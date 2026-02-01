from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class SentimentResult(BaseModel):
    label: str
    score: float


class SafetyResult(BaseModel):
    crisis: bool
    reason: Optional[str] = None


class AnalyzeEntryRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    entry_id: str = Field(..., min_length=1)
    text: str = Field(..., min_length=1, max_length=10000)
    mood: Optional[str] = None
    created_at: Optional[str] = None


class AnalyzeEntryResponse(BaseModel):
    sentiment: SentimentResult
    keyphrases: List[str]
    embedding: List[float]
    safety: SafetyResult


class ThemeMember(BaseModel):
    entry_id: str
    score: float
    snippet: str
    reason: str


class ThemeResult(BaseModel):
    temp_theme_id: str
    label: str
    keywords: List[str]
    strength: float
    members: List[ThemeMember]


class ThemeEntry(BaseModel):
    entry_id: str
    text: str
    embedding: List[float]


class RecomputeThemesRequest(BaseModel):
    user_id: str
    entries: List[ThemeEntry]


class RecomputeThemesResponse(BaseModel):
    themes: List[ThemeResult]


class WeeklyEntry(BaseModel):
    entry_id: str
    text: str
    created_at: str
    mood: Optional[str] = None
    sentiment: Optional[SentimentResult] = None
    keyphrases: List[str] = []


class WeeklyReflectionRequest(BaseModel):
    user_id: str
    entries: List[WeeklyEntry]
    themes: Optional[List[dict]] = None


class WeeklySummaryBlock(BaseModel):
    title: str
    text: str
    evidence: List[str]


class WeeklyEvidenceCard(BaseModel):
    entry_id: str
    snippet: str
    reason: str


class WeeklyReflectionResponse(BaseModel):
    summary_blocks: List[WeeklySummaryBlock]
    evidence_cards: List[WeeklyEvidenceCard]
    prompts_next_week: List[str]
    safety: SafetyResult


class GeneratePromptsRequest(BaseModel):
    user_id: str
    themes: List[str] = []
    sentiment_avg: float = 0.0
    last_mood: Optional[str] = None


class GeneratePromptsResponse(BaseModel):
    prompts: List[str]
