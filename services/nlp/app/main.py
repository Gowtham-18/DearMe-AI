import logging
import os
from typing import Dict

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .models import (
    AnalyzeEntryRequest,
    AnalyzeEntryResponse,
    ChatTurnRequest,
    ChatTurnResponse,
    GeneratePromptsRequest,
    GeneratePromptsResponse,
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
    get_emotion_pipeline,
)
from .companion import build_prompts, build_reflection_plan, render_plan_to_message
from .safety import detect_crisis
from .themes import recompute_themes
from .weekly import build_weekly_reflection

load_dotenv()

logger = logging.getLogger("nlp-service")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

app = FastAPI(title="DearMe NLP Service", version="0.2.0")

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
