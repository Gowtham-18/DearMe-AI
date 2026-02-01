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
    const { userId, sessionId, selectedPrompt, history, latestUserMessage, timeBudget, mood } =
      (await req.json()) as {
        userId?: string;
        sessionId?: string;
        selectedPrompt?: string;
        history?: Array<{ role: string; content: string }>;
        latestUserMessage?: string;
        timeBudget?: number;
        mood?: string | null;
      };

    if (!userId || !sessionId || !latestUserMessage) {
      return NextResponse.json({ error: "Missing parameters." }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();

    const analysisResponse = await fetch(`${getNlpUrl()}/analyze-entry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        entry_id: sessionId,
        text: latestUserMessage,
        mood,
      }),
    });

    const analysis = analysisResponse.ok ? await analysisResponse.json() : null;
    const embedding = analysis?.embedding ?? [];

    let retrievedEntries: Array<{ entry_id: string; text: string; created_at?: string; mood?: string | null }> = [];
    if (embedding.length > 0) {
      const { data: matches, error: matchError } = await supabase.rpc("match_journal_entries", {
        target_user_id: userId,
        query_embedding: serializeEmbedding(embedding),
        match_count: 5,
      });

      if (!matchError) {
        const entryIds = (matches ?? []).map((match: { entry_id: string }) => match.entry_id);
        if (entryIds.length) {
          const { data: entries } = await supabase
            .from("entries")
            .select("id, content, created_at, mood")
            .in("id", entryIds);

          retrievedEntries = (entries ?? []).map((entry) => ({
            entry_id: entry.id,
            text: entry.content,
            created_at: entry.created_at ?? undefined,
            mood: entry.mood,
          }));
        }
      }
    }

    const { data: recentEntries } = await supabase
      .from("entries")
      .select("id, content, created_at, mood")
      .eq("user_id", userId)
      .order("entry_date", { ascending: false })
      .limit(3);

    const recentFormatted = (recentEntries ?? []).map((entry) => ({
      entry_id: entry.id,
      text: entry.content,
      created_at: entry.created_at ?? undefined,
      mood: entry.mood,
    }));

    const mergedEntries = [
      ...retrievedEntries,
      ...recentFormatted.filter(
        (entry) => !retrievedEntries.some((existing) => existing.entry_id === entry.entry_id)
      ),
    ];

    const nlpResponse = await fetch(`${getNlpUrl()}/chat-turn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        session_id: sessionId,
        selected_prompt: selectedPrompt ?? "",
        history: history ?? [],
        latest_user_message: latestUserMessage,
        time_budget: timeBudget ?? 5,
        mood: mood ?? null,
        retrieved_entries: mergedEntries,
      }),
    });

    if (!nlpResponse.ok) {
      return NextResponse.json({ error: "Chat response failed." }, { status: 502 });
    }

    const data = await nlpResponse.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
