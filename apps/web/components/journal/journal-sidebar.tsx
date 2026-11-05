"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { CheckCircle2, Clock, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { deleteSession, listSessions, updateSessionStatus, type JournalSessionRecord } from "@/lib/db/sessions";
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
  const router = useRouter();
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

  const formatTime = (timestamp?: string | null) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };

  const handleEdit = async (event: MouseEvent, sessionId: string) => {
    event.preventDefault();
    event.stopPropagation();
    await updateSessionStatus(sessionId, "ACTIVE");
    window.dispatchEvent(new Event("journal-session-updated"));
    router.push(`/journal/session/${sessionId}`);
  };

  const handleDelete = async (event: MouseEvent, sessionId: string) => {
    event.preventDefault();
    event.stopPropagation();
    await deleteSession(sessionId);
    window.dispatchEvent(new Event("journal-session-updated"));
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Journal Sessions</h2>
        <p className="text-xs text-muted-foreground">Private and on-device identity</p>
      </div>
      <div className="space-y-3">
        {loading && (
          <Card className="p-4 text-xs text-muted-foreground">Loading sessions...</Card>
        )}
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
                <div
                  key={session.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/journal/session/${session.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      router.push(`/journal/session/${session.id}`);
                    }
                  }}
                  className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded-2xl"
                >
                  <Card className="group cursor-pointer p-4 transition hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-hover-gray">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">
                          {`Session${formatTime(session.created_at) ? ` - ${formatTime(session.created_at)}` : ""}`}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {session.status === "COMPLETED" ? "Completed" : "In progress"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          aria-label="Edit session"
                          onClick={(event) => handleEdit(event, session.id)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          aria-label="Delete session"
                          onClick={(event) => handleDelete(event, session.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        {session.status === "COMPLETED" ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </Card>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
