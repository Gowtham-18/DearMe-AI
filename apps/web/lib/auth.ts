import { getSupabaseBrowserClient } from "@/lib/supabase/client";

// Before Phase 6 the app identified people by a random id in localStorage.
const LEGACY_ID_KEY = "dearme-user-id";
const LEGACY_SESSION_KEY = "dearme-session";

/** Return the signed-in user's id, signing in anonymously on first visit. */
export async function ensureSignedIn(): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) {
    return data.session.user.id;
  }
  const { data: signIn, error } = await supabase.auth.signInAnonymously();
  if (error || !signIn.user) {
    throw new Error(error?.message ?? "Anonymous sign-in failed.");
  }
  return signIn.user.id;
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
