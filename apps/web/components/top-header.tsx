"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, Search, ShieldCheck, Sparkles } from "lucide-react";

import ThemeToggle from "@/components/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { updateProfilePreferences } from "@/lib/db/profiles";
import { useProfileStore } from "@/store/use-profile-store";

const titleMap: Record<string, string> = {
  "/": "Insights",
  "/journal": "Today's Journal",
  "/memories": "Journals/Memories",
  "/weekly": "Weekly Reflection",
  "/settings": "Privacy & Safety",
};

export default function TopHeader() {
  const pathname = usePathname();
  const { profile, setPreferences, setProfile } = useProfileStore();
  const [saving, setSaving] = useState(false);
  const [showNotice, setShowNotice] = useState(false);

  const title = useMemo(() => {
    if (pathname.startsWith("/journal")) return "Today's Journal";
    return titleMap[pathname] ?? "DearMe AI";
  }, [pathname]);

  const showSearch = pathname.startsWith("/memories");

  const enhancedEnabled = profile?.preferences?.enhanced_language_enabled ?? false;
  const enhancedConsent = profile?.preferences?.enhanced_consent ?? false;

  const initials = profile?.name
    ? profile.name
        .split(" ")
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "AN";

  const persistPreferences = async (nextPreferences: {
    enhanced_language_enabled: boolean;
    enhanced_consent: boolean;
  }) => {
    setPreferences(nextPreferences);
    if (!profile) return;
    const { data } = await updateProfilePreferences(profile.user_id, nextPreferences);
    if (data) {
      setProfile({
        user_id: data.user_id,
        name: data.name,
        age: data.age,
        occupation: data.occupation ?? undefined,
        preferences: data.preferences ?? nextPreferences,
        createdAt: data.created_at ?? new Date().toISOString(),
      });
    }
  };

  const handleToggle = async (checked: boolean) => {
    if (!profile || saving) return;
    setSaving(true);
    const nextPreferences = {
      enhanced_language_enabled: checked,
      enhanced_consent: enhancedConsent || checked,
    };
    await persistPreferences(nextPreferences);
    if (!enhancedConsent && checked) {
      setShowNotice(true);
      setTimeout(() => setShowNotice(false), 4500);
    }
    setSaving(false);
  };

  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">DearMe AI</p>
            <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
          </div>
          {showSearch && (
            <div className="relative w-full max-w-xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search memories..." />
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 rounded-full border border-divider bg-surface-2 px-3 py-2 shadow-soft-gray">
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-foreground">Enhanced wording</p>
              <p className="text-[11px] text-muted-foreground">Improves tone only.</p>
            </div>
            <Switch
              checked={enhancedEnabled}
              onCheckedChange={handleToggle}
              disabled={!profile || saving}
              aria-label="Enhanced wording"
            />
          </div>
          {enhancedEnabled && (
            <Badge className="gap-1 rounded-full px-3 py-1" variant="secondary">
              <Sparkles className="h-3.5 w-3.5" />
              Enhanced
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
      </div>
      {showNotice && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          We send only a short structured plan (not your full history) to improve wording. You can
          turn this off anytime.
        </div>
      )}
    </header>
  );
}
