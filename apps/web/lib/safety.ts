// Mirror of services/nlp/app/safety.py, used when the NLP service is unreachable so crisis
// language is still recognised. Deliberately conservative: prefer showing resources.
const CRISIS_PATTERNS: RegExp[] = [
  /\bsuicid(e|al)\b/,
  /\b(kill(ing)?|hang(ing)?|shoot(ing)?)\s+myself\b/,
  /\b(end(ing)?|take|taking)\s+(my|my own)\s+life\b/,
  /\bend(ing)?\s+it\s+all\b/,
  /\b(self[-\s]?harm(ing)?|(hurt|hurting|cut|cutting|harm|harming|burn|burning)\s+myself(?!\s+(a|an|some|off|short|loose|free)\b))\b/,
  /\b(want(ed)?|wanna|going)\s+to\s+die\b/,
  /\bwish\s+i\s+(was|were)\s+(dead|never\s+born)\b/,
  /\bbetter\s+off\s+(dead|without\s+me)\b/,
  /\b(no\s+reason|nothing(\s+left)?)\s+to\s+live(\s+for)?\b/,
  /\b(can'?t|cannot)\s+go\s+on\b/,
  /\bdon'?t\s+want\s+to\s+(be\s+alive|live|exist|be\s+here\s+anymore|wake\s+up)\b/,
  /\boverdos(e|ed|ing)\b/,
];

export const CRISIS_MESSAGE =
  "I'm really sorry you're feeling this way. You deserve support right now. " +
  "If you're in immediate danger, call your local emergency number. In the US, you can call or text 988 " +
  "(Suicide & Crisis Lifeline). Elsewhere, findahelpline.com lists free, confidential support lines. " +
  "Are you safe right now?";

export function detectCrisis(text: string): boolean {
  const normalized = text.replace(/[‘’]/g, "'").toLowerCase();
  return CRISIS_PATTERNS.some((pattern) => pattern.test(normalized));
}
