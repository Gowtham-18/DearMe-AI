import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { DbResult } from "@/lib/db/types";
import { openJson, sealJson } from "@/lib/crypto/vault";

const openReflection = async (row: WeeklyReflectionRecord): Promise<WeeklyReflectionRecord> => ({
  ...row,
  reflection: await openJson<unknown>(row.reflection, null),
});

export interface WeeklyReflectionRecord {
  id: string;
  user_id: string;
  week_start: string;
  week_end: string;
  reflection: unknown;
  created_at: string | null;
}

export async function getWeeklyReflection(
  userId: string,
  weekStart: string,
  weekEnd: string
): Promise<DbResult<WeeklyReflectionRecord>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("weekly_reflections")
      .select("*")
      .eq("user_id", userId)
      .eq("week_start", weekStart)
      .eq("week_end", weekEnd)
      .maybeSingle();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: data ? await openReflection(data as WeeklyReflectionRecord) : null, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load reflection.";
    return { data: null, error: message };
  }
}

export async function upsertWeeklyReflection(
  userId: string,
  weekStart: string,
  weekEnd: string,
  reflection: unknown
): Promise<DbResult<WeeklyReflectionRecord>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("weekly_reflections")
      .upsert({
        user_id: userId,
        week_start: weekStart,
        week_end: weekEnd,
        reflection: await sealJson(reflection),
      }, { onConflict: "user_id,week_start,week_end" })
      .select("*")
      .maybeSingle();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: data ? await openReflection(data as WeeklyReflectionRecord) : null, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save reflection.";
    return { data: null, error: message };
  }
}

export async function listWeeklyReflections(
  userId: string,
  limit = 10
): Promise<DbResult<WeeklyReflectionRecord[]>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("weekly_reflections")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: await Promise.all(((data ?? []) as WeeklyReflectionRecord[]).map(openReflection)), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load reflections.";
    return { data: null, error: message };
  }
}
