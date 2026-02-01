"use client";

import { useEffect, useState } from "react";

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
import { formatDisplayDate, shiftDate } from "@/lib/date";
import { buildMoodTrend, computeCurrentStreak, computePrimaryMood, computeTotalEntries } from "@/lib/streaks";
import { useSessionStore } from "@/store/use-session-store";

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
        listEntries(userId, 100),
        listEntryAnalysis(userId, 120),
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

  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const entryByDate = new Map(entries.map((entry) => [entry.entry_date, entry]));
  const analysisByEntry = new Map(analyses.map((item) => [item.entry_id, item]));

  const themeCards = themes.map((theme) => {
    const themeMembers = membership.filter((item) => item.theme_id === theme.id);
    const memberEntry = themeMembers[0] ? entryById.get(themeMembers[0].entry_id) : null;
    const snippet = memberEntry?.content ?? null;

    const relatedEntries = themeMembers.slice(0, 3).map((member) => {
      const entry = entryById.get(member.entry_id);
      if (!entry) {
        return null;
      }
      return {
        id: entry.id,
        date: formatDisplayDate(entry.entry_date),
        snippet: entry.content.length > 140 ? `${entry.content.slice(0, 140)}...` : entry.content,
      };
    }).filter(Boolean) as Array<{ id: string; date: string; snippet: string }>;

    const precedingCounts = new Map<string, number>();
    themeMembers.forEach((member) => {
      const entry = entryById.get(member.entry_id);
      if (!entry) return;
      const prevDate = shiftDate(entry.entry_date, -1);
      const prevEntry = entryByDate.get(prevDate);
      if (!prevEntry) return;

      if (prevEntry.mood) {
        const key = `Mood: ${prevEntry.mood}`;
        precedingCounts.set(key, (precedingCounts.get(key) ?? 0) + 1);
      }

      const prevAnalysis = analysisByEntry.get(prevEntry.id);
      if (Array.isArray(prevAnalysis?.keyphrases)) {
        prevAnalysis.keyphrases.forEach((phrase) => {
          const key = `Theme: ${phrase}`;
          precedingCounts.set(key, (precedingCounts.get(key) ?? 0) + 1);
        });
      }
    });

    const precededBy = [...precedingCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([label]) => label);

    return {
      id: theme.id,
      label: theme.label,
      keywords: Array.isArray(theme.keywords) ? theme.keywords : [],
      strength: theme.strength ?? 0,
      snippet: snippet ? `${snippet.slice(0, 120)}${snippet.length > 120 ? "..." : ""}` : null,
      relatedEntries,
      precededBy,
    };
  });

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
        <StatCard title="Primary mood" value={primaryMood} trend={primaryMood === "—" ? "Add a mood" : "Stable"} />
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
