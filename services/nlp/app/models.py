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


class PromptRationale(BaseModel):
    themes_used: List[str] = []
    mood_used: Optional[str] = None
    time_budget_used: int = 5


class PromptsRequestV1(BaseModel):
    user_id: str
    mood: Optional[str] = None
    time_budget_min: int = 5
    recent_entries: List[ContextEntry] = []
    similar_entries: List[ContextEntry] = []
    themes: List[str] = []


class PromptsResponseV1(BaseModel):
    prompts: List[PromptItem]
    rationale: Optional[PromptRationale] = None
    safety: SafetyResult

class PlanSection(BaseModel):
    text: str


class PatternConnection(BaseModel):
    text: str
    references: List[str] = Field(default_factory=list)


class PlanConstraints(BaseModel):
    no_medical_claims: bool = True
    no_diagnosis: bool = True
    journaling_only: bool = True
    no_advice: bool = True


class EvidenceCard(BaseModel):
    entry_id: Optional[str] = None
    snippet: str
    reason: str


class ReflectionPlan(BaseModel):
    validation: PlanSection
    reflection: PlanSection
    pattern_connection: PatternConnection
    gentle_nudge: PlanSection
    follow_up_question: PlanSection
    evidence_cards: List[EvidenceCard] = Field(default_factory=list)
    safety: SafetyResult
    constraints: PlanConstraints = Field(default_factory=PlanConstraints)


class RenderedMessage(BaseModel):
    validation: str
    reflection: str
    pattern_connection: str
    gentle_nudge: str
    follow_up_question: str


class ChatTurnResponse(BaseModel):
    plan: ReflectionPlan
    assistant_message: RenderedMessage
    safety: SafetyResult


class ExtractedData(BaseModel):
    sentiment: SentimentResult
    emotions: List[str] = []
    themes: List[str] = []
    keyphrases: List[str] = []


class ChatTurnRequestV1(BaseModel):
    user_id: str
    chat_id: str
    selected_prompt: Optional[str] = None
    user_message: str
    mood: Optional[str] = None
    time_budget_min: int = 5
    history: List[ChatMessage] = []
    recent_entries: List[ContextEntry] = []
    retrieved_entries: List[ContextEntry] = []
    enhanced_language: bool = False


class ChatTurnResponseV1(BaseModel):
    assistant_message: str
    follow_up_question: str
    extracted: ExtractedData
    evidence: List[EvidenceCard] = []
    safety: SafetyResult
    mode: str = "deterministic"
