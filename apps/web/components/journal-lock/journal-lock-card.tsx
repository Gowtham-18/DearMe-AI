"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Download, LockKeyhole, ShieldCheck } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useVaultStatus } from "@/lib/crypto/use-vault";
import { changePassphrase, checkPassphrase, enableVault, lockDevice, removeVault } from "@/lib/crypto/vault";
import { decryptAllData, encryptExistingData, migrationPending, setPending as markPending, type Progress } from "@/lib/crypto/migrate";
import { MIN_PASSPHRASE, passphraseHint } from "@/components/journal-lock/passphrase";

type Step = null | "enable" | "recovery" | "working" | "change" | "disable";

function ProgressBar({ progress }: { progress: Progress | null }) {
  const percent = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div className="space-y-2" role="status" aria-live="polite">
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {progress ? `${percent}% · ${progress.label}` : "Getting ready"}. Keep this tab open.
      </p>
    </div>
  );
}

export default function JournalLockCard({ userId }: { userId: string | null }) {
  const status = useVaultStatus();
  const [step, setStep] = useState<Step>(null);
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [current, setCurrent] = useState("");
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [workingLabel, setWorkingLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<"seal" | "open" | null>(null);

  useEffect(() => {
    if (userId) setPending(migrationPending(userId));
  }, [userId, status]);

  const reset = () => {
    setPassphrase("");
    setConfirm("");
    setCurrent("");
    setError(null);
    setBusy(false);
  };
  const close = () => {
    if (step === "working" || step === "recovery") return;
    reset();
    setStep(null);
  };

  const runMigration = async (direction: "seal" | "open") => {
    if (!userId) return false;
    setStep("working");
    setWorkingLabel(direction === "seal" ? "Encrypting your journal" : "Decrypting your journal");
    setProgress(null);
    try {
      await (direction === "seal" ? encryptExistingData : decryptAllData)(userId, setProgress);
      setPending(null);
      return true;
    } catch (err) {
      setPending(direction);
      setStep(null);
      setNotice(err instanceof Error ? err.message : "Something went wrong. Try again.");
      return false;
    }
  };

  const enable = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!userId) return;
    if (passphrase.length < MIN_PASSPHRASE) return setError(`Use at least ${MIN_PASSPHRASE} characters.`);
    if (passphrase !== confirm) return setError("The two passphrases don't match.");
    setBusy(true);
    setError(null);
    const result = await enableVault(userId, passphrase);
    setBusy(false);
    if ("error" in result) return setError(result.error);
    // If the tab closes before encrypting finishes, the next unlock picks it up.
    markPending(userId, "seal");
    reset();
    setRecoveryCode(result.recoveryCode);
    setSaved(false);
    setStep("recovery");
  };

  const finishRecovery = async () => {
    setRecoveryCode(null);
    if (await runMigration("seal")) {
      setStep(null);
      setNotice("Journal lock is on. Everything you've written is now encrypted.");
    }
  };

  const change = async (event: React.FormEvent) => {
    event.preventDefault();
    if (passphrase.length < MIN_PASSPHRASE) return setError(`Use at least ${MIN_PASSPHRASE} characters.`);
    if (passphrase !== confirm) return setError("The two new passphrases don't match.");
    setBusy(true);
    const ok = await changePassphrase({ passphrase: current }, passphrase);
    setBusy(false);
    if (!ok) return setError("Your current passphrase didn't work.");
    reset();
    setStep(null);
    setNotice("Passphrase changed. Your recovery code still works.");
  };

  const disable = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const ok = await checkPassphrase(current);
    setBusy(false);
    if (!ok) return setError("That passphrase didn't work.");
    reset();
    if (!(await runMigration("open"))) return;
    if (await removeVault()) {
      setStep(null);
      setNotice("Journal lock is off. Your journal is back to normal storage.");
    } else {
      setStep(null);
      setNotice("Your journal was decrypted, but journal lock couldn't be switched off. Try again.");
    }
  };

  const copyCode = async () => {
    if (!recoveryCode) return;
    try {
      await navigator.clipboard.writeText(recoveryCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the code is on screen to write down.
    }
  };

  const downloadCode = () => {
    if (!recoveryCode) return;
    const text = `DearMe journal recovery code\n\n${recoveryCode}\n\nKeep this somewhere safe. It opens your journal if you forget your passphrase.\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "dearme-recovery-code.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  const hint = passphraseHint(passphrase);
  const on = status === "unlocked";
  const unavailable = status === "unknown";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {on ? <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <LockKeyhole className="h-4 w-4" aria-hidden="true" />}
          Journal lock {on ? "is on" : "(optional)"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        {on ? (
          <p>
            Your entries, conversations, insights and memories are encrypted on this device before they&apos;re saved. Only your
            passphrase or recovery code can open them. No one else can read them, including DearMe.
          </p>
        ) : (
          <>
            <p>
              Encrypt your journal with a passphrase only you know. What you write is locked on your device before it&apos;s saved,
              so no one else can read it, including DearMe and anyone with access to the database.
            </p>
            <ul className="list-disc space-y-1 pl-5 text-xs">
              <li>You&apos;ll enter the passphrase once on each device you use.</li>
              <li>You&apos;ll get a recovery code. If you lose both, we can&apos;t recover your journal.</li>
              <li>To reply, the companion still reads the message you&apos;re answering for a moment. It isn&apos;t stored or logged.</li>
            </ul>
          </>
        )}

        {pending && on && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-foreground">
            {pending === "seal" ? "Some of your journal isn't encrypted yet." : "Turning journal lock off didn't finish."}{" "}
            <button
              type="button"
              className="font-semibold text-primary underline"
              onClick={async () => {
                if (pending === "seal") {
                  if (await runMigration("seal")) {
                    setStep(null);
                    setNotice("Done. Everything is encrypted.");
                  }
                } else {
                  setStep("disable");
                }
              }}
            >
              {pending === "seal" ? "Finish now" : "Finish turning it off"}
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          {on ? (
            <>
              <Button variant="outline" onClick={() => setStep("change")}>
                Change passphrase
              </Button>
              <Button variant="outline" onClick={() => lockDevice()}>
                Lock this device
              </Button>
              <Button variant="ghost" onClick={() => setStep("disable")}>
                Turn off
              </Button>
            </>
          ) : (
            <Button onClick={() => setStep("enable")} disabled={!userId || unavailable}>
              Turn on journal lock
            </Button>
          )}
        </div>
        {notice && <p className="text-sm text-foreground">{notice}</p>}
      </CardContent>

      <Dialog open={step !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          {step === "enable" && (
            <form onSubmit={enable} className="space-y-4">
              <DialogHeader>
                <DialogTitle>Choose a journal passphrase</DialogTitle>
                <DialogDescription>
                  Use something different from your login password. DearMe never sees it, so we can&apos;t reset it for you.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="lock-pass">Passphrase</Label>
                <Input id="lock-pass" type="password" autoComplete="new-password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} autoFocus />
                <p className={`text-xs ${hint.ok ? "text-emerald-600" : "text-muted-foreground"}`}>{hint.text}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lock-confirm">Type it again</Label>
                <Input id="lock-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={close}>Cancel</Button>
                <Button type="submit" disabled={busy}>{busy ? "Setting up..." : "Continue"}</Button>
              </div>
            </form>
          )}

          {step === "recovery" && recoveryCode && (
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle>Save your recovery code</DialogTitle>
                <DialogDescription>
                  If you forget your passphrase, this is the only way back into your journal. It&apos;s shown once.
                </DialogDescription>
              </DialogHeader>
              <p className="select-all rounded-2xl border bg-surface-2 p-4 text-center font-mono text-base font-semibold tracking-wider text-foreground">
                {recoveryCode}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={copyCode}>
                  {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={downloadCode}>
                  <Download className="mr-1.5 h-4 w-4" />
                  Download
                </Button>
              </div>
              <label className="flex items-start gap-2 text-sm text-foreground">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
                I&apos;ve saved it somewhere safe, like a password manager.
              </label>
              <div className="flex justify-end">
                <Button onClick={finishRecovery} disabled={!saved}>Encrypt my journal</Button>
              </div>
            </div>
          )}

          {step === "working" && (
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle>{workingLabel}</DialogTitle>
                <DialogDescription>This happens on your device. It can take a minute for a long journal.</DialogDescription>
              </DialogHeader>
              <ProgressBar progress={progress} />
            </div>
          )}

          {step === "change" && (
            <form onSubmit={change} className="space-y-4">
              <DialogHeader>
                <DialogTitle>Change passphrase</DialogTitle>
                <DialogDescription>Your journal stays encrypted with the same key; only the passphrase changes.</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="lock-current">Current passphrase</Label>
                <Input id="lock-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lock-new">New passphrase</Label>
                <Input id="lock-new" type="password" autoComplete="new-password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
                <p className={`text-xs ${hint.ok ? "text-emerald-600" : "text-muted-foreground"}`}>{hint.text}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lock-new-confirm">Type the new one again</Label>
                <Input id="lock-new-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={close}>Cancel</Button>
                <Button type="submit" disabled={busy}>{busy ? "Saving..." : "Change passphrase"}</Button>
              </div>
            </form>
          )}

          {step === "disable" && (
            <form onSubmit={disable} className="space-y-4">
              <DialogHeader>
                <DialogTitle>Turn off journal lock?</DialogTitle>
                <DialogDescription>
                  Your journal will be decrypted and stored normally again. It stays private to your account, but DearMe&apos;s
                  administrators could technically read it.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="lock-off">Journal passphrase</Label>
                <Input id="lock-off" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
              </div>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={close}>Cancel</Button>
                <Button type="submit" variant="destructive" disabled={busy}>{busy ? "Checking..." : "Decrypt and turn off"}</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
