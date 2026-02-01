"use client";

import Link from "next/link";
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

const navItems = [
  { label: "Today's Journal", href: "/journal", icon: PenLine },
  { label: "Journals/Memories", href: "/memories", icon: BookOpen },
  { label: "Insights", href: "/", icon: BarChart3 },
  { label: "Weekly Reflection", href: "/weekly", icon: CalendarRange },
  { label: "Privacy & Safety", href: "/settings", icon: Shield },
];

export default function Sidebar({ activePath }: { activePath: string }) {
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
        <Button className="w-full gap-2">
          <Plus className="h-4 w-4" />
          New Entry
        </Button>
      </div>
    </aside>
  );
}
