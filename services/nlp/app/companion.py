from __future__ import annotations

import hashlib
import random
from typing import List, Optional, Sequence

from .models import (
    ChatMessage,
    ContextEntry,
    EvidenceCard,
    PatternConnection,
    PlanSection,
    PromptEvidence,
    PromptItem,
    ReflectionPlan,
    RenderedMessage,
)
from .pipeline import extract_keyphrases, get_emotion


def _seeded_random(seed_text: str) -> random.Random:
    seed = int(hashlib.sha256(seed_text.encode("utf-8")).hexdigest(), 16) % (2**32)
    return random.Random(seed)


def _snippet(text: str, limit: int = 140) -> str:
    cleaned = " ".join(text.split())
    if len(cleaned) <= limit:
        return cleaned
    return f"{cleaned[:limit].rstrip()}..."


def _pick_entries(entries: Sequence[ContextEntry], count: int = 2) -> List[ContextEntry]:
    return list(entries[:count])


def _emotion_phrase(emotion: str) -> str:
    mapping = {
        "sadness": "heavy",
        "anger": "frustrating",
        "fear": "anxious",
        "joy": "uplifting",
        "surprise": "unexpected",
        "neutral": "steady",
    }
    return mapping.get(emotion.lower(), "present")


def _starter_prompts(mood: Optional[str], time_budget: int) -> List[PromptItem]:
    mood_hint = f"while feeling {mood.lower()}" if mood else "today"
    base = [
        f"With {time_budget} minutes, what feels most important to name right now?",
        f"What moment from {mood_hint} stands out?",
        "What do you want to release before the day ends?",
        "What small win do you want to remember?",
    ]
    return [
        PromptItem(
            id=f"starter_{index + 1}",
            text=text,
            reason="Starter prompt to help you begin.",
            evidence=[],
        )
        for index, text in enumerate(base[:4])
    ]


def build_prompts(
    user_id: str,
    recent_entries: List[ContextEntry],
    similar_entries: List[ContextEntry],
    themes: List[str],
    mood: Optional[str],
    time_budget: int,
) -> List[PromptItem]:
    combined = {entry.entry_id: entry for entry in recent_entries + similar_entries}
    combined_entries = list(combined.values())

    if not combined_entries:
        return _starter_prompts(mood, time_budget)

    keyphrases: List[str] = []
    for entry in combined_entries:
        keyphrases.extend(extract_keyphrases(entry.text, top_n=3))

    topics = list(dict.fromkeys([*themes, *keyphrases]))[:6]
    if not topics:
        return _starter_prompts(mood, time_budget)

    tone = "brief" if time_budget <= 5 else "deeper"
    mood_hint = f"feeling {mood.lower()}" if mood else "right now"

    rng = _seeded_random(user_id + (mood or "") + str(time_budget))
    templates = [
        "When {topic} shows up, what do you wish you could tell yourself?",
        "What moment from today connects with {topic}?",
        "With {minutes} minutes, what feels most important to name about {topic}?",
        "How did {topic} influence how you felt {mood_hint}?",
        "What helped you move through {topic}, even in a small way?",
        "What do you want to remember about {topic} before the day ends?",
    ]

    rng.shuffle(templates)
    prompts: List[PromptItem] = []

    for index, topic in enumerate(topics):
        if len(prompts) >= 4:
            break
        template = templates[index % len(templates)]
        text = template.format(topic=topic, minutes=time_budget, mood_hint=mood_hint)
        reason = f"Based on recent patterns around {topic}."
        evidence_entries = _pick_entries(combined_entries, 2)
        evidence = [
            PromptEvidence(
                entry_id=entry.entry_id,
                snippet=_snippet(entry.text),
                reason="Related to a recent entry.",
            )
            for entry in evidence_entries
        ]
        prompts.append(
            PromptItem(
                id=f"prompt_{index + 1}",
                text=text,
                reason=reason if tone == "deeper" else "Grounded in your recent reflections.",
                evidence=evidence,
            )
        )

    if len(prompts) < 3:
        prompts.extend(_starter_prompts(mood, time_budget))

    return prompts[:4]


def build_reflection_plan(
    user_id: str,
    selected_prompt: str,
    latest_user_message: str,
    retrieved_entries: List[ContextEntry],
    time_budget: int,
    mood: Optional[str],
    safety: dict,
    history: Optional[List[ChatMessage]] = None,
) -> ReflectionPlan:
    if safety.get("crisis"):
        return ReflectionPlan(
            validation=PlanSection(
                text="I'm really sorry you're feeling this way. You deserve support."
            ),
            reflection=PlanSection(
                text="If you're in immediate danger, please contact your local emergency number."
            ),
            pattern_connection=PatternConnection(
                text="Reaching out to someone you trust can be a helpful next step.", references=[]
            ),
            gentle_nudge=PlanSection(text="You don't have to carry this alone."),
            follow_up_question=PlanSection(text="Are you safe right now?"),
            evidence_cards=[],
            safety=safety,
        )

    recent_history = [
        message.content
        for message in (history or [])
        if message.role == "user" and message.content.strip()
    ]
    context_text = " ".join(recent_history[-2:] + [latest_user_message])
    emotion = get_emotion(context_text)
    emotion_phrase = _emotion_phrase(emotion)
    keyphrases = extract_keyphrases(context_text, top_n=3)
    fallback_topic = selected_prompt.replace("?", "").strip() if selected_prompt else ""
    topic = keyphrases[0] if keyphrases else (fallback_topic or "what feels most important")
    mood_hint = f"while feeling {mood.lower()}" if mood else "right now"

    evidence_entries = _pick_entries(retrieved_entries, 2)
    evidence_cards = [
        EvidenceCard(
            entry_id=entry.entry_id,
            snippet=_snippet(entry.text),
            reason="Related to a past entry.",
        )
        for entry in evidence_entries
    ]
    reference_ids = [card.entry_id for card in evidence_cards if card.entry_id]

    if time_budget <= 5:
        validation_text = f"Thanks for sharing. That sounds {emotion_phrase}."
        reflection_text = f"It seems {topic} is really present for you {mood_hint}."
        pattern_text = (
            f"You've mentioned {topic} before."
            if evidence_cards
            else "It can help to notice what keeps returning."
        )
        nudge_text = f"If it helps, name one small detail about {topic}."
        question_text = "What feels most important to explore next?"
    else:
        validation_text = f"Thanks for sharing. That sounds {emotion_phrase}."
        reflection_text = (
            f"It seems {topic} is really present for you {mood_hint}. "
            "Small details can reveal what you need most."
        )
        pattern_text = (
            f"You've touched on {topic} before."
            if evidence_cards
            else "If a pattern is forming, it's okay to name it gently."
        )
        nudge_text = f"If it helps, notice what supported you around {topic}, even a little."
        question_text = f"What feels most important to explore about {topic} next?"

    return ReflectionPlan(
        validation=PlanSection(text=validation_text),
        reflection=PlanSection(text=reflection_text),
        pattern_connection=PatternConnection(text=pattern_text, references=reference_ids),
        gentle_nudge=PlanSection(text=nudge_text),
        follow_up_question=PlanSection(text=question_text),
        evidence_cards=evidence_cards,
        safety=safety,
    )


def render_plan_to_message(plan: ReflectionPlan) -> RenderedMessage:
    return RenderedMessage(
        validation=plan.validation.text,
        reflection=plan.reflection.text,
        pattern_connection=plan.pattern_connection.text,
        gentle_nudge=plan.gentle_nudge.text,
        follow_up_question=plan.follow_up_question.text,
    )