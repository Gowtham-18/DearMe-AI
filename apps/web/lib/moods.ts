export const moodScale: Record<string, number> = {
  Sad: 1,
  Stressed: 2,
  Neutral: 3,
  Calm: 4,
  Happy: 5,
};

export function moodToNumeric(mood?: string | null): number | null {
  if (!mood) return null;
  return moodScale[mood] ?? null;
}
