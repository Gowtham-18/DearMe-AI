import { NextResponse } from "next/server";
import { promptsBodySchema, promptsV1ResponseSchema } from "@dearme/shared";

import { getRequestContext, isRateLimited, tooManyRequests } from "@/lib/supabase/server";
import { callNlp, serializeEmbedding } from "@/lib/nlp";
import { buildFallbackPrompts } from "@/lib/prompts";

export const maxDuration = 30;

export async function POST(req: Request) {
  const ctx = await getRequestContext(req);
  if (ctx instanceof NextResponse) return ctx;
  const { supabase, user } = ctx;

  const parsed = promptsBodySchema.safeParse(await req.json().catch(() => ({})));
  const mood = parsed.success ? parsed.data.mood ?? null : null;
  const timeBudget = parsed.success ? parsed.data.timeBudget ?? 5 : 5;
  const today = parsed.success ? parsed.data.today ?? null : null;
  const fallback = () =>
    NextResponse.json({ prompts: buildFallbackPrompts(mood, timeBudget), safety: { crisis: false, reason: null } });

  if (await isRateLimited(supabase, "prompts", 60, 600)) return fallback();

  const [{ data: recentEntries }, { data: lastEmbedding }, { data: themes }] = await Promise.all([
    supabase
      .from("entries")
      .select("id, content, created_at, entry_date, mood")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("journal_embeddings")
      .select("embedding")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("themes")
      .select("label")
      .eq("user_id", user.id)
      .order("strength", { ascending: false })
      .limit(5),
  ]);

  let similarEntries: Array<{ id: string; content: string; created_at: string; mood: string | null; similarity?: number }> = [];
  if (lastEmbedding?.embedding) {
    const { data: matches } = await supabase.rpc("match_journal_entries", {
      target_user_id: user.id,
      query_embedding: serializeEmbedding(lastEmbedding.embedding),
      match_count: 5,
    });
    const similarity = new Map<string, number>(
      ((matches ?? []) as Array<{ entry_id: string; similarity: number }>).map((m) => [m.entry_id, m.similarity])
    );
    if (similarity.size) {
      const { data: entries } = await supabase
        .from("entries")
        .select("id, content, created_at, mood")
        .in("id", Array.from(similarity.keys()));
      similarEntries = (entries ?? []).map((entry) => ({ ...entry, similarity: similarity.get(entry.id) }));
    }
  }

  const result = await callNlp(
    "/v1/prompts",
    {
      user_id: user.id,
      mood,
      time_budget_min: timeBudget,
      today,
      recent_entries: (recentEntries ?? []).map((entry) => ({
        entry_id: entry.id,
        text: entry.content,
        created_at: entry.created_at,
        entry_date: entry.entry_date,
        mood: entry.mood,
        source: "recent",
      })),
      similar_entries: similarEntries.map((entry) => ({
        entry_id: entry.id,
        text: entry.content,
        created_at: entry.created_at,
        mood: entry.mood,
        source: "similar",
        similarity: entry.similarity,
      })),
      themes: (themes ?? []).map((theme) => theme.label),
    },
    10000,
    promptsV1ResponseSchema
  );

  if (!result.ok) return fallback();
  if (result.data.safety.crisis) return NextResponse.json(result.data);
  if (result.data.prompts.length === 0) return fallback();
  return NextResponse.json(result.data);
}
