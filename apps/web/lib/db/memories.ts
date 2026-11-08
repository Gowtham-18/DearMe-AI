import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { DbListResult, DbResult } from "@/lib/db/types";
import { openText } from "@/lib/crypto/vault";

export const openMemory = async <T extends { label: string; detail: string | null }>(row: T): Promise<T> => ({
  ...row,
  label: await openText(row.label),
  detail: await openText(row.detail),
});

export interface MemoryFactRecord {
  id: string;
  user_id: string;
  kind: "person" | "event";
  label: string;
  detail: string | null;
  event_date: string | null;
  mention_count: number;
  first_seen: string;
  last_seen: string;
  followed_up_on: string | null;
  created_at: string | null;
}

/** Prompt ids for follow-ups about a remembered fact look like "memory:<fact id>". */
export const memoryIdFromPrompt = (promptId: string): string | null => {
  const match = /^memory:([0-9a-f-]{36})$/i.exec(promptId);
  return match ? match[1] : null;
};

export async function listMemories(userId: string, limit = 100): Promise<DbListResult<MemoryFactRecord>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("memory_facts")
      .select("*")
      .eq("user_id", userId)
      .order("last_seen", { ascending: false })
      .limit(limit);
    if (error) return { data: [], error: error.message };
    return { data: await Promise.all(((data ?? []) as MemoryFactRecord[]).map(openMemory)), error: null };
  } catch (err) {
    return { data: [], error: err instanceof Error ? err.message : "Failed to load what DearMe remembers." };
  }
}

export async function forgetMemory(id: string): Promise<DbResult<null>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.from("memory_facts").delete().eq("id", id);
    return { data: null, error: error ? error.message : null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "Failed to forget that." };
  }
}

export async function forgetAllMemories(userId: string): Promise<DbResult<null>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.from("memory_facts").delete().eq("user_id", userId);
    return { data: null, error: error ? error.message : null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "Failed to forget everything." };
  }
}

/** Record that the person answered a follow-up, so it isn't asked again too soon. */
export async function markMemoryFollowedUp(id: string, localDate: string): Promise<DbResult<null>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.from("memory_facts").update({ followed_up_on: localDate }).eq("id", id);
    return { data: null, error: error ? error.message : null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "Failed to update." };
  }
}
