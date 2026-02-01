import type { AnalyzeEntryResponse } from "@dearme/shared";

export const statCards = [
  {
    title: "Current streak",
    value: "12 Days",
    trend: "+2d today",
  },
  {
    title: "Total reflections",
    value: "148 entries",
    trend: "+5.4%",
  },
  {
    title: "Primary mood",
    value: "Peaceful",
    trend: "Stable",
  },
];

export const moodTrend7 = [
  { day: "Mon", value: 62 },
  { day: "Tue", value: 58 },
  { day: "Wed", value: 64 },
  { day: "Thu", value: 61 },
  { day: "Fri", value: 68 },
  { day: "Sat", value: 70 },
  { day: "Sun", value: 66 },
];

export const moodTrend30 = [
  { day: "W1", value: 56 },
  { day: "W2", value: 63 },
  { day: "W3", value: 60 },
  { day: "W4", value: 67 },
];

export const recentReflections = [
  {
    title: "Morning clarity",
    snippet: "Woke up with a clear head and mapped out three priorities...",
    time: "Today - 7:42 AM",
  },
  {
    title: "Lunch break reset",
    snippet: "Stepped away from the desk and noticed how calm the park felt...",
    time: "Yesterday - 12:18 PM",
  },
  {
    title: "Evening gratitude",
    snippet: "Ended the day by listing small wins and one bold intention...",
    time: "Sat - 9:03 PM",
  },
  {
    title: "Creative spark",
    snippet: "Ideas flowed while walking home. Noted three themes to explore...",
    time: "Fri - 6:21 PM",
  },
];

export const journalSessions = [
  {
    title: "Today",
    snippet: "Processing a big meeting and how it went...",
    time: "9:40 AM",
  },
  {
    title: "Yesterday",
    snippet: "Thoughts on boundaries and maintaining energy...",
    time: "8:12 PM",
  },
  {
    title: "Jan 28",
    snippet: "Exploring what balance means right now...",
    time: "7:05 PM",
  },
  {
    title: "Jan 26",
    snippet: "Reflecting on growth moments this month...",
    time: "6:15 PM",
  },
];

export const chatMessages = [
  {
    role: "assistant",
    text: "Good morning. Ready to capture how today is feeling?",
  },
  {
    role: "user",
    text: "I feel focused, but also a little anxious about the upcoming review.",
  },
  {
    role: "assistant",
    text: "That makes sense. Want to explore what would make the review feel lighter?",
  },
];

export const memories = [
  {
    id: "m1",
    title: "Pacing the week",
    date: "Jan 30, 2026",
    mood: "Grounded",
    content:
      "This week felt fuller than expected. I noticed how helpful it is to set a single focus for the day.",
  },
  {
    id: "m2",
    title: "Evening walk",
    date: "Jan 28, 2026",
    mood: "Peaceful",
    content:
      "Took a walk after dinner and felt the tension release. I want to make this a ritual.",
  },
  {
    id: "m3",
    title: "Stretching creativity",
    date: "Jan 26, 2026",
    mood: "Curious",
    content:
      "Captured a few story fragments. The key is giving myself permission to explore without pressure.",
  },
];

export const weeklyEvidence = [
  {
    title: "Consistent check-ins",
    detail: "4 entries this week, with morning reflections as the most common time.",
  },
  {
    title: "Theme focus",
    detail: "Recurring keywords: clarity, boundaries, energy, calm.",
  },
  {
    title: "Mood range",
    detail: "Mostly steady with a small dip on Wednesday.",
  },
];

export const mockAnalysis: AnalyzeEntryResponse = {
  sentiment: "neutral",
  themes: ["clarity", "balance", "energy"],
  confidence: 0.64,
};
