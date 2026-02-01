"use client";

import { useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSessionStore } from "@/store/use-session-store";
import { getWeekRange, formatDisplayDate } from "@/lib/date";

type WeeklyReflection = {
  summary_blocks: Array<{ title: string; text: string; evidence: string[] }>;
  evidence_cards: Array<{ entry_id: string; snippet: string; reason: string }>;
  prompts_next_week: string[];
  safety: { crisis: boolean; reason?: string | null };
};

export default function WeeklyPage() {
  const { ensureUserId } = useSessionStore();
  const [reflection, setReflection] = useState<WeeklyReflection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => getWeekRange(new Date()), []);

  useEffect(() => {
    const loadWeekly = async () => {
      const userId = ensureUserId();
      try {
        const response = await fetch("/api/weekly-reflection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, weekStart: range.start, weekEnd: range.end }),
        });

        if (!response.ok) {
          setError("We couldn't load your weekly reflection yet.");
          setLoading(false);
          return;
        }

        const data = (await response.json()) as { reflection: WeeklyReflection | null };
        setReflection(data.reflection);
      } catch {
        setError("We couldn't load your weekly reflection yet.");
      } finally {
        setLoading(false);
      }
    };

    loadWeekly();
  }, [ensureUserId, range.end, range.start]);

  return (
    <div className="space-y-6">
      <section className="space-y-1">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Weekly Reflection</p>
        <h2 className="text-xl font-semibold">
          {formatDisplayDate(range.start)} - {formatDisplayDate(range.end)}
        </h2>
      </section>

      {error && <Card className="p-4 text-sm text-destructive">{error}</Card>}

      {loading && <Card className="p-4 text-sm text-muted-foreground">Loading reflection...</Card>}

      {!loading && !reflection && (
        <Card className="p-4 text-sm text-muted-foreground">No reflection yet this week.</Card>
      )}

      {reflection && reflection.safety?.crisis && (
        <Card className="p-6 text-sm text-muted-foreground">
          <p className="text-base font-semibold text-foreground">You deserve support</p>
          <p className="mt-2">
            If you're feeling overwhelmed, consider reaching out to someone you trust or a
            professional. If you're in immediate danger, contact your local emergency number.
          </p>
        </Card>
      )}

      {reflection && !reflection.safety?.crisis && (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            {reflection.summary_blocks.map((block) => (
              <Card key={block.title} className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-sm text-muted-foreground">{block.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{block.text}</CardContent>
              </Card>
            ))}
          </section>

          <section className="grid gap-4 lg:grid-cols-[2fr,1fr]">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Evidence Cards</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {reflection.evidence_cards.map((item) => (
                  <div key={item.entry_id} className="rounded-2xl border bg-background p-4">
                    <p className="text-sm font-semibold">{item.reason}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.snippet}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Try this prompt next week</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <ul className="list-disc space-y-2 pl-4">
                  {reflection.prompts_next_week.map((prompt) => (
                    <li key={prompt}>{prompt}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
