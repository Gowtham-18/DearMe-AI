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


class ContextEntry(BaseModel):
    entry_id: str
    text: str
    created_at: Optional[str] = None
    mood: Optional[str] = None
    source: Optional[str] = None


class PromptEvidence(BaseModel):
    entry_id: Optional[str] = None
    snippet: str
    reason: str


class PromptItem(BaseModel):
    id: str
    text: str
    reason: str
    evidence: List[PromptEvidence] = []


class GeneratePromptsRequest(BaseModel):
    user_id: str
    recent_entries: List[ContextEntry] = []
    similar_entries: List[ContextEntry] = []
    themes: List[str] = []
    mood: Optional[str] = None
    time_budget: int = 5


class GeneratePromptsResponse(BaseModel):
    prompts: List[PromptItem]
    safety: SafetyResult


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatTurnRequest(BaseModel):
    user_id: str
    session_id: str
    selected_prompt: str
    history: List[ChatMessage] = []
    latest_user_message: str
    time_budget: int = 5
    mood: Optional[str] = None
    retrieved_entries: List[ContextEntry] = []


class ReflectionPayload(BaseModel):
    emotion: str
    themes: List[str]
    supportive_nudge: str


class AssistantEvidence(BaseModel):
    source: str
    entry_id: Optional[str] = None
    snippet: str
    reason: str


class AssistantTurn(BaseModel):
    message: str
    follow_up_question: Optional[str] = None
    reflection: ReflectionPayload
    evidence: List[AssistantEvidence] = []


class ChatTurnResponse(BaseModel):
    assistant: AssistantTurn
    safety: SafetyResult
