"""Optional LLM wording layer.

The deterministic planner decides *what* to say; the LLM may only re-word it.
Every call here is gated on (1) the user's explicit consent, passed per request,
(2) the server flag ENABLE_ENHANCED_LANGUAGE, (3) an API key, and (4) daily budgets.
Any failure returns None and the caller keeps the deterministic text.
"""
from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
from typing import Dict, List, Optional

try:
    from openai import OpenAI
except Exception:  # pragma: no cover - optional dependency
    OpenAI = None

from .models import EvidenceCard, PlanConstraints, ReflectionPlan, RenderedMessage

logger = logging.getLogger("nlp-service")

DISALLOWED_PATTERNS = [
    re.compile(r"\bdiagnos(e|is|ed)\b", re.IGNORECASE),
    re.compile(r"\bmedical advice\b", re.IGNORECASE),
    re.compile(r"\btherapy\b", re.IGNORECASE),
    re.compile(r"\bmedication\b", re.IGNORECASE),
    re.compile(r"\bprescrib(e|ing|ed)\b", re.IGNORECASE),
    re.compile(r"\bpsychiatrist\b", re.IGNORECASE),
    re.compile(r"\bdisorder\b", re.IGNORECASE),
    re.compile(r"\byou should\b", re.IGNORECASE),
    re.compile(r"\byou must\b", re.IGNORECASE),
]

STOPWORDS = {
    "the", "and", "a", "an", "to", "of", "in", "on", "for", "with", "that", "this", "is", "it",
    "are", "was", "were", "be", "as", "at", "by", "or", "from", "you", "your", "we", "our",
    "they", "their",
}

REWRITE_SCHEMA = {
    "type": "object",
    "properties": {
        "validation": {"type": "string"},
        "reflection": {"type": "string"},
        "pattern_connection": {"type": "string"},
        "gentle_nudge": {"type": "string"},
        "follow_up_question": {"type": "string"},
    },
    "required": ["validation", "reflection", "pattern_connection", "gentle_nudge", "follow_up_question"],
    "additionalProperties": False,
}

CUES_SCHEMA = {
    "type": "object",
    "properties": {"cues": {"type": "array", "items": {"type": "string"}}},
    "required": ["cues"],
    "additionalProperties": False,
}

_client = None
_client_lock = threading.Lock()
_budget_lock = threading.Lock()
_budget_day = ""
_budget_counts: Dict[str, int] = {}


def _flag(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"true", "1", "yes"}


def llm_available() -> bool:
    return OpenAI is not None and _flag("ENABLE_ENHANCED_LANGUAGE", False) and bool(os.getenv("OPENAI_API_KEY"))


def _get_client():
    global _client
    if not llm_available():
        return None
    with _client_lock:
        if _client is None:
            _client = OpenAI(
                api_key=os.getenv("OPENAI_API_KEY"),
                timeout=float(os.getenv("OPENAI_TIMEOUT_S", "8")),
                max_retries=1,
            )
        return _client


def _consume_budget(user_id: str) -> bool:
    """In-memory daily caps (per user and global). Resets at UTC midnight or on restart."""
    global _budget_day, _budget_counts
    per_user = int(os.getenv("OPENAI_DAILY_LIMIT_PER_USER", "80"))
    global_cap = int(os.getenv("OPENAI_DAILY_LIMIT", "3000"))
    today = time.strftime("%Y-%m-%d", time.gmtime())
    with _budget_lock:
        if today != _budget_day:
            _budget_day, _budget_counts = today, {}
        if _budget_counts.get("__all__", 0) >= global_cap or _budget_counts.get(user_id, 0) >= per_user:
            return False
        _budget_counts["__all__"] = _budget_counts.get("__all__", 0) + 1
        _budget_counts[user_id] = _budget_counts.get(user_id, 0) + 1
        return True


def _extract_json(text: str) -> Optional[dict]:
    text = (text or "").strip()
    if text.startswith("{"):
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None


def _chat_json(system_prompt: str, user_prompt: str, schema_name: str, schema: dict, max_tokens: int) -> Optional[dict]:
    client = _get_client()
    if client is None:
        return None
    try:
        response = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            temperature=float(os.getenv("OPENAI_TEMPERATURE", "0.2")),
            max_tokens=max_tokens,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {"name": schema_name, "strict": True, "schema": schema},
            },
        )
    except Exception as exc:
        logger.info("openai_call_failed name=%s reason=%s", schema_name, type(exc).__name__)
        return None

    try:
        message = response.choices[0].message
    except (AttributeError, IndexError):
        return None
    if getattr(message, "refusal", None):
        logger.info("openai_call_refused name=%s", schema_name)
        return None
    return _extract_json(message.content or "")


def _tokenize(text: str) -> List[str]:
    return [token for token in re.findall(r"[a-zA-Z']+", text.lower()) if token not in STOPWORDS]


def _passes_overlap_check(plan_text: str, rewrite_text: str) -> bool:
    plan_tokens = set(_tokenize(plan_text))
    rewrite_tokens = _tokenize(rewrite_text)
    if not rewrite_tokens:
        return False
    overlap = sum(1 for token in rewrite_tokens if token in plan_tokens)
    return overlap / max(1, len(rewrite_tokens)) >= 0.35


def _passes_policy_checks(text: str) -> bool:
    return not any(pattern.search(text) for pattern in DISALLOWED_PATTERNS)


def rewrite_plan(
    plan: ReflectionPlan,
    evidence_cards: List[EvidenceCard],
    constraints: PlanConstraints,
    user_id: str = "anonymous",
) -> Optional[RenderedMessage]:
    """Re-word a deterministic plan. Caller must only invoke this with user consent."""
    if not llm_available() or not _consume_budget(user_id):
        return None

    plan_payload = {
        "validation": plan.validation.text,
        "reflection": plan.reflection.text,
        "pattern_connection": plan.pattern_connection.text,
        "gentle_nudge": plan.gentle_nudge.text,
        "follow_up_question": plan.follow_up_question.text,
    }
    evidence_payload = [{"snippet": card.snippet, "reason": card.reason} for card in evidence_cards]

    system_prompt = (
        "You polish the wording of a journaling companion's reply. "
        "Keep every section's meaning identical. Do not add facts, advice, diagnoses, "
        "or anything not present in the plan or evidence. Warm, plain, non-judgmental language. "
        "Each section is one or two short sentences. The follow_up_question must stay a single question."
    )
    user_prompt = json.dumps(
        {"plan": plan_payload, "constraints": constraints.model_dump(), "evidence": evidence_payload}
    )

    payload = _chat_json(
        system_prompt, user_prompt, "companion_reply", REWRITE_SCHEMA, int(os.getenv("OPENAI_MAX_TOKENS", "220"))
    )
    if not payload:
        return None

    try:
        rendered = RenderedMessage(**payload)
    except Exception:
        logger.info("enhanced_language_rewrite_failed reason=schema_validation")
        return None

    combined_text = " ".join(
        [rendered.validation, rendered.reflection, rendered.pattern_connection, rendered.gentle_nudge, rendered.follow_up_question]
    ).strip()
    if not _passes_policy_checks(combined_text):
        logger.info("enhanced_language_rewrite_failed reason=policy_violation")
        return None

    plan_text = " ".join(plan_payload.values())
    evidence_text = " ".join(card.snippet for card in evidence_cards)
    if not _passes_overlap_check(f"{plan_text} {evidence_text}", combined_text):
        logger.info("enhanced_language_rewrite_failed reason=overlap_check")
        return None

    return rendered


def generate_journal_cues(
    message: str,
    mood: Optional[str],
    time_budget: int,
    keyphrases: List[str],
    evidence_cards: List[EvidenceCard],
    allow_llm: bool = False,
    user_id: str = "anonymous",
) -> Optional[str]:
    """Short, personalised writing cues. Only with user consent (allow_llm)."""
    if not allow_llm or not _flag("ENABLE_OPENAI_CUES", True):
        return None
    if not llm_available() or not _consume_budget(user_id):
        return None

    cue_count = 3 if time_budget <= 5 else 4
    system_prompt = (
        f"You write {cue_count} concise journaling cues that help the person keep writing about what they shared. "
        "Each cue is at most 12 words, supportive, non-judgmental, phrased as an invitation to write. "
        "No advice, no diagnosis, no medical language."
    )
    user_prompt = json.dumps(
        {
            "message": " ".join(message.split())[:400],
            "mood": mood,
            "keyphrases": keyphrases[:5],
            "related_past_snippets": [card.snippet for card in evidence_cards if card.snippet][:2],
        }
    )

    payload = _chat_json(system_prompt, user_prompt, "journal_cues", CUES_SCHEMA, 160)
    cues = payload.get("cues") if payload else None
    if not isinstance(cues, list):
        return None

    cleaned = []
    for cue in cues[:cue_count]:
        if not isinstance(cue, str):
            continue
        text = " ".join(cue.split()).strip()
        if text and len(text.split()) <= 12 and _passes_policy_checks(text):
            cleaned.append(text)

    if len(cleaned) < 2:
        logger.info("openai_cues_failed reason=too_few_cues")
        return None

    numbered = " ".join(f"{idx + 1}) {cue}" for idx, cue in enumerate(cleaned))
    return f"Journal cues: {numbered}"
