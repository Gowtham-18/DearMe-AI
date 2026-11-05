import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Public health check, also used by the keep-alive workflow so the free Supabase project
 * isn't paused for inactivity. It makes one real database round trip as the signed-out role:
 * Row Level Security refuses it ("permission denied", 42501), which still proves the database
 * answered, and no data is ever returned.
 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ ok: false, db: "not configured" }, { status: 500 });
  }
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  // A plain GET (not HEAD) so the Postgres error code comes back in the body.
  const { error } = await supabase.from("entries").select("id").limit(1);
  const reachable = !error || error.code === "42501";
  return NextResponse.json({ ok: reachable, db: reachable ? "reachable" : "unreachable" }, { status: reachable ? 200 : 503 });
}
