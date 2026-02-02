"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { moodOptions, timeBudgets } from "@/lib/prompts";
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
import { createEntry, listEntries } from "@/lib/db/entries";
import { updateProfilePreferences } from "@/lib/db/profiles";
import { cn } from "@/lib/utils";

interface SessionPageProps {
  params: { session_id: string };
}

export default function JournalSessionPage({ params }: SessionPageProps) {
  const router = useRouter();
  const { ensureUserId } = useSessionStore();
  const { profile, setProfile, setPreferences } = useProfileStore();
  const [turns, setTurns] = useState<JournalTurnRecord[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [safetyNotice, setSafetyNotice] = useState<string | null>(null);
  const [mood, setMood] = useState<string | null>(null);
  const [timeBudget, setTimeBudget] = useState<number>(5);
  const [finishing, setFinishing] = useState(false);
  const [finishMessage, setFinishMessage] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<"ACTIVE" | "COMPLETED">("ACTIVE");
  const [showEnhancedNotice, setShowEnhancedNotice] = useState(false);
  const [updatingEnhanced, setUpdatingEnhanced] = useState(false);

  const enhancedEnabled = profile?.preferences?.enhanced_language_enabled ?? false;
  const enhancedConsent = profile?.preferences?.enhanced_consent ?? false;

  const todayKey = useMemo(() => formatLocalDate(new Date()), []);

  useEffect(() => {
    const loadSession = async () => {
      const { data: sessionData } = await getSession(params.session_id);
      if (sessionData?.status) {
        setSessionStatus(sessionData.status);
      }
    };

    const loadTurns = async () => {
      const { data, error: loadError } = await listTurns(params.session_id);
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
  }, [params.session_id]);

  const persistPreferences = async (nextPreferences: {
    enhanced_language_enabled: boolean;
    enhanced_consent: boolean;
  }) => {
    setPreferences(nextPreferences);
    if (!profile) return;

    const { data, error } = await updateProfilePreferences(profile.user_id, nextPreferences);
    if (error) {
      return;
    }
    if (data) {
      setProfile({
        user_id: data.user_id,
        name: data.name,
        age: data.age,
        occupation: data.occupation ?? undefined,
        preferences: data.preferences ?? nextPreferences,
        createdAt: data.created_at ?? new Date().toISOString(),
      });
    }
  };

  const handleEnhancedToggle = async () => {
    if (updatingEnhanced || !profile) return;
    setUpdatingEnhanced(true);

    const nextEnabled = !enhancedEnabled;
    const nextConsent = enhancedConsent || nextEnabled;
    await persistPreferences({
      enhanced_language_enabled: nextEnabled,
      enhanced_consent: nextConsent,
    });

    if (!enhancedConsent && nextEnabled) {
      setShowEnhancedNotice(true);
      setTimeout(() => setShowEnhancedNotice(false), 4500);
    }

    setUpdatingEnhanced(false);
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    if (safetyNotice) return;
    if (sessionStatus === "COMPLETED") return;

    setSending(true);
    setError(null);
    const userId = ensureUserId();
    const message = input.trim();

    const { data: userTurn, error: userError } = await createTurn({
      session_id: params.session_id,
      user_id: userId,
      role: "user",
      content: message,
    });

    if (userError || !userTurn) {
      setError("We couldn't send your message yet. Please try again.");
      setSending(false);
      return;
    }

    const nextTurns = [...turns, userTurn];
    setTurns(nextTurns);
    setInput("");

    try {
      const response = await fetch("/api/chat/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          sessionId: params.session_id,
          latestUserMessage: message,
          timeBudget,
          mood,
          enhancedLanguageEnabled: enhancedEnabled,
        }),
      });

      if (!response.ok) {
        setError("We couldn't generate a response yet.");
        setSending(false);
        return;
      }

      const data = (await response.json()) as {
        assistant?: { message?: string };
        assistant_turn?: JournalTurnRecord | null;
        safety?: { crisis?: boolean; reason?: string | null };
      };

      if (data.safety?.crisis) {
        setSafetyNotice(
          "If you're feeling overwhelmed, consider reaching out to someone you trust. If you're in immediate danger, contact your local emergency number."
        );
      }

      if (data.assistant_turn) {
        setTurns((prev) => [...prev, data.assistant_turn as JournalTurnRecord]);
      } else if (data.assistant?.message) {
        const { data: assistantTurn } = await createTurn({
          session_id: params.session_id,
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

    const { data: existingEntries } = await listEntries(userId, 1);
    const isFirst = !existingEntries || existingEntries.length === 0;

    const { error: createError, data: entryData } = await createEntry({
      user_id: userId,
      entry_date: todayKey,
      mood,
      time_budget: timeBudget,
      content: combined,
    });

    if (createError || !entryData) {
      setError("We couldn't save your journal yet. Please try again.");
      setFinishing(false);
      return;
    }

    await updateSessionStatus(params.session_id, "COMPLETED");
    setSessionStatus("COMPLETED");
    window.dispatchEvent(new Event("journal-session-updated"));

    await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId: entryData.id }),
    });

    const baseMessage = isFirst
      ? "Hurray! You completed your first journal. Keep it up."
      : "Nice work. You showed up again today.";
    setFinishMessage(`${baseMessage} Want a 2-minute reflection prompt for tomorrow?`);
    setTimeout(() => router.push("/"), 900);
    setFinishing(false);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr,300px]">
      <Card className="flex h-[70vh] flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Journal Session</h2>
            <p className="text-xs text-muted-foreground">Private session</p>
          </div>
          <div className="flex items-center gap-2">
            {enhancedEnabled && <Badge variant="secondary">Enhanced wording</Badge>}
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

        <div className="flex items-center justify-between rounded-2xl border bg-muted/40 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">Enhanced wording (optional)</p>
            <p className="text-xs text-muted-foreground">
              Improves tone only. Insights remain grounded in your entries.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enhancedEnabled}
            onClick={handleEnhancedToggle}
            disabled={!profile}
            className={cn(
              "relative inline-flex h-6 w-11 items-center rounded-full transition",
              enhancedEnabled ? "bg-foreground" : "bg-muted",
              !profile && "cursor-not-allowed opacity-60"
            )}
          >
            <span
              className={cn(
                "inline-block h-5 w-5 transform rounded-full bg-background shadow transition",
                enhancedEnabled ? "translate-x-5" : "translate-x-1"
              )}
            />
          </button>
        </div>

        {showEnhancedNotice && (
          <Card className="border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
            We send only a short structured plan (not your full history) to OpenAI to improve
            wording. You can turn this off anytime.
          </Card>
        )}

        <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl border bg-background p-4">
          {loading && <p className="text-sm text-muted-foreground">Loading session...</p>}
          {!loading &&
            turns.map((turn) => (
              <div
                key={turn.id}
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                  turn.role === "assistant"
                    ? "bg-muted text-foreground"
                    : "ml-auto bg-foreground text-background"
                }`}
              >
                {turn.content}
              </div>
            ))}
          {sending && (
            <div className="max-w-[85%] rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
              Assistant is typing...
            </div>
          )}
        </div>

        {safetyNotice && (
          <Card className="border-destructive/30 bg-destructive/5 p-4 text-xs text-destructive">
            {safetyNotice}
          </Card>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        {finishMessage && <p className="text-sm text-emerald-600">{finishMessage}</p>}

        <div className="flex gap-2">
          <Textarea
            className="min-h-[72px]"
            placeholder="Type your thoughts..."
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={sending || Boolean(safetyNotice) || sessionStatus === "COMPLETED"}
          />
          <Button
            onClick={handleSend}
            disabled={sending || Boolean(safetyNotice) || sessionStatus === "COMPLETED"}
          >
            {sending ? "Sending..." : "Send"}
          </Button>
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={() => router.push("/journal")}>Back</Button>
        </div>
      </Card>

      <Card className="space-y-4 p-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Mood</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {moodOptions.map((option) => (
              <Button
                key={option}
                size="sm"
                variant={mood === option ? "default" : "outline"}
                onClick={() => setMood(option)}
              >
                {option}
              </Button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Time budget</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {timeBudgets.map((option) => (
              <Button
                key={option}
                size="sm"
                variant={timeBudget === option ? "default" : "outline"}
                onClick={() => setTimeBudget(option)}
              >
                {option} min
              </Button>
            ))}
          </div>
        </div>
        {sessionStatus === "COMPLETED" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            Completed
          </div>
        )}
      </Card>
    </div>
  );
}
