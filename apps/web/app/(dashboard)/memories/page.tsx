"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Filter } from "lucide-react";

import { listEntries, type EntryRecord } from "@/lib/db/entries";
import { formatDisplayDate } from "@/lib/date";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { emptyStateCopy, pickCopy } from "@/lib/copy";
import { useSessionStore } from "@/store/use-session-store";

export default function MemoriesPage() {
  const { ensureUserId } = useSessionStore();
  const [entries, setEntries] = useState<EntryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const emptyCopy = useMemo(
    () => pickCopy(emptyStateCopy.memories, new Date().toDateString()),
    []
  );

  useEffect(() => {
    const loadEntries = async () => {
      const userId = ensureUserId();
      const { data, error: loadError } = await listEntries(userId, 50);

      if (loadError) {
        setError("We couldn't load your entries yet.");
        setLoading(false);
        return;
      }

      setEntries(data);
      setLoading(false);
    };

    loadEntries();
  }, [ensureUserId]);

  return (
    <div className="space-y-6">
      <section className="flex items-center gap-2">
        <Input placeholder="Search entries..." />
        <Button variant="outline" size="icon" aria-label="Filter">
          <Filter className="h-4 w-4" />
        </Button>
      </section>

      {error && <Card className="p-4 text-sm text-destructive">{error}</Card>}

      <section className="space-y-3">
        {loading && <Card className="p-4 text-sm text-muted-foreground">Loading entries...</Card>}
        {!loading && entries.length === 0 && (
          <Card className="p-4 text-sm text-muted-foreground">{emptyCopy}</Card>
        )}
        {entries.map((entry, index) => {
          const showDateHeading =
            index === 0 || entries[index - 1]?.entry_date !== entry.entry_date;
          return (
            <div key={entry.id} className="space-y-2">
              {showDateHeading && (
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  {formatDisplayDate(entry.entry_date)}
                </p>
              )}
              <Link href={`/memories/${entry.id}`}>
                <Card className="p-4 transition hover:border-foreground/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">{entry.mood ?? "No mood"}</p>
                      <p className="text-xs text-muted-foreground">{entry.time_budget} min</p>
                    </div>
                    <p className="text-xs text-muted-foreground">View</p>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {entry.content.slice(0, 140)}
                    {entry.content.length > 140 ? "..." : ""}
                  </p>
                </Card>
              </Link>
            </div>
          );
        })}
      </section>
    </div>
  );
}