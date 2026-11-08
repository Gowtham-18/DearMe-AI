/**
 * Journal lock in the browser: the four API calls that need journal text.
 *
 * The database holds only ciphertext, so before each call this decrypts the context the server
 * would otherwise have read (recent entries, the conversation, memories, themes) and sends it with
 * the request. Whatever comes back that's worth keeping (the companion's reply, insights, memories,
 * themes, the weekly reflection) is encrypted here and then saved.
 *
 * Each function returns a Response shaped like the unlocked route's, so callers don't change.
 */
import type { LockedEntry, LockedMemory } from "@dearme/shared";

import { postApi } from "@/lib/auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getEntry, listEntries } from "@/lib/db/entries";
import { getSession, listTurns, type JournalTurnRecord } from "@/lib/db/sessions";
import { listMemories } from "@/lib/db/memories";
import { listThemes } from "@/lib/db/themes";
import { getWeeklyReflection, upsertWeeklyReflection } from "@/lib/db/weekly";
import { openAnalysis, type EntryAnalysisRecord } from "@/lib/db/analysis";
import { openEntry } from "@/lib/db/entries";
import { factKey, openJson, sealJson, sealText } from "@/lib/crypto/vault";

const POOL_SIZE = 30;
const THEME_POOL_SIZE = 150;
const MIN_ENTRIES_FOR_THEMES = 4;
const EMBEDDING_DIM = 384;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function currentUserId(): Promise<string | null> {
  const { data } = await getSupabaseBrowserClient().auth.getSession();
  return data.session?.user.id ?? null;
}

/** Plain vector text ("[0.1,0.2]") from before journal lock, or an encrypted JSON array. */
async function readEmbedding(row: { embedding?: unknown; embedding_enc?: string | null }): Promise<number[]> {
  if (row.embedding_enc) return openJson<number[]>(row.embedding_enc, []);
  if (typeof row.embedding === "string") {
    try {
      return JSON.parse(row.embedding) as number[];
    } catch {
      return [];
    }
  }
  return Array.isArray(row.embedding) ? (row.embedding as number[]) : [];
}

export async function sealEmbedding(embedding: number[]): Promise<string> {
  // Four decimals keep similarity intact and the ciphertext small.
  return sealText(JSON.stringify(embedding.map((value) => Math.round(value * 10000) / 10000)));
}

/** Recent entries, decrypted, with their embeddings: the browser-side stand-in for a vector search. */
async function entryPool(userId: string, size: number, textLimit: number): Promise<LockedEntry[]> {
  const { data: entries } = await listEntries(userId, size);
  if (!entries.length) return [];
  const { data: rows } = await getSupabaseBrowserClient()
    .from("journal_embeddings")
    .select("entry_id, embedding, embedding_enc")
    .in("entry_id", entries.map((entry) => entry.id));
  const embeddings = new Map<string, number[]>();
  for (const row of rows ?? []) embeddings.set(row.entry_id as string, await readEmbedding(row));
  return entries
    .slice()
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    .map((entry) => ({
      entry_id: entry.id,
      text: entry.content.slice(0, textLimit),
      created_at: entry.created_at,
      entry_date: entry.entry_date,
      mood: entry.mood,
      embedding: embeddings.get(entry.id)?.length === EMBEDDING_DIM ? embeddings.get(entry.id) : undefined,
    }))
    .filter((entry) => entry.text.trim().length > 0);
}

async function memoryContext(userId: string): Promise<LockedMemory[]> {
  const { data } = await listMemories(userId, 40);
  return data.map((fact) => ({
    id: fact.id,
    kind: fact.kind,
    label: fact.label.slice(0, 200),
    detail: fact.detail ? fact.detail.slice(0, 200) : null,
    event_date: fact.event_date,
    mention_count: fact.mention_count,
    last_seen: fact.last_seen,
    followed_up_on: fact.followed_up_on,
  }));
}

// --- /api/prompts ---------------------------------------------------------------------------------

async function prompts(body: Record<string, unknown>): Promise<Response> {
  const userId = await currentUserId();
  if (!userId) return postApi("/api/prompts", body);
  const [entries, { data: themes }, memories] = await Promise.all([
    entryPool(userId, POOL_SIZE, 2000),
    listThemes(userId, 5),
    memoryContext(userId),
  ]);
  return postApi("/api/prompts", {
    ...body,
    locked: { entries, themes: themes.map((theme) => theme.label.slice(0, 200)), memories },
  });
}

// --- /api/chat/turn -------------------------------------------------------------------------------

async function chatTurn(body: { sessionId: string; latestUserMessage: string }): Promise<Response> {
  const userId = await currentUserId();
  if (!userId) return json({ error: "Your session has ended. Refresh the page to continue." }, 401);
  const [{ data: session }, { data: turns }, entries, memories] = await Promise.all([
    getSession(body.sessionId),
    listTurns(body.sessionId),
    entryPool(userId, POOL_SIZE, 2000),
    memoryContext(userId),
  ]);
  if (!session) return json({ error: "This journal session wasn't found." }, 404);

  const response = await postApi("/api/chat/turn", {
    ...body,
    locked: {
      selectedPrompt: session.selected_prompt_text.slice(0, 1000),
      history: turns.slice(-12).map((turn) => ({ role: turn.role, content: turn.content.slice(0, 8000) })),
      entries,
      memories,
    },
  });
  if (!response.ok) return response;

  const data = (await response.json()) as {
    assistant?: { message?: string };
    assistant_turn?: JournalTurnRecord | null;
    save_assistant_turn?: boolean;
  };
  if (data.save_assistant_turn && data.assistant?.message) {
    const { createTurn } = await import("@/lib/db/sessions");
    const { data: saved } = await createTurn({
      session_id: body.sessionId,
      user_id: userId,
      role: "assistant",
      content: data.assistant.message,
    });
    data.assistant_turn = saved ?? null;
  }
  return json(data);
}

// --- /api/analyze ---------------------------------------------------------------------------------

type LockedAnalysis = {
  sentiment: { label: string; score: number };
  mood_numeric: number | null;
  keyphrases: string[];
  safety: { crisis?: boolean; reason?: string | null };
  memories: Array<{ kind: string; key: string; label: string; detail?: string | null; event_date?: string | null; seen_on?: string | null }>;
  embedding: number[] | null;
};

async function analyze(body: { entryId: string }): Promise<Response> {
  const userId = await currentUserId();
  if (!userId) return json({ error: "Your session has ended. Refresh the page to continue." }, 401);
  const { data: entry } = await getEntry(body.entryId);
  if (!entry || !entry.content.trim()) return json({ error: "Entry not found." }, 404);

  const response = await postApi("/api/analyze", { entryId: entry.id, locked: { text: entry.content.slice(0, 100000) } });
  if (!response.ok) return response;
  const data = (await response.json()) as { degraded?: string[]; locked_result?: LockedAnalysis };
  const result = data.locked_result;
  if (!result) return json({ status: "ok", degraded: data.degraded ?? [], warnings: [] });

  const supabase = getSupabaseBrowserClient();
  const warnings: string[] = [];

  const { error: analysisError } = await supabase.from("entry_analysis").upsert({
    entry_id: entry.id,
    user_id: userId,
    sentiment_label: result.sentiment.label,
    sentiment_score: result.sentiment.score,
    mood_numeric: result.mood_numeric,
    keyphrases: await sealJson(result.keyphrases),
    safety_flags: await sealJson(result.safety),
  });
  if (analysisError) return json({ error: "Failed to store insights." }, 500);

  if (result.memories.length > 0) {
    const facts = await Promise.all(
      result.memories.map(async (fact) => ({
        ...fact,
        key: await factKey(fact.key),
        label: await sealText(fact.label),
        detail: fact.detail ? await sealText(fact.detail) : null,
      }))
    );
    const { error } = await supabase.rpc("remember_facts", { p_entry_id: entry.id, p_facts: facts });
    if (error) warnings.push("memories_not_stored");
  }

  if (result.embedding?.length === EMBEDDING_DIM) {
    await supabase.from("journal_embeddings").delete().eq("entry_id", entry.id);
    const { error } = await supabase
      .from("journal_embeddings")
      .insert({ user_id: userId, entry_id: entry.id, embedding: null, embedding_enc: await sealEmbedding(result.embedding) });
    if (error) warnings.push("embedding_not_stored");
    else await refreshThemes(userId, warnings);
  } else {
    warnings.push("embedding_unavailable");
  }
  return json({ status: "ok", degraded: data.degraded ?? [], warnings });
}

async function refreshThemes(userId: string, warnings: string[]) {
  const supabase = getSupabaseBrowserClient();
  const { data: rows } = await supabase
    .from("journal_embeddings")
    .select("entry_id, embedding, embedding_enc")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(THEME_POOL_SIZE);
  if (!rows || rows.length < MIN_ENTRIES_FOR_THEMES) return;

  const ids = rows.map((row) => row.entry_id as string);
  const [{ data: entryRows }, { data: analysisRows }] = await Promise.all([
    supabase.from("entries").select("id, content").in("id", ids),
    supabase.from("entry_analysis").select("*").in("entry_id", ids),
  ]);
  const textById = new Map<string, string>();
  for (const row of entryRows ?? []) textById.set(row.id as string, (await openEntry(row as { id: string; content: string })).content);
  const phrasesById = new Map<string, string[]>();
  for (const row of analysisRows ?? []) {
    const opened = await openAnalysis(row as EntryAnalysisRecord);
    phrasesById.set(opened.entry_id, Array.isArray(opened.keyphrases) ? opened.keyphrases.slice(0, 40) : []);
  }

  const entries = [];
  for (const row of rows) {
    const text = (textById.get(row.entry_id as string) ?? "").trim().slice(0, 1000);
    const embedding = await readEmbedding(row);
    if (text && embedding.length === EMBEDDING_DIM) {
      entries.push({ entry_id: row.entry_id as string, text, embedding, keyphrases: phrasesById.get(row.entry_id as string) ?? [] });
    }
  }
  if (entries.length < MIN_ENTRIES_FOR_THEMES) return;

  const response = await postApi("/api/themes", { entries });
  if (!response.ok) {
    warnings.push("themes_not_updated");
    return;
  }
  const { themes } = (await response.json()) as {
    themes: Array<{ id: string; label: string; keywords: string[]; strength: number; members: Array<{ entry_id: string; score: number }> }>;
  };
  const sealed = await Promise.all(
    themes.map(async (theme) => ({ ...theme, label: await sealText(theme.label), keywords: await sealJson(theme.keywords) }))
  );
  const { error } = await supabase.rpc("replace_user_themes", { p_themes: sealed });
  if (error) warnings.push("themes_not_updated");
}

// --- /api/weekly-reflection -----------------------------------------------------------------------

async function weekly(body: { weekStart: string; weekEnd: string; force?: boolean }): Promise<Response> {
  const userId = await currentUserId();
  if (!userId) return json({ error: "Your session has ended. Refresh the page to continue." }, 401);
  if (!body.force) {
    const { data: existing } = await getWeeklyReflection(userId, body.weekStart, body.weekEnd);
    if (existing?.reflection) return json({ status: "ok", reflection: existing.reflection });
  }

  const supabase = getSupabaseBrowserClient();
  const { data: entryRows } = await supabase
    .from("entries")
    .select("id, content, created_at, entry_date, mood")
    .eq("user_id", userId)
    .gte("entry_date", body.weekStart)
    .lte("entry_date", body.weekEnd)
    .order("created_at", { ascending: true })
    .limit(100);
  const entries = await Promise.all(((entryRows ?? []) as Array<{ id: string; content: string; created_at: string | null; entry_date: string; mood: string | null }>).map(openEntry));
  if (entries.length === 0) return json({ status: "ok", reflection: null });

  const ids = entries.map((entry) => entry.id);
  const [{ data: analysisRows }, { data: themes }] = await Promise.all([
    supabase.from("entry_analysis").select("*").in("entry_id", ids),
    listThemes(userId, 5),
  ]);
  const analysisById = new Map<string, EntryAnalysisRecord>();
  for (const row of analysisRows ?? []) {
    const opened = await openAnalysis(row as EntryAnalysisRecord);
    analysisById.set(opened.entry_id, opened);
  }

  const contentById = new Map(entries.map((entry) => [entry.id, entry.content]));
  const membersByTheme = new Map<string, Array<{ entry_id: string; snippet: string; reason: string }>>();
  if (themes.length) {
    const { data: membership } = await supabase
      .from("theme_membership")
      .select("theme_id, entry_id, score")
      .in("theme_id", themes.map((theme) => theme.id))
      .order("score", { ascending: false });
    for (const member of membership ?? []) {
      const content = contentById.get(member.entry_id as string);
      const list = membersByTheme.get(member.theme_id as string) ?? [];
      if (!content || list.length >= 3) continue;
      list.push({
        entry_id: member.entry_id as string,
        snippet: content.length > 140 ? `${content.slice(0, 140)}...` : content,
        reason: "Evidence from a related entry.",
      });
      membersByTheme.set(member.theme_id as string, list);
    }
  }

  const response = await postApi("/api/weekly-reflection", {
    ...body,
    locked: {
      entries: entries
        .filter((entry) => entry.content.trim())
        .map((entry) => {
          const analysis = analysisById.get(entry.id);
          return {
            entry_id: entry.id,
            text: entry.content.slice(0, 12000),
            created_at: entry.created_at,
            entry_date: entry.entry_date,
            mood: entry.mood,
            sentiment: analysis ? { label: analysis.sentiment_label, score: analysis.sentiment_score } : undefined,
            keyphrases: Array.isArray(analysis?.keyphrases) ? analysis.keyphrases.slice(0, 40) : [],
          };
        }),
      themes: themes.map((theme) => ({
        label: theme.label.slice(0, 200),
        keywords: theme.keywords.slice(0, 40),
        strength: theme.strength,
        members: membersByTheme.get(theme.id) ?? [],
      })),
    },
  });
  if (!response.ok) return response;
  const data = (await response.json()) as { reflection?: unknown; save_reflection?: boolean };
  if (data.save_reflection && data.reflection) {
    await upsertWeeklyReflection(userId, body.weekStart, body.weekEnd, data.reflection);
  }
  return json({ status: "ok", reflection: data.reflection ?? null });
}

/** Routes that read or write journal text go through here while journal lock is on. */
export async function lockedApiFetch(path: string, body: unknown): Promise<Response> {
  const payload = (body ?? {}) as Record<string, unknown>;
  switch (path) {
    case "/api/prompts":
      return prompts(payload);
    case "/api/chat/turn":
      return chatTurn(payload as { sessionId: string; latestUserMessage: string });
    case "/api/analyze":
      return analyze(payload as { entryId: string });
    case "/api/weekly-reflection":
      return weekly(payload as { weekStart: string; weekEnd: string; force?: boolean });
    default:
      return postApi(path, body);
  }
}

