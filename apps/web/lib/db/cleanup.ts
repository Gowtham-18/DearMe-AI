import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { DbResult } from "@/lib/db/types";

export async function deleteUserInsights(userId: string): Promise<DbResult<null>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const tables = [
      "journal_turns",
      "journal_sessions",
      "entry_analysis",
      "theme_membership",
      "themes",
      "weekly_reflections",
      "journal_embeddings",
    ];

    for (const table of tables) {
      const { error } = await supabase.from(table).delete().eq("user_id", userId);
      if (error) {
        return { data: null, error: error.message };
      }
    }

    return { data: null, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete insights.";
    return { data: null, error: message };
  }
}
