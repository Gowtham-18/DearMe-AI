export const moodScale: Record<string, number> = {
  Sad: 1,
  Stressed: 2,
  Neutral: 3,
  Calm: 4,
  Happy: 5,
  Anxious: 2,
  Tired: 2,
  Lonely: 2,
  Overwhelmed: 2,
  Grateful: 5,
  Irritated: 2,
  Hopeful: 5,
  Focused: 4,
};

export function moodToNumeric(mood?: string | null): number | null {
  if (!mood) return null;
  return moodScale[mood] ?? null;
}
