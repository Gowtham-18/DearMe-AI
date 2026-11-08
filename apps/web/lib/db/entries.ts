import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { DbListResult, DbResult } from "@/lib/db/types";
import { openText, sealText } from "@/lib/crypto/vault";

/** Journal lock: entry text is stored encrypted and decrypted here, in the browser. */
export async function openEntry<T extends { content: string }>(row: T): Promise<T> {
  return { ...row, content: await openText(row.content) };
}

export interface EntryRecord {
  id: string;
  user_id: string;
  entry_date: string;
  mood: string | null;
  time_budget: number;
  content: string;
  session_id?: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface EntryCreateInput {
  user_id: string;
  entry_date: string;
  mood: string | null;
  time_budget: number;
  content: string;
  session_id?: string | null;
}

/** One entry by id (RLS limits this to the signed-in user's own entries). */
export async function getEntry(id: string): Promise<DbResult<EntryRecord>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.from("entries").select("*").eq("id", id).maybeSingle();
    if (error) {
      return { data: null, error: error.message };
    }
    return { data: data ? await openEntry(data as EntryRecord) : null, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load entry.";
    return { data: null, error: message };
  }
}

/** The entry saved from a given journal session (one entry per session). */
export async function getEntryForSession(sessionId: string): Promise<DbResult<EntryRecord>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("entries")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (error) {
      return { data: null, error: error.message };
    }
    return { data: data ? await openEntry(data as EntryRecord) : null, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load entry.";
    return { data: null, error: message };
  }
}

export async function getEntryForDate(
  userId: string,
  entryDate: string
): Promise<DbResult<EntryRecord>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("entries")
      .select("*")
      .eq("user_id", userId)
      .eq("entry_date", entryDate)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: data ? await openEntry(data as EntryRecord) : null, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load entry.";
    return { data: null, error: message };
  }
}

export async function listEntries(
  userId: string,
  limit = 50,
  offset = 0
): Promise<DbListResult<EntryRecord>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("entries")
      .select("*")
      .eq("user_id", userId)
      // Newest journal day first (an entry can be written for an earlier day), then newest saved.
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return { data: [], error: error.message };
    }

    return { data: await Promise.all(((data ?? []) as EntryRecord[]).map(openEntry)), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list entries.";
    return { data: [], error: message };
  }
}

export async function createEntry(
  payload: EntryCreateInput
): Promise<DbResult<EntryRecord>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("entries")
      .insert({ ...payload, content: await sealText(payload.content) })
      .select("*")
      .maybeSingle();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: data ? await openEntry(data as EntryRecord) : null, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save entry.";
    return { data: null, error: message };
  }
}

export async function updateEntry(
  id: string,
  updates: Partial<Pick<EntryRecord, "content" | "mood" | "time_budget">>
): Promise<DbResult<EntryRecord>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("entries")
      .update(updates.content === undefined ? updates : { ...updates, content: await sealText(updates.content) })
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: data ? await openEntry(data as EntryRecord) : null, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update entry.";
    return { data: null, error: message };
  }
}

export async function deleteEntry(id: string): Promise<DbResult<null>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.from("entries").delete().eq("id", id);

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: null, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete entry.";
    return { data: null, error: message };
  }
}

export async function deleteAllEntries(userId: string): Promise<DbResult<null>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.from("entries").delete().eq("user_id", userId);

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: null, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete entries.";
    return { data: null, error: message };
  }
}
