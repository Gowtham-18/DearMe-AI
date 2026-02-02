import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/server";

const getNlpUrl = () => process.env.NLP_SERVICE_URL || "http://localhost:8000";

const serializeEmbedding = (embedding: unknown): string => {
  if (Array.isArray(embedding)) {
    return `[${embedding.map((item) => Number(item)).join(",")}]`;
  }
  if (typeof embedding === "string") {
    return embedding;
  }
  return "[]";
};

const buildFallbackPrompts = (mood: string | null, timeBudget: number) => {
  const moodHint = mood ? `while feeling ${mood.toLowerCase()}` : "today";
  const base = [
    `With ${timeBudget} minutes, what feels most important to name right now?`,
    `What moment from ${moodHint} stands out?`,
    "What do you want to release before the day ends?",
    "What small win do you want to remember?",
  ];

  return base.slice(0, 4).map((text, index) => ({
    id: `starter_${index + 1}`,
    text,
    reason: "Starter prompt to help you begin.",
    evidence: [],
  }));
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
      .order("created_at", { ascending: false })
      .limit(5);

    const { data: lastEmbedding } = await supabase
      .from("journal_embeddings")
      .select("embedding")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let similarEntries: Array<{ id: string; content: string; created_at: string; mood: string | null }> = [];
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

    const payload = {
      user_id: userId,
      mood: mood ?? null,
      time_budget_min: timeBudget ?? 5,
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
    };

    const nlpResponse = await fetch(`${getNlpUrl()}/v1/prompts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!nlpResponse.ok) {
      return NextResponse.json({
        prompts: buildFallbackPrompts(mood ?? null, timeBudget ?? 5),
        safety: { crisis: false, reason: null },
      });
    }

    const data = await nlpResponse.json();
    if (!data?.prompts || data.prompts.length === 0) {
      return NextResponse.json({
        prompts: buildFallbackPrompts(mood ?? null, timeBudget ?? 5),
        safety: { crisis: false, reason: null },
      });
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({
      prompts: buildFallbackPrompts(null, 5),
      safety: { crisis: false, reason: null },
    });
  }
}
