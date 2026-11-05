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

  return { supabase, user: data.user };
}

/** Per-user limit backed by Postgres, so it holds across serverless instances. Fails open. */
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
    return false;
  }
  return data === false;
}

export function tooManyRequests(): NextResponse {
  return NextResponse.json(
    { error: "You're going a little fast. Wait a minute and try again." },
    { status: 429 }
  );
}
