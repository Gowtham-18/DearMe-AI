import Link from "next/link";
import { MoreHorizontal } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { recentReflections } from "@/lib/mock-data";

export default function RecentReflections() {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <CardTitle className="text-base">Recent Reflections</CardTitle>
        <Link href="/memories" className="text-sm text-muted-foreground hover:text-foreground">
          View All
        </Link>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {recentReflections.map((item) => (
          <Card key={item.title} className="min-w-[240px] flex-1 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between pb-2">
              <div>
                <CardTitle className="text-sm">{item.title}</CardTitle>
                <p className="text-xs text-muted-foreground">{item.time}</p>
              </div>
              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{item.snippet}</CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
