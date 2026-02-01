export type SentimentLabel = "positive" | "neutral" | "negative";

export interface SentimentResult {
  label: SentimentLabel;
  score: number;
}

export interface SafetyResult {
  crisis: boolean;
  reason?: string | null;
}

export interface AnalyzeEntryRequest {
  user_id: string;
  entry_id: string;
  text: string;
  mood?: string | null;
  created_at?: string | null;
}

export interface AnalyzeEntryResponse {
  sentiment: SentimentResult;
  keyphrases: string[];
  embedding: number[];
  safety: SafetyResult;
}

export interface RecomputeThemesRequest {
  user_id: string;
  entries: Array<{ entry_id: string; text: string; embedding: number[] }>;
}

export interface ThemeMember {
  entry_id: string;
  score: number;
  snippet: string;
  reason: string;
}

export interface ThemeResult {
  temp_theme_id: string;
  label: string;
  keywords: string[];
  strength: number;
  members: ThemeMember[];
}

export interface RecomputeThemesResponse {
  themes: ThemeResult[];
}

export interface WeeklyEntry {
  entry_id: string;
  text: string;
  created_at: string;
  mood?: string | null;
  sentiment?: SentimentResult;
  keyphrases: string[];
}

export interface WeeklyReflectionRequest {
  user_id: string;
  entries: WeeklyEntry[];
  themes?: Array<{ label: string; keywords?: string[]; strength?: number }>;
}

export interface WeeklySummaryBlock {
  title: string;
  text: string;
  evidence: string[];
}

export interface WeeklyEvidenceCard {
  entry_id: string;
  snippet: string;
  reason: string;
}

export interface WeeklyReflectionResponse {
  summary_blocks: WeeklySummaryBlock[];
  evidence_cards: WeeklyEvidenceCard[];
  prompts_next_week: string[];
  safety: SafetyResult;
}

export interface GeneratePromptsRequest {
  user_id: string;
  themes: string[];
  sentiment_avg: number;
  last_mood?: string | null;
}

export interface GeneratePromptsResponse {
  prompts: string[];
}
