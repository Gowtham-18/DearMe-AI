"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { Check, Eye, EyeOff, Lock, ShieldCheck, Sparkles } from "lucide-react";

import ThemeToggle from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WriteIllustration } from "@/components/auth/illustrations";
import { otpSchema, passwordChecks, passwordStrength } from "@/lib/auth-validation";
import { cn } from "@/lib/utils";

/** Two-column frame for log in / sign up / reset: a calm brand panel and the form. */
export function AuthShell({ title, subtitle, children, footer }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen bg-surface lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden flex-col justify-between border-r border-divider bg-sidebar p-10 lg:flex">
        <BrandMark />
        <div className="space-y-6">
          <WriteIllustration className="mx-auto w-full max-w-sm" />
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold text-balance text-foreground">A private place to think things through.</h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2"><Lock className="mt-0.5 h-4 w-4 shrink-0" />Your journal is only readable by your account.</li>
              <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />Never used to train AI models.</li>
              <li className="flex gap-2"><Sparkles className="mt-0.5 h-4 w-4 shrink-0" />Outside AI only if you switch it on.</li>
            </ul>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">DearMe AI · Journaling companion</p>
      </aside>
      <main className="flex flex-col px-4 py-6 sm:px-8">
        <div className="flex items-center justify-between">
          <div className="lg:invisible">
            <BrandMark />
          </div>
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

export function BrandMark() {
  return (
    <Link href="/welcome" className="flex items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <Sparkles className="h-4 w-4" />
      </span>
      <span className="text-sm font-semibold text-foreground">DearMe AI</span>
    </Link>
  );
}

/** Label + input + error, wired for screen readers. */
export function Field({ id, label, error, hint, children }: {
  id: string;
  label: string;
  error?: string | null;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive" role="alert">{error}</p>
      ) : hint ? (
        <div id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
}

/** Password input with a show/hide button and, optionally, a strength bar and rule checklist. */
export function PasswordField({ id, label, value, onChange, error, autoComplete, showStrength = false, disabled }: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  autoComplete: "current-password" | "new-password";
  showStrength?: boolean;
  disabled?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const strength = passwordStrength(value);
  const strengthLabel = ["Too weak", "Weak", "Fair", "Good", "Strong"][strength];
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={128}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : showStrength ? `${id}-rules` : undefined}
          className="pr-11"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && <p id={`${id}-error`} className="text-xs text-destructive" role="alert">{error}</p>}
      {showStrength && value && (
        <div id={`${id}-rules`} className="space-y-2 pt-1">
          <div className="flex items-center gap-2">
            <div className="grid flex-1 grid-cols-4 gap-1" aria-hidden="true">
              {[1, 2, 3, 4].map((step) => (
                <span
                  key={step}
                  className={cn(
                    "h-1.5 rounded-full bg-muted transition-colors",
                    strength >= step && (strength <= 1 ? "bg-destructive" : strength === 2 ? "bg-amber-500" : "bg-emerald-500")
                  )}
                />
              ))}
            </div>
            <span className="w-16 text-right text-xs text-muted-foreground">{strengthLabel}</span>
          </div>
          <ul className="grid gap-1 text-xs sm:grid-cols-2">
            {passwordChecks(value).map((check) => (
              <li key={check.id} className={cn("flex items-center gap-1.5", check.ok ? "text-foreground" : "text-muted-foreground")}>
                <Check className={cn("h-3.5 w-3.5", check.ok ? "text-emerald-500" : "opacity-30")} aria-hidden />
                <span>{check.label}</span>
                <span className="sr-only">{check.ok ? "(done)" : "(not yet)"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function GoogleButton({ onClick, busy, label = "Continue with Google" }: { onClick: () => void; busy?: boolean; label?: string }) {
  return (
    <Button type="button" variant="outline" className="h-11 w-full gap-2.5" onClick={onClick} disabled={busy}>
      <GoogleMark />
      {busy ? "Opening Google..." : label}
    </Button>
  );
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-muted-foreground" role="separator">
      <span className="h-px flex-1 bg-divider" />
      or
      <span className="h-px flex-1 bg-divider" />
    </div>
  );
}

/** Enter the emailed code. Resend has a 60-second cooldown to respect email rate limits. */
export function CodeStep({ email, onVerify, onResend, onBack, busy, error }: {
  email: string;
  onVerify: (code: string) => void;
  onResend: () => Promise<boolean>;
  onBack: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  const id = useId();
  const [code, setCode] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(60);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = otpSchema.safeParse(code);
    if (!parsed.success) {
      setLocalError(parsed.error.issues[0]?.message ?? "Enter the code from the email.");
      return;
    }
    setLocalError(null);
    onVerify(parsed.data);
  };

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <p className="rounded-xl border border-divider bg-surface-2 px-4 py-3 text-sm text-muted-foreground">
        We sent a code to <span className="font-medium text-foreground">{email}</span>. It expires in about an hour; check
        spam if you don&apos;t see it.
      </p>
      <Field id={id} label="Verification code" error={localError ?? error}>
        <Input
          id={id}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/[^\d\s]/g, "").slice(0, 12))}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          className="h-12 text-center font-mono text-lg tracking-[0.5em]"
          aria-invalid={Boolean(localError ?? error)}
          autoFocus
        />
      </Field>
      <Button type="submit" className="h-11 w-full" disabled={busy}>
        {busy ? "Checking..." : "Verify"}
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <button type="button" onClick={onBack} className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Use a different email
        </button>
        <button
          type="button"
          disabled={cooldown > 0 || busy}
          onClick={async () => {
            const ok = await onResend();
            if (ok) {
              setResent(true);
              setCooldown(60);
            }
          }}
          className="text-foreground underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
        >
          {cooldown > 0 ? `Send a new code in ${cooldown}s` : resent ? "Send another code" : "Send a new code"}
        </button>
      </div>
    </form>
  );
}
