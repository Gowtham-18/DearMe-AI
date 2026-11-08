import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { LockedEntry } from "@dearme/shared";

/**
 * Journal lock on the server. For a locked journal the database holds only ciphertext, so routes
 * use the decrypted context the browser sends with the request, return their results, and leave
 * every text write to the browser (which encrypts it first). Nothing from that context is stored
 * or logged here.
 */
export async function isJournalLocked(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase.from("journal_keys").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) {
    // Before the phase 10 migration the table doesn't exist, so nobody can be locked. Any other
    // error counts as locked, so a hiccup can't make us read ciphertext or store plain text.
    return !(error.code === "PGRST205" || error.code === "42P01");
  }
  return Boolean(data);
}

export function unlockRequired(): NextResponse {
  return NextResponse.json(
    { error: "Your journal is locked on this device. Unlock it and try again.", locked: true },
    { status: 409 }
  );
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0;
}

/** The entries most similar to `query`, best first (the in-memory version of match_journal_entries). */
export function mostSimilar(entries: LockedEntry[], query: number[], count: number) {
  return entries
    .filter((entry) => entry.embedding?.length === query.length && entry.text)
    .map((entry) => ({ entry, similarity: cosine(entry.embedding as number[], query) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, count);
}
