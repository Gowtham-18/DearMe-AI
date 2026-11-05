"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

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
  const [query, setQuery] = useState("");
  const [mood, setMood] = useState<string | null>(null);

  const emptyCopy = useMemo(() => pickCopy(emptyStateCopy.memories, new Date().toDateString()), []);

  useEffect(() => {
    const loadEntries = async () => {
      const userId = ensureUserId();
      const { data, error: loadError } = await listEntries(userId, 200);
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

  const moods = useMemo(
    () => [...new Set(entries.map((entry) => entry.mood).filter((value): value is string => Boolean(value)))],
    [entries]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (mood && entry.mood !== mood) return false;
      if (!needle) return true;
      return (
        entry.content.toLowerCase().includes(needle) ||
        (entry.mood ?? "").toLowerCase().includes(needle) ||
        formatDisplayDate(entry.entry_date).toLowerCase().includes(needle)
      );
    });
  }, [entries, query, mood]);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search your entries..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search entries"
          />
        </div>
        {moods.length > 1 && (
          <div className="flex flex-wrap gap-2" aria-label="Filter by mood">
            {[null, ...moods].map((value) => (
              <Button
                key={value ?? "all"}
                size="sm"
                variant="outline"
                className={`h-8 rounded-full ${mood === value ? "bg-muted text-foreground" : "text-muted-foreground"}`}
                onClick={() => setMood(value)}
                aria-pressed={mood === value}
              >
                {value ?? "All moods"}
              </Button>
            ))}
          </div>
        )}
      </section>

      {error && <Card className="p-4 text-sm text-destructive">{error}</Card>}

      <section className="space-y-3">
        {loading && <Card className="p-4 text-sm text-muted-foreground">Loading entries...</Card>}
        {!loading && entries.length === 0 && <Card className="p-4 text-sm text-muted-foreground">{emptyCopy}</Card>}
        {!loading && entries.length > 0 && filtered.length === 0 && (
          <Card className="p-4 text-sm text-muted-foreground">No entries match that search.</Card>
        )}
        {filtered.map((entry, index) => {
          const showDateHeading = index === 0 || filtered[index - 1]?.entry_date !== entry.entry_date;
          const words = entry.content.trim() ? entry.content.trim().split(/\s+/).length : 0;
          return (
            <div key={entry.id} className="space-y-2">
              {showDateHeading && (
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  {formatDisplayDate(entry.entry_date)}
                </p>
              )}
              <Link href={`/memories/${entry.id}`} className="block">
                <Card className="p-4 transition hover:border-foreground/20">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">{entry.mood ?? "No mood"}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.time_budget} min · {words} words
                    </p>
                  </div>
                  <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">{entry.content}</p>
                  <p className="mt-2 text-xs font-medium text-foreground">Read full entry →</p>
                </Card>
              </Link>
            </div>
          );
        })}
      </section>
    </div>
  );
}
