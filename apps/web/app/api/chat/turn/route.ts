import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/server";

const getNlpUrl = () =>
  process.env.NLP_SERVICE_URL ||
  process.env.NEXT_PUBLIC_NLP_URL ||
  "http://localhost:8000";

const serializeEmbedding = (embedding: unknown): string => {
  if (Array.isArray(embedding)) {
    return `[${embedding.map((item) => Number(item)).join(",")}]`;
  }
  if (typeof embedding === "string") {
    return embedding;
  }
  return "[]";
};

const OFF_TOPIC_KEYWORDS = [
  "weather",
  "stock",
  "crypto",
  "sports",
  "movie",
  "music",
  "recipe",
  "code",
  "programming",
  "bug",
  "error",
  "deploy",
  "vercel",
  "render",
  "supabase",
  "github",
  "sql",
];

const detectFeeling = (text: string): string | null => {
  const lowered = text.toLowerCase();
  if (/(anxious|anxiety|nervous|on edge|worried)/.test(lowered)) return "anxious";
  if (/(stressed|stress|pressure|overwhelmed)/.test(lowered)) return "stressed";
  if (/(sad|down|low|hurt|bad)/.test(lowered)) return "sad";
  if (/(tired|exhausted|drained|burned out)/.test(lowered)) return "tired";
  if (/(angry|frustrated|irritated|mad)/.test(lowered)) return "angry";
  if (/(lonely|alone|isolated)/.test(lowered)) return "lonely";
  if (/(hopeful|optimistic|encouraged)/.test(lowered)) return "hopeful";
  if (/(calm|steady|grounded)/.test(lowered)) return "calm";
  if (/(focused|clear|intentional)/.test(lowered)) return "focused";
  return null;
};

const feelingPhrase: Record<string, string> = {
  anxious: "on edge",
  stressed: "under pressure",
  sad: "low",
  tired: "drained",
  angry: "frustrated",
  lonely: "alone",
  hopeful: "a bit hopeful",
  calm: "steady",
  focused: "clear",
};

const isOffTopic = (text: string): boolean => {
  const lowered = text.toLowerCase();
  if (lowered.startsWith("how to") || lowered.startsWith("what is")) return true;
  return OFF_TOPIC_KEYWORDS.some((keyword) => lowered.includes(keyword));
};

const isAbusive = (text: string): boolean => {
  const lowered = text.toLowerCase();
  return (
    lowered.includes("fuck you") ||
    lowered.includes("bitch") ||
    lowered.includes("idiot") ||
    lowered.includes("stupid") ||
    lowered.includes("get the fuck out") ||
    lowered.includes("shut up")
  );
};

const buildFallbackMessage = (text: string, userName?: string | null): string => {
  const namePrefix = userName ? `${userName}, ` : "";
  const trimmed = text.trim();
  const lowered = trimmed.toLowerCase();

  if (!trimmed) {
    return `${namePrefix}I'm here to help you reflect. What feels most present for you right now?`;
  }

  if (isOffTopic(lowered)) {
    return `${namePrefix}I'm here to support journaling and reflection. If you'd like, share how you're feeling or what stood out today.`;
  }

  if (isAbusive(lowered)) {
    return `${namePrefix}I want to keep this space respectful. If you'd like to continue, tell me what's underneath that reaction.`;
  }

  if (["nothing", "idk", "i don't know", "meh"].includes(lowered)) {
    return `${namePrefix}It's okay if nothing stands out. We can keep it small. What is one tiny moment or sensation you noticed today?`;
  }

  if (["wtf", "whatever"].includes(lowered)) {
    return `${namePrefix}That sounds jarring. What set that off, or what was the moment that felt most intense?`;
  }

  const feeling = detectFeeling(lowered);
  if (feeling) {
    const phrase = feelingPhrase[feeling] ?? feeling;
    return `${namePrefix}Thanks for sharing. It sounds ${phrase}. What feels most important to name about that?`;
  }

  return `${namePrefix}Thanks for sharing. What feels most important to explore next?`;
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

    const { data: profile } = await supabase
      .from("profiles")
      .select("name")
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

    let data: {
      assistant_message?: string;
      follow_up_question?: string;
      evidence?: Array<{ entry_id?: string | null; snippet: string; reason: string }>;
      safety?: { crisis?: boolean; reason?: string | null };
      mode?: "deterministic" | "enhanced";
    } | null = null;
    let fallbackUsed = false;

    try {
      const nlpResponse = await fetch(`${getNlpUrl()}/v1/chat/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          user_name: profile?.name ?? null,
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

      if (nlpResponse.ok) {
        data = (await nlpResponse.json()) as {
          assistant_message?: string;
          follow_up_question?: string;
          evidence?: Array<{ entry_id?: string | null; snippet: string; reason: string }>;
          safety?: { crisis?: boolean; reason?: string | null };
          mode?: "deterministic" | "enhanced";
        };
      } else {
        fallbackUsed = true;
      }
    } catch {
      fallbackUsed = true;
    }

    if (fallbackUsed) {
      try {
        const legacyResponse = await fetch(`${getNlpUrl()}/chat-turn`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            user_name: profile?.name ?? null,
            session_id: sessionId,
            selected_prompt: sessionData?.selected_prompt_text ?? "",
            history,
            latest_user_message: latestUserMessage,
            time_budget: timeBudget ?? 5,
            mood: mood ?? null,
            retrieved_entries: retrievedEntries,
          }),
        });

        if (legacyResponse.ok) {
          const legacy = (await legacyResponse.json()) as {
            assistant_message?: {
              validation?: string;
              reflection?: string;
              pattern_connection?: string;
              gentle_nudge?: string;
              follow_up_question?: string;
            };
            safety?: { crisis?: boolean; reason?: string | null };
          };

          const rendered = legacy.assistant_message;
          data = {
            assistant_message: [
              rendered?.validation,
              rendered?.reflection,
              rendered?.pattern_connection,
              rendered?.gentle_nudge,
            ]
              .filter(Boolean)
              .join(" ")
              .trim(),
            follow_up_question: rendered?.follow_up_question ?? "",
            evidence: [],
            safety: legacy.safety ?? { crisis: false, reason: null },
            mode: "deterministic",
          };
          fallbackUsed = false;
        }
      } catch {
        fallbackUsed = true;
      }
    }

    let assistantText = [
      data?.assistant_message,
      data?.follow_up_question,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (!assistantText) {
      assistantText = buildFallbackMessage(latestUserMessage, profile?.name);
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
        evidence: data?.evidence ?? [],
        mode: data?.mode ?? (fallbackUsed ? "deterministic" : "deterministic"),
      },
      assistant_turn: assistantTurn ?? null,
      safety: data?.safety ?? { crisis: false, reason: null },
      warning: fallbackUsed ? "NLP service unavailable. Used a fallback response." : null,
    });
  } catch (err) {
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
