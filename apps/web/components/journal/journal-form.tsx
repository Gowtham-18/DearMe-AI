"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { moodOptions, timeBudgets, journalPrompts } from "@/lib/prompts";
import { formatLocalDate } from "@/lib/date";
import { emptyStateCopy, pickCopy } from "@/lib/copy";
import { useSessionStore } from "@/store/use-session-store";
import { useProfileStore } from "@/store/use-profile-store";
import { createSession, createTurn } from "@/lib/db/sessions";

const defaultTimeBudget = 5;

type PromptItem = {
  id: string;
  text: string;
  reason: string;
  evidence: Array<{ entry_id?: string | null; snippet: string; reason: string }>;
};

const buildFallbackPrompts = (mood: string | null, timeBudget: number): PromptItem[] => {
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

export default function JournalForm() {
  const { ensureUserId } = useSessionStore();
  const { profile } = useProfileStore();
  const router = useRouter();
  const [mood, setMood] = useState<string | null>(null);
  const [timeBudget, setTimeBudget] = useState<number>(defaultTimeBudget);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [promptsLoading, setPromptsLoading] = useState(true);
  const [safetyNotice, setSafetyNotice] = useState<string | null>(null);
  const [directMessage, setDirectMessage] = useState("");

  const todayKey = useMemo(() => formatLocalDate(new Date()), []);
  const emptyCopy = useMemo(
    () => pickCopy(emptyStateCopy.todayJournal, new Date().toDateString()),
    []
  );

  useEffect(() => {
    const loadPrompts = async () => {
      const userId = ensureUserId();
      setPromptsLoading(true);
      setSafetyNotice(null);

      try {
        const response = await fetch("/api/prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, mood, timeBudget }),
        });
        if (response.ok) {
          const data = (await response.json()) as {
            prompts?: PromptItem[];
            safety?: { crisis?: boolean; reason?: string | null };
          };
          if (data.safety?.crisis) {
            setSafetyNotice(
              "If you're feeling overwhelmed, consider reaching out to someone you trust."
            );
            setPrompts([]);
          } else if (data.prompts && data.prompts.length > 0) {
            setPrompts(data.prompts);
          } else {
            setPrompts(buildFallbackPrompts(mood, timeBudget));
          }
        } else {
          setPrompts(buildFallbackPrompts(mood, timeBudget));
        }
      } catch {
        setPrompts(buildFallbackPrompts(mood, timeBudget));
      } finally {
        setPromptsLoading(false);
      }
    };

    const timer = setTimeout(loadPrompts, 280);
    return () => clearTimeout(timer);
  }, [ensureUserId, mood, timeBudget]);

  const startSession = async (prompt: PromptItem, initialMessage?: string) => {
    setStarting(true);
    setError(null);
    const userId = ensureUserId();

    const { data, error: sessionError } = await createSession({
      user_id: userId,
      entry_date: todayKey,
      selected_prompt_id: prompt.id,
      selected_prompt_text: prompt.text,
      status: "ACTIVE",
      title: prompt.text.slice(0, 60),
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

    if (initialMessage?.trim()) {
      await createTurn({
        session_id: data.id,
        user_id: userId,
        role: "user",
        content: initialMessage.trim(),
      });

      try {
        await fetch("/api/chat/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            sessionId: data.id,
            latestUserMessage: initialMessage.trim(),
            timeBudget,
            mood,
            enhancedLanguageEnabled: profile?.preferences?.enhanced_language_enabled ?? false,
          }),
        });
      } catch {
        // The session is still created; the assistant response can be retried in the chat.
      }
    }

    window.dispatchEvent(new Event("journal-session-updated"));
    setStarting(false);
    setDirectMessage("");
    router.push(`/journal/session/${data.id}`);
  };

  const handlePromptSelect = async (prompt: PromptItem) => {
    if (safetyNotice) return;
    await startSession(prompt);
  };

  const handleDirectStart = async () => {
    if (!directMessage.trim() || safetyNotice) return;
    const prompt = prompts[0] ?? {
      id: "starter_direct",
      text: journalPrompts[0],
      reason: "Starter prompt",
      evidence: [],
    };
    await startSession(prompt, directMessage);
  };

  return (
    <Card className="flex h-full flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Today's Journal</h2>
          <p className="text-xs text-muted-foreground">Private session</p>
        </div>
        <Badge variant="secondary" className="gap-1">
          Ready
        </Badge>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">Mood (optional)</p>
        <div className="flex flex-wrap gap-2">
          {moodOptions.map((option) => (
            <Button
              key={option}
              variant={mood === option ? "default" : "outline"}
              onClick={() => setMood(option)}
              disabled={starting}
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
              disabled={starting}
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
              <p className="text-xs text-muted-foreground">{emptyCopy}</p>
            )}
            {prompts.map((prompt) => (
              <button
                key={prompt.id}
                type="button"
                onClick={() => handlePromptSelect(prompt)}
                className="w-full rounded-2xl border bg-background p-4 text-left transition hover:border-foreground/20"
                disabled={starting}
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

      <div className="rounded-2xl border bg-background p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Start without a prompt
        </p>
        <Textarea
          className="mt-3 min-h-[96px]"
          placeholder="Type your thoughts..."
          value={directMessage}
          onChange={(event) => setDirectMessage(event.target.value)}
          disabled={starting || Boolean(safetyNotice)}
        />
        <div className="mt-3 flex justify-end">
          <Button onClick={handleDirectStart} disabled={starting || !directMessage.trim()}>
            {starting ? "Starting..." : "Start session"}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </Card>
  );
}