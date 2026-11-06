import type { User } from "@supabase/supabase-js";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

// Before Phase 6 the app identified people by a random id in localStorage.
const LEGACY_ID_KEY = "dearme-user-id";
const LEGACY_SESSION_KEY = "dearme-session";

export type AuthUser = User;

const WELCOME_KEY = "dearme-welcome-seen";

export function hasSeenWelcome(): boolean {
  try {
    return window.localStorage.getItem(WELCOME_KEY) === "1";
  } catch {
    return false;
  }
}

export function markWelcomeSeen() {
  try {
    window.localStorage.setItem(WELCOME_KEY, "1");
  } catch {
    // Private mode: the slides simply show again next time.
  }
}

/** The signed-in user, or null. A guest (anonymous) user from before accounts is still returned. */
export async function getSignedInUser(): Promise<User | null> {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

export const isGuest = (user: User | null | undefined) => Boolean(user?.is_anonymous);

export const authCallbackUrl = () => `${window.location.origin}/auth/callback`;

/**
 * Continue with Google. A guest journal on this device is kept by attaching Google to it
 * (same user id, so every entry stays); `link` attaches Google to the signed-in account from the
 * Account page. Otherwise this signs in or creates an account.
 */
export async function continueWithGoogle(
  opts: { link?: boolean } = {}
): Promise<{ error: { message?: string; code?: string; status?: number } | null }> {
  const supabase = getSupabaseBrowserClient();
  const user = await getSignedInUser();
  const next = opts.link ? `?next=${encodeURIComponent("/account")}` : "";
  const options = { redirectTo: `${authCallbackUrl()}${next}` };
  const { error } = opts.link || isGuest(user)
    ? await supabase.auth.linkIdentity({ provider: "google", options })
    : await supabase.auth.signInWithOAuth({ provider: "google", options });
  return { error };
}

/** Sign out and forget this device's cached profile. scope "global" ends every session. */
export async function signOut(scope: "local" | "global" = "local") {
  const supabase = getSupabaseBrowserClient();
  await supabase.auth.signOut({ scope });
  try {
    window.localStorage.removeItem("dearme-profile");
  } catch {
    // ignore
  }
}

function readLegacyIds(): string[] {
  if (typeof window === "undefined") return [];
  const ids = new Set<string>();
  try {
    const direct = window.localStorage.getItem(LEGACY_ID_KEY);
    if (direct) ids.add(direct);
    const persisted = window.localStorage.getItem(LEGACY_SESSION_KEY);
    const nested = persisted ? (JSON.parse(persisted) as { state?: { userId?: string } }).state?.userId : null;
    if (nested) ids.add(nested);
  } catch {
    // Unreadable storage: nothing to migrate.
  }
  return Array.from(ids);
}

function forgetLegacyId(id: string) {
  try {
    if (window.localStorage.getItem(LEGACY_ID_KEY) === id) {
      window.localStorage.removeItem(LEGACY_ID_KEY);
    }
    const persisted = window.localStorage.getItem(LEGACY_SESSION_KEY);
    if (persisted && persisted.includes(id)) {
      window.localStorage.removeItem(LEGACY_SESSION_KEY);
    }
  } catch {
    // ignore
  }
}

/**
 * Move journals written under a pre-auth localStorage id to the signed-in user.
 * Keeps the legacy id if the database function isn't available yet, so it retries next visit.
 */
export async function claimLegacyData(userId: string): Promise<number> {
  const supabase = getSupabaseBrowserClient();
  let moved = 0;
  for (const legacyId of readLegacyIds()) {
    if (!legacyId || legacyId === userId) {
      forgetLegacyId(legacyId);
      continue;
    }
    const { data, error } = await supabase.rpc("claim_legacy_data", { p_legacy_id: legacyId });
    if (error) {
      console.warn(`legacy data claim unavailable (${error.code ?? "unknown"})`);
      continue;
    }
    moved += Number(data ?? 0);
    forgetLegacyId(legacyId);
  }
  return moved;
}

/** POST to one of our API routes as the signed-in user. */
export async function apiFetch(path: string, body: unknown): Promise<Response> {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}
