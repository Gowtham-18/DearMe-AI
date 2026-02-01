import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/server";

const getNlpUrl = () =>
  process.env.NLP_SERVICE_URL || process.env.NEXT_PUBLIC_NLP_URL || "http://localhost:8000";

const serializeEmbedding = (embedding: unknown): string => {
  if (Array.isArray(embedding)) {
    return `[${embedding.map((item) => Number(item)).join(",")}]`;
  }
  if (typeof embedding === "string") {
    return embedding;
  }
  return "[]";
};

export async function POST(req: Request) {
  try {
    const { userId, mood, timeBudget } = (await req.json()) as {
      userId?: string;
      mood?: string | null;
      timeBudget?: number;
    };

    if (!userId) {
      return NextResponse.json({ error: "Missing userId." }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const { data: recentEntries } = await supabase
      .from("entries")
      .select("id, content, created_at, mood")
      .eq("user_id", userId)
      .order("entry_date", { ascending: false })
      .limit(3);

    const { data: lastEmbedding } = await supabase
      .from("journal_embeddings")
      .select("embedding")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let similarEntries: Array<{ id: string; content: string; created_at: string; mood: string | null }> =
      [];
    if (lastEmbedding?.embedding) {
      const { data: matches, error: matchError } = await supabase.rpc("match_journal_entries", {
        target_user_id: userId,
        query_embedding: serializeEmbedding(lastEmbedding.embedding),
        match_count: 5,
      });

      if (!matchError) {
        const entryIds = (matches ?? []).map((match: { entry_id: string }) => match.entry_id);
        if (entryIds.length) {
          const { data: entries } = await supabase
            .from("entries")
            .select("id, content, created_at, mood")
            .in("id", entryIds);
          similarEntries = entries ?? [];
        }
      }
    }

    const { data: themes } = await supabase
      .from("themes")
      .select("label")
      .eq("user_id", userId)
      .order("strength", { ascending: false })
      .limit(5);

    const nlpResponse = await fetch(`${getNlpUrl()}/generate-prompts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        recent_entries: (recentEntries ?? []).map((entry) => ({
          entry_id: entry.id,
          text: entry.content,
          created_at: entry.created_at,
          mood: entry.mood,
          source: "recent",
        })),
        similar_entries: similarEntries.map((entry) => ({
          entry_id: entry.id,
          text: entry.content,
          created_at: entry.created_at,
          mood: entry.mood,
          source: "similar",
        })),
        themes: (themes ?? []).map((theme) => theme.label),
        mood: mood ?? null,
        time_budget: timeBudget ?? 5,
      }),
    });

    if (!nlpResponse.ok) {
      return NextResponse.json({ error: "Prompt generation failed." }, { status: 502 });
    }

    const data = await nlpResponse.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
