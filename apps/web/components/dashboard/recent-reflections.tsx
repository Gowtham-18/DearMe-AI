"use client";

import Link from "next/link";
import { useMemo } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EntryRecord } from "@/lib/db/entries";
import { formatDisplayDate } from "@/lib/date";
import { emptyStateCopy, pickCopy } from "@/lib/copy";

interface RecentReflectionsProps {
  entries: EntryRecord[];
}

export default function RecentReflections({ entries }: RecentReflectionsProps) {
  const emptyCopy = useMemo(
    () => pickCopy(emptyStateCopy.memories, new Date().toDateString()),
    []
  );

  if (entries.length === 0) {
    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Recent Reflections</CardTitle>
          <Link href="/memories" className="text-sm text-muted-foreground hover:text-foreground">
            View All
          </Link>
        </div>
        <Card className="p-6 text-sm text-muted-foreground">{emptyCopy}</Card>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <CardTitle className="text-base">Recent Reflections</CardTitle>
        <Link href="/memories" className="text-sm text-muted-foreground hover:text-foreground">
          View All
        </Link>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {entries.map((item) => (
          <Link key={item.id} href={`/memories/${item.id}`} className="min-w-[240px] flex-1 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
            <Card className="h-full transition-[border-color,box-shadow] duration-150 hover:border-foreground/25 hover:shadow-hover-gray">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{formatDisplayDate(item.entry_date)}</CardTitle>
                <p className="text-xs text-muted-foreground">{item.mood ?? "No mood"}</p>
              </CardHeader>
              <CardContent className="line-clamp-3 text-sm text-muted-foreground">{item.content}</CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
