export type Sentiment = "positive" | "neutral" | "negative";

export interface AnalyzeEntryResponse {
  sentiment: Sentiment;
  themes: string[];
  confidence: number;
}

export interface AnalyzeEntryRequest {
  userId: string;
  text: string;
}
