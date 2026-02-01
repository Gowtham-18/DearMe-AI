"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type MoodPoint = { day: string; value: number };

interface MoodTrendsChartProps {
  data7: MoodPoint[];
  data30: MoodPoint[];
}

export default function MoodTrendsChart({ data7, data30 }: MoodTrendsChartProps) {
  const [range, setRange] = useState<"7d" | "30d">("7d");
  const data = range === "7d" ? data7 : data30;

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle className="text-base">Mood Trends</CardTitle>
          <p className="text-sm text-muted-foreground">Tracking your emotional balance</p>
        </div>
        <div className="flex items-center gap-2">
          {(["7d", "30d"] as const).map((value) => (
            <Button
              key={value}
              variant="ghost"
              className={cn(
                "h-9 rounded-full px-4",
                range === value && "bg-muted text-foreground"
              )}
              onClick={() => setRange(value)}
            >
              {value === "7d" ? "Last 7 days" : "Last 30 days"}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="h-[280px]">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No mood data yet. Add a mood to your journal to see trends.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ left: 8, right: 8, top: 10 }}>
              <defs>
                <linearGradient id="moodLine" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="hsl(var(--chart-1))" />
                  <stop offset="100%" stopColor="hsl(var(--chart-2))" />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="day" tickLine={false} axisLine={false} />
              <YAxis hide />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  borderRadius: "12px",
                  border: "1px solid hsl(var(--border))",
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="url(#moodLine)"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
