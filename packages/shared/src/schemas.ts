import { z } from "zod";

export const sentimentResultSchema = z.object({
  label: z.enum(["positive", "neutral", "negative"]),
  score: z.number(),
});

export const safetyResultSchema = z.object({
  crisis: z.boolean(),
  reason: z.string().nullable().optional(),
});

export const analyzeEntryRequestSchema = z.object({
  user_id: z.string().min(1),
  entry_id: z.string().min(1),
  text: z.string().min(1).max(10000),
  mood: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
});

export const extractedFactSchema = z.object({
  kind: z.enum(["person", "event"]),
  key: z.string().min(1).max(160),
  label: z.string().min(1).max(80),
  detail: z.string().max(80).nullable().optional(),
  event_date: z.string().nullable().optional(),
  seen_on: z.string().nullable().optional(),
});

export const analyzeEntryResponseSchema = z.object({
  sentiment: sentimentResultSchema,
  keyphrases: z.array(z.string()),
  embedding: z.array(z.number()),
  safety: safetyResultSchema,
  emotion: z.string().nullable().optional(),
  mood_suggestion: z.string().nullable().optional(),
  memories: z.array(extractedFactSchema).optional().default([]),
  degraded: z.array(z.string()).optional().default([]),
});

export const recomputeThemesRequestSchema = z.object({
  user_id: z.string().min(1),
  entries: z.array(
    z.object({
      entry_id: z.string().min(1),
      text: z.string().min(1),
      embedding: z.array(z.number()),
    })
  ),
});

export const themeMemberSchema = z.object({
  entry_id: z.string().min(1),
  score: z.number(),
  snippet: z.string(),
  reason: z.string(),
});

export const themeResultSchema = z.object({
  temp_theme_id: z.string().min(1),
  label: z.string(),
  keywords: z.array(z.string()),
  strength: z.number(),
  members: z.array(themeMemberSchema),
});

export const recomputeThemesResponseSchema = z.object({
  themes: z.array(themeResultSchema),
});

export const weeklyEntrySchema = z.object({
  entry_id: z.string().min(1),
  text: z.string().min(1),
  created_at: z.string(),
  mood: z.string().nullable().optional(),
  sentiment: sentimentResultSchema.optional(),
  keyphrases: z.array(z.string()),
});

export const weeklyReflectionRequestSchema = z.object({
  user_id: z.string().min(1),
  entries: z.array(weeklyEntrySchema),
  themes: z
    .array(
      z.object({
        label: z.string(),
        keywords: z.array(z.string()).optional(),
        strength: z.number().optional(),
      })
    )
    .optional(),
});

export const weeklySummaryBlockSchema = z.object({
  title: z.string(),
  text: z.string(),
  evidence: z.array(z.string()),
});

export const weeklyEvidenceCardSchema = z.object({
  entry_id: z.string(),
  snippet: z.string(),
  reason: z.string(),
});

export const weeklyReflectionResponseSchema = z.object({
  summary_blocks: z.array(weeklySummaryBlockSchema),
  evidence_cards: z.array(weeklyEvidenceCardSchema),
  prompts_next_week: z.array(z.string()),
  safety: safetyResultSchema,
});

export const generatePromptsRequestSchema = z.object({
  user_id: z.string().min(1),
  recent_entries: z
    .array(
      z.object({
        entry_id: z.string().min(1),
        text: z.string().min(1),
        created_at: z.string().optional(),
        mood: z.string().nullable().optional(),
      })
    )
    .optional(),
  similar_entries: z
    .array(
      z.object({
        entry_id: z.string().min(1),
        text: z.string().min(1),
        created_at: z.string().optional(),
        mood: z.string().nullable().optional(),
      })
    )
    .optional(),
  themes: z.array(z.string()).optional(),
  mood: z.string().nullable().optional(),
  time_budget: z.number().optional(),
});

export const generatePromptsResponseSchema = z.object({
  prompts: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      reason: z.string(),
      example: z.string().nullable().optional(),
      evidence: z.array(
        z.object({
          entry_id: z.string().nullable().optional(),
          snippet: z.string(),
          reason: z.string(),
        })
      ),
    })
  ),
  safety: safetyResultSchema,
});

export const chatTurnRequestSchema = z.object({
  user_id: z.string().min(1),
  session_id: z.string().min(1),
  selected_prompt: z.string().min(1),
  history: z.array(
    z.object({
      role: z.enum(["assistant", "user"]),
      content: z.string().min(1),
    })
  ),
  latest_user_message: z.string().min(1),
  time_budget: z.number(),
  mood: z.string().nullable().optional(),
  retrieved_entries: z
    .array(
      z.object({
        entry_id: z.string().min(1),
        text: z.string().min(1),
        created_at: z.string().optional(),
        mood: z.string().nullable().optional(),
        source: z.string().optional(),
      })
    )
    .optional(),
});

export const chatTurnResponseSchema = z.object({
  plan: z.object({
    validation: z.object({ text: z.string() }),
    reflection: z.object({ text: z.string() }),
    pattern_connection: z.object({
      text: z.string(),
      references: z.array(z.string()),
    }),
    gentle_nudge: z.object({ text: z.string() }),
    follow_up_question: z.object({ text: z.string() }),
    evidence_cards: z.array(
      z.object({
        entry_id: z.string().nullable().optional(),
        snippet: z.string(),
        reason: z.string(),
      })
    ),
    safety: safetyResultSchema,
    constraints: z.object({
      no_medical_claims: z.boolean(),
      no_diagnosis: z.boolean(),
      journaling_only: z.boolean(),
      no_advice: z.boolean(),
    }),
  }),
  assistant_message: z.object({
    validation: z.string(),
    reflection: z.string(),
    pattern_connection: z.string(),
    gentle_nudge: z.string(),
    follow_up_question: z.string(),
  }),
  safety: safetyResultSchema,
});

// --- v1 contracts consumed by the web API routes ----------------------------------------

export const embedResponseSchema = z.object({
  embedding: z.array(z.number()),
  degraded: z.array(z.string()).optional().default([]),
});

export const evidenceCardSchema = z.object({
  entry_id: z.string().nullable().optional(),
  snippet: z.string(),
  reason: z.string(),
});

export const chatTurnV1ResponseSchema = z.object({
  assistant_message: z.string(),
  follow_up_question: z.string(),
  evidence: z.array(evidenceCardSchema).optional().default([]),
  safety: safetyResultSchema,
  mode: z.enum(["deterministic", "enhanced"]).catch("deterministic"),
});

export const promptsV1ResponseSchema = z.object({
  prompts: generatePromptsResponseSchema.shape.prompts,
  safety: safetyResultSchema,
});

// --- request bodies accepted by the web API routes (user id always comes from auth) ------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

/**
 * Journal lock: the database holds only ciphertext, so the browser decrypts what a request needs and
 * sends it along. The server uses it for this one request and never stores or logs it.
 */
const lockedEntrySchema = z.object({
  entry_id: z.string().uuid(),
  text: z.string().max(12000),
  created_at: z.string().max(40).nullable().optional(),
  entry_date: isoDate.nullable().optional(),
  mood: z.string().max(40).nullable().optional(),
  embedding: z.array(z.number()).max(384).optional(),
  keyphrases: z.array(z.string().max(200)).max(40).optional(),
});

const lockedMemorySchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["person", "event"]),
  label: z.string().max(200),
  detail: z.string().max(200).nullable(),
  event_date: z.string().max(20).nullable(),
  mention_count: z.number().int(),
  last_seen: z.string().max(20).nullable(),
  followed_up_on: z.string().max(20).nullable(),
});

export type LockedEntry = z.infer<typeof lockedEntrySchema>;
export type LockedMemory = z.infer<typeof lockedMemorySchema>;

export const lockedPromptsContextSchema = z.object({
  /** Newest first. The first five are "recent"; similar entries are found among all of them. */
  entries: z.array(lockedEntrySchema).max(60),
  themes: z.array(z.string().max(200)).max(10),
  memories: z.array(lockedMemorySchema).max(40),
});

export const lockedChatContextSchema = z.object({
  selectedPrompt: z.string().max(1000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) })).max(12),
  entries: z.array(lockedEntrySchema).max(60),
  memories: z.array(lockedMemorySchema).max(40),
});

export const lockedAnalyzeContextSchema = z.object({
  text: z.string().min(1).max(100000),
});

export const lockedWeeklyContextSchema = z.object({
  entries: z
    .array(
      lockedEntrySchema.extend({
        sentiment: sentimentResultSchema.optional(),
      })
    )
    .max(100),
  themes: z
    .array(
      z.object({
        label: z.string().max(200),
        keywords: z.array(z.string().max(200)).max(40).optional(),
        strength: z.number().optional(),
        members: z
          .array(z.object({ entry_id: z.string(), snippet: z.string().max(400), reason: z.string().max(200) }))
          .max(5)
          .optional(),
      })
    )
    .max(10),
});

export const promptsBodySchema = z.object({
  mood: z.string().max(30).nullable().optional(),
  timeBudget: z.union([z.literal(3), z.literal(5), z.literal(7), z.literal(10)]).optional(),
  /** The person's local date, so follow-ups say "yesterday" by their calendar, not the server's. */
  today: isoDate.optional(),
  locked: lockedPromptsContextSchema.optional(),
});

export const chatTurnBodySchema = z.object({
  sessionId: z.string().uuid(),
  latestUserMessage: z.string().trim().min(1).max(4000),
  locked: lockedChatContextSchema.optional(),
});

export const analyzeBodySchema = z.object({
  entryId: z.string().uuid(),
  locked: lockedAnalyzeContextSchema.optional(),
});

export const weeklyBodySchema = z.object({
  weekStart: isoDate,
  weekEnd: isoDate,
  force: z.boolean().optional(),
  locked: lockedWeeklyContextSchema.optional(),
});

/** Journal lock: themes are recomputed from entries the browser decrypted. */
export const themesBodySchema = z.object({
  entries: z
    .array(
      z.object({
        entry_id: z.string().uuid(),
        text: z.string().min(1).max(1000),
        embedding: z.array(z.number()).length(384),
        keyphrases: z.array(z.string().max(200)).max(40),
      })
    )
    .min(1)
    .max(150),
});
