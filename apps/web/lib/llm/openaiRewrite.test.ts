import assert from "node:assert/strict";
import test from "node:test";

import { assistantMessageSchema, validateAssistantMessage } from "./openaiRewrite";

const planText =
  "Thanks for sharing. That sounds heavy. It seems clarity is present. If it helps, name one small detail.";

const baseMessage = {
  validation: "Thanks for sharing. That sounds heavy.",
  reflection: "It seems clarity is present for you right now.",
  pattern_connection: "It can help to notice what keeps returning.",
  gentle_nudge: "If it helps, name one small detail about clarity.",
  follow_up_question: "What feels most important to explore next?",
};

test("assistant message schema accepts valid payload", () => {
  const parsed = assistantMessageSchema.parse(baseMessage);
  assert.equal(parsed.validation, baseMessage.validation);
});

test("policy rejects medical advice language", () => {
  const candidate = { ...baseMessage, reflection: "You should seek therapy immediately." };
  const result = validateAssistantMessage(candidate, planText);
  assert.equal(result.ok, false);
});

test("policy rejects low overlap output", () => {
  const candidate = {
    ...baseMessage,
    reflection: "Completely unrelated content with many different tokens.",
  };
  const result = validateAssistantMessage(candidate, planText);
  assert.equal(result.ok, false);
});
