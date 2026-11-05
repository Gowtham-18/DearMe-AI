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
from .openai_rewriter import generate_journal_cues

PROMPT_PACKS = {
    "gentle": [
        "If {topic} feels heavy, what would you want to say to yourself with kindness?",
        "What part of {topic} feels most tender right now?",
        "Where in your day did {topic} feel the strongest?",
        "What would feel like a small relief around {topic} today?",
        "If you could soften one edge of {topic}, what would you soften first?",
    ],
    "reflective": [
        "What moment today connects most with {topic}?",
        "How has {topic} been shaping your days lately?",
        "What did {topic} make you notice about yourself?",
        "When {topic} shows up, what do you wish you could remember?",
        "What feels most true about {topic} right now?",
    ],
    "encouraging": [
        "Where did you show quiet strength around {topic}?",
        "What small step did you take even with {topic} present?",
        "What helped you keep going through {topic}?",
        "What do you want to remember about how you handled {topic}?",
        "If you could offer yourself one encouraging line about {topic}, what would it be?",
    ],
    "grounding": [
        "What detail about {topic} stands out the most right now?",
        "Where did you feel {topic} in your body today?",
        "What would help you feel just 5% steadier about {topic}?",
        "What part of {topic} feels most clear to name?",
        "What’s one simple truth about {topic} you can write down?",
    ],
}


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


def _pick_entries_for_topic(entries: Sequence[ContextEntry], topic: str, count: int = 2) -> List[ContextEntry]:
    if not topic:
        return _pick_entries(entries, count)
    lowered = topic.lower()
    matching = [entry for entry in entries if lowered in entry.text.lower()]
    if matching:
        return matching[:count]
    return _pick_entries(entries, count)


def _clean_topic_from_prompt(prompt: str) -> str:
    cleaned = " ".join(prompt.replace("?", "").split()).strip()
    lowered = cleaned.lower()
    if lowered.startswith("with ") and "minutes" in lowered:
        cleaned = cleaned.split("minutes", 1)[-1].strip()
    for prefix in ["what feels most important", "what moment", "what do you want", "what small win"]:
        if cleaned.lower().startswith(prefix):
            cleaned = cleaned[len(prefix) :].strip()
    for prefix in ["to name", "to explore", "to focus on", "about", "briefly", "with a little detail"]:
        if cleaned.lower().startswith(prefix):
            cleaned = cleaned[len(prefix) :].strip()
    cleaned = cleaned.strip(",. ")
    if len(cleaned.split()) <= 2:
        return ""
    return cleaned


def _is_generic_topic(topic: str) -> bool:
    lowered = topic.lower().strip()
    return lowered in {"", "what feels most important", "right now", "today", "this", "to name"}


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


def _infer_feeling(text: str) -> Optional[str]:
    lowered = text.lower()
    cues = {
        "anxious": ["anxious", "anxiety", "nervous", "on edge", "worried"],
        "stressed": ["stressed", "stress", "pressure", "overwhelmed"],
        "sad": ["sad", "down", "low", "bad", "hurt"],
        "tired": ["tired", "exhausted", "drained", "burned out"],
        "angry": ["angry", "frustrated", "irritated", "mad"],
        "lonely": ["lonely", "alone", "isolated"],
        "hopeful": ["hopeful", "optimistic", "encouraged"],
        "calm": ["calm", "steady", "grounded"],
        "focused": ["focused", "clear", "intentional"],
    }
    for label, keywords in cues.items():
        if any(keyword in lowered for keyword in keywords):
            return label
    return None


def _is_off_topic(text: str) -> bool:
    lowered = text.lower()
    if lowered.startswith("how to") or lowered.startswith("what is"):
        return True
    keywords = [
        "weather",
        "stock",
        "crypto",
        "sports",
        "movie",
        "music",
        "recipe",
        "code",
        "programming",
        "bug",
        "error",
        "deploy",
        "vercel",
        "render",
        "supabase",
        "github",
        "sql",
    ]
    return any(keyword in lowered for keyword in keywords)


def _contains_abuse(text: str) -> bool:
    lowered = text.lower()
    abusive = ["fuck you", "bitch", "idiot", "stupid", "get the fuck out", "shut up"]
    return any(phrase in lowered for phrase in abusive)


def _contains_profanity(text: str) -> bool:
    lowered = text.lower()
    profanity = ["fuck", "fucking", "shit", "wtf", "damn"]
    return any(word in lowered for word in profanity)


def _short_reply_plan(text: str, mood_hint: str) -> Optional[ReflectionPlan]:
    lowered = text.strip().lower()
    if lowered in {"what", "what?", "huh", "?", "okay"}:
        return ReflectionPlan(
            validation=PlanSection(text="Thanks for checking in."),
            reflection=PlanSection(text="We can make this more specific."),
            pattern_connection=PatternConnection(text="You can answer in one line.", references=[]),
            gentle_nudge=PlanSection(text="Name one moment, one feeling, one need."),
            follow_up_question=PlanSection(text="What moment from today stands out the most?"),
            evidence_cards=[],
            safety={"crisis": False, "reason": None},
        )
    if not lowered:
        return ReflectionPlan(
            validation=PlanSection(text="I'm here when you're ready."),
            reflection=PlanSection(text="We can keep it simple."),
            pattern_connection=PatternConnection(text="No need to force it.", references=[]),
            gentle_nudge=PlanSection(text="One small detail is enough."),
            follow_up_question=PlanSection(text="What feels most present for you right now?"),
            evidence_cards=[],
            safety={"crisis": False, "reason": None},
        )
    if lowered in {"nothing", "idk", "i don't know", "meh"}:
        return ReflectionPlan(
            validation=PlanSection(text="Thanks for sharing."),
            reflection=PlanSection(text=f"It's okay if nothing stands out {mood_hint}."),
            pattern_connection=PatternConnection(text="We can keep it small.", references=[]),
            gentle_nudge=PlanSection(text="One tiny moment or sensation is enough."),
            follow_up_question=PlanSection(text="What is one small thing you noticed today?"),
            evidence_cards=[],
            safety={"crisis": False, "reason": None},
        )
    if lowered in {"wtf", "whatever"}:
        return ReflectionPlan(
            validation=PlanSection(text="That sounds jarring."),
            reflection=PlanSection(text="We can slow it down for a moment."),
            pattern_connection=PatternConnection(text="It's okay to name what hit hardest.", references=[]),
            gentle_nudge=PlanSection(text="A few words is enough."),
            follow_up_question=PlanSection(text="What set that off or felt most intense?"),
            evidence_cards=[],
            safety={"crisis": False, "reason": None},
        )
    return None


def _follow_up_for_feeling(feeling: Optional[str]) -> str:
    mapping = {
        "anxious": "Is there something specific that's making you feel on edge?",
        "stressed": "What's the biggest pressure you're carrying right now?",
        "sad": "What's been weighing on you the most today?",
        "tired": "What has been draining your energy lately?",
        "angry": "What felt most frustrating or unfair?",
        "lonely": "When did you feel most alone today?",
        "hopeful": "What helped that sense of hope show up?",
        "calm": "What supported that steadiness?",
        "focused": "What made it easier to stay focused?",
    }
    return mapping.get(feeling or "", "What feels most important to explore next?")


def _snippet_for_reflection(text: str, limit: int = 90) -> str:
    cleaned = " ".join(text.split())
    if len(cleaned) <= limit:
        return cleaned
    return f"{cleaned[:limit].rstrip()}..."


def _starter_prompts(mood: Optional[str], time_budget: int) -> List[PromptItem]:
    mood_hint = f"while feeling {mood.lower()}" if mood else "today"
    depth_hint = "briefly" if time_budget <= 5 else "with a little detail"
    base = [
        f"With {time_budget} minutes, what feels most important to name {depth_hint}?",
        f"What moment from {mood_hint} stands out, and what did it mean to you?",
        "What do you want to release or set down before the day ends?",
        "What small win do you want to remember, even if it felt ordinary?",
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

    recent_focus: List[str] = []
    for entry in recent_entries[:3]:
        recent_focus.extend(extract_keyphrases(entry.text, top_n=2))

    similar_focus: List[str] = []
    for entry in similar_entries[:3]:
        similar_focus.extend(extract_keyphrases(entry.text, top_n=1))

    topics = list(dict.fromkeys([*themes, *recent_focus, *similar_focus]))[:6]
    if not topics:
        return _starter_prompts(mood, time_budget)

    tone = "brief" if time_budget <= 5 else "deeper"
    mood_hint = f"feeling {mood.lower()}" if mood else "right now"

    rng = _seeded_random(user_id + (mood or "") + str(time_budget))

    if mood and mood.lower() in {"sad", "lonely", "stressed", "anxious", "overwhelmed", "irritated"}:
        pack = "gentle"
    elif mood and mood.lower() in {"happy", "hopeful", "grateful"}:
        pack = "encouraging"
    elif time_budget <= 5:
        pack = "grounding"
    else:
        pack = "reflective"

    templates = list(PROMPT_PACKS.get(pack, PROMPT_PACKS["reflective"]))
    templates.append("With {minutes} minutes, what feels most important to name about {topic}?")
    templates.append("How did {topic} influence how you felt {mood_hint}?")

    rng.shuffle(templates)
    prompts: List[PromptItem] = []

    if mood:
        prompts.append(
            PromptItem(
                id="prompt_mood",
                text=f"When you're feeling {mood.lower()}, what helps you feel a little steadier?",
                reason="Tailored to your current mood.",
                evidence=[
                    PromptEvidence(
                        entry_id=entry.entry_id,
                        snippet=_snippet(entry.text),
                        reason="Connected to a recent reflection.",
                    )
                    for entry in _pick_entries(combined_entries, 1)
                ],
            )
        )

    for index, topic in enumerate(topics):
        if len(prompts) >= 4:
            break
        template = templates[index % len(templates)]
        text = template.format(topic=topic, minutes=time_budget, mood_hint=mood_hint)
        reason = f"Based on recent patterns around {topic}."
        evidence_entries = _pick_entries_for_topic(combined_entries, topic, 2)
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
    user_name: Optional[str],
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

    if _is_off_topic(latest_user_message):
        return ReflectionPlan(
            validation=PlanSection(
                text=f"{user_name}, I'm here to support journaling and reflection."
                if user_name
                else "I'm here to support journaling and reflection."
            ),
            reflection=PlanSection(text="If you'd like, we can stay with how your day felt."),
            pattern_connection=PatternConnection(
                text="We can keep it grounded in your experience.", references=[]
            ),
            gentle_nudge=PlanSection(text="A few honest words is enough."),
            follow_up_question=PlanSection(text="What feels most important to name right now?"),
            evidence_cards=[],
            safety=safety,
        )

    if _contains_abuse(latest_user_message):
        return ReflectionPlan(
            validation=PlanSection(
                text="I want to keep this space respectful. I'm here if you want to keep journaling."
            ),
            reflection=PlanSection(text="We can pause or reset and come back to your experience."),
            pattern_connection=PatternConnection(text="No pressure to write more right now.", references=[]),
            gentle_nudge=PlanSection(text="If you'd like, name what set that off."),
            follow_up_question=PlanSection(text="Do you want to continue with your journal?"),
            evidence_cards=[],
            safety=safety,
        )

    if _contains_profanity(latest_user_message):
        return ReflectionPlan(
            validation=PlanSection(text="That sounds intense."),
            reflection=PlanSection(text="We can slow it down and stay with what you're feeling."),
            pattern_connection=PatternConnection(text="Sometimes strong language points to strong feelings.", references=[]),
            gentle_nudge=PlanSection(text="A few honest words is enough."),
            follow_up_question=PlanSection(text="What felt most intense about it?"),
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
    inferred_feeling = _infer_feeling(context_text)
    emotion_phrase = _emotion_phrase(emotion)
    keyphrases = extract_keyphrases(context_text, top_n=3)
    fallback_topic = _clean_topic_from_prompt(selected_prompt) if selected_prompt else ""
    topic = keyphrases[0] if keyphrases else (inferred_feeling or fallback_topic or "what feels most important")
    mood_hint = f"while feeling {mood.lower()}" if mood else "right now"
    name_prefix = f"{user_name}, " if user_name else ""
    reflection_snippet = _snippet_for_reflection(latest_user_message)
    short_message = len(latest_user_message.split()) <= 5
    generic_topic = _is_generic_topic(topic)

    short_plan = _short_reply_plan(latest_user_message, mood_hint)
    if short_plan:
        if user_name:
            short_plan.validation.text = f"{user_name}, {short_plan.validation.text}"
        return short_plan

    evidence_entries = _pick_entries_for_topic(retrieved_entries, topic, 2)
    evidence_cards = [
        EvidenceCard(
            entry_id=entry.entry_id,
            snippet=_snippet(entry.text),
            reason="Related to a past entry.",
        )
        for entry in evidence_entries
    ]
    reference_ids = [card.entry_id for card in evidence_cards if card.entry_id]
    openai_cues = generate_journal_cues(
        message=latest_user_message,
        mood=mood,
        time_budget=time_budget,
        keyphrases=keyphrases,
        evidence_cards=evidence_cards,
    )

    if time_budget <= 5:
        validation_text = f"{name_prefix}Thanks for sharing. That sounds {emotion_phrase}."
        if short_message:
            reflection_text = (
                f"You shared that you're feeling {topic} {mood_hint}."
                if not generic_topic
                else f"You shared that something is on your mind {mood_hint}."
            )
        else:
            reflection_text = (
                f'You mentioned, "{reflection_snippet}." It seems {topic} is present for you {mood_hint}.'
                if not generic_topic
                else f'You mentioned, "{reflection_snippet}." It sounds like something important is present for you {mood_hint}.'
            )
        pattern_text = (
            f"A past entry touched on {topic} too."
            if evidence_cards and not generic_topic
            else "It can help to notice what keeps returning."
        )
        nudge_text = openai_cues or (
            f"Journal cues: 1) name the moment around {topic}, "
            "2) name the feeling, 3) name what you needed."
            if not generic_topic
            else "Journal cues: 1) name the moment, 2) name the feeling, 3) name what you needed."
        )
        if keyphrases:
            question_text = f"What feels most important to name about {topic}?"
        else:
            question_text = _follow_up_for_feeling(inferred_feeling)
    else:
        validation_text = f"{name_prefix}Thanks for sharing. That sounds {emotion_phrase}."
        if short_message:
            reflection_text = (
                f"You shared that you're feeling {topic} {mood_hint}. "
                "Small details can reveal what you need most."
                if not generic_topic
                else f"You shared that something is on your mind {mood_hint}. Small details can reveal what you need most."
            )
        else:
            reflection_text = (
                f'You mentioned, "{reflection_snippet}." It seems {topic} is really present for you {mood_hint}. '
                "Small details can reveal what you need most."
                if not generic_topic
                else f'You mentioned, "{reflection_snippet}." It sounds like something important is really present for you {mood_hint}. '
                "Small details can reveal what you need most."
            )
        pattern_text = (
            f"You've touched on {topic} before."
            if evidence_cards and not generic_topic
            else "If a pattern is forming, it's okay to name it gently."
        )
        nudge_text = openai_cues or (
            f"Journal cues: 1) what happened with {topic}, "
            "2) how it landed, 3) what you needed, 4) one gentle next step."
            if not generic_topic
            else "Journal cues: 1) what happened, 2) how it landed, 3) what you needed, 4) one gentle next step."
        )
        if keyphrases:
            question_text = f"What feels most important to name about {topic}?"
        else:
            question_text = _follow_up_for_feeling(inferred_feeling)

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
