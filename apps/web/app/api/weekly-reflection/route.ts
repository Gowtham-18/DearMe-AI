import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/server";

const getNlpUrl = () => process.env.NLP_SERVICE_URL || "http://localhost:8000";

export async function POST(req: Request) {
  try {
    const { userId, weekStart, weekEnd, force } = (await req.json()) as {
      userId?: string;
      weekStart?: string;
      weekEnd?: string;
      force?: boolean;
    };

    if (!userId || !weekStart || !weekEnd) {
      return NextResponse.json({ error: "Missing parameters." }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();

    if (!force) {
      const { data: existing } = await supabase
        .from("weekly_reflections")
        .select("*")
        .eq("user_id", userId)
        .eq("week_start", weekStart)
        .eq("week_end", weekEnd)
        .maybeSingle();

      if (existing?.reflection) {
        return NextResponse.json({ status: "ok", reflection: existing.reflection });
      }
    }

    const { data: entries } = await supabase
      .from("entries")
      .select("id, content, created_at, mood")
      .eq("user_id", userId)
      .gte("entry_date", weekStart)
      .lte("entry_date", weekEnd)
      .order("entry_date", { ascending: true });

    if (!entries || entries.length === 0) {
      return NextResponse.json({ status: "ok", reflection: null });
    }

    const entryIds = entries.map((entry) => entry.id);
    const { data: analyses } = await supabase
      .from("entry_analysis")
      .select("*")
      .in("entry_id", entryIds);

    const analysisMap = new Map(analyses?.map((item) => [item.entry_id, item]) ?? []);

    const payloadEntries = entries.map((entry) => {
      const analysis = analysisMap.get(entry.id);
      return {
        entry_id: entry.id,
        text: entry.content,
        created_at: entry.created_at,
        mood: entry.mood,
        sentiment: analysis
          ? { label: analysis.sentiment_label, score: analysis.sentiment_score }
          : undefined,
        keyphrases: Array.isArray(analysis?.keyphrases) ? analysis.keyphrases : [],
      };
    });

    const { data: themes } = await supabase
      .from("themes")
      .select("id, label, keywords, strength")
      .eq("user_id", userId)
      .order("strength", { ascending: false })
      .limit(5);

    let themedPayload: Array<Record<string, unknown>> = themes ?? [];
    if (themes && themes.length > 0) {
      const themeIds = themes.map((theme) => theme.id);
      const { data: membership } = await supabase
        .from("theme_membership")
        .select("theme_id, entry_id, score")
        .eq("user_id", userId)
        .in("theme_id", themeIds);

      const entryMap = new Map(entries.map((entry) => [entry.id, entry.content]));

      const membersByTheme = new Map<string, Array<{ entry_id: string; snippet: string; reason: string }>>();
      (membership ?? []).forEach((member) => {
        const snippet = entryMap.get(member.entry_id) ?? "";
        if (!snippet) return;
        const existing = membersByTheme.get(member.theme_id) ?? [];
        if (existing.length >= 3) return;
        existing.push({
          entry_id: member.entry_id,
          snippet: snippet.length > 140 ? `${snippet.slice(0, 140)}...` : snippet,
          reason: "Evidence from a related entry.",
        });
        membersByTheme.set(member.theme_id, existing);
      });

      themedPayload = themes.map((theme) => ({
        ...theme,
        members: membersByTheme.get(theme.id) ?? [],
      }));
    }

    const nlpResponse = await fetch(`${getNlpUrl()}/weekly-reflection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        entries: payloadEntries,
        themes: themedPayload,
      }),
    });

    if (!nlpResponse.ok) {
      return NextResponse.json({ error: "Weekly reflection failed." }, { status: 502 });
    }

    const reflection = await nlpResponse.json();

    await supabase.from("weekly_reflections").upsert({
      user_id: userId,
      week_start: weekStart,
      week_end: weekEnd,
      reflection,
    });

    return NextResponse.json({ status: "ok", reflection });
  } catch (err) {
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
