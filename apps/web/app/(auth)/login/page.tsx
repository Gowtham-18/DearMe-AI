"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell, CodeStep, Field, GoogleButton, OrDivider, PasswordField } from "@/components/auth/auth-parts";
import { authCallbackUrl, continueWithGoogle, getSignedInUser, isGuest, markWelcomeSeen } from "@/lib/auth";
import { authErrorMessage, emailSchema, type FieldErrors } from "@/lib/auth-validation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [guest, setGuest] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);

  useEffect(() => {
    markWelcomeSeen();
    getSignedInUser().then((user) => {
      if (user && !isGuest(user)) router.replace("/");
      else setGuest(isGuest(user));
    });
  }, [router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const parsed = emailSchema.safeParse(email);
    const nextErrors: FieldErrors = {};
    if (!parsed.success) nextErrors.email = parsed.error.issues[0]?.message;
    if (!password) nextErrors.password = "Enter your password.";
    setErrors(nextErrors);
    if (!parsed.success || !password) return;

    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: parsed.data, password });
    if (error) {
      setBusy(false);
      if (error.code === "email_not_confirmed") {
        // Send a fresh code and verify right here.
        await supabase.auth.resend({ type: "signup", email: parsed.data, options: { emailRedirectTo: authCallbackUrl() } });
        setVerifyEmail(parsed.data);
        return;
      }
      setFormError(authErrorMessage(error));
      return;
    }
    setPassword("");
    router.replace("/");
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

  if (verifyEmail) {
    return (
      <AuthShell title="Verify your email" subtitle="Your account isn't verified yet. Enter the code we just sent.">
        <CodeStep
          email={verifyEmail}
          busy={busy}
          error={formError}
          onBack={() => {
            setVerifyEmail(null);
            setFormError(null);
          }}
          onResend={async () => {
            const { error } = await supabase.auth.resend({ type: "signup", email: verifyEmail, options: { emailRedirectTo: authCallbackUrl() } });
            if (error) setFormError(authErrorMessage(error));
            return !error;
          }}
          onVerify={async (token) => {
            setBusy(true);
            const { error } = await supabase.auth.verifyOtp({ email: verifyEmail, token, type: "signup" });
            setBusy(false);
            if (error) setFormError(authErrorMessage(error));
            else router.replace("/");
          }}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to your journal."
      footer={
        <>
          New to DearMe?{" "}
          <Link href="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">Create an account</Link>
        </>
      }
    >
      {guest && (
        <div className="mb-6 flex gap-3 rounded-xl border border-divider bg-surface-2 px-4 py-3 text-sm text-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p>
            This device has a journal that isn&apos;t linked to an account yet. To keep it,{" "}
            <Link href="/signup" className="font-medium underline underline-offset-4">create your account</Link> instead.
            Logging in to another account won&apos;t bring it along.
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
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setErrors((current) => ({ ...current, email: undefined }));
              }}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={254}
              placeholder="you@example.com"
              aria-invalid={Boolean(errors.email)}
            />
          </Field>
          <div className="space-y-1.5">
            <PasswordField
              id="password"
              label="Password"
              value={password}
              onChange={(value) => {
                setPassword(value);
                setErrors((current) => ({ ...current, password: undefined }));
              }}
              error={errors.password}
              autoComplete="current-password"
            />
            <div className="flex justify-end">
              <Link href="/forgot-password" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                Forgot password?
              </Link>
            </div>
          </div>
          {formError && <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">{formError}</p>}
          <Button type="submit" className="h-11 w-full" disabled={busy}>
            {busy ? "Logging in..." : "Log in"}
          </Button>
        </form>
      </div>
    </AuthShell>
  );
}
