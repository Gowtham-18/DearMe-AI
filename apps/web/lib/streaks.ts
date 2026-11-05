import type { EntryRecord } from "@/lib/db/entries";
import { formatLocalDate, parseLocalDate } from "@/lib/date";

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

export function computeCurrentStreak(entries: EntryRecord[]): number {
  if (entries.length === 0) {
    return 0;
  }

  const dateSet = new Set(getLatestEntriesByDate(entries).map((entry) => entry.entry_date));
  const today = new Date();
  const todayKey = formatLocalDate(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = formatLocalDate(yesterday);

  let cursor = today;
  if (!dateSet.has(todayKey) && dateSet.has(yesterdayKey)) {
    cursor = yesterday;
  } else if (!dateSet.has(todayKey)) {
    return 0;
  }

  let streak = 0;
  while (dateSet.has(formatLocalDate(cursor))) {
    streak += 1;
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export function computeTotalEntries(entries: EntryRecord[]): number {
  return entries.length;
}

export function computePrimaryMood(entries: EntryRecord[]): string {
  const moodCounts = new Map<string, number>();
  entries.forEach((entry) => {
    if (!entry.mood) return;
    const count = moodCounts.get(entry.mood) ?? 0;
    moodCounts.set(entry.mood, count + 1);
  });

  let topMood = "";
  let topCount = 0;
  moodCounts.forEach((count, mood) => {
    if (count > topCount) {
      topMood = mood;
      topCount = count;
    }
  });

  return topMood || "--";
}

/** Longest run of consecutive days with at least one entry. */
export function computeLongestStreak(entries: EntryRecord[]): number {
  const dates = [...new Set(entries.map((entry) => entry.entry_date))].sort();
  let best = 0;
  let run = 0;
  let previous: Date | null = null;
  dates.forEach((key) => {
    const date = parseLocalDate(key);
    const gap = previous ? Math.round((date.getTime() - previous.getTime()) / 86_400_000) : null;
    run = gap === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = date;
  });
  return best;
}

/** How many check-ins used the primary mood, out of all check-ins with a mood. */
export function computePrimaryMoodShare(entries: EntryRecord[], mood: string): { count: number; total: number } {
  const withMood = entries.filter((entry) => entry.mood);
  return { count: withMood.filter((entry) => entry.mood === mood).length, total: withMood.length };
}

export function getStreakLabel(streak: number): string {
  if (streak <= 0) return "Start your streak";
  return `${streak} Day${streak === 1 ? "" : "s"}`;
}

export function getEntryDateLabel(entryDate: string): string {
  const date = parseLocalDate(entryDate);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}
