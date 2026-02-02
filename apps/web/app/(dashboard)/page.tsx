"use client";

import { useEffect, useMemo, useState } from "react";

import Greeting from "@/components/dashboard/greeting";
import MoodTrendsChart from "@/components/dashboard/mood-trends-chart";
import RecentReflections from "@/components/dashboard/recent-reflections";
import StatCard from "@/components/dashboard/stat-card";
import SentimentTrendsChart from "@/components/dashboard/sentiment-trends-chart";
import ThemeCards from "@/components/dashboard/theme-cards";
import HabitTracker from "@/components/dashboard/habit-tracker";
import { Card } from "@/components/ui/card";
import { listEntries, type EntryRecord } from "@/lib/db/entries";
import { listEntryAnalysis, type EntryAnalysisRecord } from "@/lib/db/analysis";
import { listThemes, listThemeMembership, type ThemeMembershipRecord, type ThemeRecord } from "@/lib/db/themes";
import { buildHabitDays, buildSentimentTrend } from "@/lib/analysis";
import { formatDisplayDate, parseLocalDate, shiftDate } from "@/lib/date";
import { buildMoodTrend, computeCurrentStreak, computePrimaryMood, computeTotalEntries } from "@/lib/streaks";
import { useSessionStore } from "@/store/use-session-store";

const getLatestEntriesByDate = (entries: EntryRecord[]): Map<string, EntryRecord> => {
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
  return latestByDate;
};

const isWithinRange = (dateString: string, start: Date, end: Date) => {
  const date = parseLocalDate(dateString);
  return date >= start && date <= end;
};

const buildSnippet = (text: string, limit = 140) => {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= limit) return cleaned;
  return `${cleaned.slice(0, limit)}...`;
};

export default function DashboardPage() {
  const { ensureUserId } = useSessionStore();
  const [entries, setEntries] = useState<EntryRecord[]>([]);
  const [analyses, setAnalyses] = useState<EntryAnalysisRecord[]>([]);
  const [themes, setThemes] = useState<ThemeRecord[]>([]);
  const [membership, setMembership] = useState<ThemeMembershipRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadEntries = async () => {
      const userId = ensureUserId();
      const [entriesRes, analysisRes, themesRes] = await Promise.all([
        listEntries(userId, 120),
        listEntryAnalysis(userId, 160),
        listThemes(userId, 5),
      ]);

      if (entriesRes.error) {
        setError("We couldn't load your insights yet.");
        setLoading(false);
        return;
      }

      setEntries(entriesRes.data);
      setAnalyses(analysisRes.data);
      setThemes(themesRes.data);

      if (themesRes.data.length > 0) {
        const membershipRes = await listThemeMembership(
          userId,
          themesRes.data.map((theme) => theme.id)
        );
        setMembership(membershipRes.data);
      }
      setLoading(false);
    };

    loadEntries();
  }, [ensureUserId]);

  const [dateLabel, setDateLabel] = useState("");

  useEffect(() => {
    setDateLabel(
      new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      }).format(new Date())
    );
  }, []);

  const streak = computeCurrentStreak(entries);
  const total = computeTotalEntries(entries);
  const primaryMood = computePrimaryMood(entries);
  const moodTrend7 = buildMoodTrend(entries, 7);
  const moodTrend30 = buildMoodTrend(entries, 30);
  const sentimentTrend7 = buildSentimentTrend(entries, analyses, 7);
  const sentimentTrend30 = buildSentimentTrend(entries, analyses, 30);
  const habitDays = buildHabitDays(entries);

  const entryById = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);
  const entryByDate = useMemo(() => getLatestEntriesByDate(entries), [entries]);
  const themeLabelById = useMemo(
    () => new Map(themes.map((theme) => [theme.id, theme.label])),
    [themes]
  );

  const themeLabelsByEntry = useMemo(() => {
    const mapping = new Map<string, string[]>();
    membership.forEach((member) => {
      const label = themeLabelById.get(member.theme_id);
      if (!label) return;
      const existing = mapping.get(member.entry_id) ?? [];
      mapping.set(member.entry_id, [...existing, label]);
    });
    return mapping;
  }, [membership, themeLabelById]);

  const themeCards = useMemo(() => {
    const today = new Date();
    const recentStart = new Date(today);
    recentStart.setDate(today.getDate() - 6);
    const prevStart = new Date(today);
    prevStart.setDate(today.getDate() - 13);
    const prevEnd = new Date(today);
    prevEnd.setDate(today.getDate() - 7);

    return themes.map((theme) => {
      const themeMembers = membership.filter((item) => item.theme_id === theme.id);
      const sortedMembers = [...themeMembers].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      const memberEntry = sortedMembers[0] ? entryById.get(sortedMembers[0].entry_id) : null;
      const snippet = memberEntry?.content ? buildSnippet(memberEntry.content, 120) : null;

      const relatedEntries = sortedMembers
        .slice(0, 3)
        .map((member) => {
          const entry = entryById.get(member.entry_id);
          if (!entry) {
            return null;
          }
          return {
            id: entry.id,
            date: formatDisplayDate(entry.entry_date),
            snippet: buildSnippet(entry.content, 140),
          };
        })
        .filter(Boolean) as Array<{ id: string; date: string; snippet: string }>;

      const evidenceCards = sortedMembers
        .slice(0, 2)
        .map((member) => {
          const entry = entryById.get(member.entry_id);
          if (!entry) return null;
          return {
            entry_id: entry.id,
            snippet: buildSnippet(entry.content, 120),
            reason: "Appears strongly in this theme.",
          };
        })
        .filter(Boolean) as Array<{ entry_id: string; snippet: string; reason: string }>;

      const precedingCounts = new Map<string, number>();
      themeMembers.forEach((member) => {
        const entry = entryById.get(member.entry_id);
        if (!entry) return;
        const prevDate = shiftDate(entry.entry_date, -1);
        const prevEntry = entryByDate.get(prevDate);
        if (!prevEntry) return;
        const prevThemes = themeLabelsByEntry.get(prevEntry.id) ?? [];
        prevThemes.forEach((label) => {
          if (label === theme.label) return;
          precedingCounts.set(label, (precedingCounts.get(label) ?? 0) + 1);
        });
      });

      const precededBy = [...precedingCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([label]) => label);

      const recentCount = themeMembers.filter((member) => {
        const entry = entryById.get(member.entry_id);
        if (!entry) return false;
        return isWithinRange(entry.entry_date, recentStart, today);
      }).length;

      const prevCount = themeMembers.filter((member) => {
        const entry = entryById.get(member.entry_id);
        if (!entry) return false;
        return isWithinRange(entry.entry_date, prevStart, prevEnd);
      }).length;

      const trendValue = prevCount === 0 ? (recentCount > 0 ? 100 : 0) : Math.round(((recentCount - prevCount) / prevCount) * 100);
      const trend = trendValue > 5 ? "up" : trendValue < -5 ? "down" : "flat";

      return {
        id: theme.id,
        label: theme.label,
        keywords: Array.isArray(theme.keywords) ? theme.keywords : [],
        strength: theme.strength ?? 0,
        snippet,
        relatedEntries,
        precededBy,
        trend,
        trendValue,
        evidenceCards,
      };
    });
  }, [themes, membership, entryById, entryByDate, themeLabelsByEntry]);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm text-muted-foreground">{dateLabel}</p>
        <Greeting />
        <p className="max-w-2xl text-sm text-muted-foreground">
          You're journaling with intention. Recent themes:{" "}
          {themeCards.length > 0
            ? themeCards
                .slice(0, 3)
                .map((theme) => theme.label.toLowerCase())
                .join(", ")
            : "building clarity and consistency."}
        </p>
      </section>

      {error && <Card className="p-4 text-sm text-destructive">{error}</Card>}

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Current streak"
          value={streak === 1 ? "1 Day" : `${streak} Days`}
          trend={streak > 0 ? "Active" : "Start today"}
        />
        <StatCard
          title="Total reflections"
          value={total === 1 ? "1 entry" : `${total} entries`}
          trend="Up to date"
        />
        <StatCard title="Primary mood" value={primaryMood} trend={primaryMood === "--" ? "Add a mood" : "Stable"} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <SentimentTrendsChart data7={sentimentTrend7} data30={sentimentTrend30} />
        <MoodTrendsChart data7={moodTrend7} data30={moodTrend30} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr,1fr]">
        <ThemeCards themes={themeCards} />
        <HabitTracker days={habitDays} />
      </section>

      {loading ? (
        <Card className="p-6 text-sm text-muted-foreground">Loading your recent reflections...</Card>
      ) : (
        <RecentReflections entries={entries.slice(0, 4)} />
      )}
    </div>
  );
}
