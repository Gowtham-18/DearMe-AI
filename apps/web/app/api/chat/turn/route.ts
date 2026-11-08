import { NextResponse } from "next/server";
import { chatTurnBodySchema, chatTurnV1ResponseSchema, embedResponseSchema } from "@dearme/shared";

import { getRequestContext, isRateLimited, tooManyRequests } from "@/lib/supabase/server";
import { callNlp, EMBEDDING_DIM, serializeEmbedding } from "@/lib/nlp";
import { CRISIS_MESSAGE, detectCrisis } from "@/lib/safety";
import { loadMemories, memoryEnabled } from "@/lib/memory";
import { isJournalLocked, mostSimilar, unlockRequired } from "@/lib/journal-lock-server";

export const maxDuration = 60;

type Evidence = { entry_id?: string | null; snippet: string; reason: string };

const fallbackReply = (name?: string | null, phase?: string) => {
  // The NLP service is asleep: still close the session the same way.
  if (phase === "closing") return "Thank you for sharing that. Before you close the page, what's one small thing that would make tomorrow a good day?";
  if (phase === "finish") return "Thank you for writing today. Your page is ready, with a note to yourself and one small thing for tomorrow. Tap Complete journal to see it.";
  if (phase === "after") return "Added to your page. Tap Complete journal whenever you're ready.";
  return `${name ? `${name}, t` : "T"}hanks for sharing that. What feels most important to explore next?`;
};

export async function POST(req: Request) {
  const ctx = await getRequestContext(req);
  if (ctx instanceof NextResponse) return ctx;
  const { supabase, user } = ctx;

  const parsed = chatTurnBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Your message couldn't be sent. Please try again." }, { status: 400 });
  }
  const { sessionId, latestUserMessage, phase } = parsed.data;

  if (await isRateLimited(supabase, "chat", 40, 600)) return tooManyRequests();

  // A locked journal is ciphertext in the database: use what the browser decrypted for this request.
  const locked = (await isJournalLocked(supabase, user.id)) ? parsed.data.locked : null;
  if (locked === undefined) return unlockRequired();
  if (locked) return lockedTurn(ctx, parsed.data.sessionId, latestUserMessage, locked, phase);

  // RLS guarantees these only return the signed-in user's rows.
  const [{ data: session }, { data: profile }, { data: turns }, { data: recentEntries }, memories] = await Promise.all([
    supabase
      .from("journal_sessions")
      .select("id, status, selected_prompt_text, mood, time_budget, entry_date")
      .eq("id", sessionId)
      .maybeSingle(),
    supabase.from("profiles").select("name, preferences").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("journal_turns")
      .select("role, content, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("entries")
      .select("id, content, created_at, mood")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
    loadMemories(supabase, user.id),
  ]);

  if (!session) {
    return NextResponse.json({ error: "This journal session wasn't found." }, { status: 404 });
  }
  if (session.status === "COMPLETED") {
    return NextResponse.json({ error: "This session is already complete." }, { status: 409 });
  }

  const preferences = (profile?.preferences ?? {}) as {
    enhanced_language_enabled?: boolean;
    enhanced_consent?: boolean;
  };
  const enhancedAllowed = Boolean(preferences.enhanced_language_enabled && preferences.enhanced_consent);
  const history = (turns ?? []).reverse().map((turn) => ({ role: turn.role, content: turn.content }));

  // 1) Similar past entries (cheap embedding call; skipped if the service is slow).
  let retrievedEntries: Array<{ entry_id: string; text: string; created_at?: string; mood?: string | null; similarity?: number }> = [];
  const embedResult = await callNlp("/v1/embed", { text: latestUserMessage }, 6000, embedResponseSchema);
  if (embedResult.ok && embedResult.data.embedding.length === EMBEDDING_DIM) {
    const { data: matches } = await supabase.rpc("match_journal_entries", {
      target_user_id: user.id,
      query_embedding: serializeEmbedding(embedResult.data.embedding),
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
      retrievedEntries = (entries ?? []).map((entry) => ({
        entry_id: entry.id,
        text: entry.content,
        created_at: entry.created_at ?? undefined,
        mood: entry.mood,
        similarity: similarity.get(entry.id),
      }));
    }
  }

  // 2) Companion reply.
  const chatResult = await callNlp(
    "/v1/chat/turn",
    {
      user_id: user.id,
      user_name: profile?.name ?? null,
      chat_id: sessionId,
      selected_prompt: session.selected_prompt_text ?? "",
      user_message: latestUserMessage,
      mood: session.mood ?? null,
      time_budget_min: session.time_budget ?? 5,
      history,
      recent_entries: (recentEntries ?? []).map((entry) => ({
        entry_id: entry.id,
        text: entry.content,
        created_at: entry.created_at ?? undefined,
        mood: entry.mood,
      })),
      retrieved_entries: retrievedEntries,
      enhanced_language: enhancedAllowed,
      today: session.entry_date ?? null,
      memories,
      phase: phase ?? null,
    },
    enhancedAllowed ? 25000 : 15000,
    chatTurnV1ResponseSchema
  );

  let message: string;
  let evidence: Evidence[] = [];
  let mode: "deterministic" | "enhanced" = "deterministic";
  let crisis = false;
  const fallbackUsed = !chatResult.ok;

  if (chatResult.ok) {
    const data = chatResult.data;
    message = [data.assistant_message, data.follow_up_question].filter(Boolean).join(" ").trim();
    evidence = data.evidence;
    mode = data.mode;
    crisis = data.safety.crisis;
  } else {
    // The NLP service is down or asleep: still recognise crisis language locally.
    crisis = detectCrisis(latestUserMessage);
    message = crisis ? CRISIS_MESSAGE : fallbackReply(profile?.name, phase);
  }
  if (!message) message = fallbackReply(profile?.name, phase);

  const { data: assistantTurn } = await supabase
    .from("journal_turns")
    .insert({ session_id: sessionId, user_id: user.id, role: "assistant", content: message })
    .select("*")
    .maybeSingle();

  return NextResponse.json({
    assistant: { message, evidence, mode },
    assistant_turn: assistantTurn ?? null,
    safety: { crisis, reason: crisis ? "Detected crisis-related language." : null },
    enhanced_allowed: enhancedAllowed,
    warning: fallbackUsed ? "The reflection service is waking up, so a simple reply was used." : null,
  });
}

type LockedChatContext = NonNullable<ReturnType<typeof chatTurnBodySchema.parse>["locked"]>;

/** The same reply for a locked journal, from decrypted context. The browser saves the reply encrypted. */
async function lockedTurn(
  { supabase, user }: { supabase: import("@supabase/supabase-js").SupabaseClient; user: { id: string } },
  sessionId: string,
  latestUserMessage: string,
  locked: LockedChatContext,
  phase?: string
) {
  const [{ data: session }, { data: profile }, remember] = await Promise.all([
    supabase.from("journal_sessions").select("id, status, mood, time_budget, entry_date").eq("id", sessionId).maybeSingle(),
    supabase.from("profiles").select("name, preferences").eq("user_id", user.id).maybeSingle(),
    memoryEnabled(supabase, user.id),
  ]);
  if (!session) {
    return NextResponse.json({ error: "This journal session wasn't found." }, { status: 404 });
  }
  if (session.status === "COMPLETED") {
    return NextResponse.json({ error: "This session is already complete." }, { status: 409 });
  }
  const preferences = (profile?.preferences ?? {}) as { enhanced_language_enabled?: boolean; enhanced_consent?: boolean };
  const enhancedAllowed = Boolean(preferences.enhanced_language_enabled && preferences.enhanced_consent);

  let retrievedEntries: Array<{ entry_id: string; text: string; created_at?: string; mood?: string | null; similarity?: number }> = [];
  const embedResult = await callNlp("/v1/embed", { text: latestUserMessage }, 6000, embedResponseSchema);
  if (embedResult.ok && embedResult.data.embedding.length === EMBEDDING_DIM) {
    retrievedEntries = mostSimilar(locked.entries, embedResult.data.embedding, 5).map(({ entry, similarity }) => ({
      entry_id: entry.entry_id,
      text: entry.text,
      created_at: entry.created_at ?? undefined,
      mood: entry.mood ?? null,
      similarity,
    }));
  }

  const chatResult = await callNlp(
    "/v1/chat/turn",
    {
      user_id: user.id,
      user_name: profile?.name ?? null,
      chat_id: sessionId,
      selected_prompt: locked.selectedPrompt,
      user_message: latestUserMessage,
      mood: session.mood ?? null,
      time_budget_min: session.time_budget ?? 5,
      history: locked.history,
      recent_entries: locked.entries.slice(0, 5).map((entry) => ({
        entry_id: entry.entry_id,
        text: entry.text,
        created_at: entry.created_at ?? undefined,
        mood: entry.mood ?? null,
      })),
      retrieved_entries: retrievedEntries,
      enhanced_language: enhancedAllowed,
      today: session.entry_date ?? null,
      memories: remember ? locked.memories : [],
      phase: phase ?? null,
    },
    enhancedAllowed ? 25000 : 15000,
    chatTurnV1ResponseSchema
  );

  let message: string;
  let evidence: Evidence[] = [];
  let mode: "deterministic" | "enhanced" = "deterministic";
  let crisis = false;
  if (chatResult.ok) {
    const data = chatResult.data;
    message = [data.assistant_message, data.follow_up_question].filter(Boolean).join(" ").trim();
    evidence = data.evidence;
    mode = data.mode;
    crisis = data.safety.crisis;
  } else {
    crisis = detectCrisis(latestUserMessage);
    message = crisis ? CRISIS_MESSAGE : fallbackReply(profile?.name, phase);
  }
  if (!message) message = fallbackReply(profile?.name, phase);

  return NextResponse.json({
    assistant: { message, evidence, mode },
    assistant_turn: null,
    save_assistant_turn: true,
    safety: { crisis, reason: crisis ? "Detected crisis-related language." : null },
    enhanced_allowed: enhancedAllowed,
    warning: chatResult.ok ? null : "The reflection service is waking up, so a simple reply was used.",
  });
}
