"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/store/use-session-store";
import { listEntries, type EntryRecord } from "@/lib/db/entries";
import { getEntryAnalysis, type EntryAnalysisRecord } from "@/lib/db/analysis";
import { formatDisplayDate } from "@/lib/date";

interface MemoryDetailPageProps {
  params: { id: string };
}

export default function MemoryDetailPage({ params }: MemoryDetailPageProps) {
  const { ensureUserId } = useSessionStore();
  const [entry, setEntry] = useState<EntryRecord | null>(null);
  const [analysis, setAnalysis] = useState<EntryAnalysisRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null);

  useEffect(() => {
    const loadEntry = async () => {
      const userId = ensureUserId();
      const { data, error: loadError } = await listEntries(userId, 200);

      if (loadError) {
        setError("We couldn't load this entry yet.");
        setLoaded(true);
        return;
      }

      const found = data.find((item) => item.id === params.id) ?? null;
      setEntry(found);
      setLoaded(true);

      if (found) {
        const { data: analysisData } = await getEntryAnalysis(found.id);
        setAnalysis(analysisData);
      }
    };

    loadEntry();
  }, [ensureUserId, params.id]);

  if (error) {
    return <Card className="p-4 text-sm text-destructive">{error}</Card>;
  }

  if (!loaded) {
    return <Card className="p-4 text-sm text-muted-foreground">Loading entry...</Card>;
  }

  if (!entry) {
    return <Card className="p-4 text-sm text-muted-foreground">Entry not found.</Card>;
  }

  const handleRetryAnalysis = async () => {
    setAnalysisStatus(null);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId: entry.id }),
      });
      if (!response.ok) {
        setAnalysisStatus("We couldn't refresh insights yet.");
        return;
      }
      const { data } = await getEntryAnalysis(entry.id);
      setAnalysis(data);
    } catch {
      setAnalysisStatus("We couldn't refresh insights yet.");
    }
  };

  return (
    <div className="space-y-4">
      <Link href="/memories" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to memories
      </Link>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{formatDisplayDate(entry.entry_date)}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Mood: {entry.mood ?? "-"} | {entry.time_budget} min
          </p>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground whitespace-pre-wrap">
          {entry.content}
        </CardContent>
      </Card>

      <Card className="p-4 text-sm text-muted-foreground">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-foreground">Insights</p>
          <Button variant="outline" size="sm" onClick={handleRetryAnalysis}>
            Retry analysis
          </Button>
        </div>
        {analysisStatus && <p className="mt-2 text-xs text-destructive">{analysisStatus}</p>}
        {analysis ? (
          <div className="mt-3 space-y-2">
            <p>
              Sentiment: <span className="font-medium text-foreground">{analysis.sentiment_label}</span>
            </p>
            <p>Score: {analysis.sentiment_score.toFixed(2)}</p>
            <p>
              Keyphrases:{" "}
              {Array.isArray(analysis.keyphrases) && analysis.keyphrases.length
                ? analysis.keyphrases.join(", ")
                : "--"}
            </p>
            {analysis.safety_flags?.crisis && (
              <p className="text-destructive">
                Safety flag detected. Consider reaching out to someone you trust.
              </p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-xs">No analysis yet. Save or retry to generate insights.</p>
        )}
      </Card>
    </div>
  );
}