import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { DbListResult, DbResult } from "@/lib/db/types";

export interface JournalSessionRecord {
  id: string;
  user_id: string;
  entry_date: string;
  selected_prompt_id: string;
  selected_prompt_text: string;
  title: string | null;
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

    return { data: data ?? null, error: null };
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
    | "title"
  >
): Promise<DbResult<JournalSessionRecord>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("journal_sessions")
      .insert(payload)
      .select("*")
      .maybeSingle();

    if (error) {
      return { data: null, error: error.message };
    }
    return { data: data ?? null, error: null };
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

    return { data: data ?? null, error: null };
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
    return { data: data ?? null, error: null };
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

    return { data: data ?? [], error: null };
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
      .insert(payload)
      .select("*")
      .maybeSingle();

    if (error) {
      return { data: null, error: error.message };
    }
    return { data: data ?? null, error: null };
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

    return { data: data ?? [], error: null };
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

    return { data: data ?? [], error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load turns.";
    return { data: [], error: message };
  }
}
