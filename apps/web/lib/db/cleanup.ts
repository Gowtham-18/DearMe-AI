import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { DbResult } from "@/lib/db/types";

/** Delete everything the signed-in user has stored, in a single transaction. */
export async function deleteMyData(includeProfile = true): Promise<DbResult<null>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.rpc("delete_my_data", { p_include_profile: includeProfile });
    if (error) {
      return { data: null, error: error.message };
    }
    return { data: null, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete your data.";
    return { data: null, error: message };
  }
}
