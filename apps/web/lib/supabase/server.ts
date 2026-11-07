import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export interface RequestContext {
  supabase: SupabaseClient;
  user: User;
}

/**
 * Resolve the signed-in user from the request's bearer token and return a Supabase client
 * that acts as that user (so Row Level Security applies to every query).
 * The user id always comes from the verified token, never from the request body.
 */
export async function getRequestContext(req: Request): Promise<RequestContext | NextResponse> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "The server is missing its database settings." }, { status: 500 });
  }

  const header = req.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    return NextResponse.json({ error: "Your session has ended. Refresh the page to continue." }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return NextResponse.json({ error: "Your session has ended. Refresh the page to continue." }, { status: 401 });
  }
  // Guest (anonymous) sessions are sent to sign-up in the app; refuse them here too, so a
  // script can't mint throwaway guests to get around per-user limits.
  if (data.user.is_anonymous) {
    return NextResponse.json({ error: "Create an account to keep journaling." }, { status: 403 });
  }

  return { supabase, user: data.user };
}

/**
 * Per-user limit backed by Postgres, so it holds across serverless instances. Fails closed:
 * if the check itself errors, the request is treated as over the limit, so a broken limiter
 * can't turn into unlimited calls to the NLP service.
 */
export async function isRateLimited(
  supabase: SupabaseClient,
  bucket: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_bucket: bucket,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.warn(`rate limit check unavailable (${error.code ?? "unknown"})`);
    return true;
  }
  return data === false;
}

export function tooManyRequests(): NextResponse {
  return NextResponse.json(
    { error: "You're going a little fast. Wait a minute and try again." },
    { status: 429 }
  );
}
