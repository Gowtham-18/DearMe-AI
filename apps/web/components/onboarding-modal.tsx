"use client";

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProfileStore } from "@/store/use-profile-store";

const onboardingSchema = z.object({
  name: z.string().min(2).max(30),
  age: z.coerce.number().int().min(13).max(120),
  occupation: z.string().max(60).optional(),
});

type OnboardingForm = {
  name: string;
  age: string;
  occupation: string;
};

export default function OnboardingModal() {
  const { profile, setProfile, hasHydrated } = useProfileStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<OnboardingForm>({ name: "", age: "", occupation: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (hasHydrated && !profile) {
      setOpen(true);
    }
  }, [hasHydrated, profile]);

  const title = useMemo(() => "Welcome to DearMe", []);

  const handleSubmit = () => {
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
      setErrors(nextErrors);
      return;
    }

    setProfile({
      name: parsed.data.name,
      age: parsed.data.age,
      occupation: parsed.data.occupation,
      createdAt: new Date().toISOString(),
    });
    setErrors({});
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
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
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
            {errors.age && <p className="text-xs text-destructive">{errors.age}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="occupation">Occupation (optional)</Label>
            <Input
              id="occupation"
              value={form.occupation}
              onChange={(event) => setForm((prev) => ({ ...prev, occupation: event.target.value }))}
              placeholder="Designer, student, founder..."
            />
            {errors.occupation && <p className="text-xs text-destructive">{errors.occupation}</p>}
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <Button onClick={handleSubmit}>Continue</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
