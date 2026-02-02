import logging
import os
import uuid
from typing import Dict

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .models import (
    AnalyzeEntryRequest,
    AnalyzeEntryResponse,
    ChatTurnRequest,
    ChatTurnResponse,
    ChatTurnRequestV1,
    ChatTurnResponseV1,
    ExtractedData,
    GeneratePromptsRequest,
    GeneratePromptsResponse,
    PromptsRequestV1,
    PromptsResponseV1,
    PromptRationale,
    RecomputeThemesRequest,
    RecomputeThemesResponse,
    WeeklyReflectionRequest,
    WeeklyReflectionResponse,
)
from .pipeline import (
    embed_text,
    extract_keyphrases,
    get_keybert,
    get_sentiment,
    get_sentiment_pipeline,
    get_embedding_model,
    get_emotion,
    get_emotion_pipeline,
)
from .companion import build_prompts, build_reflection_plan, render_plan_to_message
from .openai_rewriter import rewrite_plan
from .safety import detect_crisis
from .themes import recompute_themes
from .weekly import build_weekly_reflection

load_dotenv()

logger = logging.getLogger("nlp-service")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

MAX_TEXT_LENGTH = int(os.getenv("MAX_TEXT_LENGTH", "400"))
MAX_ENTRIES_PER_REQUEST = int(os.getenv("MAX_ENTRIES_PER_REQUEST", "12"))

app = FastAPI(title="DearMe NLP Service", version="0.3.0")

cors_origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "").split(",") if origin]
if cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.on_event("startup")
def warm_models() -> None:
    try:
        get_embedding_model()
        get_sentiment_pipeline()
        get_emotion_pipeline()
        get_keybert()
        logger.info("NLP models loaded")
    except Exception:
        logger.warning("NLP models failed to load, falling back where possible.")


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/")
def root() -> Dict[str, str]:
    return {"status": "ok", "docs": "/docs"}


def _merge_entries(*entry_lists):
    seen = set()
    merged = []
    for entries in entry_lists:
        for entry in entries:
            if entry.entry_id in seen:
                continue
            seen.add(entry.entry_id)
            merged.append(entry)
    return merged


def _limit_entries(entries):
    return entries[:MAX_ENTRIES_PER_REQUEST]


def _safe_time_budget(value: int) -> int:
    if value <= 3:
        return 3
    if value >= 10:
        return 10
    return value


def _handle_prompts_v1(payload: PromptsRequestV1) -> PromptsResponseV1:
    combined_text = " ".join(entry.text for entry in payload.recent_entries + payload.similar_entries)
    safety = detect_crisis(combined_text)
    if safety.get("crisis"):
        return PromptsResponseV1(prompts=[], safety=safety)

    time_budget = _safe_time_budget(payload.time_budget_min)
    prompts = build_prompts(
        user_id=payload.user_id,
        recent_entries=_limit_entries(payload.recent_entries),
        similar_entries=_limit_entries(payload.similar_entries),
        themes=payload.themes,
        mood=payload.mood,
        time_budget=time_budget,
    )

    rationale = PromptRationale(
        themes_used=payload.themes[:3],
        mood_used=payload.mood,
        time_budget_used=time_budget,
    )

    return PromptsResponseV1(prompts=prompts, rationale=rationale, safety=safety)


def _handle_chat_turn_v1(payload: ChatTurnRequestV1) -> ChatTurnResponseV1:
    request_id = uuid.uuid4().hex
    message = payload.user_message.strip()[:MAX_TEXT_LENGTH]
    safety = detect_crisis(message)

    merged_entries = _merge_entries(payload.retrieved_entries, payload.recent_entries)
    merged_entries = _limit_entries(merged_entries)

    plan = build_reflection_plan(
        user_id=payload.user_id,
        selected_prompt=payload.selected_prompt or "",
        latest_user_message=message,
        retrieved_entries=merged_entries,
        time_budget=_safe_time_budget(payload.time_budget_min),
        mood=payload.mood,
        safety=safety,
        history=payload.history,
    )

    rendered = render_plan_to_message(plan)
    mode = "deterministic"

    if payload.enhanced_language and not plan.safety.crisis:
        rewritten = rewrite_plan(plan, plan.evidence_cards, plan.constraints)
        if rewritten:
            rendered = rewritten
            mode = "enhanced"

    sentiment_label, sentiment_score = get_sentiment(message)
    emotion = get_emotion(message)
    keyphrases = extract_keyphrases(message, top_n=5)

    assistant_message = " ".join(
        [rendered.validation, rendered.reflection, rendered.pattern_connection, rendered.gentle_nudge]
    ).strip()

    logger.info(
        "chat_turn request_id=%s user_id=%s chat_id=%s msg_len=%s mode=%s",
        request_id,
        payload.user_id,
        payload.chat_id,
        len(message),
        mode,
    )

    return ChatTurnResponseV1(
        assistant_message=assistant_message,
        follow_up_question=rendered.follow_up_question,
        extracted=ExtractedData(
            sentiment={"label": sentiment_label, "score": sentiment_score},
            emotions=[emotion] if emotion else [],
            themes=keyphrases[:3],
            keyphrases=keyphrases,
        ),
        evidence=plan.evidence_cards,
        safety=plan.safety,
        mode=mode,
    )


@app.post("/analyze-entry", response_model=AnalyzeEntryResponse)
def analyze_entry(payload: AnalyzeEntryRequest) -> AnalyzeEntryResponse:
    logger.info(
        "analyze_entry user_id=%s entry_id=%s text_len=%s",
        payload.user_id,
        payload.entry_id,
        len(payload.text),
    )

    sentiment_label, sentiment_score = get_sentiment(payload.text)
    keyphrases = extract_keyphrases(payload.text)
    embedding = embed_text(payload.text)
    safety = detect_crisis(payload.text)

    return AnalyzeEntryResponse(
        sentiment={"label": sentiment_label, "score": sentiment_score},
        keyphrases=keyphrases,
        embedding=embedding,
        safety=safety,
    )


@app.post("/recompute-themes", response_model=RecomputeThemesResponse)
def recompute_themes_handler(payload: RecomputeThemesRequest) -> RecomputeThemesResponse:
    logger.info("recompute_themes user_id=%s entries=%s", payload.user_id, len(payload.entries))
    themes = recompute_themes([entry.model_dump() for entry in payload.entries])
    return RecomputeThemesResponse(themes=themes)


@app.post("/weekly-reflection", response_model=WeeklyReflectionResponse)
def weekly_reflection(payload: WeeklyReflectionRequest) -> WeeklyReflectionResponse:
    logger.info("weekly_reflection user_id=%s entries=%s", payload.user_id, len(payload.entries))
    if not payload.entries:
        return WeeklyReflectionResponse(
            summary_blocks=[],
            evidence_cards=[],
            prompts_next_week=[],
            safety={"crisis": False, "reason": None},
        )
    safety = detect_crisis(" ".join(entry.text for entry in payload.entries))
    reflection = build_weekly_reflection(
        [entry.model_dump() for entry in payload.entries],
        payload.themes or [],
        safety,
    )
    return WeeklyReflectionResponse(**reflection)


@app.post("/generate-prompts", response_model=GeneratePromptsResponse)
def generate_prompts_handler(payload: GeneratePromptsRequest) -> GeneratePromptsResponse:
    logger.info(
        "generate_prompts user_id=%s recent=%s similar=%s",
        payload.user_id,
        len(payload.recent_entries),
        len(payload.similar_entries),
    )
    combined_text = " ".join(entry.text for entry in payload.recent_entries + payload.similar_entries)
    safety = detect_crisis(combined_text)
    if safety.get("crisis"):
        return GeneratePromptsResponse(prompts=[], safety=safety)

    prompts = build_prompts(
        user_id=payload.user_id,
        recent_entries=payload.recent_entries,
        similar_entries=payload.similar_entries,
        themes=payload.themes,
        mood=payload.mood,
        time_budget=payload.time_budget,
    )
    return GeneratePromptsResponse(prompts=prompts, safety=safety)


@app.post("/chat-turn", response_model=ChatTurnResponse)
def chat_turn(payload: ChatTurnRequest) -> ChatTurnResponse:
    logger.info(
        "chat_turn user_id=%s session_id=%s msg_len=%s",
        payload.user_id,
        payload.session_id,
        len(payload.latest_user_message),
    )
    safety = detect_crisis(payload.latest_user_message)
    plan = build_reflection_plan(
        user_id=payload.user_id,
        selected_prompt=payload.selected_prompt,
        latest_user_message=payload.latest_user_message,
        retrieved_entries=payload.retrieved_entries,
        time_budget=payload.time_budget,
        mood=payload.mood,
        safety=safety,
    )
    assistant_message = render_plan_to_message(plan)
    return ChatTurnResponse(plan=plan, assistant_message=assistant_message, safety=safety)


@app.post("/v1/prompts", response_model=PromptsResponseV1)
def prompts_v1(payload: PromptsRequestV1) -> PromptsResponseV1:
    logger.info(
        "prompts_v1 user_id=%s recent=%s similar=%s",
        payload.user_id,
        len(payload.recent_entries),
        len(payload.similar_entries),
    )
    return _handle_prompts_v1(payload)


@app.post("/v1/chat/turn", response_model=ChatTurnResponseV1)
def chat_turn_v1(payload: ChatTurnRequestV1) -> ChatTurnResponseV1:
    return _handle_chat_turn_v1(payload)