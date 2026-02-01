import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { moodToNumeric } from "@/lib/moods";

const getNlpUrl = () =>
  process.env.NLP_SERVICE_URL || process.env.NEXT_PUBLIC_NLP_URL || "http://localhost:8000";

const serializeEmbedding = (embedding: number[]) => `[${embedding.join(",")}]`;

const parseEmbedding = (value: unknown): number[] => {
  if (Array.isArray(value)) {
    return value.map((item) => Number(item)).filter((item) => Number.isFinite(item));
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[\[\]\(\)]/g, "");
    return cleaned
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item));
  }
  return [];
};

export async function POST(req: Request) {
  try {
    const { entryId } = (await req.json()) as { entryId?: string };
    if (!entryId) {
      return NextResponse.json({ error: "Missing entryId." }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const { data: entry, error: entryError } = await supabase
      .from("entries")
      .select("*")
      .eq("id", entryId)
      .maybeSingle();

    if (entryError || !entry) {
      return NextResponse.json({ error: "Entry not found." }, { status: 404 });
    }

    const nlpResponse = await fetch(`${getNlpUrl()}/analyze-entry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: entry.user_id,
        entry_id: entry.id,
        text: entry.content,
        mood: entry.mood,
        created_at: entry.created_at,
      }),
    });

    if (!nlpResponse.ok) {
      return NextResponse.json({ error: "NLP analysis failed." }, { status: 502 });
    }

    const analysis = (await nlpResponse.json()) as {
      sentiment: { label: string; score: number };
      keyphrases: string[];
      embedding: number[];
      safety: { crisis: boolean; reason?: string | null };
    };

    const keyphrases = Array.isArray(analysis.keyphrases) ? analysis.keyphrases : [];
    const { error: analysisError } = await supabase.from("entry_analysis").upsert({
      entry_id: entry.id,
      user_id: entry.user_id,
      sentiment_label: analysis.sentiment.label,
      sentiment_score: analysis.sentiment.score,
      mood_numeric: moodToNumeric(entry.mood),
      keyphrases,
      safety_flags: analysis.safety ?? {},
    });

    if (analysisError) {
      return NextResponse.json({ error: "Failed to store analysis." }, { status: 500 });
    }

    await supabase.from("journal_embeddings").delete().eq("entry_id", entry.id);
    const { error: embeddingError } = await supabase.from("journal_embeddings").insert({
      user_id: entry.user_id,
      entry_id: entry.id,
      embedding: serializeEmbedding(analysis.embedding),
    });

    if (embeddingError) {
      return NextResponse.json({ error: "Failed to store embedding." }, { status: 500 });
    }

    const { data: embeddingRows } = await supabase
      .from("journal_embeddings")
      .select("entry_id, embedding")
      .eq("user_id", entry.user_id)
      .order("created_at", { ascending: false })
      .limit(200);

    const entryIds = (embeddingRows ?? []).map((row) => row.entry_id);
    const { data: entryRows } = await supabase
      .from("entries")
      .select("id, content")
      .in("id", entryIds);

    const entryMap = new Map(entryRows?.map((row) => [row.id, row.content]) ?? []);
    const recomputeEntries = (embeddingRows ?? [])
      .map((row) => ({
        entry_id: row.entry_id,
        text: entryMap.get(row.entry_id) ?? "",
        embedding: parseEmbedding(row.embedding),
      }))
      .filter((item) => item.text && item.embedding.length > 0);

    if (recomputeEntries.length >= 2) {
      const themeResponse = await fetch(`${getNlpUrl()}/recompute-themes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: entry.user_id,
          entries: recomputeEntries,
        }),
      });

      if (themeResponse.ok) {
        const themePayload = (await themeResponse.json()) as {
          themes: Array<{
            temp_theme_id: string;
            label: string;
            keywords: string[];
            strength: number;
            members: Array<{ entry_id: string; score: number }>;
          }>;
        };

        await supabase.from("theme_membership").delete().eq("user_id", entry.user_id);
        await supabase.from("themes").delete().eq("user_id", entry.user_id);

        const themeRows = themePayload.themes.map((theme) => ({
          id: theme.temp_theme_id,
          user_id: entry.user_id,
          label: theme.label,
          keywords: theme.keywords ?? [],
          strength: theme.strength ?? 0,
        }));

        if (themeRows.length > 0) {
          await supabase.from("themes").insert(themeRows);
        }

        const membershipRows = themePayload.themes.flatMap((theme) =>
          theme.members.map((member) => ({
            user_id: entry.user_id,
            theme_id: theme.temp_theme_id,
            entry_id: member.entry_id,
            score: member.score ?? 0,
          }))
        );

        if (membershipRows.length > 0) {
          await supabase.from("theme_membership").insert(membershipRows);
        }
      }
    }

    return NextResponse.json({ status: "ok" });
  } catch (err) {
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
