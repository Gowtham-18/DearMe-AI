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
