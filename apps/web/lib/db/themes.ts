import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { DbListResult, DbResult } from "@/lib/db/types";

export interface ThemeRecord {
  id: string;
  user_id: string;
  label: string;
  keywords: string[];
  strength: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface ThemeMembershipRecord {
  id: string;
  user_id: string;
  theme_id: string;
  entry_id: string;
  score: number;
  created_at: string | null;
}

export async function listThemes(
  userId: string,
  limit = 10
): Promise<DbListResult<ThemeRecord>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("themes")
      .select("*")
      .eq("user_id", userId)
      .order("strength", { ascending: false })
      .limit(limit);

    if (error) {
      return { data: [], error: error.message };
    }

    return { data: data ?? [], error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load themes.";
    return { data: [], error: message };
  }
}

export async function listThemeMembership(
  userId: string,
  themeIds: string[]
): Promise<DbListResult<ThemeMembershipRecord>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const query = supabase.from("theme_membership").select("*").eq("user_id", userId);
    const { data, error } = themeIds.length > 0 ? await query.in("theme_id", themeIds) : await query;

    if (error) {
      return { data: [], error: error.message };
    }

    return { data: data ?? [], error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load theme membership.";
    return { data: [], error: message };
  }
}
