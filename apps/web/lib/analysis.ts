import type { EntryAnalysisRecord } from "@/lib/db/analysis";
import type { EntryRecord } from "@/lib/db/entries";
import { formatLocalDate, parseLocalDate } from "@/lib/date";
import { moodScale } from "@/lib/moods";
import type { TrendPoint } from "@/components/dashboard/trend-chart";

const getLatestEntriesByDate = (entries: EntryRecord[]): EntryRecord[] => {
  const latestByDate = new Map<string, EntryRecord>();
  entries.forEach((entry) => {
    const existing = latestByDate.get(entry.entry_date);
    if (!existing) {
      latestByDate.set(entry.entry_date, entry);
      return;
    }
    const existingTime = existing.created_at ?? "";
    const entryTime = entry.created_at ?? "";
    if (entryTime > existingTime) {
      latestByDate.set(entry.entry_date, entry);
    }
  });
  return [...latestByDate.values()];
};

type DayBucket = { date: Date; key: string };

const lastDays = (days: number): DayBucket[] => {
  const today = new Date();
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(date.getDate() - (days - 1 - index));
    return { date, key: formatLocalDate(date) };
  });
};

const axisLabel = (date: Date, days: number) =>
  days <= 7
    ? new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date)
    : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);

const fullLabel = (date: Date) =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(date);

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

/** Daily average tone of every analysed entry (-1 heavy .. +1 positive), one point per calendar day. */
export function buildSentimentTrend(
  entries: EntryRecord[],
  analyses: EntryAnalysisRecord[],
  days: number
): TrendPoint[] {
  const scoreByEntry = new Map(analyses.map((item) => [item.entry_id, item.sentiment_score]));
  return lastDays(days).map(({ date, key }) => {
    const scores = entries
      .filter((entry) => entry.entry_date === key && scoreByEntry.has(entry.id))
      .map((entry) => scoreByEntry.get(entry.id) as number);
    return {
      day: axisLabel(date, days),
      date: fullLabel(date),
      value: scores.length ? Math.round(average(scores) * 100) / 100 : null,
      count: scores.length,
    };
  });
}

/** Daily average of the moods picked at check-in (1 low .. 5 great), one point per calendar day. */
export function buildMoodTrend(entries: EntryRecord[], days: number): TrendPoint[] {
  return lastDays(days).map(({ date, key }) => {
    const moods = entries
      .filter((entry) => entry.entry_date === key && entry.mood && moodScale[entry.mood])
      .map((entry) => entry.mood as string);
    const unique = [...new Set(moods)];
    return {
      day: axisLabel(date, days),
      date: fullLabel(date),
      value: moods.length ? Math.round(average(moods.map((mood) => moodScale[mood])) * 10) / 10 : null,
      count: moods.length,
      detail: unique.length ? `Felt: ${unique.join(", ")}` : undefined,
    };
  });
}

/** Entries written in the last `days` calendar days (including today). */
export function countRecentEntries(entries: EntryRecord[], days: number): number {
  const keys = new Set(lastDays(days).map((day) => day.key));
  return entries.filter((entry) => keys.has(entry.entry_date)).length;
}

export function buildHabitDays(entries: EntryRecord[]): Array<{ label: string; completed: boolean }> {
  const today = new Date();
  const dateSet = new Set(getLatestEntriesByDate(entries).map((entry) => entry.entry_date));
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