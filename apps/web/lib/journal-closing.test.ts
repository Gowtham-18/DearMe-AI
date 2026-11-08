import { test } from "node:test";
import assert from "node:assert/strict";

import { affirmationFor, closingSentence, entryCategory, isClosingQuestion, suggestedTodo, todoFrom } from "./journal-closing";
import { sessionPace, questionsFor } from "./session-pace";

test("the closing question is recognised by its lead-in, not by any mention of tomorrow", () => {
  assert.ok(isClosingQuestion("Before you close the page, what would make tomorrow even better?"));
  assert.ok(!isClosingQuestion("What would make tomorrow feel a bit lighter?"));
});

test("plans become a to-do; non-answers get a suggestion instead", () => {
  assert.equal(todoFrom("I think I'll go to bed early."), "Go to bed early");
  assert.equal(todoFrom("maybe I could call my mom"), "Call my mom");
  assert.equal(todoFrom("If I sleep on time"), "Sleep on time");
  assert.equal(todoFrom("idk"), null);
  assert.equal(todoFrom("nothing really"), null);
});

test("the closing answer becomes one sentence that fits the question", () => {
  assert.equal(
    closingSentence("What's one small thing that could make tomorrow a little lighter?", "go for a walk", "Go for a walk"),
    "To make tomorrow a little lighter, I'll go for a walk."
  );
  assert.equal(
    closingSentence("What would make tomorrow even better?", "More time with family", "More time with family"),
    "What would make tomorrow even better is more time with family."
  );
});

test("affirmations and suggestions fit what was written", () => {
  assert.equal(entryCategory("My grandmother passed away last week"), "grief");
  assert.equal(entryCategory("I performed bad in the interview"), "setback");
  assert.equal(entryCategory("So tired, my body has no energy"), "tired");
  assert.equal(entryCategory("Had a great day with friends, so happy"), "positive");
  assert.equal(entryCategory("Work was fine I guess", "Great"), "positive");
  assert.match(affirmationFor("I keep worrying about the deadline and I feel anxious"), /step|handled/);
  assert.equal(suggestedTodo("I feel so lonely, no one texted"), "Message someone you've been missing");
});

test("the number of questions follows the time picked, then closes", () => {
  assert.deepEqual([3, 5, 7, 10].map(questionsFor), [3, 4, 5, 6]);
  const start = new Date(Date.now() - 60_000).toISOString();
  const a = (content: string) => ({ role: "assistant", content });
  const u = (content: string) => ({ role: "user", content });
  // 3 minutes: answer 1 explores, answer 2 gets the closing question, answer 3 finishes.
  assert.equal(sessionPace([a("Prompt?")], 3, start).nextPhase, "explore");
  assert.equal(sessionPace([a("Prompt?"), u("one"), a("Why?")], 3, start).nextPhase, "closing");
  const asked = [a("Prompt?"), u("one"), a("Why?"), u("two"), a("Okay. Before you close the page, what would make tomorrow even better?")];
  assert.equal(sessionPace(asked, 3, start).nextPhase, "finish");
  const done = [...asked, u("sleep"), a("Thank you for writing today. Your page is ready.")];
  const pace = sessionPace(done, 3, start);
  assert.equal(pace.finished, true);
  assert.equal(pace.nextPhase, "after");
  // Out of time: move to the closing question early, once there are two answers.
  const late = new Date(Date.now() - 11 * 60_000).toISOString();
  assert.equal(sessionPace([a("Prompt?"), u("one"), a("Why?")], 10, late).nextPhase, "closing");
  assert.equal(sessionPace([a("Prompt?")], 10, late).nextPhase, "explore");
});
