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
  { label: "Today's Journal", short: "Journal", href: "/journal", icon: PenLine },
  { label: "Journals/Memories", short: "Memories", href: "/memories", icon: BookOpen },
  { label: "Insights", short: "Insights", href: "/", icon: BarChart3 },
  { label: "Weekly Reflection", short: "Weekly", href: "/weekly", icon: CalendarRange },
  { label: "Privacy & Safety", short: "Privacy", href: "/settings", icon: Shield },
];

const isActiveItem = (href: string, activePath: string) =>
  href === "/" ? activePath === "/" : activePath.startsWith(href);

export default function Sidebar({ activePath }: { activePath: string }) {
  // New Entry opens the same setup as Today's Journal (mood, time, prompts) in a dialog, wherever you are.
  const [newEntryOpen, setNewEntryOpen] = useState(false);
  // The journal pages already are the place to write, so the phone shortcut stays out of the way there.
  const showMobileNewEntry = !activePath.startsWith("/journal");

  return (
    <>
      <aside className="hidden h-screen w-64 flex-col border-r border-divider bg-sidebar px-5 py-6 md:flex md:fixed md:inset-y-0">
        <Logo />
        <nav className="mt-10 flex-1 space-y-2" aria-label="Main">
          {navItems.map((item) => {
            const isActive = isActiveItem(item.href, activePath);
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
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
      </aside>

      {/* Phones and small tablets: a bottom tab bar, plus a round New Entry button above it. */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-divider bg-sidebar/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {navItems.map((item) => {
            const isActive = isActiveItem(item.href, activePath);
            const Icon = item.icon;
            return (
              <li key={item.label}>
                <Link
                  href={item.href}
                  aria-label={item.label}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30",
                    isActive && "text-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                      isActive && "bg-foreground/[0.08]"
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" aria-hidden />
                  </span>
                  {item.short}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {showMobileNewEntry && (
        <Button
          size="icon"
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-40 h-14 w-14 rounded-full shadow-lg md:hidden"
          onClick={() => setNewEntryOpen(true)}
          aria-label="New entry"
        >
          <Plus className="h-6 w-6" />
        </Button>
      )}

      <Dialog open={newEntryOpen} onOpenChange={setNewEntryOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto">
          <DialogHeader className="mb-2 pr-8">
            <DialogTitle>New entry</DialogTitle>
            <DialogDescription>Choose a mood and how long you have, then pick a prompt or just write.</DialogDescription>
          </DialogHeader>
          {newEntryOpen && <JournalForm variant="dialog" onStarted={() => setNewEntryOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
