/**
 * Journal lock: encrypt everything already written when it's turned on, and decrypt it all when it's
 * turned off. Both run in the browser (the server never holds the key), skip rows already in the
 * target form, and can be run again safely if the tab closes half way.
 */
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { factKey, isSealed, openTextStrict, sealJson, sealText } from "@/lib/crypto/vault";
import { sealEmbedding } from "@/lib/crypto/locked-api";

type Direction = "seal" | "open";
type Row = Record<string, unknown>;
export type Progress = { done: number; total: number; label: string };

const PAGE = 500;
const PARALLEL = 6;
const PENDING_KEY = (userId: string) => `dearme-vault-pending:${userId}`;

/** Remember that a run didn't finish, so the next unlock picks it up again. */
export function migrationPending(userId: string): Direction | null {
  try {
    const value = window.localStorage.getItem(PENDING_KEY(userId));
    return value === "seal" || value === "open" ? value : null;
  } catch {
    return null;
  }
}

export function setPending(userId: string, direction: Direction | null) {
  try {
    if (direction) window.localStorage.setItem(PENDING_KEY(userId), direction);
    else window.localStorage.removeItem(PENDING_KEY(userId));
  } catch {
    // Private mode: an interrupted run is picked up when lock settings are next opened.
  }
}

type Table = {
  name: string;
  key: string;
  label: string;
  columns: string[];
  /** The changes for one row, or null when it's already in the target form. */
  convert: (row: Row, direction: Direction) => Promise<Row | null>;
};

const textColumn = (column: string) => async (row: Row, direction: Direction): Promise<Row | null> => {
  const value = row[column];
  if (typeof value !== "string") return null;
  if (direction === "seal") return isSealed(value) ? null : { [column]: await sealText(value) };
  return isSealed(value) ? { [column]: await openTextStrict(value) } : null;
};

const jsonColumns = (...columns: string[]) => async (row: Row, direction: Direction): Promise<Row | null> => {
  const changes: Row = {};
  for (const column of columns) {
    const value = row[column];
    if (direction === "seal" && !isSealed(value) && value !== null && value !== undefined) changes[column] = await sealJson(value);
    if (direction === "open" && isSealed(value)) changes[column] = JSON.parse(await openTextStrict(value));
  }
  return Object.keys(changes).length ? changes : null;
};

const TABLES: Table[] = [
  { name: "entries", key: "id", label: "entries", columns: ["id", "content"], convert: textColumn("content") },
  { name: "journal_turns", key: "id", label: "conversations", columns: ["id", "content"], convert: textColumn("content") },
  {
    name: "journal_sessions",
    key: "id",
    label: "prompts",
    columns: ["id", "selected_prompt_text"],
    convert: textColumn("selected_prompt_text"),
  },
  {
    name: "entry_analysis",
    key: "entry_id",
    label: "insights",
    columns: ["entry_id", "keyphrases", "safety_flags"],
    convert: jsonColumns("keyphrases", "safety_flags"),
  },
  {
    name: "themes",
    key: "id",
    label: "themes",
    columns: ["id", "label", "keywords"],
    convert: async (row, direction) => {
      const label = await textColumn("label")(row, direction);
      const keywords = await jsonColumns("keywords")(row, direction);
      return label || keywords ? { ...label, ...keywords } : null;
    },
  },
  {
    name: "weekly_reflections",
    key: "id",
    label: "weekly reflections",
    columns: ["id", "reflection"],
    convert: jsonColumns("reflection"),
  },
  {
    name: "memory_facts",
    key: "id",
    label: "memories",
    columns: ["id", "fact_key", "label", "detail"],
    convert: async (row, direction) => {
      const changes: Row = {};
      const label = row.label as string;
      const detail = row.detail as string | null;
      const key = row.fact_key as string;
      if (direction === "seal") {
        if (!isSealed(label)) changes.label = await sealText(label);
        if (detail && !isSealed(detail)) changes.detail = await sealText(detail);
        // The key ("person:priya") would give the fact away, so it becomes an unreadable HMAC.
        if (!key.startsWith("h:")) changes.fact_key = await factKey(key);
      } else {
        if (isSealed(label)) changes.label = await openTextStrict(label);
        if (detail && isSealed(detail)) changes.detail = await openTextStrict(detail);
        // An HMAC can't be turned back into the key; it stays as a unique id for the fact.
      }
      return Object.keys(changes).length ? changes : null;
    },
  },
  {
    name: "journal_embeddings",
    key: "id",
    label: "entry fingerprints",
    columns: ["id", "embedding", "embedding_enc"],
    convert: async (row, direction) => {
      if (direction === "seal") {
        if (row.embedding_enc || typeof row.embedding !== "string") return null;
        const vector = JSON.parse(row.embedding) as number[];
        return { embedding: null, embedding_enc: await sealEmbedding(vector) };
      }
      if (!row.embedding_enc) return null;
      const vector = JSON.parse(await openTextStrict(row.embedding_enc as string)) as number[];
      return { embedding: `[${vector.join(",")}]`, embedding_enc: null };
    },
  },
];

async function run(userId: string, direction: Direction, onProgress?: (progress: Progress) => void): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  setPending(userId, direction);

  const counts = await Promise.all(
    TABLES.map(async (table) => {
      const { count } = await supabase.from(table.name).select(table.key, { count: "exact", head: true }).eq("user_id", userId);
      return count ?? 0;
    })
  );
  const total = counts.reduce((sum, count) => sum + count, 0);
  let done = 0;
  onProgress?.({ done, total, label: "Getting ready" });

  for (const table of TABLES) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from(table.name)
        .select(table.columns.join(", "))
        .eq("user_id", userId)
        .order(table.key, { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`We couldn't read your ${table.label}. Check your connection and try again.`);
      const rows = (data ?? []) as unknown as Row[];

      for (let i = 0; i < rows.length; i += PARALLEL) {
        await Promise.all(
          rows.slice(i, i + PARALLEL).map(async (row) => {
            let changes: Row | null;
            try {
              changes = await table.convert(row, direction);
            } catch {
              throw new Error(`Some of your ${table.label} couldn't be ${direction === "seal" ? "encrypted" : "decrypted"}. Nothing was lost; try again.`);
            }
            if (changes) {
              const { error: updateError } = await supabase.from(table.name).update(changes).eq(table.key, row[table.key] as string);
              if (updateError?.code === "23505" && table.name === "memory_facts") {
                // The same fact was already saved in locked form by a newer entry: keep that one.
                await supabase.from(table.name).delete().eq(table.key, row[table.key] as string);
              } else if (updateError) throw new Error(`We couldn't update your ${table.label}. Check your connection and try again.`);
            }
            done += 1;
          })
        );
        onProgress?.({ done: Math.min(done, total), total, label: table.label });
      }
      if (rows.length < PAGE) break;
    }
  }
  setPending(userId, null);
}

/** After turning journal lock on: encrypt everything written so far. */
export function encryptExistingData(userId: string, onProgress?: (progress: Progress) => void) {
  return run(userId, "seal", onProgress);
}

/** Before turning journal lock off: decrypt everything back to normal storage. */
export function decryptAllData(userId: string, onProgress?: (progress: Progress) => void) {
  return run(userId, "open", onProgress);
}
