import hmac
import logging
import os
import threading
import uuid
from dataclasses import asdict
from typing import Dict

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, Request  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402

from .companion import build_prompts, build_reflection_plan, render_plan_to_message  # noqa: E402
from .models import (  # noqa: E402
    AnalyzeEntryRequest,
    AnalyzeEntryResponse,
    ChatTurnRequest,
    ChatTurnRequestV1,
    ChatTurnResponse,
    ChatTurnResponseV1,
    EmbedRequest,
    EmbedResponse,
    ExtractedData,
    GeneratePromptsRequest,
    GeneratePromptsResponse,
    PromptRationale,
    PromptsRequestV1,
    PromptsResponseV1,
    RecomputeThemesRequest,
    RecomputeThemesResponse,
    WeeklyReflectionRequest,
    WeeklyReflectionResponse,
)
from .openai_rewriter import llm_available, rewrite_plan  # noqa: E402
from .pipeline import (  # noqa: E402
    analyze_affect,
    embed_text,
    extract_keyphrases,
    models_status,
    warm_models,
)
from .safety import detect_crisis  # noqa: E402
from .themes import recompute_themes  # noqa: E402
from .weekly import build_weekly_reflection  # noqa: E402

logger = logging.getLogger("nlp-service")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

MAX_TEXT_LENGTH = int(os.getenv("MAX_TEXT_LENGTH", "400"))
MAX_ANALYZE_CHARS = int(os.getenv("MAX_ANALYZE_CHARS", "6000"))
MAX_ENTRIES_PER_REQUEST = int(os.getenv("MAX_ENTRIES_PER_REQUEST", "12"))
MAX_THEME_ENTRIES = int(os.getenv("MAX_THEME_ENTRIES", "200"))
INTERNAL_TOKEN = os.getenv("NLP_INTERNAL_TOKEN", "")

app = FastAPI(
    title="DearMe NLP Service",
    version="0.4.0",
    docs_url=None if INTERNAL_TOKEN else "/docs",
    redoc_url=None,
    openapi_url=None if INTERNAL_TOKEN else "/openapi.json",
)

cors_origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "").split(",") if origin.strip()]
if cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-Internal-Token"],
    )


@app.middleware("http")
async def require_internal_token(request: Request, call_next):
    """Only the web tier (which holds the shared secret) may call the analysis endpoints."""
    if INTERNAL_TOKEN and request.method == "POST":
        supplied = request.headers.get("x-internal-token", "")
        if not hmac.compare_digest(supplied.encode(), INTERNAL_TOKEN.encode()):
            return JSONResponse({"detail": "Unauthorized"}, status_code=401)
    return await call_next(request)


def _warm_in_background() -> None:
    warm_models()
    logger.info("models ready status=%s llm_available=%s", models_status(), llm_available())


@app.on_event("startup")
def start_model_warmup() -> None:
    # Load models off the startup path so uvicorn binds the port immediately (hosts such as
    # Render fail a deploy that doesn't open its port in time). A request that arrives
    # before warm-up finishes waits for the same one-time load instead of starting another.
    if not INTERNAL_TOKEN:
        logger.warning("NLP_INTERNAL_TOKEN is not set: POST endpoints are open to anyone.")
    threading.Thread(target=_warm_in_background, name="model-warmup", daemon=True).start()


@app.get("/health")
def health() -> Dict[str, object]:
    return {"status": "ok", "models": models_status()}


@app.get("/")
def root() -> Dict[str, str]:
    return {"status": "ok"}


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
    return min(10, max(3, value))


def _emotion_to_mood(emotion: str) -> str:
    mapping = {
        "sadness": "Sad",
        "anger": "Irritated",
        "fear": "Anxious",
        "joy": "Happy",
        "neutral": "Neutral",
        "surprise": "Focused",
        "disgust": "Stressed",
    }
    return mapping.get(emotion.lower(), "Neutral")


def _handle_prompts_v1(payload: PromptsRequestV1) -> PromptsResponseV1:
    combined_text = " ".join(entry.text for entry in payload.recent_entries + payload.similar_entries)
    safety = detect_crisis(combined_text)
    time_budget = _safe_time_budget(payload.time_budget_min)
    if safety.get("crisis"):
        return PromptsResponseV1(prompts=[], safety=safety)

    prompts = build_prompts(
        user_id=payload.user_id,
        recent_entries=_limit_entries(payload.recent_entries),
        similar_entries=_limit_entries(payload.similar_entries),
        themes=payload.themes,
        mood=payload.mood,
        time_budget=time_budget,
    )
    rationale = PromptRationale(themes_used=payload.themes[:3], mood_used=payload.mood, time_budget_used=time_budget)
    return PromptsResponseV1(prompts=prompts, rationale=rationale, safety=safety)


def _handle_chat_turn_v1(payload: ChatTurnRequestV1) -> ChatTurnResponseV1:
    request_id = uuid.uuid4().hex[:12]
    message = payload.user_message.strip()[:MAX_TEXT_LENGTH]
    safety = detect_crisis(message)
    allow_llm = bool(payload.enhanced_language)

    plan = build_reflection_plan(
        user_id=payload.user_id,
        user_name=payload.user_name,
        selected_prompt=payload.selected_prompt or "",
        latest_user_message=message,
        retrieved_entries=_limit_entries(_merge_entries(payload.retrieved_entries, payload.recent_entries)),
        time_budget=_safe_time_budget(payload.time_budget_min),
        mood=payload.mood,
        safety=safety,
        history=payload.history[-12:],
        allow_llm=allow_llm,
    )

    rendered = render_plan_to_message(plan)
    mode = "enhanced" if (plan.signals or {}).get("llm_cues") else "deterministic"
    if allow_llm and not plan.safety.crisis:
        rewritten = rewrite_plan(plan, plan.evidence_cards, plan.constraints, user_id=payload.user_id)
        if rewritten:
            rendered = rewritten
            mode = "enhanced"

    signals = plan.signals or {}
    sentiment = signals.get("sentiment") or {"label": "neutral", "score": 0.0}
    keyphrases = signals.get("keyphrases") or []
    emotion = signals.get("emotion")

    logger.info(
        "chat_turn request_id=%s user_id=%s msg_len=%s mode=%s crisis=%s",
        request_id,
        payload.user_id,
        len(message),
        mode,
        plan.safety.crisis,
    )

    return ChatTurnResponseV1(
        assistant_message=" ".join(
            [rendered.validation, rendered.reflection, rendered.pattern_connection, rendered.gentle_nudge]
        ).strip(),
        follow_up_question=rendered.follow_up_question,
        extracted=ExtractedData(
            sentiment=sentiment,
            emotions=[emotion] if emotion else [],
            themes=keyphrases[:3],
            keyphrases=keyphrases,
        ),
        evidence=plan.evidence_cards,
        safety=plan.safety,
        mode=mode,
    )


@app.post("/v1/embed", response_model=EmbedResponse)
def embed(payload: EmbedRequest) -> EmbedResponse:
    embedding = embed_text(payload.text[:MAX_ANALYZE_CHARS])
    if embedding is None:
        return EmbedResponse(embedding=[], degraded=["embedding_unavailable"])
    return EmbedResponse(embedding=embedding)


@app.post("/analyze-entry", response_model=AnalyzeEntryResponse)
def analyze_entry(payload: AnalyzeEntryRequest) -> AnalyzeEntryResponse:
    text = payload.text[:MAX_ANALYZE_CHARS]
    logger.info("analyze_entry user_id=%s entry_id=%s text_len=%s", payload.user_id, payload.entry_id, len(payload.text))

    affect = analyze_affect(text)
    embedding = embed_text(text)
    degraded = list(affect.degraded)
    if embedding is None:
        degraded.append("embedding_unavailable")

    return AnalyzeEntryResponse(
        sentiment={"label": affect.sentiment_label, "score": affect.sentiment_score},
        keyphrases=extract_keyphrases(text),
        embedding=embedding or [],
        safety=detect_crisis(payload.text),
        emotion=affect.emotion,
        mood_suggestion=_emotion_to_mood(affect.emotion) if affect.emotion_confidence >= 0.4 else None,
        degraded=degraded,
    )


@app.post("/recompute-themes", response_model=RecomputeThemesResponse)
def recompute_themes_handler(payload: RecomputeThemesRequest) -> RecomputeThemesResponse:
    entries = payload.entries[:MAX_THEME_ENTRIES]
    logger.info("recompute_themes user_id=%s entries=%s", payload.user_id, len(entries))
    themes = recompute_themes([entry.model_dump() for entry in entries])
    # recompute_themes returns dataclasses; pydantic v2 only accepts dicts or its own models.
    return RecomputeThemesResponse(themes=[asdict(theme) for theme in themes])


@app.post("/weekly-reflection", response_model=WeeklyReflectionResponse)
def weekly_reflection(payload: WeeklyReflectionRequest) -> WeeklyReflectionResponse:
    logger.info("weekly_reflection user_id=%s entries=%s", payload.user_id, len(payload.entries))
    if not payload.entries:
        return WeeklyReflectionResponse(
            summary_blocks=[], evidence_cards=[], prompts_next_week=[], safety={"crisis": False, "reason": None}
        )
    safety = detect_crisis(" ".join(entry.text for entry in payload.entries))
    reflection = build_weekly_reflection([entry.model_dump() for entry in payload.entries], payload.themes or [], safety)
    return WeeklyReflectionResponse(**reflection)


@app.post("/generate-prompts", response_model=GeneratePromptsResponse)
def generate_prompts_handler(payload: GeneratePromptsRequest) -> GeneratePromptsResponse:
    """Legacy contract; kept for compatibility with older web builds."""
    combined_text = " ".join(entry.text for entry in payload.recent_entries + payload.similar_entries)
    safety = detect_crisis(combined_text)
    if safety.get("crisis"):
        return GeneratePromptsResponse(prompts=[], safety=safety)
    prompts = build_prompts(
        user_id=payload.user_id,
        recent_entries=_limit_entries(payload.recent_entries),
        similar_entries=_limit_entries(payload.similar_entries),
        themes=payload.themes,
        mood=payload.mood,
        time_budget=_safe_time_budget(payload.time_budget),
    )
    return GeneratePromptsResponse(prompts=prompts, safety=safety)


@app.post("/chat-turn", response_model=ChatTurnResponse)
def chat_turn(payload: ChatTurnRequest) -> ChatTurnResponse:
    """Legacy contract; kept for compatibility with older web builds."""
    message = payload.latest_user_message.strip()[:MAX_TEXT_LENGTH]
    safety = detect_crisis(message)
    plan = build_reflection_plan(
        user_id=payload.user_id,
        user_name=payload.user_name,
        selected_prompt=payload.selected_prompt,
        latest_user_message=message,
        retrieved_entries=_limit_entries(payload.retrieved_entries),
        time_budget=_safe_time_budget(payload.time_budget),
        mood=payload.mood,
        safety=safety,
        history=payload.history[-12:],
    )
    return ChatTurnResponse(plan=plan, assistant_message=render_plan_to_message(plan), safety=plan.safety)


@app.post("/v1/prompts", response_model=PromptsResponseV1)
def prompts_v1(payload: PromptsRequestV1) -> PromptsResponseV1:
    logger.info("prompts_v1 user_id=%s recent=%s similar=%s", payload.user_id, len(payload.recent_entries), len(payload.similar_entries))
    return _handle_prompts_v1(payload)


@app.post("/v1/chat/turn", response_model=ChatTurnResponseV1)
def chat_turn_v1(payload: ChatTurnRequestV1) -> ChatTurnResponseV1:
    return _handle_chat_turn_v1(payload)
