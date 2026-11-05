"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getEntry, type EntryRecord } from "@/lib/db/entries";
import { getEntryAnalysis, type EntryAnalysisRecord } from "@/lib/db/analysis";
import { getSession, listTurns, type JournalSessionRecord, type JournalTurnRecord } from "@/lib/db/sessions";
import { formatDisplayDate } from "@/lib/date";
import { describeSentiment } from "@/lib/sentiment";
import { apiFetch } from "@/lib/auth";

export default function MemoryDetailPage() {
  // Next 16 passes page params as a Promise; useParams() reads them directly in a client page.
  const params = useParams<{ id?: string | string[] }>();
  const entryId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [entry, setEntry] = useState<EntryRecord | null>(null);
  const [session, setSession] = useState<JournalSessionRecord | null>(null);
  const [turns, setTurns] = useState<JournalTurnRecord[]>([]);
  const [analysis, setAnalysis] = useState<EntryAnalysisRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null);
  const [view, setView] = useState<"entry" | "conversation">("entry");

  useEffect(() => {
    if (!entryId) return;
    const load = async () => {
      const { data, error: loadError } = await getEntry(entryId);
      if (loadError) {
        setError("We couldn't load this entry yet.");
        setLoaded(true);
        return;
      }
      setEntry(data);
      setLoaded(true);
      if (!data) return;

      const [analysisRes, sessionRes, turnsRes] = await Promise.all([
        getEntryAnalysis(data.id),
        data.session_id ? getSession(data.session_id) : Promise.resolve({ data: null, error: null }),
        data.session_id ? listTurns(data.session_id) : Promise.resolve({ data: [], error: null }),
      ]);
      setAnalysis(analysisRes.data);
      setSession(sessionRes.data);
      setTurns(turnsRes.data);
    };
    load();
  }, [entryId]);

  if (error) {
    return <Card className="p-4 text-sm text-destructive">{error}</Card>;
  }
  if (!loaded) {
    return <Card className="p-4 text-sm text-muted-foreground">Loading entry...</Card>;
  }
  if (!entry) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Card className="p-4 text-sm text-muted-foreground">This entry wasn&apos;t found.</Card>
      </div>
    );
  }

  const handleRetryAnalysis = async () => {
    setAnalysisStatus(null);
    try {
      const response = await apiFetch("/api/analyze", { entryId: entry.id });
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

  const wordCount = entry.content.trim() ? entry.content.trim().split(/\s+/).length : 0;
  const hasConversation = turns.some((turn) => turn.role === "assistant");

  return (
    <div className="space-y-4">
      <BackLink />
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">{formatDisplayDate(entry.entry_date)}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {entry.mood ?? "No mood"} · {entry.time_budget} min · {wordCount} words
              </p>
            </div>
            {hasConversation && (
              <div className="flex gap-1 rounded-full border p-1" role="tablist" aria-label="Entry view">
                {(["entry", "conversation"] as const).map((value) => (
                  <Button
                    key={value}
                    size="sm"
                    variant="ghost"
                    role="tab"
                    aria-selected={view === value}
                    className={`h-8 rounded-full px-3 ${view === value ? "bg-foreground/[0.08] text-foreground" : ""}`}
                    onClick={() => setView(value)}
                  >
                    {value === "entry" ? "Your entry" : "Full conversation"}
                  </Button>
                ))}
              </div>
            )}
          </div>
          {session?.selected_prompt_text && (
            <p className="rounded-xl border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              Prompt: <span className="text-foreground">{session.selected_prompt_text}</span>
            </p>
          )}
        </CardHeader>
        <CardContent>
          {view === "entry" || !hasConversation ? (
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{entry.content}</div>
          ) : (
            <div className="space-y-3">
              {turns.map((turn) => (
                <div
                  key={turn.id}
                  className={
                    turn.role === "user"
                      ? "ml-auto max-w-[85%] rounded-2xl bg-primary/10 px-4 py-2 text-sm text-foreground"
                      : "max-w-[85%] rounded-2xl border px-4 py-2 text-sm text-muted-foreground"
                  }
                >
                  <p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                    {turn.role === "user" ? "You" : "DearMe"}
                  </p>
                  <p className="whitespace-pre-wrap">{turn.content}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="p-4 text-sm text-muted-foreground">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-foreground">Insights</p>
          <Button variant="outline" size="sm" onClick={handleRetryAnalysis}>
            Refresh insights
          </Button>
        </div>
        {analysisStatus && <p className="mt-2 text-xs text-destructive">{analysisStatus}</p>}
        {analysis ? (
          <div className="mt-3 space-y-3">
            <p>
              Overall tone:{" "}
              <span className="font-medium text-foreground">{describeSentiment(analysis.sentiment_score)}</span>{" "}
              <span className="text-xs">({analysis.sentiment_score.toFixed(2)} on a −1 to +1 scale)</span>
            </p>
            {Array.isArray(analysis.keyphrases) && analysis.keyphrases.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {analysis.keyphrases.map((phrase) => (
                  <Badge key={phrase} variant="outline" className="font-normal">
                    {phrase}
                  </Badge>
                ))}
              </div>
            )}
            {analysis.safety_flags?.crisis && (
              <p className="text-destructive">
                This entry mentioned something serious. If you&apos;re struggling, please reach out to someone you
                trust or call or text 988.
              </p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-xs">No insights yet. Refresh to generate them.</p>
        )}
      </Card>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/memories" className="inline-flex items-center gap-2 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground">
      <ArrowLeft className="h-4 w-4" />
      Back to memories
    </Link>
  );
}
