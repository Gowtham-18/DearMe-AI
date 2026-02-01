"use client";

import { useEffect, useMemo, useState } from "react";

import Greeting from "@/components/dashboard/greeting";
import MoodTrendsChart from "@/components/dashboard/mood-trends-chart";
import RecentReflections from "@/components/dashboard/recent-reflections";
import StatCard from "@/components/dashboard/stat-card";
import WeeklyFocusCard from "@/components/dashboard/weekly-focus-card";
import { Card } from "@/components/ui/card";
import { listEntries, type EntryRecord } from "@/lib/db/entries";
import { buildMoodTrend, computeCurrentStreak, computePrimaryMood, computeTotalEntries } from "@/lib/streaks";
import { useSessionStore } from "@/store/use-session-store";

export default function DashboardPage() {
  const { ensureUserId } = useSessionStore();
  const [entries, setEntries] = useState<EntryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadEntries = async () => {
      const userId = ensureUserId();
      const { data, error: loadError } = await listEntries(userId, 100);

      if (loadError) {
        setError("We couldn't load your insights yet.");
        setLoading(false);
        return;
      }

      setEntries(data);
      setLoading(false);
    };

    loadEntries();
  }, [ensureUserId]);

  const dateLabel = useMemo(() => {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    }).format(new Date());
  }, []);

  const streak = computeCurrentStreak(entries);
  const total = computeTotalEntries(entries);
  const primaryMood = computePrimaryMood(entries);
  const moodTrend7 = buildMoodTrend(entries, 7);
  const moodTrend30 = buildMoodTrend(entries, 30);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm text-muted-foreground">{dateLabel}</p>
        <Greeting />
        <p className="max-w-2xl text-sm text-muted-foreground">
          You're journaling with intention. Most frequent themes: clarity, boundaries, renewal.
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

      <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <MoodTrendsChart data7={moodTrend7} data30={moodTrend30} />
        <WeeklyFocusCard />
      </section>

      {loading ? (
        <Card className="p-6 text-sm text-muted-foreground">Loading your recent reflections...</Card>
      ) : (
        <RecentReflections entries={entries.slice(0, 4)} />
      )}
    </div>
  );
}
