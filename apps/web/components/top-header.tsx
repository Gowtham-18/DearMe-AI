"use client";

import { Bell, Search, ShieldCheck, Sparkles } from "lucide-react";

import ThemeToggle from "@/components/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProfileStore } from "@/store/use-profile-store";

export default function TopHeader() {
  const { profile } = useProfileStore();
  const enhancedEnabled = profile?.preferences?.enhanced_language_enabled;
  const initials = profile?.name
    ? profile.name
        .split(" ")
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "AN";

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card px-4 py-3 md:flex-nowrap">
      <div className="relative w-full max-w-xl flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search memories..." />
      </div>
      <div className="flex items-center gap-3">
        {enhancedEnabled && (
          <Badge className="gap-1 rounded-full px-3 py-1" variant="secondary">
            <Sparkles className="h-3.5 w-3.5" />
            Enhanced wording
          </Badge>
        )}
        <Badge className="gap-1 rounded-full px-3 py-1" variant="secondary">
          <ShieldCheck className="h-3.5 w-3.5" />
          Privacy Locked
        </Badge>
        <Button size="icon" variant="ghost" aria-label="Notifications">
          <Bell className="h-4 w-4" />
        </Button>
        <Avatar>
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <ThemeToggle />
      </div>
    </header>
  );
}