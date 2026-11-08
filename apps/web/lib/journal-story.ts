/**
 * Turn a journaling session (prompt, companion questions, your answers) into one first-person
 * journal piece. Runs entirely in the browser with plain rules: no AI model, nothing sent anywhere.
 *
 * - Full sentences are kept in your own words, only tidied (capitals, "couldnt" -> "couldn't", a
 *   final full stop).
 * - Short answers ("The body pain and tiredness") are joined to the question they answer, rewritten
 *   in the first person: "What's been the hardest part?" -> "The hardest part has been the body
 *   pain and tiredness."
 * - When a question can't be turned into a statement, it stays as a question you asked yourself:
 *   "Did that help? Not really."
 */

import { affirmationFor, closingCore, closingSentence, isClosingQuestion, suggestedTodo, todoFrom } from "./journal-closing";

export type StoryTurn = { role: string; content: string };
/** `text` is the written-out prose (never contains a question); `answer` is your own words, tidied. */
export type StoryPassage = { question: string | null; text: string; answer: string };
export type JournalClosing = {
  /** The closing answer as a sentence ("To make tomorrow a little lighter, I'll go to bed early."), if there was one. */
  sentence: string | null;
  /** The closing question, in the first person, and the answer as written, for the "show the questions" view. */
  question: string | null;
  answer: string | null;
  /** One small thing for tomorrow: from the closing answer, or suggested from the entry. */
  todo: string;
  todoSuggested: boolean;
  /** A first-person affirmation that fits what was written. */
  affirmation: string;
};
export type JournalStory = {
  /** The opening prompt, in the first person ("What's on my mind today?"). */
  opening: string | null;
  /** True when the first answer already says the prompt in its own sentence, so the page needn't repeat it. */
  openingJoined: boolean;
  passages: StoryPassage[];
  paragraphs: string[];
  closing: JournalClosing | null;
};

const CONTRACTIONS: Record<string, string> = {
  arent: "aren't",
  cant: "can't",
  couldnt: "couldn't",
  didnt: "didn't",
  doesnt: "doesn't",
  dont: "don't",
  hadnt: "hadn't",
  hasnt: "hasn't",
  havent: "haven't",
  im: "I'm",
  isnt: "isn't",
  ive: "I've",
  shouldnt: "shouldn't",
  thats: "that's",
  theres: "there's",
  theyre: "they're",
  wasnt: "wasn't",
  werent: "weren't",
  whats: "what's",
  wont: "won't",
  wouldnt: "wouldn't",
  youre: "you're",
};

// Words that make an answer a clause rather than a fragment.
const CLAUSE_WORDS = new Set(
  (
    "i i'm i've i'd i'll we we're he she they it's there's that's am is are was were been be do does did " +
    "have has had feel feels felt want wanted need needed think thought know knew can could will would " +
    "should might must get got go went make made keep kept love hate hope wish try tried keeps says thinks wants " +
    "needs gets goes makes takes seems looks don't didn't doesn't can't couldn't won't wasn't isn't aren't weren't " +
    "hasn't haven't hadn't shouldn't wouldn't"
  ).split(" ")
);

const VERBS_AFTER_YOU = new Set(
  (
    "feel feels felt think thought need needed want wanted know knew have had get got notice noticed " +
    "hope wish expect remember mean say said like love hate find found see saw usually tend would could " +
    "can will should might do did"
  ).split(" ")
);

const IRREGULAR_PAST = new Set(
  (
    "was were did had made felt got took kept left went said came brought thought wore tore broke gave told " +
    "hurt began stood drove ran ate wrote spoke chose fell forgot lost met paid sent spent taught won woke heard " +
    "held led meant sat slept threw caught fought bought found sold built"
  ).split(" ")
);
// Words ending in -ed that aren't past tense, plus feeling words ("tired", "stressed") used as adjectives.
const NOT_PAST = new Set(
  "need speed feed seed bleed proceed succeed exceed indeed bed red tired scared worried stressed".split(" ")
);

function soundsPast(clause: string): boolean {
  return clause
    .toLowerCase()
    .split(/[^a-z']+/)
    .some((word) => IRREGULAR_PAST.has(word) || (word.length > 4 && word.endsWith("ed") && !NOT_PAST.has(word)));
}

const ACK_RE =
  /^(ok(ay)?|k|thanks?( you)?( so much)?|thank you|ty|bye|good ?night|cool|sure|alright|got it|hmm+|done|nothing( else)?|that'?s (it|all)|no(pe)?,? that'?s (it|all))[.! ]*$/i;
const YES_NO_RE =
  /^(yes|yeah|yep|yup|no|nope|nah|not really|maybe|kind of|kinda|sort of|i guess|probably|definitely|absolutely|a little|a bit)[.! ]*$/i;

const capitalize = (text: string) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);
const wordCount = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

function normalizeSpace(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[ \t]+/g, " ").trim();
}

function fixWords(text: string): string {
  return text
    .replace(/\b([A-Za-z]+)\b/g, (word) => {
      const fixed = CONTRACTIONS[word.toLowerCase()];
      if (!fixed) return word;
      if (fixed.startsWith("I")) return fixed;
      return word[0] === word[0].toUpperCase() ? capitalize(fixed) : fixed;
    })
    .replace(/\bi\b/g, "I");
}

function endWithPunctuation(text: string): string {
  return /[.!?…"')\]]$/.test(text) ? text : `${text}.`;
}

/** Tidy your own words without changing them: capitals, contractions, full stops. */
export function tidy(text: string): string {
  const lines = normalizeSpace(text)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => endWithPunctuation(fixWords(line)));
  return lines
    .join(" ")
    .split(/(?<=[.!?])\s+/)
    .map(capitalize)
    .join(" ");
}

const SUBJECT_STARTS = new Set("it he she they we everything nothing".split(" "));

export function isFragment(text: string): boolean {
  const words = normalizeSpace(text)
    .toLowerCase()
    .replace(/[^a-z' ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0 || words.length > 12) return false;
  if (soundsPast(words.join(" ")) && words.length > 2) return false; // "she learned to sit"
  if (words.length >= 3 && SUBJECT_STARTS.has(words[0])) return false; // "it affects everything"
  return !words.some((word) => CLAUSE_WORDS.has(word) || CLAUSE_WORDS.has(word.replace(/'.*$/, "")));
}

/** The last question in a companion message ("That sounds hard. What helped?" -> "What helped?"). */
export function lastQuestion(message: string): string | null {
  const sentences = normalizeSpace(message).split(/(?<=[.!?])\s+/);
  for (let i = sentences.length - 1; i >= 0; i -= 1) {
    if (sentences[i].trim().endsWith("?")) return sentences[i].trim();
  }
  return null;
}

/** "How are you feeling about your sister?" -> "How am I feeling about my sister?" */
export function toFirstPerson(question: string): string {
  const keepCase = (match: string, replacement: string) =>
    match[0] === match[0].toUpperCase() ? capitalize(replacement) : replacement;
  let text = normalizeSpace(question)
    .replace(/\b(are|were|have|do|did|can|could|would|will|should|might|had) you\b/gi, (match, aux: string) => {
      const lower = aux.toLowerCase();
      const verb = lower === "are" ? "am" : lower === "were" ? "was" : lower;
      return keepCase(match, `${verb} I`);
    })
    .replace(/\byou are\b/gi, "I am")
    .replace(/\byou were\b/gi, "I was")
    .replace(/\byou're\b/gi, "I'm")
    .replace(/\byou've\b/gi, "I've")
    .replace(/\byou'd\b/gi, "I'd")
    .replace(/\byou'll\b/gi, "I'll")
    .replace(/\byourself\b/gi, (m) => keepCase(m, "myself"))
    .replace(/\byours\b/gi, (m) => keepCase(m, "mine"))
    .replace(/\byour\b/gi, (m) => keepCase(m, "my"));
  text = text.replace(
    /\byou\b(\s+(\w+))?/gi,
    (_match, rest: string | undefined, next: string | undefined, offset: number, whole: string) => {
      const startsSentence = offset === 0 || /[.!?]\s*$/.test(whole.slice(0, offset));
      const afterCausative = /\b(made|make|makes|let|lets|help|helps|helped|got|get|gets|have|had)\s*$/i.test(whole.slice(0, offset));
      const subject = !afterCausative && (startsSentence || (next !== undefined && VERBS_AFTER_YOU.has(next.toLowerCase())));
      return `${subject ? "I" : "me"}${rest ?? ""}`;
    }
  );
  return text;
}

const bareWord = (word: string) => word.replace(/[^A-Za-z']/g, "").replace(/'s$/, "");

/** Words written with a capital in the middle of a sentence ("my sister Priya"): names to keep. */
export function namesIn(texts: string[]): Set<string> {
  const names = new Set<string>();
  for (const text of texts) {
    for (const sentence of normalizeSpace(text).split(/(?<=[.!?])\s+|\n+/)) {
      sentence
        .split(/\s+/)
        .slice(1)
        .forEach((word) => {
          const bare = bareWord(word);
          if (/^[A-Z][a-z']+$/.test(bare) && bare !== "I") names.add(bare);
        });
    }
  }
  return names;
}

// A short answer joined mid-sentence loses its keyboard auto-capital ("Rest" -> "rest"), unless
// it's "I" or a name you've written with a capital elsewhere.
function answerForSentence(answer: string, names: Set<string> = new Set()): string {
  const trimmed = normalizeSpace(fixWords(answer)).replace(/[.!?…\s]+$/, "");
  const first = trimmed.split(/\s+/)[0] ?? "";
  const bare = bareWord(first);
  if (bare === "I" || first.startsWith("I'") || names.has(bare) || !/^[A-Z][a-z']*$/.test(bare)) return trimmed;
  return first.charAt(0).toLowerCase() + trimmed.slice(1);
}

/**
 * Rewrite a short answer as a first-person statement using the question it answers.
 * Returns null when no pattern fits (the caller keeps it as a question-and-answer).
 */
export function statementFor(question: string, answer: string, names: Set<string> = new Set()): string | null {
  const q = toFirstPerson(question)
    .replace(/^(and|so|okay|ok|then),?\s+/i, "")
    .replace(/\?+$/, "")
    .trim();
  const a = answerForSentence(answer, names);
  if (!q || !a) return null;
  let m: RegExpMatchArray | null;

  // "What made you feel heavy today?" + "my interview" -> "I felt heavy today because of my interview."
  if ((m = q.match(/^what (?:made|makes) I feel (.+)$/i)) || (m = q.match(/^what (?:made|makes) me feel (.+)$/i))) {
    return `I felt ${m[1]} because of ${a}.`;
  }
  if ((m = q.match(/^what (?:made|makes) (today|it|this|that|the day|this week|work|tonight) (.+)$/i))) {
    return `${capitalize(m[1])} was ${m[2]} because of ${a}.`;
  }
  if ((m = q.match(/^what (?:made|makes) me (.+)$/i))) return `${capitalize(a)} made me ${m[1]}.`;
  // "What's been the hardest part of it?" -> "The hardest part of it has been ..."
  if ((m = q.match(/^what(?:'s been| has been|'s| is| was) (the|my|a|an) (.+)$/i))) {
    const aux = /'s been|has been/i.test(q) ? "has been" : /^what was/i.test(q) ? "was" : "is";
    return `${capitalize(m[1].toLowerCase())} ${m[2]} ${aux} ${a}.`;
  }
  // "What would you like to change?" -> "What I'd like to change is ..."
  if ((m = q.match(/^what (do|would|could|can|might|will) I (.+)$/i))) {
    const modal = m[1].toLowerCase();
    const rest = m[2];
    if (modal === "do") return `What I ${rest} is ${a}.`;
    if (modal === "would" && /^like\b/i.test(rest)) return `What I'd ${rest} is ${a}.`;
    return `What I ${modal} ${rest} is ${a}.`;
  }
  // "How are you feeling about it?" -> "I'm feeling ... about it."
  if ((m = q.match(/^how (am|was) I feeling(.*)$/i))) {
    return `${m[1].toLowerCase() === "am" ? "I'm" : "I was"} feeling ${a}${m[2]}.`;
  }
  if ((m = q.match(/^how (do|did) I feel(.*)$/i))) {
    return `I ${m[1].toLowerCase() === "do" ? "feel" : "felt"} ${a}${m[2]}.`;
  }
  // "How did the interview go?" -> "The interview went well."
  if ((m = q.match(/^how did (it|that|this|the [\w' ]+?|my [\w' ]+?) (go|feel)(.*)$/i))) {
    return `${capitalize(m[1])} ${m[2].toLowerCase() === "go" ? "went" : "felt"} ${a}${m[3]}.`;
  }
  // "Who's been on your mind?" -> "My sister has been on my mind."
  if ((m = q.match(/^who(?:'s been| has been|'s| is| was) (.+)$/i))) {
    const aux = /'s been|has been/i.test(q) ? "has been" : /^who was/i.test(q) ? "was" : "is";
    return `${capitalize(a)} ${aux} ${m[1]}.`;
  }
  // "Who could you talk to about this?" -> "Someone I could talk to about this is ..."
  if ((m = q.match(/^who (could|can|would|might) I (.+)$/i))) {
    return `Someone I ${m[1].toLowerCase()} ${m[2]} is ${a}.`;
  }
  // "What part of it hurt the most?" -> "The part that hurt the most was ..."
  const part = partQuestion(q);
  if (part) return `${part.lead} ${part.aux} ${a}.`;
  // "What's been happening?" / "What happened?" have no tidy statement form.
  if (/^what(?:'s been| has been| was| is)? (happening|going on)\b|^what happened\b/i.test(q)) return null;
  // Subject questions: "What drained you the most?" -> "What drained me the most was ..."
  if ((m = q.match(/^what(?!\s+(?:did|am|was|have|had|should)\s+I\b)(\S*)\s+(.+)$/i)) && !/^what (do|did|would|could|can|might|will) I\b/i.test(q)) {
    const clause = `What${m[1]} ${m[2]}`;
    const aux = soundsPast(m[2]) && !/^'s/.test(m[1]) ? "was" : "is";
    return `${clause} ${aux} ${a}.`;
  }
  return null;
}

// Small, common slips that read oddly once the words become a written page.
const GRAMMAR_FIXES: Array<[RegExp, string]> = [
  [/\b(performed|did|went|played|scored|slept|spoke|presented)\s+bad\b/gi, "$1 badly"],
  [/\b(in|at|after|before|during)\s+(interview|meeting|exam|presentation|party)\b/gi, "$1 the $2"],
];

const DROPPED_SUBJECT_RE =
  /^((?:just|really|kinda|so|also|still)\s+)?(felt|feel|feeling|had|got|went|tried|woke|slept|need|needed|want|wanted|think|thought|love|loved|hate|hated|miss|missed|was feeling|have been|been feeling|keep|kept)\b/i;

function polish(text: string): string {
  const fixed = GRAMMAR_FIXES.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text);
  // "Just felt tired in general." -> "I just felt tired in general."
  return fixed
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => (DROPPED_SUBJECT_RE.test(sentence) ? `I ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}` : sentence))
    .join(" ");
}

const PAST_HINT = /\b(went|made|happened|was|were|did|got|felt|took|came|today|yesterday|this morning|tonight)\b/i;
const PART_RE =
  /^what part(?: of ([\w' ]+?))? ((?:wore|hurt|hurts|made|makes|felt|feels|was|is|has|stressed|bothered|bothers|worried|worries|annoyed|annoys|upset|upsets|scared|scares|frustrates|frustrated|drained|drains|stayed|stays|stuck|weighs|weighed|matters|mattered|helps|helped|excites|excited)\b.*)$/i;

/** "What part of work wore me out the most" -> lead "The part of work that wore me out the most", aux "was". */
function partQuestion(q: string): { lead: string; aux: string } | null {
  const m = q.match(PART_RE);
  if (!m) return null;
  const of = m[1] && !/^(it|this|that)$/i.test(m[1]) ? ` of ${m[1]}` : "";
  return { lead: `The part${of} that ${m[2]}`, aux: soundsPast(m[2]) ? "was" : "is" };
}

/**
 * Join a full-sentence answer to the question it answers, so the page reads as one thought:
 * "What made you feel heavy today?" + "I performed bad in interview"
 *   -> "I felt heavy today because I performed badly in the interview."
 * Returns null when the question doesn't have a natural statement form.
 */
export function clauseStatementFor(question: string, answer: string, names: Set<string> = new Set()): string | null {
  const q = toFirstPerson(question)
    .replace(/^(and|so|okay|ok|then),?\s+/i, "")
    .replace(/\?+$/, "")
    .trim();
  const sentences = normalizeSpace(answer).split(/(?<=[.!?])\s+/);
  const first = sentences[0] ?? "";
  if (!q || !first || wordCount(first) > 15 || /\?$/.test(first)) return null;
  const clause = polish(answerForSentence(first.replace(/^because\s+/i, ""), names));
  const rest = sentences.slice(1).join(" ");
  const finish = (sentence: string) => (rest ? `${endWithPunctuation(sentence)} ${tidy(polish(rest))}` : endWithPunctuation(sentence));
  let m: RegExpMatchArray | null;

  // "What made you feel heavy today?" -> "I felt heavy today because ..."
  if ((m = q.match(/^what (?:made|makes) me feel (.+)$/i))) return finish(`I felt ${m[1]} because ${clause}`);
  // "What made today hard?" -> "Today was hard because ..."
  if ((m = q.match(/^what (?:made|makes) (today|it|this|that|the day|this week|work|tonight) (.+)$/i))) {
    return finish(`${capitalize(m[1])} was ${m[2]} because ${clause}`);
  }
  // "What made you smile today?" -> "What made me smile today was that ..."
  if ((m = q.match(/^what (made|makes) me (.+)$/i))) return finish(`What ${m[1].toLowerCase()} me ${m[2]} was that ${clause}`);
  // "What's one small thing that went right today?" -> "One small thing that went right today was that ..."
  if ((m = q.match(/^what(?:'s| is| was) one (.+)$/i))) {
    return finish(`One ${m[1]} ${PAST_HINT.test(m[1]) ? "was" : "is"} that ${clause}`);
  }
  // "What's been the hardest part?" -> "The hardest part has been that ..."
  if ((m = q.match(/^what(?:'s been| has been|'s| is| was) (the|my) (.+)$/i))) {
    const aux = /'s been|has been/i.test(q) ? "has been" : /^what was/i.test(q) ? "was" : "is";
    return finish(`${capitalize(m[1].toLowerCase())} ${m[2]} ${aux} that ${clause}`);
  }
  // "What do you wish you'd said?" -> "What I wish I'd said is that ..."
  if ((m = q.match(/^what (do|would|could|can|might|will) I (.+)$/i))) {
    const modal = m[1].toLowerCase();
    const lead = modal === "do" ? `What I ${m[2]}` : `What I ${modal} ${m[2]}`;
    const link = /^that\b/i.test(clause) ? "" : "that ";
    return finish(`${lead} is ${link}${clause}`);
  }
  const part = partQuestion(q);
  if (part) return finish(`${part.lead} ${part.aux} ${linkThat(clause)}${clause}`);
  // "What drained you today?" -> "What drained me today was that ..."
  if ((m = q.match(/^what (drained|helped|surprised|hurt|annoyed|upset|worried|stressed|scared|bothered|gave) me(.*)$/i))) {
    return finish(`What ${m[1].toLowerCase()} me${m[2]} was ${linkThat(clause)}${clause}`);
  }
  return null;
}

/** "that" joins a clause ("... is that I lost focus"), but not one that already links ("... is when I ..."). */
function linkThat(clause: string): string {
  return /^(that|when|if|how|whether|because|being|having|not|knowing|seeing|feeling|the fact)\b/i.test(clause) ? "" : "that ";
}

const AUX_NEGATIVE: Record<string, string> = {
  do: "don't", does: "doesn't", did: "didn't", is: "isn't", are: "aren't", was: "wasn't", were: "weren't",
  have: "haven't", has: "hasn't", had: "hadn't", can: "can't", could: "couldn't", would: "wouldn't",
  will: "won't", should: "shouldn't", am: "am not",
};
const BASE_VERBS = new Set(
  "help work matter change make feel go come hurt bother affect improve calm last stay get".split(" ")
);
const YES_RE = /^(yes|yeah|yep|yup|definitely|absolutely|sure|of course)\b/i;
const NO_RE = /^(no|nope|nah|not really|not at all)\b/i;
const HEDGES: Array<[RegExp, (s: string) => string]> = [
  [/^(maybe|perhaps)\b/i, (s) => `Maybe ${lowerFirst(s)}`],
  [/^probably\b/i, (s) => `Probably ${lowerFirst(s)}`],
  [/^i guess\b/i, (s) => `I guess ${lowerFirst(s)}`],
  [/^(kind of|kinda|sort of)\b/i, (s) => `${s.replace(/[.]$/, "")}, kind of.`],
  [/^(a little|a bit)\b/i, (s) => `${s.replace(/[.]$/, "")}, a little.`],
];
const lowerFirst = (text: string) => (/^I\b|^I'/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1));

/** "Did that help?" + "not really" -> "That didn't really help." Null when the question won't flip. */
export function yesNoStatement(question: string, answer: string): string | null {
  const q = toFirstPerson(question).replace(/^(and|so|okay|ok),?\s+/i, "").replace(/\?+$/, "").trim();
  const m = q.match(/^(do|does|did|is|are|am|was|were|have|has|had|can|could|would|will|should)\s+(.+)$/i);
  if (!m) return null;
  const aux = m[1].toLowerCase();
  const words = m[2].split(/\s+/);
  let split = 0;
  if (/^(I|it|that|this|they|he|she|we|there|you)$/i.test(words[0])) split = 1;
  else if (/^(my|the|your|his|her|their|our)$/i.test(words[0]) && words.length > 2) split = 2;
  else {
    const verb = words.findIndex((word, index) => index > 0 && BASE_VERBS.has(word.toLowerCase()));
    if (verb > 0) split = verb;
  }
  if (split === 0 || split >= words.length) return null;
  const subject = words.slice(0, split).join(" ");
  const rest = words.slice(split).join(" ");
  const a = answer.trim().toLowerCase();
  const negative = NO_RE.test(a);
  if (!negative && !YES_RE.test(a) && !HEDGES.some(([re]) => re.test(a))) return null;
  const subj = subject === "I" ? "I" : capitalize(subject.toLowerCase() === "it" ? "it" : subject);
  let sentence: string;
  if (negative) {
    const neg = aux === "am" && subject === "I" ? "I'm not" : `${subj} ${AUX_NEGATIVE[aux]}`;
    const really = /^not really/.test(a) ? " really" : "";
    sentence = `${neg}${really} ${rest}.`;
  } else {
    sentence = aux === "am" && subject === "I" ? `I'm ${rest}.` : `${subj} ${aux} ${rest}.`;
    const hedge = HEDGES.find(([re]) => re.test(a));
    if (hedge) sentence = hedge[1](sentence);
  }
  return capitalize(sentence.replace(/\s+/g, " "));
}

/** "What has been draining my energy?" -> "what has been draining my energy"; "Where do I feel it?" -> "where I feel it". */
export function embeddedQuestion(question: string): string | null {
  const q = toFirstPerson(question).replace(/^(and|so|okay|ok),?\s+/i, "").replace(/\?+$/, "").trim();
  const wh = q.match(/^(what|why|how|who|where|when|which)\b\s*(.*)$/i);
  if (!wh) return null;
  const word = wh[1].toLowerCase();
  const rest = wh[2];
  const inverted = rest.match(/^(do|am|is|are|was|were|have|has|had|can|could|would|will|should)\s+(I|it|this|that|they|he|she|we|my \S+|the \S+)\s+(.*)$/i);
  if (inverted) {
    const aux = inverted[1].toLowerCase();
    const subject = inverted[2];
    const tail = inverted[3];
    if (aux === "do") return `${word} ${subject} ${tail}`.trim();
    return `${word} ${subject} ${aux} ${tail}`.trim();
  }
  if (/^(does|did)\b/i.test(rest)) return null; // needs a verb form change
  return `${word} ${rest}`.trim();
}

const UNSURE_RE = /^((?:i(?:'m| am)?\s+)?(?:really\s+|honestly\s+|just\s+)?(?:not\s+(?:really\s+)?sure|don't\s+(?:really\s+)?know|do not know|have no idea|no idea))\b[,.;:]?\s*/i;
const LEADING_YES_NO_RE = /^(yes|yeah|yep|yup|no|nope|nah)\b[,.!]?\s+(?=\S)/i;
const EVERYTHING_RE = /\b(everything|all of (?:it|them|those)|all three|both)\b/i;

/** "affects everything" + "— my energy, my plans, or my mood" -> "affects everything: my energy, my plans and my mood". */
function expandEverything(question: string, text: string): string {
  const list = toFirstPerson(question).replace(/\?+$/, "").split(/\s+[—–-]\s+|:\s+/)[1];
  if (!list || !/,|\bor\b/.test(list) || !EVERYTHING_RE.test(text)) return text;
  const items = list.replace(/,?\s+or\s+/i, " and ").replace(/,\s+and\s+/, " and ");
  return text.replace(EVERYTHING_RE, (match) => `${match}: ${items}`);
}

/** "I'm really not sure, my body is tired." + question -> "I'm really not sure what has been draining my energy. My body is tired." */
function unsureStatement(question: string, answer: string): string | null {
  const m = normalizeSpace(answer).match(UNSURE_RE);
  const embedded = embeddedQuestion(question);
  if (!m || !embedded) return null;
  const lead = fixWords(m[1].replace(/^(?!i\b)/i, "I'm ")).replace(/^I'm (I|I'm|I am)\b/i, "$1");
  const rest = normalizeSpace(answer).slice(m[0].length);
  const first = `${capitalize(lead)} ${embedded}.`;
  return rest ? `${first} ${tidy(polish(rest))}` : first;
}

/** The written passage for one answer: prose without the question, and whether the question was woven in. */
function passageFor(question: string | null, rawAnswer: string, names: Set<string>): { text: string | null; joined: boolean } {
  let answer = normalizeSpace(rawAnswer);
  const yesNo = YES_NO_RE.test(answer);
  if (question && yesNo) {
    // A bare "yes"/"not really" only means something next to its question.
    const statement = yesNoStatement(question, answer);
    return statement ? { text: polish(statement), joined: true } : { text: null, joined: true };
  }
  // "Yes, it affects everything." -> "it affects everything" (the question is carried by the sentence).
  if (question && LEADING_YES_NO_RE.test(answer) && wordCount(answer.replace(LEADING_YES_NO_RE, "")) >= 2) {
    answer = capitalize(answer.replace(LEADING_YES_NO_RE, ""));
  }
  if (question) {
    const unsure = unsureStatement(question, answer);
    if (unsure) return { text: unsure, joined: true };
  }
  if (question && isFragment(answer)) {
    const statement = statementFor(question, answer, names);
    if (statement) return { text: expandEverything(question, polish(statement)), joined: true };
    // No statement form: a note in journal style ("Where I feel it in my body: my shoulders.").
    const embedded = embeddedQuestion(question);
    const note = answerForSentence(answer, names);
    return { text: embedded ? `${capitalize(embedded)}: ${note}.` : `${capitalize(note)}.`, joined: Boolean(embedded) };
  }
  if (question) {
    const joined = clauseStatementFor(question, answer, names);
    if (joined) return { text: expandEverything(question, joined), joined: true };
    return { text: expandEverything(question, tidy(polish(answer))), joined: false };
  }
  return { text: tidy(polish(answer)), joined: false };
}

/** Build the journal piece for one entry. */
export function composeJournal(
  prompt: string | null | undefined,
  turns: StoryTurn[],
  fallbackText = "",
  mood: string | null = null
): JournalStory {
  const opening = prompt?.trim() ? toFirstPerson(prompt.trim()) : null;
  const userTurns = turns.filter((turn) => turn.role === "user" && turn.content.trim());
  const passages: StoryPassage[] = [];
  let openingJoined = false;
  let closingQuestion: string | null = null;
  let closingAnswer: string | null = null;

  if (userTurns.length === 0) {
    for (const block of fallbackText.split(/\n\s*\n/)) {
      if (block.trim()) passages.push({ question: null, text: tidy(block), answer: tidy(block) });
    }
  } else {
    const names = namesIn(userTurns.map((t) => t.content));
    let question: string | null = prompt?.trim() || null;
    for (const turn of turns) {
      const content = turn.content.trim();
      if (!content) continue;
      if (turn.role !== "user") {
        question = lastQuestion(content);
        continue;
      }
      if (ACK_RE.test(content) && !isClosingQuestion(question)) {
        question = null;
        continue;
      }
      // The forward-looking last answer becomes the page's closing, not part of the story.
      if (isClosingQuestion(question) && closingAnswer === null) {
        closingQuestion = question;
        closingAnswer = content;
        question = null;
        continue;
      }
      const passage = passageFor(question, content, names);
      if (passages.length === 0 && question && question === (prompt?.trim() || null)) openingJoined = passage.joined;
      if (passage.text) passages.push({ question, text: passage.text, answer: tidy(polish(content)) });
      question = null;
    }
  }

  // One flowing piece: passages join into paragraphs of roughly 45+ words.
  const paragraphs: string[] = [];
  for (const passage of passages) {
    const last = paragraphs.length - 1;
    if (last >= 0 && wordCount(paragraphs[last]) < 45) {
      paragraphs[last] = `${paragraphs[last]} ${passage.text}`;
    } else {
      paragraphs.push(passage.text);
    }
  }

  const written = userTurns.length ? userTurns.map((turn) => turn.content).join(" ") : fallbackText;
  let closing: JournalClosing | null = null;
  if (written.trim()) {
    const firstPersonClosing = closingQuestion ? toFirstPerson(closingCore(closingQuestion)) : null;
    const todo = closingAnswer ? todoFrom(closingAnswer) : null;
    // The affirmation reads the story, not the plan for tomorrow.
    const story = userTurns.filter((turn) => turn.content !== closingAnswer).map((turn) => turn.content).join(" ") || written;
    closing = {
      sentence: firstPersonClosing && closingAnswer ? closingSentence(firstPersonClosing, closingAnswer, todo) : null,
      question: firstPersonClosing,
      answer: closingAnswer ? tidy(polish(closingAnswer)) : null,
      todo: todo ?? suggestedTodo(story, mood),
      todoSuggested: !todo,
      affirmation: affirmationFor(story, mood),
    };
  }
  return { opening, openingJoined, passages, paragraphs, closing };
}
