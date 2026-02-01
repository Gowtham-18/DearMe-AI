import { SendHorizontal } from "lucide-react";

import { chatMessages } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export default function JournalChat() {
  return (
    <Card className="flex h-full flex-col gap-4 p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Today's Journal</h2>
          <p className="text-xs text-muted-foreground">Private Session</p>
        </div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto">
        {chatMessages.map((message, index) => (
          <div
            key={index}
            className={cn(
              "max-w-[80%] rounded-2xl px-4 py-3 text-sm",
              message.role === "assistant"
                ? "bg-muted text-foreground"
                : "ml-auto bg-primary text-primary-foreground"
            )}
          >
            {message.text}
          </div>
        ))}
      </div>
      <div className="rounded-2xl border bg-background p-3">
        <div className="flex items-end gap-3">
          <Textarea className="min-h-[60px] resize-none border-none p-0 focus-visible:ring-0" placeholder="Type your thoughts..." />
          <Button size="icon" aria-label="Send">
            <SendHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
