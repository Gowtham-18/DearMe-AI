"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BarChart3,
  BookOpen,
  CalendarRange,
  PenLine,
  Shield,
  Plus,
} from "lucide-react";

import Logo from "@/components/logo";
import JournalForm from "@/components/journal/journal-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Today's Journal", href: "/journal", icon: PenLine },
  { label: "Journals/Memories", href: "/memories", icon: BookOpen },
  { label: "Insights", href: "/", icon: BarChart3 },
  { label: "Weekly Reflection", href: "/weekly", icon: CalendarRange },
  { label: "Privacy & Safety", href: "/settings", icon: Shield },
];

export default function Sidebar({ activePath }: { activePath: string }) {
  // New Entry opens the same setup as Today's Journal (mood, time, prompts) in a dialog, wherever you are.
  const [newEntryOpen, setNewEntryOpen] = useState(false);

  return (
    <aside className="hidden h-screen w-64 flex-col border-r border-divider bg-sidebar px-5 py-6 md:flex md:fixed md:inset-y-0">
      <Logo />
      <nav className="mt-10 flex-1 space-y-2">
        {navItems.map((item) => {
          const isActive = item.href === "/" ? activePath === "/" : activePath.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-foreground/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                isActive && "bg-foreground/[0.07] text-foreground"
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-primary" />
              )}
              <Icon className={cn("h-4 w-4 transition-colors group-hover:text-foreground", isActive && "text-foreground")} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto">
        <Button className="w-full gap-2" onClick={() => setNewEntryOpen(true)}>
          <Plus className="h-4 w-4" />
          New Entry
        </Button>
      </div>
      <Dialog open={newEntryOpen} onOpenChange={setNewEntryOpen}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader className="mb-2 pr-8">
            <DialogTitle>New entry</DialogTitle>
            <DialogDescription>Choose a mood and how long you have, then pick a prompt or just write.</DialogDescription>
          </DialogHeader>
          {newEntryOpen && <JournalForm variant="dialog" onStarted={() => setNewEntryOpen(false)} />}
        </DialogContent>
      </Dialog>
    </aside>
  );
}
