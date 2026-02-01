"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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
  type JournalTurnRecord,
} from "@/lib/db/sessions";
import { getEntryForDate, createEntry, updateEntry } from "@/lib/db/entries";

interface SessionPageProps {
  params: { session_id: string };
}

export default function JournalSessionPage({ params }: SessionPageProps) {
  const router = useRouter();
  const { ensureUserId } = useSessionStore();
  const { profile } = useProfileStore();
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
  const enhancedEnabled = profile?.preferences?.enhanced_language_enabled ?? false;

  const todayKey = useMemo(() => formatLocalDate(new Date()), []);

  useEffect(() => {
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

    loadTurns();
  }, [params.session_id]);

  const handleSend = async () => {
    if (!input.trim()) return;
    if (safetyNotice) return;

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
      const response = await fetch("/api/chat-turn", {
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

  const handleFinish = async () => {
    setFinishing(true);
    setError(null);
    const userId = ensureUserId();
    const userTurns = turns.filter((turn) => turn.role === "user");
    const combined = userTurns.map((turn) => turn.content).join("\n\n");

    if (!combined.trim()) {
      setError("Add at least one response before finishing.");
      setFinishing(false);
      return;
    }

    const { data: existing } = await getEntryForDate(userId, todayKey);
    if (existing) {
      const { error: updateError } = await updateEntry(existing.id, {
        content: `${existing.content}\n\n${combined}`,
        mood,
        time_budget: timeBudget,
      });
      if (updateError) {
        setError("We couldn't save your entry yet. Please try again.");
        setFinishing(false);
        return;
      }
    } else {
      const { error: createError } = await createEntry({
        user_id: userId,
        entry_date: todayKey,
        mood,
        time_budget: timeBudget,
        content: combined,
      });
      if (createError) {
        setError("We couldn't save your entry yet. Please try again.");
        setFinishing(false);
        return;
      }
    }

    await updateSessionStatus(params.session_id, "COMPLETED");

    const { data: updatedEntry } = await getEntryForDate(userId, todayKey);
    if (updatedEntry) {
      await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId: updatedEntry.id }),
      });
    }

    setFinishMessage("Hurray, Day completed! Your reflections were saved.");
    setTimeout(() => router.push("/"), 800);
    setFinishing(false);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr,300px]">
      <Card className="flex h-[70vh] flex-col gap-4 p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Journal Session</h2>
            <p className="text-xs text-muted-foreground">Private session</p>
          </div>
          <div className="flex items-center gap-2">
            {enhancedEnabled && <Badge variant="secondary">Enhanced</Badge>}
            <Badge variant="secondary">Active</Badge>
          </div>
        </div>

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
            disabled={sending || Boolean(safetyNotice)}
          />
          <Button onClick={handleSend} disabled={sending || Boolean(safetyNotice)}>
            {sending ? "Sending..." : "Send"}
          </Button>
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={() => router.push("/journal")}>
            Back
          </Button>
          <Button onClick={handleFinish} disabled={finishing}>
            {finishing ? "Finishing..." : "Finish session"}
          </Button>
        </div>
      </Card>

      <Card className="space-y-4 p-6 shadow-sm">
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
      </Card>
    </div>
  );
}
