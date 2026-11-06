"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { BadgeCheck, CheckCircle2, KeyRound, Loader2, LogOut, Mail, ShieldCheck } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, PasswordField } from "@/components/auth/auth-parts";
import { continueWithGoogle, getSignedInUser, signOut } from "@/lib/auth";
import {
  authErrorMessage,
  cleanText,
  nameSchema,
  otpSchema,
  usernameSchema,
  validateNewPassword,
  type FieldErrors,
} from "@/lib/auth-validation";
import { updateProfileDetails } from "@/lib/db/profiles";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useProfileStore } from "@/store/use-profile-store";
import { useSessionStore } from "@/store/use-session-store";

type Status = { kind: "ok" | "error"; text: string } | null;

function StatusLine({ status }: { status: Status }) {
  if (!status) return null;
  return (
    <p className={status.kind === "ok" ? "text-sm text-emerald-600 dark:text-emerald-400" : "text-sm text-destructive"} role="status">
      {status.text}
    </p>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const { profile, setProfile } = useProfileStore();
  const clearUserId = useSessionStore((state) => state.clearUserId);
  const [user, setUser] = useState<User | null>(null);

  // Profile form
  const [details, setDetails] = useState({ name: "", username: "", age: "", occupation: "" });
  const [detailErrors, setDetailErrors] = useState<FieldErrors>({});
  const [detailStatus, setDetailStatus] = useState<Status>(null);
  const [savingDetails, setSavingDetails] = useState(false);

  // Password form
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordErrors, setPasswordErrors] = useState<FieldErrors>({});
  const [passwordStatus, setPasswordStatus] = useState<Status>(null);
  const [savingPassword, setSavingPassword] = useState(false);
  const [nonceNeeded, setNonceNeeded] = useState(false);
  const [nonce, setNonce] = useState("");

  const [linkStatus, setLinkStatus] = useState<Status>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    getSignedInUser().then(setUser);
  }, []);

  useEffect(() => {
    if (!profile) return;
    setDetails({
      name: profile.name ?? "",
      username: profile.username ?? "",
      age: profile.age ? String(profile.age) : "",
      occupation: profile.occupation ?? "",
    });
  }, [profile]);

  const providers = new Set((user?.identities ?? []).map((identity) => identity.provider));
  const hasGoogle = providers.has("google");
  const hasPassword = providers.has("email");

  const saveDetails = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile) return;
    setDetailStatus(null);
    const errors: FieldErrors = {};
    const name = nameSchema.safeParse(details.name);
    const username = usernameSchema.safeParse(details.username);
    const age = Number(details.age);
    const occupation = cleanText(details.occupation);
    if (!name.success) errors.name = name.error.issues[0]?.message;
    if (!username.success) errors.username = username.error.issues[0]?.message;
    if (!/^\d+$/.test(details.age.trim()) || age < 16 || age > 120) errors.age = "Age must be a whole number from 16 to 120.";
    if (occupation.length > 60) errors.occupation = "Occupation must be 60 characters or less.";
    if (username.success && username.data !== profile.username) {
      const { data: free, error } = await supabase.rpc("username_available", { p_username: username.data });
      if (!error && !free) errors.username = "That username is taken. Try another.";
    }
    setDetailErrors(errors);
    if (Object.values(errors).some(Boolean) || !name.success || !username.success) return;

    setSavingDetails(true);
    const { data, error } = await updateProfileDetails(profile.user_id, {
      name: name.data,
      username: username.data,
      age,
      occupation: occupation || null,
    });
    setSavingDetails(false);
    if (error || !data) {
      setDetailStatus({
        kind: "error",
        text: error?.includes("profiles_username_key") ? "That username was just taken. Try another." : "We couldn't save your profile. Please try again.",
      });
      return;
    }
    setProfile({ ...profile, name: data.name, username: data.username ?? username.data, age: data.age, occupation: data.occupation });
    setDetailStatus({ kind: "ok", text: "Profile saved." });
  };

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordStatus(null);
    const errors = validateNewPassword(password, confirm, { email: user?.email, username: profile?.username ?? undefined });
    setPasswordErrors(errors);
    if (Object.values(errors).some(Boolean)) return;
    let code: string | undefined;
    if (nonceNeeded) {
      const parsed = otpSchema.safeParse(nonce);
      if (!parsed.success) {
        setPasswordErrors({ nonce: parsed.error.issues[0]?.message });
        return;
      }
      code = parsed.data;
    }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser(code ? { password, nonce: code } : { password });
    if (error?.code === "reauthentication_needed") {
      // "Secure password change" is on: email a one-time code first.
      await supabase.auth.reauthenticate();
      setNonceNeeded(true);
      setSavingPassword(false);
      setPasswordStatus({ kind: "error", text: authErrorMessage(error) });
      return;
    }
    setSavingPassword(false);
    if (error) {
      setPasswordStatus({ kind: "error", text: authErrorMessage(error) });
      return;
    }
    setPassword("");
    setConfirm("");
    setNonce("");
    setNonceNeeded(false);
    setPasswordStatus({ kind: "ok", text: hasPassword ? "Password changed." : "Password set. You can now log in with your email too." });
    getSignedInUser().then(setUser);
  };

  const connectGoogle = async () => {
    setLinkStatus(null);
    const { error } = await continueWithGoogle({ link: true });
    if (error) setLinkStatus({ kind: "error", text: authErrorMessage(error) });
  };

  const logOut = async (scope: "local" | "global") => {
    await signOut(scope);
    setProfile(null);
    clearUserId();
    router.replace("/login");
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    const { error } = await supabase.rpc("delete_my_account");
    if (error) {
      setDeleting(false);
      setDeleteError("We couldn't delete your account. Please try again, or export your data first from Privacy & Safety.");
      return;
    }
    await signOut();
    setProfile(null);
    clearUserId();
    router.replace("/welcome");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveDetails} className="grid gap-4 sm:grid-cols-2" noValidate>
            <Field id="acc-name" label="Name" error={detailErrors.name}>
              <Input id="acc-name" value={details.name} maxLength={30} autoComplete="name"
                onChange={(event) => setDetails((d) => ({ ...d, name: event.target.value }))} />
            </Field>
            <Field id="acc-username" label="Username" error={detailErrors.username}>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">@</span>
                <Input id="acc-username" value={details.username} maxLength={20} autoCapitalize="none" spellCheck={false} className="pl-7"
                  onChange={(event) => setDetails((d) => ({ ...d, username: event.target.value.replace(/\s/g, "") }))} />
              </div>
            </Field>
            <Field id="acc-age" label="Age" error={detailErrors.age}>
              <Input id="acc-age" type="number" inputMode="numeric" min={16} max={120} value={details.age}
                onChange={(event) => setDetails((d) => ({ ...d, age: event.target.value }))} />
            </Field>
            <Field id="acc-occupation" label="Occupation (optional)" error={detailErrors.occupation}>
              <Input id="acc-occupation" value={details.occupation} maxLength={60}
                onChange={(event) => setDetails((d) => ({ ...d, occupation: event.target.value }))} />
            </Field>
            <div className="flex items-center justify-between gap-3 sm:col-span-2">
              <StatusLine status={detailStatus} />
              <Button type="submit" className="ml-auto" disabled={savingDetails || !profile}>
                {savingDetails ? "Saving..." : "Save profile"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sign-in &amp; security</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-divider bg-surface-2 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{user?.email ?? "—"}</p>
                <p className="text-xs text-muted-foreground">Email for signing in and account codes</p>
              </div>
            </div>
            {user?.email_confirmed_at && (
              <Badge variant="secondary" className="gap-1 rounded-full"><BadgeCheck className="h-3.5 w-3.5" /> Verified</Badge>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Ways to sign in</p>
            <ul className="divide-y divide-divider rounded-2xl border border-divider">
              <li className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="flex items-center gap-2 text-foreground"><KeyRound className="h-4 w-4 text-muted-foreground" /> Email and password</span>
                {hasPassword ? <span className="flex items-center gap-1 text-xs text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> On</span>
                  : <span className="text-xs text-muted-foreground">Set a password below</span>}
              </li>
              <li className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="flex items-center gap-2 text-foreground"><ShieldCheck className="h-4 w-4 text-muted-foreground" /> Google</span>
                {hasGoogle ? <span className="flex items-center gap-1 text-xs text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Connected</span>
                  : <Button size="sm" variant="outline" onClick={connectGoogle}>Connect Google</Button>}
              </li>
            </ul>
            <StatusLine status={linkStatus} />
          </div>

          <form onSubmit={savePassword} className="space-y-4" noValidate>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{hasPassword ? "Change password" : "Set a password"}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <PasswordField id="new-password" label="New password" value={password} onChange={setPassword} error={passwordErrors.password} autoComplete="new-password" showStrength />
              <PasswordField id="confirm-password" label="Confirm new password" value={confirm} onChange={setConfirm} error={passwordErrors.confirm} autoComplete="new-password" />
            </div>
            {nonceNeeded && (
              <Field id="nonce" label="Code from your email" error={passwordErrors.nonce}>
                <Input id="nonce" value={nonce} inputMode="numeric" autoComplete="one-time-code" className="max-w-[12rem] font-mono tracking-[0.3em]"
                  onChange={(event) => setNonce(event.target.value.replace(/[^\d]/g, "").slice(0, 10))} />
              </Field>
            )}
            <div className="flex items-center justify-between gap-3">
              <StatusLine status={passwordStatus} />
              <Button type="submit" className="ml-auto" disabled={savingPassword}>
                {savingPassword ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : hasPassword ? "Change password" : "Set password"}
              </Button>
            </div>
          </form>

          <div className="flex flex-wrap gap-2 border-t border-divider pt-5">
            <Button variant="outline" className="gap-2" onClick={() => logOut("local")}><LogOut className="h-4 w-4" /> Log out</Button>
            <Button variant="ghost" onClick={() => logOut("global")}>Log out on all devices</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your data and AI</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <ul className="space-y-2">
            <li><span className="font-medium text-foreground">Your password</span> is stored only as a bcrypt hash by our sign-in provider (Supabase Auth). DearMe never sees or stores it.</li>
            <li><span className="font-medium text-foreground">Your journal</span> is encrypted in transit (HTTPS) and at rest (AES-256 disk encryption), and database rules let only your account read it.</li>
            <li><span className="font-medium text-foreground">Never used to train AI.</span> Insights come from open-source models running on DearMe&apos;s own server; entries are analysed in memory and not kept there.</li>
            <li><span className="font-medium text-foreground">Outside AI is off</span> unless you turn on AI replies. Then only your recent messages and up to two short past snippets are sent, and the provider doesn&apos;t train on API data.</li>
          </ul>
          <p>
            Export your data, manage memory and AI replies in{" "}
            <Link href="/settings" className="font-medium text-foreground underline-offset-4 hover:underline">Privacy &amp; Safety</Link>.
          </p>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base">Delete account</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <p className="max-w-prose">Permanently deletes your login, profile, entries, chats, insights and everything DearMe remembers. This can&apos;t be undone.</p>
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>Delete account</Button>
        </CardContent>
      </Card>

      <Dialog open={deleteOpen} onOpenChange={(open) => { setDeleteOpen(open); setDeleteText(""); setDeleteError(null); }}>
        <DialogContent className="w-[calc(100%-2rem)]">
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              Everything goes: your login and all of your journal. If you want a copy, export it first from Privacy &amp; Safety.
            </DialogDescription>
          </DialogHeader>
          <Field id="delete-confirm" label='Type "DELETE" to confirm'>
            <Input id="delete-confirm" value={deleteText} onChange={(event) => setDeleteText(event.target.value)} autoComplete="off" />
          </Field>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteText !== "DELETE" || deleting} onClick={deleteAccount}>
              {deleting ? "Deleting..." : "Delete everything"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
