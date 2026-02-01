"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

import { Card } from "@/components/ui/card";
import { listEntries, type EntryRecord } from "@/lib/db/entries";
import { formatDisplayDate } from "@/lib/date";
import { useSessionStore } from "@/store/use-session-store";

export default function JournalSidebar() {
  const { ensureUserId } = useSessionStore();
  const [entries, setEntries] = useState<EntryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadEntries = async () => {
      const userId = ensureUserId();
      const { data } = await listEntries(userId, 8);
      setEntries(data);
      setLoading(false);
    };

    loadEntries();
  }, [ensureUserId]);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Journal Sessions</h2>
        <p className="text-xs text-muted-foreground">Private and on-device identity</p>
      </div>
      <div className="space-y-3">
        {loading && <Card className="p-4 text-xs text-muted-foreground">Loading sessions...</Card>}
        {!loading && entries.length === 0 && (
          <Card className="p-4 text-xs text-muted-foreground">No entries yet.</Card>
        )}
        {entries.map((entry) => (
          <Link key={entry.id} href={`/memories/${entry.id}`}>
            <Card className="p-4 shadow-sm transition hover:border-foreground/20">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{formatDisplayDate(entry.entry_date)}</p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {entry.mood ?? "No mood"}
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {entry.content.slice(0, 72)}
                {entry.content.length > 72 ? "..." : ""}
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
