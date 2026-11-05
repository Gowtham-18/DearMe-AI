export const journalPrompts = [
  "What's one moment from today you'd like to remember?",
  "What felt energizing or calming today?",
  "Is there anything you want to release before tomorrow?",
  "What small win are you proud of?",
];

export const moodOptions = [
  "Calm",
  "Happy",
  "Neutral",
  "Stressed",
  "Sad",
  "Anxious",
  "Tired",
  "Lonely",
  "Overwhelmed",
  "Grateful",
  "Irritated",
  "Hopeful",
  "Focused",
] as const;
export const timeBudgets = [3, 5, 7, 10] as const;

export type PromptEvidence = { entry_id?: string | null; snippet: string; reason: string };

export type PromptItem = {
  id: string;
  text: string;
  reason: string;
  /** A short sample answer that shows how concrete an answer can be. */
  example?: string | null;
  evidence: PromptEvidence[];
};

/** Offline prompts, used when the prompt service is slow or unavailable. Each one is concrete and comes with an example. */
export const buildFallbackPrompts = (mood: string | null, timeBudget: number): PromptItem[] => {
  const pace = timeBudget <= 5 ? "A few lines is plenty." : "Take your time and add detail.";
  const moodPrompt: Omit<PromptItem, "id"> = mood
    ? {
        text: `You picked "${mood}". What happened today that fits that feeling?`,
        reason: `Starts from your mood. ${pace}`,
        example: `e.g. I felt ${mood.toLowerCase()} after the meeting ran late and I missed my workout.`,
        evidence: [],
      }
    : {
        text: "What's one moment from today that stands out, and why does it stick with you?",
        reason: `One specific moment is easier than the whole day. ${pace}`,
        example: "e.g. Lunch with an old friend. It was the first proper laugh I've had all week.",
        evidence: [],
      };
  const prompts: Array<Omit<PromptItem, "id">> = [
    moodPrompt,
    {
      text: "What's taking up the most space in your head right now?",
      reason: `Name the loudest thought first. ${pace}`,
      example: "e.g. The presentation on Friday. I keep rehearsing it while I'm trying to sleep.",
      evidence: [],
    },
    {
      text: "What drained your energy today, and what gave some of it back?",
      reason: "Helps you spot patterns over time.",
      example: "e.g. Back-to-back calls drained me. The walk after dinner helped.",
      evidence: [],
    },
    {
      text: "What's one small thing that went right today?",
      reason: "Small wins are easy to forget and good to look back on.",
      example: "e.g. I finally replied to the email I'd been avoiding for a week.",
      evidence: [],
    },
  ];
  return prompts.map((prompt, index) => ({ id: `starter_${index + 1}`, ...prompt }));
};

/** "Just write" option: no question to answer, only a blank page with a gentle opener. */
export const freeWritePrompt: PromptItem = {
  id: "free_write",
  text: "Write freely: whatever is on your mind.",
  reason: "No question to answer. Start anywhere.",
  example: "e.g. Today was strange. I woke up early and couldn't shake the feeling that...",
  evidence: [],
};

/** Sentence openers offered in a session, for when a blank box is the hard part. */
export const sentenceStarters = [
  "Today I noticed…",
  "The hardest part was…",
  "I keep thinking about…",
  "I felt most like myself when…",
  "I'm grateful for…",
  "What I need right now is…",
] as const;
