from __future__ import annotations

import json
import logging
import os
import re
from typing import List, Optional

try:
    from openai import OpenAI
except Exception:  # pragma: no cover - optional dependency
    OpenAI = None

from .models import EvidenceCard, PlanConstraints, ReflectionPlan, RenderedMessage

logger = logging.getLogger("nlp-service")

DISALLOWED_PATTERNS = [
    re.compile(r"\bdiagnos(e|is)\b", re.IGNORECASE),
    re.compile(r"\bmedical advice\b", re.IGNORECASE),
    re.compile(r"\btherapy\b", re.IGNORECASE),
    re.compile(r"\bmedication\b", re.IGNORECASE),
    re.compile(r"\bprescrib(e|ing)\b", re.IGNORECASE),
    re.compile(r"\bpsychiatrist\b", re.IGNORECASE),
    re.compile(r"\byou should\b", re.IGNORECASE),
    re.compile(r"\byou must\b", re.IGNORECASE),
]

STOPWORDS = {
    "the",
    "and",
    "a",
    "an",
    "to",
    "of",
    "in",
    "on",
    "for",
    "with",
    "that",
    "this",
    "is",
    "it",
    "are",
    "was",
    "were",
    "be",
    "as",
    "at",
    "by",
    "or",
    "from",
    "you",
    "your",
    "we",
    "our",
    "they",
    "their",
}


def _extract_json(text: str) -> Optional[dict]:
    text = text.strip()
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


def _tokenize(text: str) -> List[str]:
    return [token for token in re.findall(r"[a-zA-Z']+", text.lower()) if token not in STOPWORDS]


def _passes_overlap_check(plan_text: str, rewrite_text: str) -> bool:
    plan_tokens = set(_tokenize(plan_text))
    rewrite_tokens = _tokenize(rewrite_text)
    if not rewrite_tokens:
        return False
    overlap = sum(1 for token in rewrite_tokens if token in plan_tokens)
    ratio = overlap / max(1, len(rewrite_tokens))
    return ratio >= 0.35


def _passes_policy_checks(text: str) -> bool:
    for pattern in DISALLOWED_PATTERNS:
        if pattern.search(text):
            return False
    return True


def rewrite_plan(
    plan: ReflectionPlan,
    evidence_cards: List[EvidenceCard],
    constraints: PlanConstraints,
) -> Optional[RenderedMessage]:
    if OpenAI is None:
        return None

    if not os.getenv("ENABLE_ENHANCED_LANGUAGE", "false").lower() in {"true", "1", "yes"}:
        return None

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None

    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    temperature = float(os.getenv("OPENAI_TEMPERATURE", "0.2"))
    max_tokens = int(os.getenv("OPENAI_MAX_TOKENS", "180"))

    plan_payload = {
        "validation": plan.validation.text,
        "reflection": plan.reflection.text,
        "pattern_connection": plan.pattern_connection.text,
        "gentle_nudge": plan.gentle_nudge.text,
        "follow_up_question": plan.follow_up_question.text,
    }
    evidence_payload = [
        {"entry_id": card.entry_id, "snippet": card.snippet, "reason": card.reason}
        for card in evidence_cards
    ]

    system_prompt = (
        "You rewrite journaling companion responses. "
        "Keep meaning identical, do not add new facts or advice. "
        "Return JSON only with keys validation, reflection, pattern_connection, gentle_nudge, follow_up_question."
    )

    user_prompt = json.dumps(
        {
            "plan": plan_payload,
            "constraints": constraints.model_dump(),
            "evidence": evidence_payload,
            "style": {
                "tone": "supportive, non-judgmental, journaling companion",
                "no_medical": True,
                "no_diagnosis": True,
                "no_advice": True,
            },
        }
    )

    try:
        client = OpenAI(api_key=api_key)
        response = client.responses.create(
            model=model,
            temperature=temperature,
            max_output_tokens=max_tokens,
            input=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
    except Exception:
        logger.info("enhanced_language_rewrite_failed", extra={"reason": "openai_error"})
        return None

    output_text = getattr(response, "output_text", None) or ""
    payload = _extract_json(output_text)
    if not payload:
        logger.info("enhanced_language_rewrite_failed", extra={"reason": "invalid_json"})
        return None

    try:
        rendered = RenderedMessage(**payload)
    except Exception:
        logger.info("enhanced_language_rewrite_failed", extra={"reason": "schema_validation"})
        return None

    combined_text = " ".join(
        [rendered.validation, rendered.reflection, rendered.pattern_connection, rendered.gentle_nudge, rendered.follow_up_question]
    ).strip()

    if not _passes_policy_checks(combined_text):
        logger.info("enhanced_language_rewrite_failed", extra={"reason": "policy_violation"})
        return None

    plan_text = " ".join(
        [plan.validation.text, plan.reflection.text, plan.pattern_connection.text, plan.gentle_nudge.text, plan.follow_up_question.text]
    )

    evidence_text = " ".join(card.snippet for card in evidence_cards)
    if not _passes_overlap_check(f"{plan_text} {evidence_text}", combined_text):
        logger.info("enhanced_language_rewrite_failed", extra={"reason": "overlap_check"})
        return None

    return rendered