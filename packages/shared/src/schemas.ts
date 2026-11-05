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

export const analyzeEntryResponseSchema = z.object({
  sentiment: sentimentResultSchema,
  keyphrases: z.array(z.string()),
  embedding: z.array(z.number()),
  safety: safetyResultSchema,
  emotion: z.string().nullable().optional(),
  mood_suggestion: z.string().nullable().optional(),
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

export const promptsBodySchema = z.object({
  mood: z.string().max(30).nullable().optional(),
  timeBudget: z.union([z.literal(3), z.literal(5), z.literal(7), z.literal(10)]).optional(),
  /** The person's local date, so follow-ups say "yesterday" by their calendar, not the server's. */
  today: isoDate.optional(),
});

export const chatTurnBodySchema = z.object({
  sessionId: z.string().uuid(),
  latestUserMessage: z.string().trim().min(1).max(4000),
});

export const analyzeBodySchema = z.object({
  entryId: z.string().uuid(),
});

export const weeklyBodySchema = z.object({
  weekStart: isoDate,
  weekEnd: isoDate,
  force: z.boolean().optional(),
});
