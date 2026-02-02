const hashSeed = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

export const pickCopy = (options: string[], seed: string) => {
  if (options.length === 0) return "";
  const index = hashSeed(seed) % options.length;
  return options[index];
};

export const emptyStateCopy = {
  memories: [
    "Your journal history will appear here once you start writing.",
    "Start your first journal, and this space will grow with your reflections.",
    "This is where your past journals live. Begin with your first entry to get started.",
    "No journals yet. Your first entry starts here.",
  ],
  todayJournal: [
    "Ready when you are. Start today's journal.",
    "Take a moment for yourself. This is today's space to reflect.",
    "Today's journal is empty. A few honest lines are enough.",
    "Begin your journal for today whenever it feels right.",
  ],
  sentiment: [
    "Your sentiment trends will appear as you add journal entries.",
    "As you journal over time, you'll start seeing emotional patterns here.",
    "Once you've written a few journals, this view will reflect how your days evolve.",
  ],
  mood: [
    "Mood trends appear once moods are added to your journals.",
    "Log your mood when you're ready. Over time, patterns will show up here.",
    "This chart fills in as you start tracking your mood.",
  ],
  themes: [
    "Recurring themes emerge as you continue journaling.",
    "With more entries, meaningful patterns will start to surface here.",
    "Nothing to analyze yet. This space will reflect your recurring thoughts over time.",
  ],
  insights: [
    "Insights appear gradually as you continue journaling.",
    "This view builds itself over time, one entry at a time.",
    "Nothing to show yet. Consistent journaling brings this to life.",
  ],
};