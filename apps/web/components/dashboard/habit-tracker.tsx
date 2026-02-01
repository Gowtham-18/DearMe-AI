"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface HabitDay {
  label: string;
  completed: boolean;
}

interface HabitTrackerProps {
  days: HabitDay[];
}

export default function HabitTracker({ days }: HabitTrackerProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Weekly Habit Tracker</CardTitle>
        <p className="text-sm text-muted-foreground">Days you showed up this week</p>
      </CardHeader>
      <CardContent className="grid grid-cols-7 gap-2">
        {days.map((day) => (
          <div key={day.label} className="flex flex-col items-center gap-2">
            <div
              className={`h-8 w-8 rounded-full border ${
                day.completed
                  ? "border-transparent bg-emerald-500/80"
                  : "border-muted bg-muted"
              }`}
              aria-label={day.completed ? `${day.label} complete` : `${day.label} incomplete`}
            />
            <span className="text-[10px] text-muted-foreground">{day.label}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
