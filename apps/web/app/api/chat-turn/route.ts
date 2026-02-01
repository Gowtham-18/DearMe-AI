import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  rewriteAssistantMessage,
  type AssistantMessage,
  type ReflectionPlan,
} from "@/lib/llm/openaiRewrite";

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

const joinSections = (message: AssistantMessage) => {
  const parts = [
    message.validation,
    message.reflection,
    message.pattern_connection,
    message.gentle_nudge,
  ].filter(Boolean);
  const base = parts.join(" ");
  return message.follow_up_question ? `${base} ${message.follow_up_question}` : base;
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
        selected_prompt: sessionData?.selected_prompt_text ?? "",
        history,
        latest_user_message: latestUserMessage,
        time_budget: timeBudget ?? 5,
        mood: mood ?? null,
        retrieved_entries: mergedEntries,
      }),
    });

    if (!nlpResponse.ok) {
      return NextResponse.json({ error: "Chat response failed." }, { status: 502 });
    }

    const data = (await nlpResponse.json()) as {
      plan?: ReflectionPlan;
      assistant_message?: AssistantMessage;
      safety?: { crisis?: boolean; reason?: string | null };
    };

    if (!data.plan || !data.assistant_message) {
      return NextResponse.json({ error: "Malformed chat response." }, { status: 502 });
    }

    let assistantMessage = data.assistant_message;
    const rewriteAttempt = enhancedLanguageEnabled && !data.plan.safety?.crisis
      ? await rewriteAssistantMessage({
          plan: data.plan,
          assistantMessage: data.assistant_message,
        })
      : { data: null };

    if (rewriteAttempt.data) {
      assistantMessage = rewriteAttempt.data;
    }

    const assistantText = joinSections(assistantMessage);
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
        sections: assistantMessage,
        evidence: data.plan.evidence_cards ?? [],
      },
      assistant_turn: assistantTurn ?? null,
      safety: data.plan.safety ?? data.safety,
      enhanced_language_used: Boolean(rewriteAttempt.data),
    });
  } catch (err) {
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
