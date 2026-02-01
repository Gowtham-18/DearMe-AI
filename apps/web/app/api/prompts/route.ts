import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/server";

const getNlpUrl = () =>
  process.env.NLP_SERVICE_URL || process.env.NEXT_PUBLIC_NLP_URL || "http://localhost:8000";

export async function POST(req: Request) {
  try {
    const { userId } = (await req.json()) as { userId?: string };
    if (!userId) {
      return NextResponse.json({ error: "Missing userId." }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const { data: themes } = await supabase
      .from("themes")
      .select("label")
      .eq("user_id", userId)
      .order("strength", { ascending: false })
      .limit(3);

    const { data: analyses } = await supabase
      .from("entry_analysis")
      .select("sentiment_score, safety_flags")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(7);

    const hasCrisis = (analyses ?? []).some(
      (item) => (item.safety_flags as { crisis?: boolean } | null)?.crisis
    );

    if (hasCrisis) {
      return NextResponse.json({
        status: "ok",
        prompts: [],
        safety: { crisis: true, reason: "Crisis cues detected in recent entries." },
      });
    }

    const { data: lastEntry } = await supabase
      .from("entries")
      .select("mood")
      .eq("user_id", userId)
      .order("entry_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const sentimentValues = (analyses ?? []).map((item) => Number(item.sentiment_score));
    const sentimentAvg =
      sentimentValues.length > 0
        ? sentimentValues.reduce((sum, value) => sum + value, 0) / sentimentValues.length
        : 0;

    const nlpResponse = await fetch(`${getNlpUrl()}/generate-prompts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        themes: (themes ?? []).map((theme) => theme.label),
        sentiment_avg: sentimentAvg,
        last_mood: lastEntry?.mood ?? null,
      }),
    });

    if (!nlpResponse.ok) {
      return NextResponse.json({ error: "Prompt generation failed." }, { status: 502 });
    }

    const data = await nlpResponse.json();
    return NextResponse.json({ status: "ok", prompts: data.prompts ?? [], safety: { crisis: false } });
  } catch (err) {
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
