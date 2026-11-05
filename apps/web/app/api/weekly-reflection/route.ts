import { NextResponse } from "next/server";
import { weeklyBodySchema, weeklyReflectionResponseSchema } from "@dearme/shared";

import { getRequestContext, isRateLimited, tooManyRequests } from "@/lib/supabase/server";
import { callNlp } from "@/lib/nlp";

export const maxDuration = 30;

export async function POST(req: Request) {
  const ctx = await getRequestContext(req);
  if (ctx instanceof NextResponse) return ctx;
  const { supabase, user } = ctx;

  const parsed = weeklyBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing week range." }, { status: 400 });
  }
  const { weekStart, weekEnd, force } = parsed.data;

  if (!force) {
    const { data: existing } = await supabase
      .from("weekly_reflections")
      .select("reflection")
      .eq("user_id", user.id)
      .eq("week_start", weekStart)
      .eq("week_end", weekEnd)
      .maybeSingle();
    if (existing?.reflection) {
      return NextResponse.json({ status: "ok", reflection: existing.reflection });
    }
  }

  if (await isRateLimited(supabase, "weekly", 20, 3600)) return tooManyRequests();

  const { data: entries } = await supabase
    .from("entries")
    .select("id, content, created_at, entry_date, mood")
    .eq("user_id", user.id)
    .gte("entry_date", weekStart)
    .lte("entry_date", weekEnd)
    .order("created_at", { ascending: true });

  if (!entries || entries.length === 0) {
    return NextResponse.json({ status: "ok", reflection: null });
  }

  const entryIds = entries.map((entry) => entry.id);
  const [{ data: analyses }, { data: themes }] = await Promise.all([
    supabase.from("entry_analysis").select("entry_id, sentiment_label, sentiment_score, keyphrases").in("entry_id", entryIds),
    supabase
      .from("themes")
      .select("id, label, keywords, strength")
      .eq("user_id", user.id)
      .order("strength", { ascending: false })
      .limit(5),
  ]);
  const analysisMap = new Map((analyses ?? []).map((item) => [item.entry_id, item]));

  let themedPayload: Array<Record<string, unknown>> = themes ?? [];
  if (themes && themes.length > 0) {
    const { data: membership } = await supabase
      .from("theme_membership")
      .select("theme_id, entry_id, score")
      .in("theme_id", themes.map((theme) => theme.id))
      .order("score", { ascending: false });

    const contentById = new Map(entries.map((entry) => [entry.id, entry.content as string]));
    const membersByTheme = new Map<string, Array<{ entry_id: string; snippet: string; reason: string }>>();
    for (const member of membership ?? []) {
      const content = contentById.get(member.entry_id);
      if (!content) continue;
      const list = membersByTheme.get(member.theme_id) ?? [];
      if (list.length >= 3) continue;
      list.push({
        entry_id: member.entry_id,
        snippet: content.length > 140 ? `${content.slice(0, 140)}...` : content,
        reason: "Evidence from a related entry.",
      });
      membersByTheme.set(member.theme_id, list);
    }
    themedPayload = themes.map((theme) => ({ ...theme, members: membersByTheme.get(theme.id) ?? [] }));
  }

  const result = await callNlp(
    "/weekly-reflection",
    {
      user_id: user.id,
      entries: entries.map((entry) => {
        const analysis = analysisMap.get(entry.id);
        return {
          entry_id: entry.id,
          text: entry.content,
          created_at: entry.created_at,
          entry_date: entry.entry_date,
          mood: entry.mood,
          sentiment: analysis ? { label: analysis.sentiment_label, score: analysis.sentiment_score } : undefined,
          keyphrases: Array.isArray(analysis?.keyphrases) ? analysis.keyphrases : [],
        };
      }),
      themes: themedPayload,
    },
    15000,
    weeklyReflectionResponseSchema
  );

  if (!result.ok) {
    return NextResponse.json({ error: "Your weekly reflection isn't available right now." }, { status: 502 });
  }

  await supabase.from("weekly_reflections").upsert(
    { user_id: user.id, week_start: weekStart, week_end: weekEnd, reflection: result.data },
    { onConflict: "user_id,week_start,week_end" }
  );

  return NextResponse.json({ status: "ok", reflection: result.data });
}
