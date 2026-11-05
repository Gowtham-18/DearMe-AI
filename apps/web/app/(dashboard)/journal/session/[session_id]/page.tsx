"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatLocalDate } from "@/lib/date";
import { useSessionStore } from "@/store/use-session-store";
import { useProfileStore } from "@/store/use-profile-store";
import {
  createTurn,
  listTurns,
  updateSessionStatus,
  getSession,
  type JournalTurnRecord,
} from "@/lib/db/sessions";
import { createEntry, getEntryForDate, listEntries, updateEntry } from "@/lib/db/entries";

export default function JournalSessionPage() {
  const router = useRouter();
  const params = useParams<{ session_id?: string | string[] }>();
  const sessionId = Array.isArray(params?.session_id)
    ? params.session_id[0]
    : params?.session_id;
  const { ensureUserId } = useSessionStore();
  const { profile } = useProfileStore();
  const [turns, setTurns] = useState<JournalTurnRecord[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [safetyNotice, setSafetyNotice] = useState<string | null>(null);
  const [mood] = useState<string | null>(null);
  const [timeBudget] = useState<number>(5);
  const [finishing, setFinishing] = useState(false);
  const [finishMessage, setFinishMessage] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<"ACTIVE" | "COMPLETED">("ACTIVE");
  const [enhancedStatus, setEnhancedStatus] = useState<string | null>(null);

  const enhancedEnabled = profile?.preferences?.enhanced_language_enabled ?? false;

  const todayKey = useMemo(() => formatLocalDate(new Date()), []);

  useEffect(() => {
    const loadSession = async () => {
      if (!sessionId) return;
      const { data: sessionData } = await getSession(sessionId);
      if (sessionData?.status) {
        setSessionStatus(sessionData.status);
      }
    };

    const loadTurns = async () => {
      if (!sessionId) return;
      const { data, error: loadError } = await listTurns(sessionId);
      if (loadError) {
        setError("We couldn't load this session yet.");
        setLoading(false);
        return;
      }
      setTurns(data);
      setLoading(false);
    };

    loadSession();
    loadTurns();
  }, [sessionId]);

  const handleSend = async () => {
    if (!input.trim()) return;
    if (safetyNotice) return;
    if (sessionStatus === "COMPLETED") return;

    setSending(true);
    setError(null);
    setEnhancedStatus(null);
    setNotice(null);
    const userId = ensureUserId();
    const message = input.trim();

    if (!sessionId) {
      setError("We couldn't load this session yet.");
      setSending(false);
      return;
    }

    const { data: userTurn, error: userError } = await createTurn({
      session_id: sessionId,
      user_id: userId,
      role: "user",
      content: message,
    });

    if (userError || !userTurn) {
      setError("We couldn't send your message yet. Please try again.");
      setSending(false);
      return;
    }

    const nextTurns = [...turns, userTurn];
    setTurns(nextTurns);
    setInput("");

    try {
      const response = await fetch("/api/chat/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          sessionId,
          latestUserMessage: message,
          timeBudget,
          mood,
          enhancedLanguageEnabled: enhancedEnabled,
        }),
      });

      if (!response.ok) {
        let errorMessage = "We couldn't generate a response yet.";
        try {
          const payload = (await response.json()) as { error?: string };
          if (payload?.error) {
            errorMessage = payload.error;
          }
        } catch {
          // ignore
        }
        setError(errorMessage);
        setSending(false);
        return;
      }

      const data = (await response.json()) as {
        assistant?: { message?: string; mode?: "deterministic" | "enhanced" };
        assistant_turn?: JournalTurnRecord | null;
        safety?: { crisis?: boolean; reason?: string | null };
        warning?: string | null;
      };

      if (data.safety?.crisis) {
        setSafetyNotice(
          "If you're feeling overwhelmed, consider reaching out to someone you trust. If you're in immediate danger, contact your local emergency number."
        );
      }
      if (data.warning) {
        setNotice("The AI service is unavailable, so a simple response was used.");
      }
      if (enhancedEnabled && data.assistant?.mode !== "enhanced") {
        setEnhancedStatus(
          "Enhanced wording is currently unavailable. Check OPENAI_API_KEY and ENABLE_ENHANCED_LANGUAGE."
        );
      }

      if (data.assistant_turn) {
        setTurns((prev) => [...prev, data.assistant_turn as JournalTurnRecord]);
      } else if (data.assistant?.message) {
        const { data: assistantTurn } = await createTurn({
          session_id: sessionId,
          user_id: userId,
          role: "assistant",
          content: data.assistant.message,
        });
        if (assistantTurn) {
          setTurns((prev) => [...prev, assistantTurn]);
        }
      }
    } catch {
      setError("We couldn't generate a response yet.");
    } finally {
      setSending(false);
    }
  };

  const handleComplete = async () => {
    if (sessionStatus === "COMPLETED") return;
    setFinishing(true);
    setError(null);
    const userId = ensureUserId();
    const userTurns = turns.filter((turn) => turn.role === "user");
    const combined = userTurns.map((turn) => turn.content).join("\n\n");

    if (!combined.trim()) {
      setError("Add at least one response before completing.");
      setFinishing(false);
      return;
    }

    const { data: existingEntries } = await listEntries(userId, 1);
    const isFirst = !existingEntries || existingEntries.length === 0;
    const { data: existingEntry } = await getEntryForDate(userId, todayKey);

    let entryData = existingEntry;
    if (existingEntry) {
      const { data: updatedEntry, error: updateError } = await updateEntry(existingEntry.id, {
        content: combined,
        mood,
        time_budget: timeBudget,
      });
      if (updateError || !updatedEntry) {
        setError("We couldn't update your journal yet. Please try again.");
        setFinishing(false);
        return;
      }
      entryData = updatedEntry;
    } else {
      const { error: createError, data: createdEntry } = await createEntry({
        user_id: userId,
        entry_date: todayKey,
        mood,
        time_budget: timeBudget,
        content: combined,
      });
      if (createError || !createdEntry) {
        setError("We couldn't save your journal yet. Please try again.");
        setFinishing(false);
        return;
      }
      entryData = createdEntry;
    }

    if (!sessionId) {
      setError("We couldn't load this session yet.");
      setFinishing(false);
      return;
    }

    await updateSessionStatus(sessionId, "COMPLETED");
    setSessionStatus("COMPLETED");
    window.dispatchEvent(new Event("journal-session-updated"));

    const analyzeResponse = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId: entryData.id }),
    });
    if (!analyzeResponse.ok) {
      setError("We saved your journal, but insights couldn't update yet.");
    }

    const baseMessage = isFirst
      ? "Hurray! You completed your first journal. Keep it up."
      : "Nice work. You showed up again today.";
    setFinishMessage(`${baseMessage} Want a 2-minute reflection prompt for tomorrow?`);
    setTimeout(() => router.push("/"), 900);
    setFinishing(false);
  };

  return (
    <div className="grid gap-6">
      <Card className="flex h-[80vh] flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Journal Session</h2>
            <p className="text-xs text-muted-foreground">Private session</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {enhancedEnabled && <Badge variant="secondary">Enhanced wording</Badge>}
            <Badge variant="secondary">{sessionStatus === "COMPLETED" ? "Completed" : "Active"}</Badge>
            <Button
              size="sm"
              onClick={handleComplete}
              disabled={finishing || sessionStatus === "COMPLETED"}
            >
              {finishing ? "Completing..." : "Complete journal"}
            </Button>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl border bg-muted/10 p-4 shadow-soft-gray">
          {loading && <p className="text-sm text-muted-foreground">Loading session...</p>}
          {!loading &&
            turns.map((turn) => (
              <div
                key={turn.id}
                className={`max-w-[85%] rounded-2xl border px-4 py-3 text-sm shadow-soft-gray ${
                  turn.role === "assistant"
                    ? "bg-surface-2 text-foreground border-divider"
                    : "ml-auto bg-primary text-primary-foreground border-transparent"
                }`}
              >
                {turn.content}
              </div>
            ))}
          {sending && (
            <div className="max-w-[85%] rounded-2xl border border-divider bg-surface-2 px-4 py-3 text-sm text-muted-foreground shadow-soft-gray">
              Assistant is typing...
            </div>
          )}
        </div>

        {safetyNotice && (
          <Card className="border-destructive/30 bg-destructive/5 p-4 text-xs text-destructive">
            {safetyNotice}
          </Card>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
        {enhancedStatus && <p className="text-sm text-muted-foreground">{enhancedStatus}</p>}
        {finishMessage && <p className="text-sm text-emerald-600">{finishMessage}</p>}

        <div className="flex gap-2">
          <Textarea
            className="min-h-[72px]"
            placeholder="Type your thoughts..."
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={sending || Boolean(safetyNotice) || sessionStatus === "COMPLETED"}
          />
          <Button
            onClick={handleSend}
            disabled={sending || Boolean(safetyNotice) || sessionStatus === "COMPLETED"}
          >
            {sending ? "Sending..." : "Send"}
          </Button>
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={() => router.push("/journal")}>Back</Button>
        </div>
      </Card>

    </div>
  );
}
