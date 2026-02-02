"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  CalendarRange,
  PenLine,
  Shield,
  Plus,
} from "lucide-react";

import Logo from "@/components/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createSession, createTurn } from "@/lib/db/sessions";
import { formatLocalDate } from "@/lib/date";
import { useSessionStore } from "@/store/use-session-store";

const navItems = [
  { label: "Today's Journal", href: "/journal", icon: PenLine },
  { label: "Journals/Memories", href: "/memories", icon: BookOpen },
  { label: "Insights", href: "/", icon: BarChart3 },
  { label: "Weekly Reflection", href: "/weekly", icon: CalendarRange },
  { label: "Privacy & Safety", href: "/settings", icon: Shield },
];

export default function Sidebar({ activePath }: { activePath: string }) {
  const router = useRouter();
  const { ensureUserId } = useSessionStore();
  const [creating, setCreating] = useState(false);

  const handleNewEntry = async () => {
    if (creating) return;
    setCreating(true);
    const userId = ensureUserId();
    const todayKey = formatLocalDate(new Date());
    const promptText = "What feels most important to explore right now?";

    const { data, error } = await createSession({
      user_id: userId,
      entry_date: todayKey,
      selected_prompt_id: "prompt_new_entry",
      selected_prompt_text: promptText,
      status: "ACTIVE",
      title: "New journal session",
    });

    if (error || !data) {
      setCreating(false);
      return;
    }

    await createTurn({
      session_id: data.id,
      user_id: userId,
      role: "assistant",
      content: promptText,
    });

    window.dispatchEvent(new Event("journal-session-updated"));
    setCreating(false);
    router.push(`/journal/session/${data.id}`);
  };

  return (
    <aside className="hidden h-screen w-64 flex-col border-r bg-background px-5 py-6 md:flex md:fixed md:inset-y-0">
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
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted/80 hover:text-foreground",
                isActive && "bg-muted text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto">
        <Button className="w-full gap-2" onClick={handleNewEntry} disabled={creating}>
          <Plus className="h-4 w-4" />
          {creating ? "Starting..." : "New Entry"}
        </Button>
      </div>
    </aside>
  );
}