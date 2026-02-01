import Greeting from "@/components/dashboard/greeting";
import MoodTrendsChart from "@/components/dashboard/mood-trends-chart";
import RecentReflections from "@/components/dashboard/recent-reflections";
import StatCard from "@/components/dashboard/stat-card";
import WeeklyFocusCard from "@/components/dashboard/weekly-focus-card";
import { statCards } from "@/lib/mock-data";

export default function DashboardPage() {
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <p className="text-sm text-muted-foreground">{dateLabel}</p>
        <Greeting />
        <p className="max-w-2xl text-sm text-muted-foreground">
          You're journaling 4 times a week. Most frequent themes: clarity, boundaries,
          renewal.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {statCards.map((card) => (
          <StatCard key={card.title} title={card.title} value={card.value} trend={card.trend} />
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <MoodTrendsChart />
        <WeeklyFocusCard />
      </section>

      <RecentReflections />
    </div>
  );
}
