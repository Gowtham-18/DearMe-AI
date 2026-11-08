import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { DbListResult, DbResult } from "@/lib/db/types";
import { openText, sealText } from "@/lib/crypto/vault";

// Journal lock: the chosen prompt and every message are stored encrypted and decrypted here.
const openSession = async (row: JournalSessionRecord): Promise<JournalSessionRecord> => ({
  ...row,
  selected_prompt_text: await openText(row.selected_prompt_text),
});
const openTurn = async (row: JournalTurnRecord): Promise<JournalTurnRecord> => ({
  ...row,
  content: await openText(row.content),
});

export interface JournalSessionRecord {
  id: string;
  user_id: string;
  entry_date: string;
  selected_prompt_id: string;
  selected_prompt_text: string;
  title?: string | null;
  mood?: string | null;
  time_budget?: number | null;
  status: "ACTIVE" | "COMPLETED";
  completed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface JournalTurnRecord {
  id: string;
  session_id: string;
  user_id: string;
  role: "assistant" | "user";
  content: string;
  created_at: string | null;
}

export async function getActiveSession(
  userId: string,
  entryDate: string
): Promise<DbResult<JournalSessionRecord>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("journal_sessions")
      .select("*")
      .eq("user_id", userId)
      .eq("entry_date", entryDate)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: data ? await openSession(data as JournalSessionRecord) : null, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load session.";
    return { data: null, error: message };
  }
}

export async function createSession(
  payload: Pick<
    JournalSessionRecord,
    | "user_id"
    | "entry_date"
    | "selected_prompt_id"
    | "selected_prompt_text"
    | "status"
  >
    & { title?: string | null; mood?: string | null; time_budget?: number | null }
): Promise<DbResult<JournalSessionRecord>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const insertPayload = { ...payload, selected_prompt_text: await sealText(payload.selected_prompt_text) };
    if (insertPayload.title == null) {
      delete insertPayload.title;
    }

    let { data, error } = await supabase
      .from("journal_sessions")
      .insert(insertPayload)
      .select("*")
      .maybeSingle();

    if (error && /column "(title|mood|time_budget)"|'(title|mood|time_budget)' column/.test(error.message)) {
      // Older schema (before phase 5/6a): retry without the optional columns.
      const { title: _title, mood: _mood, time_budget: _time, ...withoutTitle } = insertPayload as Record<string, unknown>;
      const retry = await supabase
        .from("journal_sessions")
        .insert(withoutTitle)
        .select("*")
        .maybeSingle();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      const message = error.message;
      if (message.includes('relation "journal_sessions"') || message.includes("journal_sessions")) {
        return {
          data: null,
          error:
            "Session storage is not set up yet. Run docs/db/schema-phase3.sql and docs/db/schema-phase5.sql in Supabase.",
        };
      }
      if (message.includes("row-level security") || message.includes("permission denied")) {
        return {
          data: null,
          error: "Your session has ended. Refresh the page to continue.",
        };
      }
      if (message.includes('column "title"')) {
        return {
          data: null,
          error: "Database schema is out of date. Run docs/db/schema-phase5.sql in Supabase.",
        };
      }
      return { data: null, error: message };
    }
    return { data: data ? await openSession(data as JournalSessionRecord) : null, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start session.";
    return { data: null, error: message };
  }
}

export async function getSession(sessionId: string): Promise<DbResult<JournalSessionRecord>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("journal_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: data ? await openSession(data as JournalSessionRecord) : null, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load session.";
    return { data: null, error: message };
  }
}

export async function updateSessionStatus(
  sessionId: string,
  status: "ACTIVE" | "COMPLETED"
): Promise<DbResult<JournalSessionRecord>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("journal_sessions")
      .update({
        status,
        completed_at: status === "COMPLETED" ? new Date().toISOString() : null,
      })
      .eq("id", sessionId)
      .select("*")
      .maybeSingle();

    if (error) {
      return { data: null, error: error.message };
    }
    return { data: data ? await openSession(data as JournalSessionRecord) : null, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update session.";
    return { data: null, error: message };
  }
}

export async function listTurns(sessionId: string): Promise<DbListResult<JournalTurnRecord>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("journal_turns")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (error) {
      return { data: [], error: error.message };
    }

    return { data: await Promise.all(((data ?? []) as JournalTurnRecord[]).map(openTurn)), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load turns.";
    return { data: [], error: message };
  }
}

export async function createTurn(
  payload: Pick<JournalTurnRecord, "session_id" | "user_id" | "role" | "content">
): Promise<DbResult<JournalTurnRecord>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("journal_turns")
      .insert({ ...payload, content: await sealText(payload.content) })
      .select("*")
      .maybeSingle();

    if (error) {
      return { data: null, error: error.message };
    }
    return { data: data ? await openTurn(data as JournalTurnRecord) : null, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save turn.";
    return { data: null, error: message };
  }
}

export async function listSessions(
  userId: string,
  limit = 8
): Promise<DbListResult<JournalSessionRecord>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("journal_sessions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return { data: [], error: error.message };
    }

    return { data: await Promise.all(((data ?? []) as JournalSessionRecord[]).map(openSession)), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load sessions.";
    return { data: [], error: message };
  }
}

export async function listTurnsByUser(
  userId: string,
  limit = 500
): Promise<DbListResult<JournalTurnRecord>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("journal_turns")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return { data: [], error: error.message };
    }

    return { data: await Promise.all(((data ?? []) as JournalTurnRecord[]).map(openTurn)), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load turns.";
    return { data: [], error: message };
  }
}

export async function deleteSession(sessionId: string): Promise<DbResult<null>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { error: turnsError } = await supabase
      .from("journal_turns")
      .delete()
      .eq("session_id", sessionId);

    if (turnsError) {
      return { data: null, error: turnsError.message };
    }

    const { error } = await supabase.from("journal_sessions").delete().eq("id", sessionId);

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: null, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete session.";
    return { data: null, error: message };
  }
}
