import type { SupabaseClient } from "@supabase/supabase-js";

/** A remembered fact as the NLP service expects it. */
export type MemoryFactPayload = {
  id: string;
  kind: "person" | "event";
  label: string;
  detail: string | null;
  event_date: string | null;
  mention_count: number;
  last_seen: string | null;
  followed_up_on: string | null;
};

/** Memory is on unless the person turned it off in Settings. */
export async function memoryEnabled(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase.from("profiles").select("preferences").eq("user_id", userId).maybeSingle();
  const preferences = (data?.preferences ?? {}) as { memory_enabled?: boolean };
  return preferences.memory_enabled !== false;
}

/**
 * The person's remembered facts (RLS keeps this to their own rows). Returns [] when memory is
 * off, or when the table isn't there yet, so prompts and chat keep working either way.
 */
export async function loadMemories(supabase: SupabaseClient, userId: string): Promise<MemoryFactPayload[]> {
  if (!(await memoryEnabled(supabase, userId))) return [];
  const { data, error } = await supabase
    .from("memory_facts")
    .select("id, kind, label, detail, event_date, mention_count, last_seen, followed_up_on")
    .eq("user_id", userId)
    .order("last_seen", { ascending: false })
    .limit(40);
  if (error || !data) return [];
  return data as MemoryFactPayload[];
}
