import { Clock } from "lucide-react";

import { Card } from "@/components/ui/card";
import { journalSessions } from "@/lib/mock-data";

export default function JournalSessions() {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Journal Sessions</h2>
        <p className="text-xs text-muted-foreground">Private and on-device</p>
      </div>
      <div className="space-y-3">
        {journalSessions.map((session) => (
          <Card key={session.title} className="p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{session.title}</p>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {session.time}
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{session.snippet}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}
