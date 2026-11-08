"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatLocalDate } from "@/lib/date";
import { useSessionStore } from "@/store/use-session-store";
import { useProfileStore } from "@/store/use-profile-store";
import {
  createTurn,
  listTurns,
  updateSessionStatus,
  getSession,
  type JournalTurnRecord,
} from "@/lib/db/sessions";
import { createEntry, getEntryForSession, listEntries, updateEntry } from "@/lib/db/entries";
import { apiFetch } from "@/lib/auth";
import CrisisResources from "@/components/crisis-resources";
import { sentenceStarters } from "@/lib/prompts";
import { sessionPace } from "@/lib/session-pace";

export default function JournalSessionPage() {
  const router = useRouter();
  const params = useParams<{ session_id?: string | string[] }>();
  const sessionId = Array.isArray(params?.session_id)
    ? params.session_id[0]
    : params?.session_id;
  const { ensureUserId } = useSessionStore();
  const { profile } = useProfileStore();
  const [turns, setTurns] = useState<JournalTurnRecord[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [crisis, setCrisis] = useState(false);
  const [mood, setMood] = useState<string | null>(null);
  const [timeBudget, setTimeBudget] = useState<number>(5);
  const [entryDate, setEntryDate] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [finishMessage, setFinishMessage] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<"ACTIVE" | "COMPLETED">("ACTIVE");
  const [enhancedStatus, setEnhancedStatus] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // The time left updates every half minute.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const enhancedEnabled = profile?.preferences?.enhanced_language_enabled ?? false;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [placeholder, setPlaceholder] = useState("Type your thoughts...");

  // The prompt card's example becomes the placeholder, so the box shows what an answer can look like.
  useEffect(() => {
    if (!sessionId) return;
    try {
      const example = sessionStorage.getItem(`dearme:prompt-example:${sessionId}`);
      if (example) setPlaceholder(example);
    } catch {
      // Storage unavailable: keep the default placeholder.
    }
  }, [sessionId]);

  const insertStarter = (starter: string) => {
    const opener = starter.replace(/…$/, " ");
    setInput((current) => (current.trim() ? `${current.trimEnd()}\n${opener}` : opener));
    requestAnimationFrame(() => {
      const box = textareaRef.current;
      if (!box) return;
      box.focus();
      box.setSelectionRange(box.value.length, box.value.length);
    });
  };

  const todayKey = useMemo(() => formatLocalDate(new Date()), []);

  useEffect(() => {
    const loadSession = async () => {
      if (!sessionId) return;
      const { data: sessionData } = await getSession(sessionId);
      if (sessionData?.status) {
        setSessionStatus(sessionData.status);
      }
      if (sessionData) {
        setMood(sessionData.mood ?? null);
        setTimeBudget(sessionData.time_budget ?? 5);
        setEntryDate(sessionData.entry_date ?? null);
        setStartedAt(sessionData.created_at ?? null);
      }
    };

    const loadTurns = async () => {
      if (!sessionId) return;
      const { data, error: loadError } = await listTurns(sessionId);
      if (loadError) {
        setError("We couldn't load this session yet.");
        setLoading(false);
        return;
      }
      setTurns(data);
      setLoading(false);
    };

    loadSession();
    loadTurns();
  }, [sessionId]);

  const handleSend = async () => {
    if (!input.trim()) return;
    if (sessionStatus === "COMPLETED") return;

    setSending(true);
    setError(null);
    setEnhancedStatus(null);
    setNotice(null);
    const userId = ensureUserId();
    const message = input.trim();

    if (!sessionId) {
      setError("We couldn't load this session yet.");
      setSending(false);
      return;
    }

    const { data: userTurn, error: userError } = await createTurn({
      session_id: sessionId,
      user_id: userId,
      role: "user",
      content: message,
    });

    if (userError || !userTurn) {
      setError("We couldn't send your message yet. Please try again.");
      setSending(false);
      return;
    }

    // The phase comes from the session before this answer: explore, ask about tomorrow, or finish.
    const phase = sessionPace(turns, timeBudget, startedAt).nextPhase;
    const nextTurns = [...turns, userTurn];
    setTurns(nextTurns);
    setInput("");

    try {
      const response = await apiFetch("/api/chat/turn", { sessionId, latestUserMessage: message, phase });

      if (!response.ok) {
        let errorMessage = "We couldn't generate a response yet.";
        try {
          const payload = (await response.json()) as { error?: string };
          if (payload?.error) {
            errorMessage = payload.error;
          }
        } catch {
          // ignore
        }
        setError(errorMessage);
        setSending(false);
        return;
      }

      const data = (await response.json()) as {
        assistant?: { message?: string; mode?: "deterministic" | "enhanced" };
        assistant_turn?: JournalTurnRecord | null;
        safety?: { crisis?: boolean; reason?: string | null };
        warning?: string | null;
      };

      if (data.safety?.crisis) {
        setCrisis(true);
      }
      if (data.warning) {
        setNotice(data.warning);
      }
      if (enhancedEnabled && !data.safety?.crisis && data.assistant?.mode !== "enhanced") {
        setEnhancedStatus("AI replies aren't available right now, so the built-in companion replied.");
      }

      if (data.assistant_turn) {
        setTurns((prev) => [...prev, data.assistant_turn as JournalTurnRecord]);
      } else if (data.assistant?.message) {
        const { data: assistantTurn } = await createTurn({
          session_id: sessionId,
          user_id: userId,
          role: "assistant",
          content: data.assistant.message,
        });
        if (assistantTurn) {
          setTurns((prev) => [...prev, assistantTurn]);
        }
      }
    } catch {
      setError("We couldn't generate a response yet.");
    } finally {
      setSending(false);
    }
  };

  const handleComplete = async () => {
    if (sessionStatus === "COMPLETED") return;
    setFinishing(true);
    setError(null);
    const userId = ensureUserId();
    const userTurns = turns.filter((turn) => turn.role === "user");
    const combined = userTurns.map((turn) => turn.content).join("\n\n");

    if (!combined.trim()) {
      setError("Add at least one response before completing.");
      setFinishing(false);
      return;
    }

    if (!sessionId) {
      setError("We couldn't load this session yet.");
      setFinishing(false);
      return;
    }

    const { data: existingEntries } = await listEntries(userId, 1);
    const isFirst = !existingEntries || existingEntries.length === 0;
    // One entry per session: finishing a second session today adds a new entry
    // instead of overwriting the first one.
    const { data: existingEntry } = await getEntryForSession(sessionId);

    let entryData = existingEntry;
    if (existingEntry) {
      const { data: updatedEntry, error: updateError } = await updateEntry(existingEntry.id, {
        content: combined,
        mood,
        time_budget: timeBudget,
      });
      if (updateError || !updatedEntry) {
        setError("We couldn't update your journal yet. Please try again.");
        setFinishing(false);
        return;
      }
      entryData = updatedEntry;
    } else {
      const { error: createError, data: createdEntry } = await createEntry({
        user_id: userId,
        entry_date: entryDate ?? todayKey,
        mood,
        time_budget: timeBudget,
        content: combined,
        session_id: sessionId,
      });
      if (createError || !createdEntry) {
        setError("We couldn't save your journal yet. Please try again.");
        setFinishing(false);
        return;
      }
      entryData = createdEntry;
    }

    await updateSessionStatus(sessionId, "COMPLETED");
    setSessionStatus("COMPLETED");
    window.dispatchEvent(new Event("journal-session-updated"));

    const analyzeResponse = await apiFetch("/api/analyze", { entryId: entryData.id });
    if (!analyzeResponse.ok) {
      setError("We saved your journal, but insights couldn't update yet.");
    }

    const baseMessage = isFirst
      ? "Hurray! You completed your first journal. Keep it up."
      : "Nice work. You showed up again today.";
    setFinishMessage(`${baseMessage} Want a 2-minute reflection prompt for tomorrow?`);
    setTimeout(() => router.push("/"), 900);
    setFinishing(false);
  };

  const pace = sessionPace(turns, timeBudget, startedAt, now);
  const steps = pace.finished ? pace.total : Math.min(pace.answered, pace.total);
  const paceLabel = pace.finished
    ? "Done · your page is ready"
    : pace.closingAsked
      ? "Last step · looking ahead to tomorrow"
      : `Step ${Math.min(pace.answered + 1, pace.total)} of ${pace.total}${pace.minutesLeft > 0 ? ` · about ${pace.minutesLeft} min left` : ""}`;

  return (
    <div className="grid gap-6">
      <Card className="flex h-[80vh] flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Journal Session</h2>
            <p className="text-xs text-muted-foreground">Private session</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {enhancedEnabled && <Badge variant="secondary">AI replies</Badge>}
            <Badge variant="secondary">{sessionStatus === "COMPLETED" ? "Completed" : "Active"}</Badge>
            <Button
              size="sm"
              onClick={handleComplete}
              disabled={finishing || sessionStatus === "COMPLETED"}
            >
              {finishing ? "Completing..." : "Complete journal"}
            </Button>
          </div>
        </div>

        {sessionStatus === "ACTIVE" && !loading && (
          <div className="space-y-1.5" aria-label="Journal progress">
            <div
              className="flex gap-1.5"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={pace.total}
              aria-valuenow={steps}
              aria-valuetext={paceLabel}
            >
              {Array.from({ length: pace.total }, (_, index) => (
                <span
                  key={index}
                  className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${
                    index < steps ? "bg-primary" : index === steps && !pace.finished ? "bg-primary/35" : "bg-muted"
                  }`}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{paceLabel}</p>
          </div>
        )}

        <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl border bg-muted/10 p-4 shadow-soft-gray">
          {loading && <p className="text-sm text-muted-foreground">Loading session...</p>}
          {!loading &&
            turns.map((turn) => (
              <div
                key={turn.id}
                className={`max-w-[85%] rounded-2xl border px-4 py-3 text-sm shadow-soft-gray ${
                  turn.role === "assistant"
                    ? "bg-surface-2 text-foreground border-divider"
                    : "ml-auto bg-primary text-primary-foreground border-transparent"
                }`}
              >
                {turn.content}
              </div>
            ))}
          {sending && (
            <div className="max-w-[85%] rounded-2xl border border-divider bg-surface-2 px-4 py-3 text-sm text-muted-foreground shadow-soft-gray">
              Assistant is typing...
            </div>
          )}
        </div>

        {crisis && <CrisisResources />}

        {error && <p className="text-sm text-destructive">{error}</p>}
        {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
        {enhancedStatus && <p className="text-sm text-muted-foreground">{enhancedStatus}</p>}
        {finishMessage && <p className="text-sm text-emerald-600">{finishMessage}</p>}

        {pace.finished && sessionStatus === "ACTIVE" && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Your page is ready</p>
              <p className="text-xs text-muted-foreground">Written out with a note to yourself and one small thing for tomorrow.</p>
            </div>
            <Button size="sm" onClick={handleComplete} disabled={finishing}>
              {finishing ? "Completing..." : "Complete journal"}
            </Button>
          </div>
        )}

        {sessionStatus === "ACTIVE" && !turns.some((turn) => turn.role === "user") && (
          <div className="flex flex-wrap items-center gap-2" aria-label="Sentence starters">
            <span className="text-xs text-muted-foreground">Stuck? Try starting with</span>
            {sentenceStarters.map((starter) => (
              <button
                key={starter}
                type="button"
                onClick={() => insertStarter(starter)}
                disabled={sending}
                className="cursor-pointer rounded-full border border-divider bg-background px-3 py-1 text-xs text-muted-foreground transition-colors duration-150 hover:border-foreground/30 hover:bg-foreground/[0.04] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50"
              >
                {starter}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            className="min-h-[72px]"
            placeholder={pace.finished ? "Anything else? It'll be added to your page." : placeholder}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={sending || sessionStatus === "COMPLETED"}
          />
          <Button
            onClick={handleSend}
            disabled={sending || sessionStatus === "COMPLETED"}
          >
            {sending ? "Sending..." : "Send"}
          </Button>
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={() => router.push("/journal")}>Back</Button>
        </div>
      </Card>

    </div>
  );
}
