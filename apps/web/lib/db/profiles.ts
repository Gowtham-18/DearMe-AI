import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { DbResult } from "@/lib/db/types";

export interface ProfileRecord {
  user_id: string;
  name: string;
  age: number;
  occupation: string | null;
  preferences?: ProfilePreferences | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ProfilePreferences {
  enhanced_language_enabled?: boolean;
  enhanced_consent?: boolean;
}

const USER_ID_KEY = "dearme-user-id";

export function getOrCreateAnonymousUserId(): string {
  if (typeof window === "undefined") {
    return "";
  }

  const existing = window.localStorage.getItem(USER_ID_KEY);
  if (existing) {
    return existing;
  }

  const generated =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `anon_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  window.localStorage.setItem(USER_ID_KEY, generated);
  return generated;
}

export async function getProfile(userId: string): Promise<DbResult<ProfileRecord>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: data ?? null, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load profile.";
    return { data: null, error: message };
  }
}

export async function upsertProfile(profile: ProfileRecord): Promise<DbResult<ProfileRecord>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("profiles")
      .upsert(profile, { onConflict: "user_id" })
      .select("*")
      .maybeSingle();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: data ?? null, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save profile.";
    return { data: null, error: message };
  }
}

export async function updateProfilePreferences(
  userId: string,
  preferences: ProfilePreferences
): Promise<DbResult<ProfileRecord>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("profiles")
      .update({ preferences, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: data ?? null, error: null };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update your preferences.";
    return { data: null, error: message };
  }
}

export async function deleteProfile(userId: string): Promise<DbResult<null>> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.from("profiles").delete().eq("user_id", userId);

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: null, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete profile.";
    return { data: null, error: message };
  }
}
