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
  recent_entries?: Array<{ entry_id: string; text: string; created_at?: string; mood?: string | null }>;
  similar_entries?: Array<{ entry_id: string; text: string; created_at?: string; mood?: string | null }>;
  themes?: string[];
  mood?: string | null;
  time_budget?: number;
}

export interface GeneratePromptsResponse {
  prompts: Array<{
    id: string;
    text: string;
    reason: string;
    evidence: Array<{ entry_id?: string | null; snippet: string; reason: string }>;
  }>;
  safety: SafetyResult;
}

export interface ChatTurnRequest {
  user_id: string;
  session_id: string;
  selected_prompt: string;
  history: Array<{ role: "assistant" | "user"; content: string }>;
  latest_user_message: string;
  time_budget: number;
  mood?: string | null;
  retrieved_entries?: Array<{
    entry_id: string;
    text: string;
    created_at?: string;
    mood?: string | null;
    source?: string;
  }>;
}

export interface EvidenceCard {
  entry_id?: string | null;
  snippet: string;
  reason: string;
}

export interface ReflectionPlan {
  validation: { text: string };
  reflection: { text: string };
  pattern_connection: { text: string; references: string[] };
  gentle_nudge: { text: string };
  follow_up_question: { text: string };
  evidence_cards: EvidenceCard[];
  safety: SafetyResult;
  constraints: {
    no_medical_claims: boolean;
    no_diagnosis: boolean;
    journaling_only: boolean;
    no_advice: boolean;
  };
}

export interface AssistantMessage {
  validation: string;
  reflection: string;
  pattern_connection: string;
  gentle_nudge: string;
  follow_up_question: string;
}

export interface ChatTurnResponse {
  plan: ReflectionPlan;
  assistant_message: AssistantMessage;
  safety: SafetyResult;
}
