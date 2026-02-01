"use client";

import { useState } from "react";
import { Filter } from "lucide-react";

import { memories, mockAnalysis } from "@/lib/mock-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function MemoriesPage() {
  const [selectedId, setSelectedId] = useState(memories[0]?.id ?? "");
  const selected = memories.find((memory) => memory.id === selectedId) ?? memories[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Input placeholder="Search entries..." />
          <Button variant="outline" size="icon" aria-label="Filter">
            <Filter className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-3">
          {memories.map((memory) => (
            <button
              key={memory.id}
              type="button"
              onClick={() => setSelectedId(memory.id)}
              className={cn(
                "w-full rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:border-foreground/20",
                memory.id === selectedId && "border-foreground/20"
              )}
            >
              <p className="text-sm font-semibold">{memory.title}</p>
              <p className="text-xs text-muted-foreground">{memory.date}</p>
              <p className="mt-2 text-xs text-muted-foreground">Mood: {memory.mood}</p>
            </button>
          ))}
        </div>
      </section>
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="text-lg">{selected?.title}</CardTitle>
          <p className="text-sm text-muted-foreground">{selected?.date}</p>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>{selected?.content}</p>
          <div className="rounded-2xl bg-muted p-4 text-xs text-muted-foreground">
            NLP summary placeholder: sentiment {mockAnalysis.sentiment}, themes{" "}
            {mockAnalysis.themes.join(", ")}.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
