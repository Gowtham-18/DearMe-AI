import Link from "next/link";
import { MoreHorizontal } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EntryRecord } from "@/lib/db/entries";
import { formatDisplayDate } from "@/lib/date";

interface RecentReflectionsProps {
  entries: EntryRecord[];
}

export default function RecentReflections({ entries }: RecentReflectionsProps) {
  if (entries.length === 0) {
    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Recent Reflections</CardTitle>
          <Link href="/memories" className="text-sm text-muted-foreground hover:text-foreground">
            View All
          </Link>
        </div>
        <Card className="p-6 text-sm text-muted-foreground">
          No entries yet. Start your first journal to see it here.
        </Card>
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
          <Card key={item.id} className="min-w-[240px] flex-1 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between pb-2">
              <div>
                <CardTitle className="text-sm">{formatDisplayDate(item.entry_date)}</CardTitle>
                <p className="text-xs text-muted-foreground">{item.mood ?? "No mood"}</p>
              </div>
              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {item.content.slice(0, 90)}
              {item.content.length > 90 ? "..." : ""}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
