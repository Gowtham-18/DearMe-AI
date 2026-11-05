import { NextResponse } from "next/server";

import { pingNlp } from "@/lib/nlp";

export const dynamic = "force-dynamic";

// Called once when the app opens: wakes a sleeping free-tier NLP instance while the person
// is still choosing a mood and prompt, so their first reply doesn't wait on a cold start.
export async function GET() {
  const awake = await pingNlp(2500);
  return NextResponse.json({ awake });
}
