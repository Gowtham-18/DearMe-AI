from __future__ import annotations

import hashlib
import random
from typing import List, Optional, Sequence

from .models import AssistantEvidence, AssistantTurn, ContextEntry, PromptEvidence, PromptItem, ReflectionPayload
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

    keyphrases: List[str] = []
    for entry in combined_entries:
        keyphrases.extend(extract_keyphrases(entry.text, top_n=3))

    topics = list(dict.fromkeys([*themes, *keyphrases]))[:4]
    if not topics:
        topics = ["your day", "what feels important"]

    tone = "brief" if time_budget <= 5 else "deeper"
    mood_hint = f"feeling {mood.lower()}" if mood else "right now"

    rng = _seeded_random(user_id + (mood or ""))
    templates = [
        "When {topic} shows up, what do you wish you could tell yourself?",
        "What moment from today connects with {topic}?",
        "With {minutes} minutes, what feels most important to name about {topic}?",
        "How did {topic} influence how you felt {mood_hint}?",
        "What helped you move through {topic}, even in a small way?",
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

    return prompts[:4]


def build_chat_turn(
    user_id: str,
    selected_prompt: str,
    latest_user_message: str,
    retrieved_entries: List[ContextEntry],
    time_budget: int,
    mood: Optional[str],
) -> AssistantTurn:
    emotion = get_emotion(latest_user_message)
    emotion_phrase = _emotion_phrase(emotion)
    keyphrases = extract_keyphrases(latest_user_message, top_n=3)
    topic = keyphrases[0] if keyphrases else "what matters most"

    base = f"That sounds {emotion_phrase}. Thank you for sharing."
    reflection = f"It seems {topic} is really present for you right now."
    if retrieved_entries:
        reflection += " You mentioned something similar before."

    if time_budget <= 5:
        message = f"{base} {reflection}"
    else:
        message = (
            f"{base} {reflection} "
            f"Even small details you notice can help you stay connected to {topic}."
        )

    follow_up = f"What feels most important to explore about {topic} next?"
    if mood:
        follow_up = f"How does this connect to feeling {mood.lower()} lately?"

    evidence = [
        AssistantEvidence(
            source="past_entry",
            entry_id=entry.entry_id,
            snippet=_snippet(entry.text),
            reason="Similar theme appeared in a previous entry.",
        )
        for entry in _pick_entries(retrieved_entries, 2)
    ]

    reflection_payload = ReflectionPayload(
        emotion=emotion,
        themes=keyphrases[:3],
        supportive_nudge="You’re doing the work by showing up with honesty.",
    )

    return AssistantTurn(
        message=message,
        follow_up_question=follow_up,
        reflection=reflection_payload,
        evidence=evidence,
    )
