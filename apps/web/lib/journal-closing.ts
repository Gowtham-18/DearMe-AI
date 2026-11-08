/**
 * The end of a journal page: one forward-looking line, one small thing to do tomorrow, and an
 * affirmation that fits what was written. Plain rules in the browser, so it works the same for
 * locked journals and never sends anything anywhere.
 */

type Category =
  | "grief"
  | "setback"
  | "tired"
  | "work"
  | "anxious"
  | "lonely"
  | "angry"
  | "conflict"
  | "sad"
  | "positive"
  | "steady";

const CUES: Array<[Exclude<Category, "positive" | "steady">, RegExp]> = [
  ["grief", /\b(passed away|died|funeral|grie(f|ving)|lost my (mom|mum|dad|mother|father|grand\w*|friend|dog|cat|pet|brother|sister))\b/i],
  ["setback", /\b(interview|exams?|tests?|rejected|rejection|failed|fail|didn'?t get (the|a|my) (job|offer|place)|did badly|performed bad(ly)?)\b/i],
  ["tired", /\b(tired|exhausted|drained|draining|fatigue|energy|sleep\w*|burn(ed|t)? ?out|worn out)\b/i],
  ["work", /\b(work|office|job|tasks?|deadlines?|boss|productiv\w*|progress|career|meetings?)\b/i],
  ["anxious", /\b(anxious|anxiety|worr(y|ied|ies|ying)|nervous|scared|afraid|panic\w*|overthink\w*|stress(ed|ful)?)\b/i],
  ["lonely", /\b(lonely|alone|left out|isolated|no one|nobody)\b/i],
  ["angry", /\b(angry|furious|frustrat\w*|annoyed|irritated|mad at|pissed)\b/i],
  ["conflict", /\b(fight|fought|argument|argued|conflict|yelled)\b/i],
  ["sad", /\b(sad|down|low|heavy|cr(y|ied|ying)|hurt|upset|depressed|miserable|empty)\b/i],
];
const POSITIVE_RE =
  /\b(happy|grateful|thankful|proud|excited|great|amazing|wonderful|fun|enjoyed|loved|good day|went well|felt good|relaxed|calm|peaceful)\b/gi;
const NEGATIVE_RE =
  /\b(tired|exhausted|drained|sad|down|low|heavy|anxious|worried|stressed|angry|frustrated|lonely|hurt|upset|bad|badly|awful|terrible|hard|difficult|lack|can'?t|couldn'?t)\b/gi;
const POSITIVE_MOODS = /^(great|good|happy|calm|grateful|excited|content|okay-good)$/i;
const LOW_MOODS = /^(low|sad|anxious|stressed|tired|angry|overwhelmed|awful|bad)$/i;

const AFFIRMATIONS: Record<Category, string[]> = {
  grief: ["I can miss them and still take gentle care of myself.", "Love doesn't end, and neither does my ability to heal."],
  setback: ["One result doesn't decide what I'm capable of.", "I'm still learning, and every attempt makes me stronger."],
  tired: ["Rest is part of progress, not a break from it.", "I'm allowed to slow down and refill."],
  work: ["My worth isn't measured by how much I get done in a day.", "Small steps still move me forward."],
  anxious: ["I can take this one step at a time.", "I've handled hard things before, and I can handle this too."],
  lonely: ["I deserve connection, and it's okay to reach out first.", "I'm good company, starting with being kind to myself."],
  angry: ["My feelings make sense, and I get to choose what I do with them.", "I can feel this fully and still respond calmly."],
  conflict: ["I can stand up for myself and still be kind.", "Repair is possible, and it can start with me being honest."],
  sad: ["Heavy days pass, and I'm allowed to go gently through this one.", "It's okay not to be okay today."],
  positive: ["I'm learning to notice what's going right.", "I deserve days like this, and more of them."],
  steady: ["Showing up for myself today counts.", "I'm doing better than I give myself credit for."],
};

const SUGGESTED_TODOS: Record<Category, string> = {
  grief: "Spend a quiet moment with a favourite memory",
  setback: "Write down one thing you learned from it",
  tired: "Go to bed 30 minutes earlier tonight",
  work: "Pick one small task and finish it first",
  anxious: "Write the worry down, then one small step for it",
  lonely: "Message someone you've been missing",
  angry: "Take a 10-minute walk before replying to anything",
  conflict: "Decide one calm thing you want to say",
  sad: "Get 10 minutes of fresh air",
  positive: "Do one more thing that made today good",
  steady: "Drink a glass of water and take five slow breaths",
};

function count(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length;
}

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** What the entry is mostly about, for the affirmation and a suggested to-do. */
export function entryCategory(text: string, mood?: string | null): Category {
  if (CUES[0][1].test(text)) return "grief";
  const positive = count(text, POSITIVE_RE) + (mood && POSITIVE_MOODS.test(mood) ? 2 : 0);
  const negative = count(text, NEGATIVE_RE) + (mood && LOW_MOODS.test(mood) ? 2 : 0);
  if (positive > negative) return "positive";
  // The most-mentioned theme wins; earlier in the list breaks a tie.
  let best: Category | null = null;
  let bestHits = 0;
  for (const [category, re] of CUES.slice(1)) {
    const hits = count(text, new RegExp(re.source, "gi"));
    if (hits > bestHits) {
      best = category;
      bestHits = hits;
    }
  }
  return best ?? (negative > 0 ? "sad" : "steady");
}

export function affirmationFor(text: string, mood?: string | null): string {
  const options = AFFIRMATIONS[entryCategory(text, mood)];
  return options[hash(text) % options.length];
}

export function suggestedTodo(text: string, mood?: string | null): string {
  return SUGGESTED_TODOS[entryCategory(text, mood)];
}

/** The companion's last question in a session looks forward to tomorrow ("Before you close the page, ..."). */
const CLOSING_RE = /\bclose the page\b[^?]*\bmake tomorrow\b/i;
export const isClosingQuestion = (question: string | null | undefined) => Boolean(question && CLOSING_RE.test(question));

/** "Before you close the page, what's one ...?" -> "What's one ...?" */
export function closingCore(question: string): string {
  const core = question.trim().replace(/^(before (?:you|we) [^,]+|one last thing|last one|to finish|and finally),\s*/i, "");
  return core.charAt(0).toUpperCase() + core.slice(1);
}

const NOTHING_RE = /^(nothing|idk|i don'?t know|not sure|no idea|dunno|nah|no|none|nothing really|i'?m not sure)[.! ]*$/i;
const FILLER_RE = /^(i think|i guess|maybe|probably|honestly|hmm+|well|just|perhaps|so)[,]?\s+/i;
const INTENT_RE =
  /^(i(?:\s+(?:could|can|will|would|should|might|must|need to|want to|have to|plan to|hope to|am going to|am gonna|would like to)|'ll|'d like to|'d|'m going to|'m gonna)|(?:try(?:ing)?|going) to|to)\s+/i;
const NOT_A_VERB = /^(the|a|an|my|if|when|more|less|some|not|no|nothing|being|having|i|it|that|this|a lot|better|good|enough|some|any)\b|ing\b/i;

/** "I think I'll go to bed early." -> "Go to bed early". Null when it isn't a plan ("nothing", "idk"). */
export function todoFrom(answer: string): string | null {
  let text = answer.replace(/[‘’]/g, "'").trim().split(/(?<=[.!?])\s+|\n+/)[0]?.trim() ?? "";
  text = text.replace(/[.!?]+$/, "");
  if (!text || NOTHING_RE.test(text)) return null;
  for (let i = 0; i < 3; i += 1) text = text.replace(FILLER_RE, "").replace(INTENT_RE, "");
  text = text.replace(/^if i\s+/i, "");
  if (!text) return null;
  const words = text.split(/\s+/);
  if (words.length > 16) text = `${words.slice(0, 16).join(" ")}…`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const isVerbPhrase = (todo: string) => !NOT_A_VERB.test(todo.split(/\s+/)[0] ?? "");

/**
 * The closing answer as a sentence that fits the question:
 *   "What's one small thing that could make tomorrow a little lighter?" + "go to bed early"
 *     -> "To make tomorrow a little lighter, I'll go to bed early."
 */
export function closingSentence(firstPersonQuestion: string, answer: string, todo: string | null): string | null {
  const goal = firstPersonQuestion.match(/\b(make tomorrow[^?]*?)\??$/i)?.[1];
  const tidyAnswer = answer.replace(/[‘’]/g, "'").trim().replace(/\s+/g, " ").replace(/[.!?]*$/, "");
  if (!tidyAnswer) return null;
  if (goal && todo && isVerbPhrase(todo) && !todo.endsWith("…")) {
    const lower = /^I\b/.test(todo) ? todo : todo.charAt(0).toLowerCase() + todo.slice(1);
    return `To ${goal}, I'll ${lower}.`;
  }
  if (goal && todo === null) return null;
  const subject = firstPersonQuestion.replace(/^what(?:'s| is) (one .+?)\??$/i, "$1").replace(/\?+$/, "");
  const lead = subject.charAt(0).toUpperCase() + subject.slice(1);
  const first = tidyAnswer.charAt(0);
  const body = /^I\b|^I'/.test(tidyAnswer) ? tidyAnswer : first.toLowerCase() + tidyAnswer.slice(1);
  return `${lead} is ${body}.`;
}
