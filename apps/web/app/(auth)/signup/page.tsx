"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle2, Info, Loader2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell, CodeStep, Field, GoogleButton, OrDivider, PasswordField } from "@/components/auth/auth-parts";
import { authCallbackUrl, continueWithGoogle, getSignedInUser, isGuest, markWelcomeSeen } from "@/lib/auth";
import { authErrorMessage, usernameSchema, validateSignUp, type FieldErrors } from "@/lib/auth-validation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type UsernameStatus = "idle" | "checking" | "available" | "taken";

export default function SignUpPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [form, setForm] = useState({ email: "", username: "", password: "", confirm: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [step, setStep] = useState<"form" | "code">("form");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [guest, setGuest] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const [verified, setVerified] = useState({ email: "", password: "" });

  // Already signed in: go to the journal. A guest journal on this device gets kept.
  useEffect(() => {
    markWelcomeSeen();
    getSignedInUser().then((user) => {
      if (user && !isGuest(user)) router.replace("/");
      else setGuest(isGuest(user));
    });
  }, [router]);

  // Live username check (debounced). If the check itself fails, the database still enforces uniqueness.
  useEffect(() => {
    const parsed = usernameSchema.safeParse(form.username);
    if (!parsed.success) {
      setUsernameStatus("idle");
      return;
    }
    setUsernameStatus("checking");
    const timer = window.setTimeout(async () => {
      const { data, error } = await supabase.rpc("username_available", { p_username: parsed.data });
      if (error) setUsernameStatus("idle");
      else setUsernameStatus(data ? "available" : "taken");
    }, 400);
    return () => window.clearTimeout(timer);
  }, [form.username, supabase]);

  const update = (key: keyof typeof form) => (value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const { values, errors: nextErrors } = validateSignUp(form);
    if (usernameStatus === "taken") nextErrors.username = "That username is taken. Try another.";
    setErrors(nextErrors);
    if (!values || Object.values(nextErrors).some(Boolean)) return;

    setBusy(true);
    if (guest) {
      // Attach an email login to this device's guest journal (same account, so every entry stays).
      const { error } = await supabase.auth.updateUser(
        { email: values.email, data: { username: values.username } },
        { emailRedirectTo: authCallbackUrl() }
      );
      setBusy(false);
      if (error) {
        setFormError(authErrorMessage(error));
        return;
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: { data: { username: values.username }, emailRedirectTo: authCallbackUrl() },
      });
      setBusy(false);
      if (error) {
        setFormError(authErrorMessage(error));
        return;
      }
      if (data.session) {
        router.replace("/");
        return;
      }
    }
    setVerified({ email: values.email, password: values.password });
    setStep("code");
  };

  const handleVerify = async (token: string) => {
    setBusy(true);
    setFormError(null);
    const { error } = await supabase.auth.verifyOtp({
      email: verified.email,
      token,
      type: guest ? "email_change" : "signup",
    });
    if (error) {
      setBusy(false);
      setFormError(authErrorMessage(error));
      return;
    }
    if (guest) {
      const { error: passwordError } = await supabase.auth.updateUser({ password: verified.password });
      if (passwordError) {
        // The email is verified and the journal is kept; the password can be set from Account.
        console.warn("password not set after guest upgrade", passwordError.code);
      }
    }
    setVerified({ email: "", password: "" });
    router.replace("/");
  };

  const handleResend = async () => {
    const { error } = await supabase.auth.resend(
      guest
        ? { type: "email_change", email: verified.email }
        : { type: "signup", email: verified.email, options: { emailRedirectTo: authCallbackUrl() } }
    );
    if (error) setFormError(authErrorMessage(error));
    return !error;
  };

  const handleGoogle = async () => {
    setGoogleBusy(true);
    setFormError(null);
    const { error } = await continueWithGoogle();
    if (error) {
      setGoogleBusy(false);
      setFormError(authErrorMessage(error));
    }
  };

  if (step === "code") {
    return (
      <AuthShell title="Check your email" subtitle="Enter the code to verify your email and finish creating your account.">
        <CodeStep
          email={verified.email}
          onVerify={handleVerify}
          onResend={handleResend}
          onBack={() => {
            setStep("form");
            setFormError(null);
          }}
          busy={busy}
          error={formError}
        />
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">Log in</Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="It takes a minute. Your journal stays private to this account."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">Log in</Link>
        </>
      }
    >
      {guest && (
        <div className="mb-6 flex gap-3 rounded-xl border border-divider bg-surface-2 px-4 py-3 text-sm text-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p>
            This device already has a journal. Create your account here and every entry comes with you; nothing is
            lost.
          </p>
        </div>
      )}
      <div className="space-y-5">
        <GoogleButton onClick={handleGoogle} busy={googleBusy} />
        <OrDivider />
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Field id="email" label="Email" error={errors.email}>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(event) => update("email")(event.target.value)}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={254}
              placeholder="you@example.com"
              aria-invalid={Boolean(errors.email)}
            />
          </Field>
          <Field
            id="username"
            label="Username"
            error={errors.username ?? (usernameStatus === "taken" ? "That username is taken. Try another." : null)}
            hint={
              usernameStatus === "checking" ? (
                <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Checking...</span>
              ) : usernameStatus === "available" ? (
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3" /> Available</span>
              ) : (
                "3–20 characters: letters, numbers and underscores."
              )
            }
          >
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">@</span>
              <Input
                id="username"
                value={form.username}
                onChange={(event) => update("username")(event.target.value.replace(/\s/g, ""))}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={20}
                placeholder="your_name"
                className="pl-7"
                aria-invalid={Boolean(errors.username) || usernameStatus === "taken"}
              />
              {usernameStatus === "taken" && <XCircle className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-destructive" aria-hidden />}
            </div>
          </Field>
          <PasswordField
            id="password"
            label="Password"
            value={form.password}
            onChange={update("password")}
            error={errors.password}
            autoComplete="new-password"
            showStrength
          />
          <PasswordField
            id="confirm"
            label="Confirm password"
            value={form.confirm}
            onChange={update("confirm")}
            error={errors.confirm}
            autoComplete="new-password"
          />
          {formError && <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">{formError}</p>}
          <Button type="submit" className="h-11 w-full" disabled={busy}>
            {busy ? "Creating your account..." : "Create account"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            We&apos;ll email you a code to confirm it&apos;s you. Your password is stored only as a secure hash by our
            sign-in provider; DearMe never sees it.
          </p>
        </form>
      </div>
    </AuthShell>
  );
}
