"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProfileStore } from "@/store/use-profile-store";
import { useSessionStore } from "@/store/use-session-store";
import { upsertProfile } from "@/lib/db/profiles";
import { getSignedInUser } from "@/lib/auth";
import { cleanText, nameSchema, usernameSchema } from "@/lib/auth-validation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const onboardingSchema = z.object({
  name: nameSchema,
  username: usernameSchema,
  age: z
    .string()
    .trim()
    .min(1, "Age is required.")
    .refine((value) => /^\d+$/.test(value), "Age must be a whole number.")
    .transform((value) => Number(value))
    .refine((value) => value >= 16, "Age must be at least 16.")
    .refine((value) => value <= 120, "Age must be 120 or less."),
  occupation: z
    .string()
    .transform(cleanText)
    .pipe(z.string().max(60, "Occupation must be 60 characters or less."))
    .optional(),
});

type OnboardingForm = { name: string; username: string; age: string; occupation: string };
type UsernameStatus = "idle" | "checking" | "available" | "taken";

/** A suggestion from the email or Google name: "Gowtham G" -> "gowtham_g". */
function suggestUsername(source: string): string {
  return source
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
}

/** After sign-up: name, username and age, so insights and prompts can be personal. */
export default function OnboardingModal() {
  const { profile, status, setProfile, setStatus, setError, error } = useProfileStore();
  const { ensureUserId } = useSessionStore();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<OnboardingForm>({ name: "", username: "", age: "", occupation: "" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");

  useEffect(() => {
    if (status === "ready" && !profile) setOpen(true);
  }, [status, profile]);

  // Pre-fill from sign-up (username) or Google (name).
  useEffect(() => {
    if (!open) return;
    getSignedInUser().then((user) => {
      const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
      const fullName = typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : "";
      const chosen = typeof meta.username === "string" ? meta.username : "";
      const fromEmail = user?.email?.split("@")[0] ?? "";
      setForm((current) => ({
        ...current,
        name: current.name || cleanText(fullName).slice(0, 30),
        username: current.username || chosen || suggestUsername(fullName || fromEmail),
      }));
    });
  }, [open]);

  useEffect(() => {
    const parsed = usernameSchema.safeParse(form.username);
    if (!parsed.success) {
      setUsernameStatus("idle");
      return;
    }
    setUsernameStatus("checking");
    const timer = window.setTimeout(async () => {
      const { data, error: rpcError } = await getSupabaseBrowserClient().rpc("username_available", { p_username: parsed.data });
      setUsernameStatus(rpcError ? "idle" : data ? "available" : "taken");
    }, 400);
    return () => window.clearTimeout(timer);
  }, [form.username]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = onboardingSchema.safeParse({
      name: form.name,
      username: form.username,
      age: form.age,
      occupation: form.occupation.trim() || undefined,
    });

    const nextErrors: Record<string, string> = {};
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => {
        const key = issue.path[0];
        if (typeof key === "string" && !nextErrors[key]) nextErrors[key] = issue.message;
      });
    }
    if (usernameStatus === "taken") nextErrors.username = "That username is taken. Try another.";
    setFieldErrors(nextErrors);
    if (!parsed.success || Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    setError(null);
    const userId = ensureUserId();
    const now = new Date().toISOString();
    const { data, error: upsertError } = await upsertProfile({
      user_id: userId,
      name: parsed.data.name,
      username: parsed.data.username,
      age: parsed.data.age,
      occupation: parsed.data.occupation || null,
      preferences: { enhanced_language_enabled: false, enhanced_consent: false },
      created_at: now,
      updated_at: now,
    });

    if (upsertError || !data) {
      if (upsertError?.includes("profiles_username_key")) {
        setFieldErrors({ username: "That username was just taken. Try another." });
        setUsernameStatus("taken");
      } else {
        setError("We couldn't save your profile yet. Please try again.");
      }
      setSaving(false);
      return;
    }

    setProfile({
      user_id: data.user_id,
      name: data.name,
      age: data.age,
      occupation: data.occupation ?? undefined,
      username: data.username ?? parsed.data.username,
      preferences: data.preferences ?? { enhanced_language_enabled: false, enhanced_consent: false },
      createdAt: data.created_at ?? now,
    });
    setStatus("ready");
    setFieldErrors({});
    setSaving(false);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (profile ? setOpen(next) : setOpen(true))}>
      <DialogContent className="max-h-[92vh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Set up your profile</DialogTitle>
          <DialogDescription>A few details so prompts and insights feel like yours. Only you can see them.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={form.name} maxLength={30} autoComplete="name"
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Your name" />
            {fieldErrors.name && <p className="text-xs text-destructive">{fieldErrors.name}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-username">Username</Label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">@</span>
              <Input id="profile-username" value={form.username} maxLength={20} autoCapitalize="none" spellCheck={false} className="pl-7"
                onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value.replace(/\s/g, "") }))} placeholder="your_name" />
            </div>
            {fieldErrors.username ? (
              <p className="text-xs text-destructive">{fieldErrors.username}</p>
            ) : usernameStatus === "taken" ? (
              <p className="text-xs text-destructive">That username is taken. Try another.</p>
            ) : usernameStatus === "checking" ? (
              <p className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Checking...</p>
            ) : usernameStatus === "available" ? (
              <p className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3" /> Available</p>
            ) : (
              <p className="text-xs text-muted-foreground">3–20 characters: letters, numbers and underscores.</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="age">Age</Label>
            <Input id="age" type="number" inputMode="numeric" min={16} max={120} value={form.age}
              onChange={(event) => setForm((prev) => ({ ...prev, age: event.target.value }))} placeholder="18" />
            {fieldErrors.age && <p className="text-xs text-destructive">{fieldErrors.age}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="occupation">Occupation (optional)</Label>
            <Input id="occupation" value={form.occupation} maxLength={60}
              onChange={(event) => setForm((prev) => ({ ...prev, occupation: event.target.value }))} placeholder="Designer, student, founder..." />
            {fieldErrors.occupation && <p className="text-xs text-destructive">{fieldErrors.occupation}</p>}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Continue"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
