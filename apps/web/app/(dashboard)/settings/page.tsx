"use client";

import { useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSessionStore } from "@/store/use-session-store";
import { useProfileStore } from "@/store/use-profile-store";
import { listEntries } from "@/lib/db/entries";
import { getProfile, updateProfilePreferences } from "@/lib/db/profiles";
import { listEntryAnalysis } from "@/lib/db/analysis";
import { listThemes, listThemeMembership } from "@/lib/db/themes";
import { listWeeklyReflections } from "@/lib/db/weekly";
import { listSessions, listTurnsByUser } from "@/lib/db/sessions";
import { deleteMyData } from "@/lib/db/cleanup";
import { listMemories } from "@/lib/db/memories";
import MemoryCard from "@/components/settings/memory-card";
import CrisisResources from "@/components/crisis-resources";

export default function SettingsPage() {
  const { ensureUserId } = useSessionStore();
  const { profile, setProfile, setPreferences } = useProfileStore();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);

  // The header's AI switch sends first-time users here so they see what is shared before opting in.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("consent") === "ai-replies") {
      setConsentOpen(true);
    }
  }, []);
  const [updatingEnhanced, setUpdatingEnhanced] = useState(false);
  const [status, setStatus] = useState<{ message: string; tone: "success" | "error" } | null>(
    null
  );
  const [prefStatus, setPrefStatus] = useState<{ message: string; tone: "success" | "error" } | null>(
    null
  );

  const enhancedEnabled = profile?.preferences?.enhanced_language_enabled ?? false;
  const memoryEnabled = profile?.preferences?.memory_enabled !== false;
  const [updatingMemory, setUpdatingMemory] = useState(false);
  const enhancedConsent = profile?.preferences?.enhanced_consent ?? false;
  const canToggleEnhanced = Boolean(profile);
  const enhancedSummary = useMemo(
    () =>
      enhancedEnabled
        ? "AI-written replies are on."
        : "Replies are written by DearMe's built-in companion. You can opt in to AI-written replies.",
    [enhancedEnabled]
  );

  // Preferences are one JSON object: merge, so changing one switch never resets another.
  const persistPreferences = async (changes: {
    enhanced_language_enabled?: boolean;
    enhanced_consent?: boolean;
    memory_enabled?: boolean;
  }) => {
    const nextPreferences = { ...(profile?.preferences ?? {}), ...changes };
    setPreferences(nextPreferences);
    if (!profile) return;

    const { data, error } = await updateProfilePreferences(profile.user_id, nextPreferences);
    if (error) {
      setPrefStatus({
        message: "We couldn't sync your preferences yet. We'll retry next time.",
        tone: "error",
      });
      return;
    }
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

  const handleEnhancedToggle = async () => {
    if (updatingEnhanced || !canToggleEnhanced) return;
    setPrefStatus(null);

    if (!enhancedEnabled && !enhancedConsent) {
      setConsentOpen(true);
      return;
    }

    setUpdatingEnhanced(true);
    await persistPreferences({
      enhanced_language_enabled: !enhancedEnabled,
      enhanced_consent: enhancedConsent,
    });
    setUpdatingEnhanced(false);
  };

  const handleConsentConfirm = async () => {
    setConsentOpen(false);
    setUpdatingEnhanced(true);
    await persistPreferences({ enhanced_language_enabled: true, enhanced_consent: true });
    setUpdatingEnhanced(false);
  };

  const handleMemoryToggle = async (next: boolean) => {
    if (updatingMemory || !profile) return;
    setPrefStatus(null);
    setUpdatingMemory(true);
    await persistPreferences({ memory_enabled: next });
    setUpdatingMemory(false);
  };

  const handleExport = async () => {
    setExporting(true);
    setStatus(null);
    try {
      const userId = ensureUserId();
      const { data: profileData } = await getProfile(userId);
      const { data: entries } = await listEntries(userId, 500);
      const { data: analyses } = await listEntryAnalysis(userId, 500);
      const { data: themes } = await listThemes(userId, 20);
      const { data: memberships } = await listThemeMembership(
        userId,
        themes?.map((theme) => theme.id) ?? []
      );
      const { data: weekly } = await listWeeklyReflections(userId, 12);
      const { data: sessions } = await listSessions(userId, 50);
      const { data: turns } = await listTurnsByUser(userId, 500);
      const { data: memories } = await listMemories(userId, 500);

      const payload = {
        profile: profileData,
        entries,
        analyses: analyses ?? [],
        themes: themes ?? [],
        theme_membership: memberships ?? [],
        weekly_reflections: weekly ?? [],
        journal_sessions: sessions ?? [],
        journal_turns: turns ?? [],
        memory_facts: memories ?? [],
        exported_at: new Date().toISOString(),
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `dearme-ai-export-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);

      setStatus({ message: "Export created successfully.", tone: "success" });
    } catch (err) {
      setStatus({ message: "We couldn't export your data yet. Please try again.", tone: "error" });
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setStatus(null);

    // One transaction: either everything is deleted or nothing is.
    const result = await deleteMyData(true);
    if (result.error) {
      setStatus({ message: "We couldn't delete your data. Nothing was removed. Please try again.", tone: "error" });
      setDeleting(false);
      return;
    }

    setProfile(null);
    setConfirmOpen(false);
    setDeleting(false);
    setStatus({ message: "Your journals, insights and profile were deleted.", tone: "success" });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI-written replies (optional)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>{enhancedSummary}</p>
          <div className="flex items-center justify-between rounded-2xl border border-divider bg-surface-2 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">AI-written replies</p>
              <p className="text-xs text-muted-foreground">
                A language model writes the companion&apos;s replies, guided by DearMe&apos;s own analysis.
                Safety checks and insights stay the same.
              </p>
            </div>
            <Switch
              checked={enhancedEnabled}
              onCheckedChange={() => handleEnhancedToggle()}
              disabled={!canToggleEnhanced || updatingEnhanced}
              aria-label="AI-written replies toggle"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            When on, your latest message, the earlier messages of the current session and up to two
            related snippets from past entries are sent to the AI provider DearMe uses to write each
            reply. Your full journal is never sent. Turn it off anytime.
          </p>
          {prefStatus && (
            <p
              className={`text-sm ${prefStatus.tone === "error" ? "text-destructive" : "text-emerald-600"}`}
            >
              {prefStatus.message}
            </p>
          )}
        </CardContent>
      </Card>

      <MemoryCard
        userId={profile?.user_id ?? null}
        enabled={memoryEnabled}
        disabled={!profile || updatingMemory}
        onToggle={handleMemoryToggle}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Privacy & Safety</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            Your journal is private to you. You're signed in anonymously on this browser, and the
            database only returns rows that belong to your account. Clearing this browser&apos;s data
            signs you out, so export first if you want a copy.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={handleExport} disabled={exporting}>
              {exporting ? "Exporting..." : "Export data"}
            </Button>
            <Button variant="outline" onClick={() => setConfirmOpen(true)}>
              Delete data
            </Button>
          </div>
          {status && (
            <p
              className={`text-sm ${status.tone === "error" ? "text-destructive" : "text-emerald-600"}`}
            >
              {status.message}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Model limitations</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            AI insights are supportive but not perfect. Always verify important decisions with your
            own judgment.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Safety note</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Not medical advice. If you are in crisis, contact local emergency services or a trusted
            professional.
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">If you need support now</CardTitle>
        </CardHeader>
        <CardContent>
          <CrisisResources />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data minimization & consent</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          We collect the minimum needed for personalization: your name, age, optional occupation and
          what you write. Nothing is used to train models.
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete all data?</DialogTitle>
            <DialogDescription>
              This permanently removes your profile, journal entries, chats, insights and everything DearMe
              remembers. This cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={consentOpen} onOpenChange={setConsentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Turn on AI-written replies?</DialogTitle>
            <DialogDescription>
              This optional mode sends your latest message, the earlier messages of the current session
              and up to two related snippets from past entries to DearMe&apos;s AI provider, which writes
              the companion&apos;s reply. Replies are checked to avoid advice and medical language, and
              crisis messages always get the built-in safety response. You can turn it off anytime.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConsentOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConsentConfirm} disabled={updatingEnhanced}>
              {updatingEnhanced ? "Enabling..." : "I consent"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
