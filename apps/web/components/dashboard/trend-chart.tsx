"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** One calendar day. `value` is null on days without data so the time axis stays honest. */
export type TrendPoint = {
  day: string; // short axis label ("Thu" or "Nov 5")
  date: string; // full label for the tooltip ("Thu, Nov 5")
  value: number | null; // average of the day's entries
  count: number; // entries that day
  detail?: string; // e.g. the moods logged that day
};

interface TrendChartProps {
  title: string;
  subtitle: string;
  data7: TrendPoint[];
  data30: TrendPoint[];
  domain: [number, number];
  ticks: number[];
  tickLabel: (value: number) => string;
  describe: (value: number) => string;
  formatValue?: (value: number) => string;
  referenceY?: number;
  color: string;
  emptyCopy: string;
}

export default function TrendChart({
  title,
  subtitle,
  data7,
  data30,
  domain,
  ticks,
  tickLabel,
  describe,
  formatValue,
  referenceY,
  color,
  emptyCopy,
}: TrendChartProps) {
  const [range, setRange] = useState<"7d" | "30d">("7d");
  const data = range === "7d" ? data7 : data30;

  const summary = useMemo(() => {
    const days = data.filter((point) => point.value !== null);
    if (days.length === 0) return null;
    const entries = days.reduce((sum, point) => sum + point.count, 0);
    const weighted = days.reduce((sum, point) => sum + (point.value as number) * point.count, 0) / Math.max(1, entries);
    return { average: weighted, days: days.length, entries };
  }, [data]);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
          {summary && (
            <p className="text-sm">
              <span className="font-medium text-foreground">{describe(summary.average)}</span>
              <span className="text-muted-foreground">
                {" "}
                on average · {summary.entries} {summary.entries === 1 ? "entry" : "entries"} over {summary.days}{" "}
                {summary.days === 1 ? "day" : "days"}
              </span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-1" role="tablist" aria-label={`${title} range`}>
          {(["7d", "30d"] as const).map((value) => (
            <Button
              key={value}
              variant="ghost"
              role="tab"
              aria-selected={range === value}
              className={cn("h-8 rounded-full px-3 text-xs", range === value && "bg-muted text-foreground")}
              onClick={() => setRange(value)}
            >
              {value === "7d" ? "7 days" : "30 days"}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="h-[260px]">
        {!summary ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
            {emptyCopy}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={16}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              />
              <YAxis
                domain={domain}
                ticks={ticks}
                tickFormatter={tickLabel}
                tickLine={false}
                axisLine={false}
                width={64}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              />
              {referenceY !== undefined && (
                <ReferenceLine y={referenceY} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />
              )}
              <Tooltip
                cursor={{ stroke: "hsl(var(--border))" }}
                content={({ active, payload }) => {
                  const point = payload?.[0]?.payload as TrendPoint | undefined;
                  if (!active || !point || point.value === null) return null;
                  return (
                    <div className="rounded-xl border bg-card px-3 py-2 text-xs shadow-sm">
                      <p className="font-medium text-foreground">{point.date}</p>
                      <p className="text-foreground">
                        {describe(point.value)}
                        {formatValue ? <span className="text-muted-foreground"> ({formatValue(point.value)})</span> : null}
                      </p>
                      {point.detail && <p className="text-muted-foreground">{point.detail}</p>}
                      <p className="text-muted-foreground">
                        {point.count} {point.count === 1 ? "entry" : "entries"}
                      </p>
                    </div>
                  );
                }}
              />
              <Line
                // Straight segments: a smoothed curve would suggest values on days with no entries.
                type="linear"
                dataKey="value"
                // Solid stroke: an SVG gradient stroke vanishes on a perfectly flat line.
                stroke={color}
                strokeWidth={3}
                connectNulls
                dot={{ r: 4, fill: color, strokeWidth: 0 }}
                activeDot={{ r: 6 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
