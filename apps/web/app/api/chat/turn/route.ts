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

export async function POST(req: Request) {
  try {
    const { userId, sessionId, latestUserMessage, timeBudget, mood, enhancedLanguageEnabled } =
      (await req.json()) as {
        userId?: string;
        sessionId?: string;
        latestUserMessage?: string;
        timeBudget?: number;
        mood?: string | null;
        enhancedLanguageEnabled?: boolean;
      };

    if (!userId || !sessionId || !latestUserMessage) {
      return NextResponse.json({ error: "Missing parameters." }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();

    const { data: sessionData } = await supabase
      .from("journal_sessions")
      .select("selected_prompt_text")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();

    const { data: turns } = await supabase
      .from("journal_turns")
      .select("role, content, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    const history = (turns ?? []).map((turn) => ({
      role: turn.role,
      content: turn.content,
    }));

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
      .order("created_at", { ascending: false })
      .limit(5);

    const recentFormatted = (recentEntries ?? []).map((entry) => ({
      entry_id: entry.id,
      text: entry.content,
      created_at: entry.created_at ?? undefined,
      mood: entry.mood,
    }));

    const nlpResponse = await fetch(`${getNlpUrl()}/v1/chat/turn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        chat_id: sessionId,
        selected_prompt: sessionData?.selected_prompt_text ?? "",
        user_message: latestUserMessage,
        mood: mood ?? null,
        time_budget_min: timeBudget ?? 5,
        history,
        recent_entries: recentFormatted,
        retrieved_entries: retrievedEntries,
        enhanced_language: enhancedLanguageEnabled ?? false,
      }),
    });

    if (!nlpResponse.ok) {
      return NextResponse.json({ error: "Chat response failed." }, { status: 502 });
    }

    const data = (await nlpResponse.json()) as {
      assistant_message?: string;
      follow_up_question?: string;
      evidence?: Array<{ entry_id?: string | null; snippet: string; reason: string }>;
      safety?: { crisis?: boolean; reason?: string | null };
      mode?: "deterministic" | "enhanced";
    };

    let assistantText = [data.assistant_message, data.follow_up_question]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (!assistantText) {
      assistantText = "Thanks for sharing. What feels most important to explore next?";
    }

    const { data: assistantTurn } = await supabase
      .from("journal_turns")
      .insert({
        session_id: sessionId,
        user_id: userId,
        role: "assistant",
        content: assistantText,
      })
      .select("*")
      .maybeSingle();

    return NextResponse.json({
      assistant: {
        message: assistantText,
        evidence: data.evidence ?? [],
        mode: data.mode ?? "deterministic",
      },
      assistant_turn: assistantTurn ?? null,
      safety: data.safety ?? { crisis: false, reason: null },
    });
  } catch (err) {
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
