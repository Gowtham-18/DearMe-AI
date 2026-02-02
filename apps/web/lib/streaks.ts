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
  getLatestEntriesByDate(entries).forEach((entry) => {
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

export function buildMoodTrend(entries: EntryRecord[], days: number): Array<{ day: string; value: number }> {
  const moodScale: Record<string, number> = {
    Sad: 1,
    Stressed: 2,
    Neutral: 3,
    Calm: 4,
    Happy: 5,
  };

  const today = new Date();
  const points: Array<{ day: string; value: number }> = [];
  const latestByDate = getLatestEntriesByDate(entries);

  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateKey = formatLocalDate(date);
    const entry = latestByDate.find((item) => item.entry_date === dateKey && item.mood);

    if (entry?.mood && moodScale[entry.mood]) {
      points.push({
        day:
          days <= 7
            ? new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date)
            : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date),
        value: moodScale[entry.mood],
      });
    }
  }

  return points;
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