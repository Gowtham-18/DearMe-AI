import type { EntryAnalysisRecord } from "@/lib/db/analysis";
import type { EntryRecord } from "@/lib/db/entries";
import { formatLocalDate, parseLocalDate } from "@/lib/date";

export function buildSentimentTrend(
  entries: EntryRecord[],
  analyses: EntryAnalysisRecord[],
  days: number
): Array<{ day: string; value: number }> {
  const analysisMap = new Map(analyses.map((item) => [item.entry_id, item]));
  const today = new Date();
  const points: Array<{ day: string; value: number }> = [];

  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateKey = formatLocalDate(date);
    const entry = entries.find((item) => item.entry_date === dateKey);
    const analysis = entry ? analysisMap.get(entry.id) : null;

    if (analysis) {
      points.push({
        day:
          days <= 7
            ? new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date)
            : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date),
        value: analysis.sentiment_score,
      });
    }
  }

  return points;
}

export function buildHabitDays(entries: EntryRecord[]): Array<{ label: string; completed: boolean }> {
  const today = new Date();
  const dateSet = new Set(entries.map((entry) => entry.entry_date));
  const days: Array<{ label: string; completed: boolean }> = [];

  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateKey = formatLocalDate(date);
    days.push({
      label: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date),
      completed: dateSet.has(dateKey),
    });
  }

  return days;
}

export function getEntryDateLabel(entryDate: string): string {
  const date = parseLocalDate(entryDate);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}
