import type { SessionPhase } from "@dearme/shared";

import { isClosingQuestion } from "@/lib/journal-closing";
import { lastQuestion } from "@/lib/journal-story";

/** How many answers fit the time someone picked: short sessions stay short. */
export const questionsFor = (minutes: number) => (minutes <= 3 ? 3 : minutes <= 5 ? 4 : minutes <= 7 ? 5 : 6);

const FINISHED_RE = /your page is ready/i;

export type SessionPace = {
  answered: number;
  total: number;
  closingAsked: boolean;
  finished: boolean;
  /** The phase to send with the next answer. */
  nextPhase: SessionPhase;
  minutesLeft: number;
};

/**
 * Where a session is against its chosen time. The second-to-last answer gets the closing question
 * (about tomorrow); the answer to that finishes the session. Running out of time moves to the
 * closing question early, once there are at least two answers.
 */
export function sessionPace(
  turns: Array<{ role: string; content: string }>,
  minutes: number,
  startedAt: string | null,
  now: number = Date.now()
): SessionPace {
  const total = questionsFor(minutes);
  const answered = turns.filter((turn) => turn.role === "user" && turn.content.trim()).length;
  const assistant = turns.filter((turn) => turn.role === "assistant");
  const closingAsked = assistant.some((turn) => isClosingQuestion(lastQuestion(turn.content)));
  const finished = assistant.some((turn) => FINISHED_RE.test(turn.content));
  const started = startedAt ? Date.parse(startedAt) : NaN;
  const elapsedMin = Number.isFinite(started) ? Math.max(0, (now - started) / 60000) : 0;
  const minutesLeft = Math.max(0, Math.ceil(minutes - elapsedMin));
  const next = answered + 1;

  let nextPhase: SessionPhase = "explore";
  if (finished) nextPhase = "after";
  else if (closingAsked) nextPhase = "finish";
  else if (next >= total - 1 || (minutesLeft === 0 && Number.isFinite(started) && next >= 2)) nextPhase = "closing";

  return { answered, total, closingAsked, finished, nextPhase, minutesLeft };
}
