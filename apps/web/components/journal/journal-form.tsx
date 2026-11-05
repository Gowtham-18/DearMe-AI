"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ChevronRight, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { moodOptions, timeBudgets } from "@/lib/prompts";
import { formatLocalDate } from "@/lib/date";
import { emptyStateCopy, pickCopy } from "@/lib/copy";
import { useSessionStore } from "@/store/use-session-store";
import { createSession, createTurn } from "@/lib/db/sessions";
import { apiFetch } from "@/lib/auth";
import CrisisResources from "@/components/crisis-resources";

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
  const router = useRouter();
  const [mood, setMood] = useState<string | null>(null);
  const [timeBudget, setTimeBudget] = useState<number>(defaultTimeBudget);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [promptsLoading, setPromptsLoading] = useState(true);
  const [crisis, setCrisis] = useState(false);

  const todayKey = useMemo(() => formatLocalDate(new Date()), []);
  const emptyCopy = useMemo(
    () => pickCopy(emptyStateCopy.todayJournal, new Date().toDateString()),
    []
  );

  useEffect(() => {
    const loadPrompts = async () => {
      setPromptsLoading(true);

      try {
        const response = await apiFetch("/api/prompts", { mood, timeBudget });
        if (response.ok) {
          const data = (await response.json()) as {
            prompts?: PromptItem[];
            safety?: { crisis?: boolean; reason?: string | null };
          };
          if (data.safety?.crisis) {
            // Show support resources, but never lock someone out of writing.
            setCrisis(true);
            setPrompts(buildFallbackPrompts(mood, timeBudget));
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
  }, [mood, timeBudget]);

  const startSession = async (prompt: PromptItem) => {
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
      mood,
      time_budget: timeBudget,
    });

    if (sessionError || !data) {
      setError(sessionError ?? "We couldn't start a session yet. Please try again.");
      setStarting(false);
      return;
    }

    await createTurn({
      session_id: data.id,
      user_id: userId,
      role: "assistant",
      content: prompt.text,
    });

    window.dispatchEvent(new Event("journal-session-updated"));
    setStarting(false);
    router.push(`/journal/session/${data.id}`);
  };

  const handlePromptSelect = async (prompt: PromptItem) => {
    await startSession(prompt);
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
              className="rounded-full px-4"
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
              className="rounded-full px-4"
            >
              {option} min
            </Button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-divider bg-surface-2 p-4 text-sm text-muted-foreground">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              AI prompts
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Pick a prompt to begin a private journal session.
            </p>
          </div>
          <Sparkles className="h-4 w-4 text-muted-foreground" />
        </div>
        {crisis && (
          <div className="mt-3">
            <CrisisResources />
          </div>
        )}
        {promptsLoading ? (
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
                className="group w-full cursor-pointer rounded-2xl border border-divider bg-background p-4 text-left transition hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-hover-gray focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={starting}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{prompt.text}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{prompt.reason}</p>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                </div>
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
    </Card>
  );
}
