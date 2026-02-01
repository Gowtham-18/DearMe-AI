"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, SendHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { journalPrompts, moodOptions, timeBudgets } from "@/lib/prompts";
import {
  createEntry,
  getEntryForDate,
  listEntries,
  updateEntry,
  type EntryRecord,
} from "@/lib/db/entries";
import { formatLocalDate } from "@/lib/date";
import { computeCurrentStreak } from "@/lib/streaks";
import { useSessionStore } from "@/store/use-session-store";

const defaultTimeBudget = 5;

const getNudge = (currentMood: string | null, budget: number) => {
  if (currentMood === "Stressed") {
    return "Try one calming sentence before you close the day.";
  }
  if (currentMood === "Sad") {
    return "Name one kind thing you can do for yourself tomorrow.";
  }
  if (currentMood === "Happy") {
    return "Capture what made this moment feel light so you can return to it.";
  }
  if (budget <= 3) {
    return "One clear sentence is enough for today.";
  }
  return "Notice one small shift you want to carry into tomorrow.";
};

export default function JournalForm() {
  const { ensureUserId } = useSessionStore();
  const [entry, setEntry] = useState<EntryRecord | null>(null);
  const [content, setContent] = useState("");
  const [mood, setMood] = useState<string | null>(null);
  const [timeBudget, setTimeBudget] = useState<number>(defaultTimeBudget);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reward, setReward] = useState<string | null>(null);
  const [analysisNotice, setAnalysisNotice] = useState<string | null>(null);
  const [prompts, setPrompts] = useState<string[]>(journalPrompts);
  const [promptsLoading, setPromptsLoading] = useState(true);
  const [safetyNotice, setSafetyNotice] = useState<string | null>(null);

  const todayKey = useMemo(() => formatLocalDate(new Date()), []);

  useEffect(() => {
    const loadEntry = async () => {
      const userId = ensureUserId();
      const { data, error: entryError } = await getEntryForDate(userId, todayKey);
      if (entryError) {
        setError("We couldn't load today's entry.");
        setLoading(false);
        return;
      }

      if (data) {
        setEntry(data);
        setContent(data.content);
        setMood(data.mood ?? null);
        setTimeBudget(data.time_budget);
      }
      setLoading(false);
    };

    loadEntry();
  }, [ensureUserId, todayKey]);

  useEffect(() => {
    const loadPrompts = async () => {
      const userId = ensureUserId();
      try {
        const response = await fetch("/api/prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        });
        if (response.ok) {
          const data = (await response.json()) as {
            prompts?: string[];
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
  }, [ensureUserId]);

  const triggerAnalysis = async (entryId: string) => {
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId }),
      });
      if (!response.ok) {
        setAnalysisNotice("Insights will update shortly.");
      } else {
        setAnalysisNotice(null);
      }
    } catch {
      setAnalysisNotice("Insights will update shortly.");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setReward(null);
    setAnalysisNotice(null);

    if (!content.trim()) {
      setError("Please write a few thoughts before saving.");
      setSaving(false);
      return;
    }

    const userId = ensureUserId();
    if (entry) {
      const { data, error: updateError } = await updateEntry(entry.id, {
        content: content.trim(),
        mood,
        time_budget: timeBudget,
      });

      if (updateError || !data) {
        setError("We couldn't update your entry yet. Please try again.");
        setSaving(false);
        return;
      }

      setEntry(data);
      void triggerAnalysis(data.id);
    } else {
      const { data, error: createError } = await createEntry({
        user_id: userId,
        entry_date: todayKey,
        mood,
        time_budget: timeBudget,
        content: content.trim(),
      });

      if (createError || !data) {
        const { data: existingEntry } = await getEntryForDate(userId, todayKey);
        if (existingEntry) {
          setEntry(existingEntry);
          setContent(existingEntry.content);
          setMood(existingEntry.mood ?? null);
          setTimeBudget(existingEntry.time_budget);
          setError("You've already written today. You can update this entry.");
          setSaving(false);
          return;
        }

        setError("We couldn't save your entry yet. Please try again.");
        setSaving(false);
        return;
      }

      setEntry(data);
      void triggerAnalysis(data.id);
    }

    const { data: entries } = await listEntries(userId, 365);
    const streak = computeCurrentStreak(entries);
    const nudge = getNudge(mood, timeBudget);
    setReward(`Hurray, Day ${streak} completed! ${nudge}`);
    setSaving(false);
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
            Already written today
          </Badge>
        )}
      </div>

      {loading ? (
        <div className="rounded-2xl border p-4 text-sm text-muted-foreground">Loading...</div>
      ) : (
        <>
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
              Gentle prompts
            </p>
            {safetyNotice ? (
              <p className="mt-2 text-xs text-muted-foreground">{safetyNotice}</p>
            ) : promptsLoading ? (
              <p className="mt-2 text-xs text-muted-foreground">Loading prompts...</p>
            ) : (
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {prompts.map((prompt) => (
                  <li key={prompt}>{prompt}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border bg-background p-3">
            <Textarea
              className="min-h-[160px] resize-none border-none p-0 focus-visible:ring-0"
              placeholder="Type your thoughts..."
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {reward && <p className="text-sm text-emerald-600">{reward}</p>}
          {analysisNotice && <p className="text-sm text-muted-foreground">{analysisNotice}</p>}

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? "Saving..." : "Save"}
              <SendHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
