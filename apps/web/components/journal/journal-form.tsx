"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { moodOptions, timeBudgets } from "@/lib/prompts";
import { getEntryForDate, type EntryRecord } from "@/lib/db/entries";
import { formatLocalDate } from "@/lib/date";
import { useSessionStore } from "@/store/use-session-store";
import {
  createSession,
  createTurn,
  getActiveSession,
  type JournalSessionRecord,
} from "@/lib/db/sessions";

const defaultTimeBudget = 5;

export default function JournalForm() {
  const { ensureUserId } = useSessionStore();
  const router = useRouter();
  const [entry, setEntry] = useState<EntryRecord | null>(null);
  const [activeSession, setActiveSession] = useState<JournalSessionRecord | null>(null);
  const [mood, setMood] = useState<string | null>(null);
  const [timeBudget, setTimeBudget] = useState<number>(defaultTimeBudget);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prompts, setPrompts] = useState<
    Array<{
      id: string;
      text: string;
      reason: string;
      evidence: Array<{ entry_id?: string | null; snippet: string; reason: string }>;
    }>
  >([]);
  const [promptsLoading, setPromptsLoading] = useState(true);
  const [safetyNotice, setSafetyNotice] = useState<string | null>(null);

  const todayKey = useMemo(() => formatLocalDate(new Date()), []);

  useEffect(() => {
    const loadEntry = async () => {
      const userId = ensureUserId();
      const [{ data: entryData, error: entryError }, { data: sessionData }] = await Promise.all([
        getEntryForDate(userId, todayKey),
        getActiveSession(userId, todayKey),
      ]);
      if (entryError) {
        setError("We couldn't load today's entry.");
        setLoading(false);
        return;
      }

      if (entryData) {
        setEntry(entryData);
        setMood(entryData.mood ?? null);
        setTimeBudget(entryData.time_budget);
      }
      if (sessionData) {
        setActiveSession(sessionData);
      }
      setLoading(false);
    };

    loadEntry();
  }, [ensureUserId, todayKey]);

  useEffect(() => {
    const loadPrompts = async () => {
      const userId = ensureUserId();
      try {
        const response = await fetch("/api/generate-prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, mood, timeBudget }),
        });
        if (response.ok) {
          const data = (await response.json()) as {
            prompts?: Array<{
              id: string;
              text: string;
              reason: string;
              evidence: Array<{ entry_id?: string | null; snippet: string; reason: string }>;
            }>;
            safety?: { crisis?: boolean; reason?: string | null };
          };
          if (data.safety?.crisis) {
            setSafetyNotice(
              "If you're feeling overwhelmed, consider reaching out to someone you trust."
            );
            setPrompts([]);
          } else if (data.prompts && data.prompts.length > 0) {
            setPrompts(data.prompts);
          }
        }
      } catch {
        // fall back to default prompts
      } finally {
        setPromptsLoading(false);
      }
    };

    loadPrompts();
  }, [ensureUserId, mood, timeBudget]);

  const handlePromptSelect = async (prompt: { id: string; text: string }) => {
    setStarting(true);
    setError(null);
    const userId = ensureUserId();

    const { data, error: sessionError } = await createSession({
      user_id: userId,
      entry_date: todayKey,
      selected_prompt_id: prompt.id,
      selected_prompt_text: prompt.text,
      status: "ACTIVE",
    });

    if (sessionError || !data) {
      setError("We couldn't start a session yet. Please try again.");
      setStarting(false);
      return;
    }

    await createTurn({
      session_id: data.id,
      user_id: userId,
      role: "assistant",
      content: prompt.text,
    });

    setStarting(false);
    router.push(`/journal/session/${data.id}`);
  };

  return (
    <Card className="flex h-full flex-col gap-4 p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Today's Journal</h2>
          <p className="text-xs text-muted-foreground">Private Session</p>
        </div>
        {entry && (
          <Badge variant="secondary" className="gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Entry saved today
          </Badge>
        )}
      </div>

      {loading ? (
        <div className="rounded-2xl border p-4 text-sm text-muted-foreground">Loading...</div>
      ) : (
        <>
          {activeSession && (
            <Card className="border-dashed p-4 text-sm text-muted-foreground">
              You already have an active session today.
              <Button
                className="mt-3"
                onClick={() => router.push(`/journal/session/${activeSession.id}`)}
              >
                Continue session
              </Button>
            </Card>
          )}
          <div className="space-y-3">
            <p className="text-sm font-medium">Mood (optional)</p>
            <div className="flex flex-wrap gap-2">
              {moodOptions.map((option) => (
                <Button
                  key={option}
                  variant={mood === option ? "default" : "outline"}
                  onClick={() => setMood(option)}
                >
                  {option}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Time budget</p>
            <div className="flex flex-wrap gap-2">
              {timeBudgets.map((option) => (
                <Button
                  key={option}
                  variant={timeBudget === option ? "default" : "outline"}
                  onClick={() => setTimeBudget(option)}
                >
                  {option} min
                </Button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border bg-muted/40 p-4 text-sm text-muted-foreground">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              AI prompts
            </p>
            {safetyNotice ? (
              <p className="mt-2 text-xs text-muted-foreground">{safetyNotice}</p>
            ) : promptsLoading ? (
              <p className="mt-2 text-xs text-muted-foreground">Loading prompts...</p>
            ) : (
              <div className="mt-4 space-y-3">
                {prompts.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No prompts yet. Save more entries to see personalized prompts.
                  </p>
                )}
                {prompts.map((prompt) => (
                  <button
                    key={prompt.id}
                    type="button"
                    onClick={() => handlePromptSelect(prompt)}
                    className="w-full rounded-2xl border bg-background p-4 text-left transition hover:border-foreground/20"
                    disabled={starting || Boolean(activeSession)}
                  >
                    <p className="text-sm font-semibold text-foreground">{prompt.text}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{prompt.reason}</p>
                    {prompt.evidence?.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {prompt.evidence.map((item, index) => (
                          <div key={`${prompt.id}-${index}`} className="rounded-xl bg-muted/60 p-3">
                            <p className="text-xs text-muted-foreground">{item.reason}</p>
                            <p className="text-xs text-muted-foreground">"{item.snippet}"</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </>
      )}
    </Card>
  );
}
