"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock } from "lucide-react";

import { Card } from "@/components/ui/card";
import { listSessions, type JournalSessionRecord } from "@/lib/db/sessions";
import { formatDisplayDate, formatLocalDate, parseLocalDate } from "@/lib/date";
import { emptyStateCopy, pickCopy } from "@/lib/copy";
import { useSessionStore } from "@/store/use-session-store";

const sortDatesDesc = (a: string, b: string) => {
  const dateA = parseLocalDate(a).getTime();
  const dateB = parseLocalDate(b).getTime();
  return dateB - dateA;
};

export default function JournalSidebar() {
  const { ensureUserId } = useSessionStore();
  const [sessions, setSessions] = useState<JournalSessionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const todayKey = useMemo(() => formatLocalDate(new Date()), []);
  const emptyCopy = useMemo(
    () => pickCopy(emptyStateCopy.todayJournal, new Date().toDateString()),
    []
  );

  useEffect(() => {
    const loadEntries = async () => {
      const userId = ensureUserId();
      const { data } = await listSessions(userId, 20);
      setSessions(data);
      setLoading(false);
    };

    loadEntries();

    const handleRefresh = () => loadEntries();
    window.addEventListener("journal-session-updated", handleRefresh);
    return () => window.removeEventListener("journal-session-updated", handleRefresh);
  }, [ensureUserId]);

  const grouped = useMemo(() => {
    const result = sessions.reduce<Record<string, JournalSessionRecord[]>>((acc, session) => {
      acc[session.entry_date] = acc[session.entry_date] ?? [];
      acc[session.entry_date].push(session);
      return acc;
    }, {});
    Object.values(result).forEach((items) =>
      items.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    );
    return result;
  }, [sessions]);

  const orderedDates = useMemo(() => Object.keys(grouped).sort(sortDatesDesc), [grouped]);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Journal Sessions</h2>
        <p className="text-xs text-muted-foreground">Private and on-device identity</p>
      </div>
      <div className="space-y-3">
        {loading && <Card className="p-4 text-xs text-muted-foreground">Loading sessions...</Card>}
        {!loading && sessions.length === 0 && (
          <Card className="p-4 text-xs text-muted-foreground">{emptyCopy}</Card>
        )}
        {orderedDates.map((date) => (
          <div key={date} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {date === todayKey ? "Today" : formatDisplayDate(date)}
            </p>
            <div className="space-y-2 pl-3">
              {grouped[date].map((session) => (
                <Link key={session.id} href={`/journal/session/${session.id}`}>
                  <Card className="p-4 transition hover:border-foreground/20">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">
                        {session.title ?? session.selected_prompt_text.slice(0, 40)}
                      </p>
                      {session.status === "COMPLETED" ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {session.selected_prompt_text.slice(0, 72)}
                      {session.selected_prompt_text.length > 72 ? "..." : ""}
                    </p>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
