import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { analyzeBodySchema, analyzeEntryResponseSchema, recomputeThemesResponseSchema } from "@dearme/shared";

import { getRequestContext, isRateLimited, tooManyRequests } from "@/lib/supabase/server";
import { callNlp, EMBEDDING_DIM, parseEmbedding, serializeEmbedding } from "@/lib/nlp";
import { moodToNumeric } from "@/lib/moods";
import { memoryEnabled } from "@/lib/memory";

export const maxDuration = 60;

const MIN_ENTRIES_FOR_THEMES = 4;

export async function POST(req: Request) {
  const ctx = await getRequestContext(req);
  if (ctx instanceof NextResponse) return ctx;
  const { supabase, user } = ctx;

  const parsed = analyzeBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing entry." }, { status: 400 });
  }

  if (await isRateLimited(supabase, "analyze", 30, 3600)) return tooManyRequests();

  const { data: entry } = await supabase
    .from("entries")
    .select("id, user_id, content, mood, created_at, entry_date")
    .eq("id", parsed.data.entryId)
    .maybeSingle();
  if (!entry) {
    return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  }

  const result = await callNlp(
    "/analyze-entry",
    {
      user_id: user.id,
      entry_id: entry.id,
      text: entry.content,
      mood: entry.mood,
      created_at: entry.created_at,
      entry_date: entry.entry_date,
    },
    20000,
    analyzeEntryResponseSchema
  );
  if (!result.ok) {
    return NextResponse.json({ error: "Insights are unavailable right now." }, { status: 502 });
  }
  const analysis = result.data;
  const warnings: string[] = [];

  const mood = entry.mood ?? analysis.mood_suggestion ?? null;
  if (!entry.mood && analysis.mood_suggestion) {
    await supabase.from("entries").update({ mood: analysis.mood_suggestion }).eq("id", entry.id);
  }

  const { error: analysisError } = await supabase.from("entry_analysis").upsert({
    entry_id: entry.id,
    user_id: user.id,
    sentiment_label: analysis.sentiment.label,
    sentiment_score: analysis.sentiment.score,
    mood_numeric: moodToNumeric(mood),
    keyphrases: analysis.keyphrases,
    safety_flags: analysis.safety,
  });
  if (analysisError) {
    return NextResponse.json({ error: "Failed to store insights." }, { status: 500 });
  }

  // Remember people and upcoming events, unless the person turned memory off.
  if (analysis.memories.length > 0 && (await memoryEnabled(supabase, user.id))) {
    const { error } = await supabase.rpc("remember_facts", { p_entry_id: entry.id, p_facts: analysis.memories });
    if (error) warnings.push("memories_not_stored");
  }

  // Only store real embeddings: a placeholder vector would corrupt recall and themes.
  if (analysis.embedding.length === EMBEDDING_DIM) {
    await supabase.from("journal_embeddings").delete().eq("entry_id", entry.id);
    const { error } = await supabase
      .from("journal_embeddings")
      .insert({ user_id: user.id, entry_id: entry.id, embedding: serializeEmbedding(analysis.embedding) });
    if (error) warnings.push("embedding_not_stored");
    else await refreshThemes(supabase, user.id, warnings);
  } else {
    warnings.push("embedding_unavailable");
  }

  return NextResponse.json({ status: "ok", degraded: analysis.degraded, warnings });
}

async function refreshThemes(supabase: SupabaseClient, userId: string, warnings: string[]) {
  const { data: embeddingRows } = await supabase
    .from("journal_embeddings")
    .select("entry_id, embedding")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (!embeddingRows || embeddingRows.length < MIN_ENTRIES_FOR_THEMES) return;

  const entryIds = embeddingRows.map((row) => row.entry_id);
  const [{ data: entryRows }, { data: analysisRows }] = await Promise.all([
    supabase.from("entries").select("id, content").in("id", entryIds),
    supabase.from("entry_analysis").select("entry_id, keyphrases").in("entry_id", entryIds),
  ]);
  const textById = new Map((entryRows ?? []).map((row) => [row.id, row.content as string]));
  const phrasesById = new Map(
    (analysisRows ?? []).map((row) => [row.entry_id, Array.isArray(row.keyphrases) ? (row.keyphrases as string[]) : []])
  );

  const entries = embeddingRows
    .map((row) => ({
      entry_id: row.entry_id,
      text: (textById.get(row.entry_id) ?? "").slice(0, 1000),
      embedding: parseEmbedding(row.embedding),
      keyphrases: phrasesById.get(row.entry_id) ?? [],
    }))
    .filter((item) => item.text && item.embedding.length === EMBEDDING_DIM);
  if (entries.length < MIN_ENTRIES_FOR_THEMES) return;

  const result = await callNlp("/recompute-themes", { user_id: userId, entries }, 25000, recomputeThemesResponseSchema);
  if (!result.ok) {
    warnings.push("themes_not_updated");
    return;
  }

  const themes = result.data.themes.map((theme) => ({
    id: theme.temp_theme_id,
    label: theme.label,
    keywords: theme.keywords,
    strength: theme.strength,
    members: theme.members.map((member) => ({ entry_id: member.entry_id, score: member.score })),
  }));

  // One transaction: a failure keeps the previous themes instead of leaving none.
  const { error } = await supabase.rpc("replace_user_themes", { p_themes: themes });
  if (error) {
    console.warn(`replace_user_themes failed (${error.code ?? "unknown"})`);
    warnings.push("themes_not_updated");
  }
}
