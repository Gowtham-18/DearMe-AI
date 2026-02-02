"use client";

import { useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSessionStore } from "@/store/use-session-store";
import { useProfileStore } from "@/store/use-profile-store";
import { deleteAllEntries, listEntries } from "@/lib/db/entries";
import { deleteProfile, getProfile, updateProfilePreferences } from "@/lib/db/profiles";
import { listEntryAnalysis } from "@/lib/db/analysis";
import { listThemes, listThemeMembership } from "@/lib/db/themes";
import { listWeeklyReflections } from "@/lib/db/weekly";
import { listSessions, listTurnsByUser } from "@/lib/db/sessions";
import { deleteUserInsights } from "@/lib/db/cleanup";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { ensureUserId } = useSessionStore();
  const { profile, setProfile, setPreferences } = useProfileStore();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [updatingEnhanced, setUpdatingEnhanced] = useState(false);
  const [status, setStatus] = useState<{ message: string; tone: "success" | "error" } | null>(
    null
  );
  const [prefStatus, setPrefStatus] = useState<{ message: string; tone: "success" | "error" } | null>(
    null
  );

  const enhancedEnabled = profile?.preferences?.enhanced_language_enabled ?? false;
  const enhancedConsent = profile?.preferences?.enhanced_consent ?? false;
  const canToggleEnhanced = Boolean(profile);
  const enhancedSummary = useMemo(
    () =>
      enhancedEnabled
        ? "Enhanced wording is on."
        : "Enhanced wording uses a model to rephrase responses only.",
    [enhancedEnabled]
  );

  const persistPreferences = async (nextPreferences: {
    enhanced_language_enabled: boolean;
    enhanced_consent: boolean;
  }) => {
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

      const payload = {
        profile: profileData,
        entries,
        analyses: analyses ?? [],
        themes: themes ?? [],
        theme_membership: memberships ?? [],
        weekly_reflections: weekly ?? [],
        journal_sessions: sessions ?? [],
        journal_turns: turns ?? [],
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
    const userId = ensureUserId();

    const insightsResult = await deleteUserInsights(userId);
    if (insightsResult.error) {
      setStatus({ message: "We couldn't delete your insights yet. Please try again.", tone: "error" });
      setDeleting(false);
      return;
    }

    const entriesResult = await deleteAllEntries(userId);
    if (entriesResult.error) {
      setStatus({ message: "We couldn't delete your entries yet. Please try again.", tone: "error" });
      setDeleting(false);
      return;
    }

    const profileResult = await deleteProfile(userId);
    if (profileResult.error) {
      setStatus({ message: "We couldn't delete your profile yet. Please try again.", tone: "error" });
      setDeleting(false);
      return;
    }

    setProfile(null);
    setConfirmOpen(false);
    setDeleting(false);
    setStatus({ message: "Your data was deleted from this demo.", tone: "success" });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Enhanced wording (optional)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>{enhancedSummary}</p>
          <div className="flex items-center justify-between rounded-2xl border bg-muted/40 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Rewrite-only mode</p>
              <p className="text-xs text-muted-foreground">
                Uses a language model to improve tone only. Insights stay grounded in your entries.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enhancedEnabled}
              onClick={handleEnhancedToggle}
              disabled={!canToggleEnhanced}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition",
                enhancedEnabled ? "bg-foreground" : "bg-muted",
                !canToggleEnhanced && "cursor-not-allowed opacity-60"
              )}
            >
              <span
                className={cn(
                  "inline-block h-5 w-5 transform rounded-full bg-background shadow transition",
                  enhancedEnabled ? "translate-x-5" : "translate-x-1"
                )}
              />
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Toggle off anytime. We only send the structured plan, not your full entry history.
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Privacy & Safety</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            Your journal entries are private. This demo stores an anonymous identity in this
            browser, and uses Supabase with an anon key for persistence.
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
          <CardTitle className="text-base">Crisis routing</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Placeholder: In future phases, we will provide regional crisis resources and a direct
          routing flow.
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data minimization & consent</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          We collect the minimum metadata needed for personalization. Clearing your browser data
          resets this anonymous demo identity.
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete all data?</DialogTitle>
            <DialogDescription>
              This removes your profile and journal entries from the demo database. This cannot be
              undone.
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
            <DialogTitle>Enable enhanced wording?</DialogTitle>
            <DialogDescription>
              This optional mode uses a language model to rewrite responses only. It does not
              change meaning or add new advice. You can turn it off anytime.
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