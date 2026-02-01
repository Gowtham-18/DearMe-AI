"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

import { Card } from "@/components/ui/card";
import { listSessions, type JournalSessionRecord } from "@/lib/db/sessions";
import { formatDisplayDate } from "@/lib/date";
import { useSessionStore } from "@/store/use-session-store";

export default function JournalSidebar() {
  const { ensureUserId } = useSessionStore();
  const [sessions, setSessions] = useState<JournalSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadEntries = async () => {
      const userId = ensureUserId();
      const { data } = await listSessions(userId, 8);
      setSessions(data);
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
        {!loading && sessions.length === 0 && (
          <Card className="p-4 text-xs text-muted-foreground">No entries yet.</Card>
        )}
        {sessions.map((session) => (
          <Link key={session.id} href={`/journal/session/${session.id}`}>
            <Card className="p-4 shadow-sm transition hover:border-foreground/20">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{formatDisplayDate(session.entry_date)}</p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {session.status === "ACTIVE" ? "Active" : "Completed"}
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {session.selected_prompt_text.slice(0, 72)}
                {session.selected_prompt_text.length > 72 ? "..." : ""}
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
