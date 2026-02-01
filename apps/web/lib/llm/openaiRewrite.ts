import { z } from "zod";

export const assistantMessageSchema = z.object({
  validation: z.string().min(1),
  reflection: z.string().min(1),
  pattern_connection: z.string().min(1),
  gentle_nudge: z.string().min(1),
  follow_up_question: z.string().min(1),
});

const rewriteResponseSchema = z.object({
  assistant_message: assistantMessageSchema,
});

export type AssistantMessage = z.infer<typeof assistantMessageSchema>;

export interface ReflectionPlan {
  validation: { text: string };
  reflection: { text: string };
  pattern_connection: { text: string; references: string[] };
  gentle_nudge: { text: string };
  follow_up_question: { text: string };
  evidence_cards: Array<{ entry_id?: string | null; snippet: string; reason: string }>;
  safety: { crisis: boolean; reason?: string | null };
  constraints: {
    no_medical_claims: boolean;
    no_diagnosis: boolean;
    journaling_only: boolean;
    no_advice: boolean;
  };
}

const disallowedPatterns: RegExp[] = [
  /\bdiagnos(e|is|tic)\b/i,
  /\bmedication\b/i,
  /\bprescrib(e|ed|ing)\b/i,
  /\bmedical advice\b/i,
  /\btherapy\b/i,
  /\btherapist\b/i,
  /\bclinician\b/i,
  /\bpsychiatr(is|y)\b/i,
  /\bself[-\s]?harm\b/i,
  /\bkill yourself\b/i,
  /\bsuicid(al|e)\b/i,
  /\byou should\b/i,
  /\byou must\b/i,
  /\byou need to\b/i,
  /\bi recommend\b/i,
];

const tokenize = (text: string) =>
  (text.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []).filter(Boolean);

export const validateAssistantMessage = (message: AssistantMessage, planText: string) => {
  const merged = [
    message.validation,
    message.reflection,
    message.pattern_connection,
    message.gentle_nudge,
    message.follow_up_question,
  ].join(" ");

  if (disallowedPatterns.some((pattern) => pattern.test(merged))) {
    return { ok: false, reason: "policy_blocked" };
  }

  const planTokens = new Set(tokenize(planText));
  const rewriteTokens = new Set(tokenize(merged));
  if (rewriteTokens.size === 0) {
    return { ok: false, reason: "empty_rewrite" };
  }
  const overlapCount = [...rewriteTokens].filter((token) => planTokens.has(token)).length;
  const overlapRatio = overlapCount / rewriteTokens.size;
  if (overlapRatio < 0.6) {
    return { ok: false, reason: "low_overlap" };
  }

  return { ok: true, reason: "ok" };
};

const buildPlanText = (plan: ReflectionPlan) =>
  [
    plan.validation.text,
    plan.reflection.text,
    plan.pattern_connection.text,
    plan.gentle_nudge.text,
    plan.follow_up_question.text,
    ...plan.evidence_cards.map((card) => card.snippet),
  ]
    .filter(Boolean)
    .join(" ");

const extractJsonPayload = (raw: unknown) => {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") {
    return raw;
  }
  return null;
};

export async function rewriteAssistantMessage({
  plan,
  assistantMessage,
}: {
  plan: ReflectionPlan;
  assistantMessage: AssistantMessage;
}): Promise<{ data: AssistantMessage | null; reason?: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { data: null, reason: "missing_key" };
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const maxTokens = Number(process.env.OPENAI_MAX_TOKENS ?? "240");
  const temperature = Number(process.env.OPENAI_TEMPERATURE ?? "0.2");

  const systemPrompt =
    "You rewrite journaling assistant responses for warmth and clarity. " +
    "Do not add facts, advice, or medical language. Keep the same meaning and constraints.";

  const userPrompt = JSON.stringify({
    instructions: [
      "Rewrite the assistant_message with a warmer tone.",
      "Keep meaning identical; do not add new topics or claims.",
      "Return strict JSON matching the schema.",
    ],
    constraints: plan.constraints,
    plan_sections: {
      validation: plan.validation.text,
      reflection: plan.reflection.text,
      pattern_connection: plan.pattern_connection.text,
      gentle_nudge: plan.gentle_nudge.text,
      follow_up_question: plan.follow_up_question.text,
    },
    assistant_message: assistantMessage,
  });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature,
      max_output_tokens: Number.isFinite(maxTokens) ? maxTokens : 240,
      instructions: systemPrompt,
      input: userPrompt,
      text: {
        format: {
          type: "json_schema",
          name: "rewrite_response",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              assistant_message: {
                type: "object",
                additionalProperties: false,
                properties: {
                  validation: { type: "string" },
                  reflection: { type: "string" },
                  pattern_connection: { type: "string" },
                  gentle_nudge: { type: "string" },
                  follow_up_question: { type: "string" },
                },
                required: [
                  "validation",
                  "reflection",
                  "pattern_connection",
                  "gentle_nudge",
                  "follow_up_question",
                ],
              },
            },
            required: ["assistant_message"],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    return { data: null, reason: "request_failed" };
  }

  const payload = await response.json();
  const raw =
    payload.output_text ??
    payload.output?.[0]?.content?.find((item: { type?: string }) => item.type === "output_text")
      ?.text ??
    payload.output?.[0]?.content?.find((item: { type?: string }) => item.type === "output_json")
      ?.json ??
    payload.output?.[0]?.content?.[0]?.text ??
    payload.output?.[0]?.content?.[0]?.json;

  const parsed = extractJsonPayload(raw);
  const validated = rewriteResponseSchema.safeParse(parsed);
  if (!validated.success) {
    return { data: null, reason: "schema_invalid" };
  }

  const planText = buildPlanText(plan);
  const policy = validateAssistantMessage(validated.data.assistant_message, planText);
  if (!policy.ok) {
    return { data: null, reason: policy.reason };
  }

  return { data: validated.data.assistant_message, reason: "ok" };
}
