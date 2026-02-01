import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { DbListResult, DbResult } from "@/lib/db/types";

export interface EntryAnalysisRecord {
  entry_id: string;
  user_id: string;
  sentiment_label: string;
  sentiment_score: number;
  mood_numeric: number | null;
  keyphrases: string[];
  safety_flags: { crisis?: boolean; reason?: string | null };
  created_at: string | null;
  updated_at: string | null;
}

export async function getEntryAnalysis(entryId: string): Promise<DbResult<EntryAnalysisRecord>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("entry_analysis")
      .select("*")
      .eq("entry_id", entryId)
      .maybeSingle();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: data ?? null, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load analysis.";
    return { data: null, error: message };
  }
}

export async function listEntryAnalysis(
  userId: string,
  limit = 50
): Promise<DbListResult<EntryAnalysisRecord>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("entry_analysis")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return { data: [], error: error.message };
    }

    return { data: data ?? [], error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load analysis.";
    return { data: [], error: message };
  }
}
