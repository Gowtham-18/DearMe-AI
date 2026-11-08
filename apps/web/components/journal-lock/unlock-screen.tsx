"use client";

import { useState } from "react";
import { KeyRound, LockKeyhole } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePassphrase, unlockWithPassphrase } from "@/lib/crypto/vault";
import { signOut } from "@/lib/auth";
import { MIN_PASSPHRASE } from "@/components/journal-lock/passphrase";

/** Shown instead of the app while this device doesn't hold the journal key. */
export default function UnlockScreen() {
  const [mode, setMode] = useState<"passphrase" | "recovery">("passphrase");
  const [passphrase, setPassphrase] = useState("");
  const [code, setCode] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (mode === "recovery" && next.length < MIN_PASSPHRASE) {
      setError(`Choose a new passphrase of at least ${MIN_PASSPHRASE} characters.`);
      return;
    }
    setBusy(true);
    if (mode === "passphrase") {
      if (!(await unlockWithPassphrase(passphrase))) setError("That passphrase didn't work. Check it and try again.");
    } else if (!(await changePassphrase({ recoveryCode: code }, next))) {
      // Setting the new passphrase also unlocks this device.
      setError("That recovery code didn't work. Check it and try again.");
    }
    setBusy(false);
  };

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 py-10 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
        <LockKeyhole className="h-7 w-7" aria-hidden="true" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Your journal is locked</h1>
        <p className="text-sm text-muted-foreground">
          {mode === "passphrase"
            ? "Enter your journal passphrase to open it on this device."
            : "Enter your recovery code and choose a new passphrase."}
        </p>
      </div>

      <form onSubmit={submit} className="w-full space-y-4 text-left">
        {mode === "passphrase" ? (
          <div className="space-y-2">
            <Label htmlFor="unlock-passphrase">Journal passphrase</Label>
            <Input
              id="unlock-passphrase"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              required
            />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="unlock-code">Recovery code</Label>
              <Input
                id="unlock-code"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                className="font-mono tracking-wider"
                autoFocus
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unlock-new">New passphrase</Label>
              <Input
                id="unlock-new"
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(event) => setNext(event.target.value)}
                required
              />
            </div>
          </>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Unlocking..." : "Unlock journal"}
        </Button>
      </form>

      <div className="flex flex-col items-center gap-2 text-sm">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
          onClick={() => {
            setMode(mode === "passphrase" ? "recovery" : "passphrase");
            setError(null);
          }}
        >
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          {mode === "passphrase" ? "Forgot it? Use your recovery code" : "Use your passphrase instead"}
        </button>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground hover:underline"
          onClick={() => signOut().then(() => window.location.assign("/login"))}
        >
          Sign out
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Your passphrase never leaves this device. Without it or your recovery code, no one, including DearMe, can open a
        locked journal.
      </p>
    </div>
  );
}
