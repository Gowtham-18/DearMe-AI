"use client";

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProfileStore } from "@/store/use-profile-store";
import { useSessionStore } from "@/store/use-session-store";
import { upsertProfile } from "@/lib/db/profiles";

const onboardingSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters.").max(30),
  age: z.coerce
    .number({ invalid_type_error: "Age is required." })
    .int("Age must be a whole number.")
    .min(13, "Age must be at least 13.")
    .max(120, "Age must be 120 or less."),
  occupation: z.string().max(60, "Occupation must be 60 characters or less.").optional(),
});

type OnboardingForm = {
  name: string;
  age: string;
  occupation: string;
};

export default function OnboardingModal() {
  const { profile, status, setProfile, setStatus, setError, error } = useProfileStore();
  const { ensureUserId } = useSessionStore();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<OnboardingForm>({ name: "", age: "", occupation: "" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (status === "ready" && !profile) {
      setOpen(true);
    }
  }, [status, profile]);

  const title = useMemo(() => "Welcome to DearMe", []);

  const handleSubmit = async () => {
    const parsed = onboardingSchema.safeParse({
      name: form.name.trim(),
      age: form.age,
      occupation: form.occupation.trim() || undefined,
    });

    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        const key = issue.path[0];
        if (typeof key === "string") {
          nextErrors[key] = issue.message;
        }
      });
      setFieldErrors(nextErrors);
      return;
    }

    setSaving(true);
    setError(null);

    const userId = ensureUserId();
    const payload = {
      user_id: userId,
      name: parsed.data.name,
      age: parsed.data.age,
      occupation: parsed.data.occupation ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error: upsertError } = await upsertProfile(payload);

    if (upsertError || !data) {
      setError("We couldn't save your profile yet. Please try again.");
      setSaving(false);
      return;
    }

    setProfile({
      user_id: data.user_id,
      name: data.name,
      age: data.age,
      occupation: data.occupation ?? undefined,
      createdAt: data.created_at ?? new Date().toISOString(),
    });
    setStatus("ready");
    setFieldErrors({});
    setSaving(false);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (profile ? setOpen(next) : setOpen(true))}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Tell us a bit about you. This stays on your device and personalizes your insights.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Your name"
            />
            {fieldErrors.name && <p className="text-xs text-destructive">{fieldErrors.name}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="age">Age</Label>
            <Input
              id="age"
              type="number"
              value={form.age}
              onChange={(event) => setForm((prev) => ({ ...prev, age: event.target.value }))}
              placeholder="18"
            />
            {fieldErrors.age && <p className="text-xs text-destructive">{fieldErrors.age}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="occupation">Occupation (optional)</Label>
            <Input
              id="occupation"
              value={form.occupation}
              onChange={(event) => setForm((prev) => ({ ...prev, occupation: event.target.value }))}
              placeholder="Designer, student, founder..."
            />
            {fieldErrors.occupation && (
              <p className="text-xs text-destructive">{fieldErrors.occupation}</p>
            )}
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        <div className="mt-6 flex justify-end">
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving..." : "Continue"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
