"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, User, X } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { forgetAllMemories, forgetMemory, listMemories, type MemoryFactRecord } from "@/lib/db/memories";

type MemoryCardProps = {
  userId: string | null;
  enabled: boolean;
  disabled?: boolean;
  onToggle: (next: boolean) => Promise<void> | void;
};

const formatDay = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

function describe(fact: MemoryFactRecord): { title: string; subtitle: string } {
  if (fact.kind === "event") {
    return {
      title: fact.label.charAt(0).toUpperCase() + fact.label.slice(1),
      subtitle: fact.event_date ? formatDay(fact.event_date) : "Upcoming",
    };
  }
  const mentions = fact.mention_count === 1 ? "Mentioned once" : `Mentioned in ${fact.mention_count} entries`;
  if (fact.detail) return { title: fact.label, subtitle: `Your ${fact.detail} · ${mentions}` };
  return { title: `Your ${fact.label}`, subtitle: mentions };
}

export default function MemoryCard({ userId, enabled, disabled, onToggle }: MemoryCardProps) {
  const [facts, setFacts] = useState<MemoryFactRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: loadError } = await listMemories(userId);
    setFacts(data);
    setError(loadError ? "We couldn't load this yet." : null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleForget = async (id: string) => {
    setBusyId(id);
    const { error: forgetError } = await forgetMemory(id);
    if (forgetError) setError("We couldn't forget that yet. Please try again.");
    else setFacts((current) => current.filter((fact) => fact.id !== id));
    setBusyId(null);
  };

  const handleForgetAll = async () => {
    if (!userId) return;
    setBusyId("all");
    const { error: forgetError } = await forgetAllMemories(userId);
    if (forgetError) setError("We couldn't forget everything yet. Please try again.");
    else setFacts([]);
    setBusyId(null);
  };

  const people = facts.filter((fact) => fact.kind === "person");
  const events = facts.filter((fact) => fact.kind === "event");

  const renderList = (items: MemoryFactRecord[], Icon: typeof User) => (
    <ul className="divide-y divide-divider rounded-2xl border border-divider bg-background">
      {items.map((fact) => {
        const { title, subtitle } = describe(fact);
        return (
          <li key={fact.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-3">
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{title}</p>
                <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => handleForget(fact.id)}
              disabled={busyId !== null}
              aria-label={`Forget ${title}`}
              title="Forget this"
            >
              <X className="h-4 w-4" />
            </Button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">What DearMe remembers</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-divider bg-surface-2 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">Remember people and plans</p>
            <p className="text-xs text-muted-foreground">
              Picks up names and dated plans you write about (like &ldquo;my sister Priya&rdquo; or &ldquo;my
              interview on Friday&rdquo;) so prompts can follow up: &ldquo;How did your interview go?&rdquo;
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(next) => onToggle(next)}
            disabled={disabled}
            aria-label="Remember people and plans"
          />
        </div>

        {loading ? (
          <div className="h-16 animate-pulse rounded-2xl border border-divider bg-surface-2" aria-busy="true" />
        ) : facts.length === 0 ? (
          <p className="text-xs">
            {enabled
              ? "Nothing yet. As you journal, the people and upcoming plans you mention will show up here."
              : "Memory is off. Nothing new will be remembered."}
          </p>
        ) : (
          <div className="space-y-3">
            {events.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.2em]">Plans</p>
                {renderList(events, CalendarDays)}
              </div>
            )}
            {people.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.2em]">People</p>
                {renderList(people, User)}
              </div>
            )}
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={handleForgetAll} disabled={busyId !== null}>
                {busyId === "all" ? "Forgetting..." : "Forget everything"}
              </Button>
            </div>
          </div>
        )}
        <p className="text-xs">
          Stored privately with your journal and only visible to you. Turning this off stops new memories; use
          &ldquo;Forget&rdquo; to remove what&apos;s here. Deleting an entry also forgets what came from it.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
