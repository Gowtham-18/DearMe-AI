"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSessionStore } from "@/store/use-session-store";
import { listEntries, type EntryRecord } from "@/lib/db/entries";
import { formatDisplayDate } from "@/lib/date";

interface MemoryDetailPageProps {
  params: { id: string };
}

export default function MemoryDetailPage({ params }: MemoryDetailPageProps) {
  const { ensureUserId } = useSessionStore();
  const [entry, setEntry] = useState<EntryRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

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
    };

    loadEntry();
  }, [ensureUserId, params.id]);

  if (error) {
    return <Card className="p-4 text-sm text-destructive">{error}</Card>;
  }

  if (!entry && !loaded) {
    return <Card className="p-4 text-sm text-muted-foreground">Loading entry...</Card>;
  }

  if (!entry && loaded) {
    return <Card className="p-4 text-sm text-muted-foreground">Entry not found.</Card>;
  }

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
            Mood: {entry.mood ?? "—"} · {entry.time_budget} min
          </p>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground whitespace-pre-wrap">
          {entry.content}
        </CardContent>
      </Card>
    </div>
  );
}
