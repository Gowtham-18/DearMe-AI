import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { DbListResult, DbResult } from "@/lib/db/types";
import { openJson } from "@/lib/crypto/vault";

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

/** Journal lock: key phrases and safety flags are stored encrypted (as a JSON string). */
export async function openAnalysis(row: EntryAnalysisRecord): Promise<EntryAnalysisRecord> {
  return {
    ...row,
    keyphrases: await openJson<string[]>(row.keyphrases, []),
    safety_flags: await openJson<EntryAnalysisRecord["safety_flags"]>(row.safety_flags, {}),
  };
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

    return { data: data ? await openAnalysis(data as EntryAnalysisRecord) : null, error: null };
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

    return { data: await Promise.all(((data ?? []) as EntryAnalysisRecord[]).map(openAnalysis)), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load analysis.";
    return { data: [], error: message };
  }
}
