"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell, CodeStep, Field, PasswordField } from "@/components/auth/auth-parts";
import { authCallbackUrl, getSignedInUser } from "@/lib/auth";
import { authErrorMessage, emailSchema, validateNewPassword, type FieldErrors } from "@/lib/auth-validation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Step = "email" | "code" | "new";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Arriving from the emailed link (instead of typing the code) lands here with a recovery session.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("step") !== "new") return;
    getSignedInUser().then((user) => {
      if (user) setStep("new");
    });
  }, []);

  const sendCode = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setFormError(null);
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setErrors({ email: parsed.error.issues[0]?.message });
      return false;
    }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${authCallbackUrl()}?next=${encodeURIComponent("/forgot-password?step=new")}`,
    });
    setBusy(false);
    // Same next step whether or not the email has an account, so this page can't be used to find accounts.
    if (error && error.status === 429) {
      setFormError(authErrorMessage(error));
      return false;
    }
    setEmail(parsed.data);
    setStep("code");
    return true;
  };

  const verify = async (token: string) => {
    setBusy(true);
    setFormError(null);
    const { error } = await supabase.auth.verifyOtp({ email, token, type: "recovery" });
    setBusy(false);
    if (error) setFormError(authErrorMessage(error));
    else setStep("new");
  };

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const nextErrors = validateNewPassword(password, confirm, { email });
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setFormError(authErrorMessage(error));
      return;
    }
    setPassword("");
    setConfirm("");
    router.replace("/");
  };

  const back = (
    <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">Back to log in</Link>
  );

  if (step === "code") {
    return (
      <AuthShell title="Check your email" subtitle="If an account exists for this email, we've sent a code to reset your password." footer={back}>
        <CodeStep
          email={email}
          onVerify={verify}
          onResend={() => sendCode()}
          onBack={() => setStep("email")}
          busy={busy}
          error={formError}
        />
      </AuthShell>
    );
  }

  if (step === "new") {
    return (
      <AuthShell title="Choose a new password" subtitle="You'll stay logged in on this device.">
        <form onSubmit={savePassword} className="space-y-4" noValidate>
          <PasswordField id="password" label="New password" value={password} onChange={setPassword} error={errors.password} autoComplete="new-password" showStrength />
          <PasswordField id="confirm" label="Confirm new password" value={confirm} onChange={setConfirm} error={errors.confirm} autoComplete="new-password" />
          {formError && <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">{formError}</p>}
          <Button type="submit" className="h-11 w-full" disabled={busy}>{busy ? "Saving..." : "Save new password"}</Button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset your password" subtitle="Enter your account's email and we'll send you a code." footer={back}>
      <form onSubmit={sendCode} className="space-y-4" noValidate>
        <Field id="email" label="Email" error={errors.email}>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setErrors({});
            }}
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={254}
            placeholder="you@example.com"
            aria-invalid={Boolean(errors.email)}
          />
        </Field>
        {formError && <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">{formError}</p>}
        <Button type="submit" className="h-11 w-full" disabled={busy}>{busy ? "Sending..." : "Send code"}</Button>
      </form>
    </AuthShell>
  );
}
