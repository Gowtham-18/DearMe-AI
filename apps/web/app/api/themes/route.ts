import { NextResponse } from "next/server";
import { recomputeThemesResponseSchema, themesBodySchema } from "@dearme/shared";

import { getRequestContext, isRateLimited, tooManyRequests } from "@/lib/supabase/server";
import { callNlp } from "@/lib/nlp";

export const maxDuration = 60;

/**
 * Journal lock: recompute themes from entries the browser decrypted. Returns the themes for the
 * browser to encrypt and save (replace_user_themes); nothing is stored here.
 */
export async function POST(req: Request) {
  const ctx = await getRequestContext(req);
  if (ctx instanceof NextResponse) return ctx;
  const { supabase, user } = ctx;

  const parsed = themesBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Themes couldn't be updated." }, { status: 400 });
  }
  if (await isRateLimited(supabase, "themes", 30, 3600)) return tooManyRequests();

  const result = await callNlp(
    "/recompute-themes",
    { user_id: user.id, entries: parsed.data.entries },
    25000,
    recomputeThemesResponseSchema
  );
  if (!result.ok) {
    return NextResponse.json({ error: "Themes couldn't be updated right now." }, { status: 502 });
  }
  return NextResponse.json({
    themes: result.data.themes.map((theme) => ({
      id: theme.temp_theme_id,
      label: theme.label,
      keywords: theme.keywords,
      strength: theme.strength,
      members: theme.members.map((member) => ({ entry_id: member.entry_id, score: member.score })),
    })),
  });
}
