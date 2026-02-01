import { z } from "zod";

export const analyzeEntryRequestSchema = z.object({
  userId: z.string().min(1),
  text: z.string().min(1).max(10000)
});

export const analyzeEntryResponseSchema = z.object({
  sentiment: z.enum(["positive", "neutral", "negative"]),
  themes: z.array(z.string()),
  confidence: z.number().min(0).max(1)
});
