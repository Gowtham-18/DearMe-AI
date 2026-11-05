"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ChevronRight, Feather, Sparkles } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { buildFallbackPrompts, freeWritePrompt, moodOptions, timeBudgets, type PromptItem } from "@/lib/prompts";
import { formatLocalDate } from "@/lib/date";
import { emptyStateCopy, pickCopy } from "@/lib/copy";
import { useSessionStore } from "@/store/use-session-store";
import { createSession, createTurn } from "@/lib/db/sessions";
import { apiFetch } from "@/lib/auth";
import CrisisResources from "@/components/crisis-resources";

const defaultTimeBudget = 5;

const chipClass = (selected: boolean) =>
  cn(
    "inline-flex h-9 cursor-pointer items-center rounded-full border px-4 text-sm font-medium transition-[color,background-color,border-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50",
    selected
      ? "border-primary bg-primary text-primary-foreground"
      : "border-divider bg-background text-muted-foreground hover:border-foreground/30 hover:bg-foreground/[0.04] hover:text-foreground"
  );

type JournalFormProps = {
  /** "page" renders inside a card on Today's Journal; "dialog" renders bare for the New Entry dialog. */
  variant?: "page" | "dialog";
  /** Called once a session has been created (e.g. to close the dialog). */
  onStarted?: () => void;
};

export default function JournalForm({ variant = "page", onStarted }: JournalFormProps) {
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
  const emptyCopy = useMemo(() => pickCopy(emptyStateCopy.todayJournal, new Date().toDateString()), []);

  useEffect(() => {
    const loadPrompts = async () => {
      setPromptsLoading(true);

      try {
        const response = await apiFetch("/api/prompts", { mood, timeBudget, today: formatLocalDate(new Date()) });
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
    if (starting) return;
    setStarting(true);
    setError(null);
    const userId = ensureUserId();

    const { data, error: sessionError } = await createSession({
      user_id: userId,
      entry_date: todayKey,
      selected_prompt_id: prompt.id,
      selected_prompt_text: prompt.text,
      status: "ACTIVE",
      title: prompt.id === freeWritePrompt.id ? "Free writing" : prompt.text.slice(0, 60),
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
    // Hand the example to the session page so it can use it as the writing placeholder.
    try {
      if (prompt.example) sessionStorage.setItem(`dearme:prompt-example:${data.id}`, prompt.example);
    } catch {
      // Storage can be unavailable (private mode); the placeholder just falls back to the default.
    }
    setStarting(false);
    onStarted?.();
    router.push(`/journal/session/${data.id}`);
  };

  const body = (
    <>
      <div className="space-y-2.5">
        <p className="text-sm font-medium">How are you feeling? <span className="font-normal text-muted-foreground">(optional)</span></p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Mood">
          {moodOptions.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={mood === option}
              onClick={() => setMood(mood === option ? null : option)}
              disabled={starting}
              className={chipClass(mood === option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2.5">
        <p className="text-sm font-medium">How much time do you have?</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Time budget">
          {timeBudgets.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={timeBudget === option}
              onClick={() => setTimeBudget(option)}
              disabled={starting}
              className={chipClass(timeBudget === option)}
            >
              {option} min
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-divider bg-surface-2 p-4 text-sm text-muted-foreground">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Prompts for you</p>
            <p className="mt-1 text-xs text-muted-foreground">Pick one to start. Each has an example to show how simple an answer can be.</p>
          </div>
          <Sparkles className="h-4 w-4 text-muted-foreground" />
        </div>
        {crisis && (
          <div className="mt-3">
            <CrisisResources />
          </div>
        )}
        {promptsLoading ? (
          <div className="mt-4 space-y-3" aria-busy="true" aria-label="Loading prompts">
            {[0, 1, 2].map((index) => (
              <div key={index} className="h-[72px] animate-pulse rounded-2xl border border-divider bg-background/60" />
            ))}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {prompts.length === 0 && <p className="text-xs text-muted-foreground">{emptyCopy}</p>}
            {[...prompts, freeWritePrompt].map((prompt) => {
              const isFreeWrite = prompt.id === freeWritePrompt.id;
              return (
                <button
                  key={prompt.id}
                  type="button"
                  onClick={() => startSession(prompt)}
                  className={cn(
                    "group w-full cursor-pointer rounded-2xl border bg-background p-4 text-left transition-[border-color,box-shadow,background-color] duration-150 hover:border-foreground/25 hover:shadow-hover-gray focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60",
                    isFreeWrite ? "border-dashed border-divider" : "border-divider"
                  )}
                  disabled={starting}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        {isFreeWrite && <Feather className="h-3.5 w-3.5 text-muted-foreground" />}
                        {prompt.text}
                      </p>
                      <p className="text-xs text-muted-foreground">{prompt.reason}</p>
                      {prompt.example && !isFreeWrite && (
                        <p className="text-xs italic text-muted-foreground/90">{prompt.example}</p>
                      )}
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-foreground" />
                  </div>
                  {prompt.evidence?.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {prompt.evidence.map((item, index) => (
                        <div key={`${prompt.id}-${index}`} className="rounded-xl bg-muted/60 p-3">
                          <p className="text-xs text-muted-foreground">{item.reason}</p>
                          <p className="text-xs text-muted-foreground">&ldquo;{item.snippet}&rdquo;</p>
                        </div>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {starting && <p className="text-xs text-muted-foreground">Starting your session...</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </>
  );

  if (variant === "dialog") {
    return <div className="flex flex-col gap-5">{body}</div>;
  }

  return (
    <Card className="flex h-full flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Today&apos;s Journal</h2>
          <p className="text-xs text-muted-foreground">Private session</p>
        </div>
        <Badge variant="secondary" className="gap-1">
          Ready
        </Badge>
      </div>
      {body}
    </Card>
  );
}
