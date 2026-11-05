/** Plain-language description of a sentiment score in [-1, 1] (from the NLP service). */
export function describeSentiment(score: number): string {
  if (score <= -0.5) return "Mostly heavy";
  if (score <= -0.15) return "Leaning heavy";
  if (score < 0.15) return "Mixed / neutral";
  if (score < 0.5) return "Leaning positive";
  return "Mostly positive";
}

/** Mood check-in scale used by the mood chart (1 = low, 5 = great). */
export const MOOD_LEVELS: Record<number, string> = {
  1: "Low",
  2: "Strained",
  3: "Okay",
  4: "Good",
  5: "Great",
};
