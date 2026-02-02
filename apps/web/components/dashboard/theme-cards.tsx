"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { emptyStateCopy, pickCopy } from "@/lib/copy";

export interface ThemeCardItem {
  id: string;
  label: string;
  keywords: string[];
  strength: number;
  snippet: string | null;
  relatedEntries?: Array<{ id: string; date: string; snippet: string }>;
  precededBy?: string[];
  trend?: "up" | "down" | "flat";
  trendValue?: number;
  evidenceCards?: Array<{ entry_id: string; snippet: string; reason: string }>;
}

interface ThemeCardsProps {
  themes: ThemeCardItem[];
}

export default function ThemeCards({ themes }: ThemeCardsProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeTheme = themes.find((theme) => theme.id === activeId) ?? null;
  const emptyCopy = useMemo(
    () => pickCopy(emptyStateCopy.themes, new Date().toDateString()),
    []
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Themes</CardTitle>
          <p className="text-sm text-muted-foreground">Patterns from your entries</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {themes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {emptyCopy}
            </p>
          ) : (
            themes.map((theme) => (
              <button
                key={theme.id}
                type="button"
                onClick={() => setActiveId(theme.id)}
                className="w-full rounded-2xl border bg-background p-4 text-left transition hover:border-foreground/20"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{theme.label}</p>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {theme.trend === "up" && <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" />}
                    {theme.trend === "down" && <ArrowDownRight className="h-3.5 w-3.5 text-rose-500" />}
                    {theme.trend === "flat" && <Minus className="h-3.5 w-3.5 text-muted-foreground" />}
                    {typeof theme.trendValue === "number"
                      ? `${theme.trendValue > 0 ? "+" : ""}${theme.trendValue}%`
                      : `${Math.round(theme.strength * 100)}%`}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {theme.keywords.length ? theme.keywords.join(", ") : "No keywords yet."}
                </p>
                {theme.snippet && (
                  <p className="mt-2 text-xs text-muted-foreground">"{theme.snippet}"</p>
                )}
              </button>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(activeTheme)} onOpenChange={(open) => (!open ? setActiveId(null) : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{activeTheme?.label}</DialogTitle>
          </DialogHeader>
          {activeTheme && (
            <div className="space-y-4 text-sm text-muted-foreground">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Keywords</p>
                <p className="mt-2">{activeTheme.keywords.join(", ") || "No keywords yet."}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Related entries</p>
                <div className="mt-2 space-y-2">
                  {(activeTheme.relatedEntries ?? []).map((entry) => (
                    <div key={entry.id} className="rounded-xl border bg-background p-3">
                      <p className="text-xs text-muted-foreground">{entry.date}</p>
                      <p className="text-sm">{entry.snippet}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Evidence cards
                </p>
                <div className="mt-2 space-y-2">
                  {(activeTheme.evidenceCards ?? []).map((card) => (
                    <div key={card.entry_id} className="rounded-xl border bg-background p-3">
                      <p className="text-xs text-muted-foreground">{card.reason}</p>
                      <p className="text-sm">{card.snippet}</p>
                    </div>
                  ))}
                  {(activeTheme.evidenceCards ?? []).length === 0 && (
                    <p className="text-xs text-muted-foreground">No evidence cards yet.</p>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Often preceded by
                </p>
                <p className="mt-2">
                  {(activeTheme.precededBy ?? []).length > 0
                    ? activeTheme.precededBy?.join(", ")
                    : "Not enough data yet."}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
