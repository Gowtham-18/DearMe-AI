from __future__ import annotations

import hashlib
import random
import re
from typing import Dict, List, Optional, Sequence, Tuple

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
from .openai_rewriter import generate_journal_cues
from .pipeline import analyze_affect, extract_keyphrases
from .safety import CRISIS_RESOURCES

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
        "What's one simple truth about {topic} you can write down?",
    ],
}

# --- text helpers -----------------------------------------------------------------------


def _norm(text: str) -> str:
    return " ".join(text.replace("’", "'").replace("‘", "'").lower().split())


def _word_re(words: Sequence[str]) -> re.Pattern[str]:
    return re.compile(r"\b(" + "|".join(re.escape(word) for word in words) + r")\b")


def _seeded_random(seed_text: str) -> random.Random:
    seed = int(hashlib.sha256(seed_text.encode("utf-8")).hexdigest(), 16) % (2**32)
    return random.Random(seed)


def _snippet(text: str, limit: int = 140) -> str:
    cleaned = " ".join(text.split())
    if len(cleaned) <= limit:
        return cleaned
    return f"{cleaned[:limit].rstrip()}..."


# --- guardrail vocabularies ---------------------------------------------------------------

FEELING_CUES: Dict[str, Tuple[str, ...]] = {
    "anxious": ("anxious", "anxiety", "nervous", "on edge", "worried", "worrying", "panicky", "uneasy"),
    "stressed": ("stressed", "stress", "pressure", "overwhelmed", "swamped"),
    "sad": ("sad", "feeling down", "felt down", "so down", "feeling low", "felt low", "hurt", "heartbroken", "upset", "crying", "cried"),
    "tired": ("tired", "exhausted", "drained", "burned out", "burnt out", "worn out"),
    "angry": ("angry", "frustrated", "irritated", "mad", "furious", "annoyed"),
    "lonely": ("lonely", "alone", "isolated", "left out"),
    "hopeful": ("hopeful", "optimistic", "encouraged"),
    "calm": ("calm", "peaceful", "grounded", "at ease"),
    "grateful": ("grateful", "thankful", "appreciative"),
    "happy": ("happy", "glad", "joyful", "excited", "proud"),
    "focused": ("focused", "clear-headed", "productive", "intentional"),
}
_FEELING_RES = {label: _word_re(words) for label, words in FEELING_CUES.items()}
_FEELING_WORDS = {word for words in FEELING_CUES.values() for word in words} | {"worried", "worry"}

_EMOTIONAL_RE = _word_re(
    [word for words in FEELING_CUES.values() for word in words]
    + [
        "feel", "feeling", "felt", "feelings", "emotion", "emotions", "mood", "scared", "afraid",
        "ashamed", "guilty", "jealous", "hope", "grief", "grieving", "cope", "coping", "overthinking",
        "motivation", "procrastinating", "confidence", "self-esteem", "relationship", "breakup",
        "miss", "missing", "love", "hate", "regret",
    ]
)
_NARRATIVE_RE = re.compile(
    r"\b(today|tonight|yesterday|this morning|this week|my day)\b"
    r"|\b(i|we)\s+(was|were|spent|had|went|tried|kept|got|did|felt|feel|am|have been|couldn't|can't|didn't)\b"
    r"|\bi'm\b|\bi've\b|\ball day\b"
    r"|^(spent|had|went|tried|got|felt|woke|worked|kept|couldn't|didn't|finally)\b"
)
_INFO_REQUEST_RE = re.compile(
    r"^(how\s+(to|do|does|can|should)\b|what\s+(is|are|was)\s+(the|a|an)\b|what's\s+the\b|who\s+(is|was)\b"
    r"|when\s+(is|was|did)\b|where\s+(is|can)\b|explain\b|define\b|write\s+(me|a|an)\b"
    r"|can\s+you\s+(write|tell|explain|give|code|fix)\b|tell\s+me\s+(a|about)\b|give\s+me\s+(a|some)\b)"
)
_TECH_RE = _word_re(
    [
        "python", "javascript", "typescript", "sql", "html", "css", "code", "coding", "programming",
        "compile", "deploy", "deployment", "vercel", "supabase", "github", "docker", "kubernetes", "api",
        "regex", "bitcoin", "crypto", "cryptocurrency", "stock price",
    ]
)
_ABUSE_RE = re.compile(
    r"\b(fuck|screw)\s+(you|u|off)\b"
    r"|\byou(\s+are|'re|\s+r)?\s+(so\s+|such\s+an?\s+|an?\s+)?(stupid|useless|dumb|idiot|moron|trash|garbage|worthless|pathetic)\b"
    r"|^(shut\s+up|stfu)\b"
    r"|\b(stupid|useless|dumb)\s+(bot|app|ai)\b"
)
_PROFANITY_RE = _word_re(["fuck", "fucking", "fucked", "shit", "shitty", "wtf", "damn", "crap"])
_NEGATIVE_SAFETY_REPLY_RE = re.compile(
    r"^(no|nope|nah|not really|not sure|i'm not|im not|i am not|idk|i don't know|i dont know|maybe not)\b"
)

EMOTION_ADJECTIVE = {
    "sadness": "sad",
    "fear": "anxious",
    "anger": "frustrated",
    "joy": "happy",
    "surprise": "surprised",
    "disgust": "upset",
}
EMOTION_VALIDATION = {
    "sadness": "heavy",
    "fear": "unsettling",
    "anger": "frustrating",
    "joy": "uplifting",
    "surprise": "unexpected",
    "disgust": "upsetting",
}
FEELING_VALIDATION = {
    "anxious": "unsettling",
    "stressed": "like a lot to carry",
    "sad": "heavy",
    "tired": "draining",
    "angry": "frustrating",
    "lonely": "isolating",
    "hopeful": "encouraging",
    "calm": "steadying",
    "grateful": "meaningful",
    "happy": "uplifting",
    "focused": "grounding",
}
FOLLOW_UPS: Dict[str, Tuple[str, ...]] = {
    "anxious": (
        "Is there something specific that's making you feel on edge?",
        "What would help you feel even a little more settled right now?",
    ),
    "stressed": (
        "What's the biggest pressure you're carrying right now?",
        "Which part of this feels most within your control?",
    ),
    "sad": (
        "What's been weighing on you the most today?",
        "What would feel comforting to you right now?",
    ),
    "tired": (
        "What has been draining your energy lately?",
        "What would rest look like for you this week?",
    ),
    "angry": (
        "What felt most frustrating or unfair?",
        "What did you need in that moment that you didn't get?",
    ),
    "lonely": (
        "When did you feel most alone today?",
        "Who or what helps you feel a bit more connected?",
    ),
    "hopeful": ("What helped that sense of hope show up?", "What would help you hold on to that feeling?"),
    "calm": ("What supported that steadiness?", "How might you make room for more moments like this?"),
    "grateful": ("What made that moment stand out?", "Who or what would you like to remember from it?"),
    "happy": ("What made that moment feel good?", "What do you want to remember about it?"),
    "focused": ("What made it easier to stay focused?", "What helped you get into that rhythm?"),
}
GENERIC_FOLLOW_UPS = (
    "What feels most important to explore next?",
    "What else is sitting with you about this?",
    "What did you need most in that moment?",
)


def _infer_feeling(text: str) -> Optional[str]:
    lowered = _norm(text)
    best: Optional[Tuple[int, int, str]] = None
    for label, pattern in _FEELING_RES.items():
        matches = list(pattern.finditer(lowered))
        if not matches:
            continue
        candidate = (-len(matches), matches[0].start(), label)
        if best is None or candidate < best:
            best = candidate
    return best[2] if best else None


def _is_off_topic(text: str) -> bool:
    lowered = _norm(text)
    if _EMOTIONAL_RE.search(lowered) or _NARRATIVE_RE.search(lowered):
        return False
    return bool(_INFO_REQUEST_RE.search(lowered) or _TECH_RE.search(lowered))


def _contains_abuse(text: str) -> bool:
    return bool(_ABUSE_RE.search(_norm(text)))


def _contains_profanity(text: str) -> bool:
    return bool(_PROFANITY_RE.search(_norm(text)))


def _last_assistant_message(history: Sequence[ChatMessage]) -> str:
    for message in reversed(history):
        if message.role == "assistant" and message.content.strip():
            return message.content
    return ""


def _answers_safety_check_negatively(history: Sequence[ChatMessage], message: str) -> bool:
    last = _norm(_last_assistant_message(history))
    return "are you safe" in last and bool(_NEGATIVE_SAFETY_REPLY_RE.search(_norm(message)))


_GENERIC_TOPIC_WORDS = {
    "today", "tomorrow", "yesterday", "tonight", "morning", "evening", "night", "week", "day",
    "time", "lot", "things", "thing", "really", "just", "feel", "feeling", "felt",
}


def _clean_phrase(phrase: str) -> str:
    return " ".join(word for word in phrase.lower().split() if word not in _GENERIC_TOPIC_WORDS)


def _pick_topic(keyphrases: Sequence[str], text: str) -> Optional[str]:
    """Prefer a keyphrase the person actually wrote, so it reads naturally in a sentence."""
    lowered = _norm(text)
    cleaned = [_clean_phrase(phrase) for phrase in keyphrases if phrase]
    cleaned = [phrase for phrase in cleaned if phrase and phrase not in {"i", "me", "my"}]
    verbatim = [phrase for phrase in cleaned if re.search(rf"\b{re.escape(phrase)}\b", lowered)]
    keyword_tokens = {word for phrase in cleaned for word in phrase.split()}

    # Single nouns read most naturally ("about your manager"); fragments like "manager yelled",
    # verbs ("listened") or adjectives ("stupid") don't. Without a POS tagger, a word that follows
    # a determiner in the person's own text is the most reliable noun signal.
    determined = [m.group(2) for m in _DETERMINER_NOUN_RE.finditer(lowered) if _usable_topic_word(m.group(2))]
    for word in determined:
        if word in keyword_tokens:
            return word
    if determined:
        return determined[0]
    for phrase in verbatim:
        if " " not in phrase and _usable_topic_word(phrase):
            return phrase
    for phrase in verbatim:
        if all(_usable_topic_word(word) for word in phrase.split()):
            return phrase
    return None


_DETERMINER_NOUN_RE = re.compile(r"\b(my|our|the|this|that|his|her|their)\s+([a-z][a-z'-]{2,})\b")
_NON_TOPIC_WORDS = {
    "stupid", "bad", "good", "great", "fine", "okay", "ok", "better", "worse", "best", "worst", "little",
    "big", "hard", "easy", "bit", "same", "other", "whole", "first", "last", "next", "most", "only",
    "end", "rest", "way", "point", "fact", "kind", "sort",
}


def _usable_topic_word(word: str) -> bool:
    return (
        word not in _FEELING_WORDS
        and word not in _NON_TOPIC_WORDS
        and word not in _GENERIC_TOPIC_WORDS
        and not _PROFANITY_RE.fullmatch(word)
        and not word.endswith(("ed", "ing", "ly"))
    )


def _topic_phrase(topic: str, text: str) -> str:
    """Borrow the person's own determiner: "my manager" -> "your manager", "the exam" -> "the exam"."""
    match = re.search(rf"\b(my|our|the|this|that)\s+{re.escape(topic)}\b", _norm(text))
    if not match:
        return topic
    determiner = {"my": "your", "our": "your"}.get(match.group(1), match.group(1))
    return f"{determiner} {topic}"


def _entries_mentioning(entries: Sequence[ContextEntry], topic: Optional[str], count: int = 2) -> List[ContextEntry]:
    if not topic:
        return []
    words = [word for word in topic.lower().split() if len(word) >= 4 and word not in _GENERIC_TOPIC_WORDS]
    patterns = [re.compile(rf"\b{re.escape(topic.lower())}\b")] + [re.compile(rf"\b{re.escape(w)}\b") for w in words]
    return [entry for entry in entries if any(p.search(_norm(entry.text)) for p in patterns)][:count]


def _similar_entries(entries: Sequence[ContextEntry], threshold: float = 0.5, count: int = 2) -> List[ContextEntry]:
    ranked = [entry for entry in entries if entry.similarity is not None and entry.similarity >= threshold]
    ranked.sort(key=lambda entry: entry.similarity or 0.0, reverse=True)
    return ranked[:count]


def _choose_follow_up(feeling: Optional[str], topic: Optional[str], history: Sequence[ChatMessage]) -> str:
    recent_assistant = " ".join(
        _norm(message.content) for message in list(history)[-6:] if message.role == "assistant"
    )
    options: List[str] = list(FOLLOW_UPS.get(feeling or "", ()))
    if topic:
        options.append(f"What feels most important to name about {topic}?")
    options.extend(GENERIC_FOLLOW_UPS)
    for option in options:
        if _norm(option) not in recent_assistant:
            return option
    return options[0]


def _plan(
    validation: str,
    reflection: str,
    pattern: str,
    nudge: str,
    question: str,
    safety: dict,
    evidence: Optional[List[EvidenceCard]] = None,
    references: Optional[List[str]] = None,
    signals: Optional[dict] = None,
) -> ReflectionPlan:
    return ReflectionPlan(
        validation=PlanSection(text=validation),
        reflection=PlanSection(text=reflection),
        pattern_connection=PatternConnection(text=pattern, references=references or []),
        gentle_nudge=PlanSection(text=nudge),
        follow_up_question=PlanSection(text=question),
        evidence_cards=evidence or [],
        safety=safety,
        signals=signals,
    )


def _crisis_plan(safety: dict) -> ReflectionPlan:
    return _plan(
        "I'm really sorry you're feeling this way. You deserve support right now.",
        CRISIS_RESOURCES,
        "Reaching out to someone you trust can be a helpful next step.",
        "You don't have to carry this alone.",
        "Are you safe right now?",
        safety,
    )


def _short_reply_plan(text: str, safety: dict) -> Optional[ReflectionPlan]:
    lowered = _norm(text).strip(" .!")
    if not lowered:
        return _plan(
            "I'm here when you're ready.",
            "We can keep it simple.",
            "No need to force it.",
            "One small detail is enough.",
            "What feels most present for you right now?",
            safety,
        )
    if lowered in {"what", "what?", "huh", "?", "ok", "okay", "k", "hmm"}:
        return _plan(
            "Thanks for checking in.",
            "We can make this more specific.",
            "You can answer in one line.",
            "Name one moment, one feeling, or one need.",
            "What moment from today stands out the most?",
            safety,
        )
    if lowered in {"nothing", "idk", "i don't know", "i dont know", "meh", "not sure"}:
        return _plan(
            "Thanks for being honest.",
            "It's okay if nothing stands out right now.",
            "We can keep it small.",
            "One tiny moment or sensation is enough.",
            "What is one small thing you noticed today?",
            safety,
        )
    if lowered in {"wtf", "whatever"}:
        return _plan(
            "That sounds jarring.",
            "We can slow it down for a moment.",
            "It's okay to name what hit hardest.",
            "A few words is enough.",
            "What set that off or felt most intense?",
            safety,
        )
    return None


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
        PromptItem(id=f"starter_{index + 1}", text=text, reason="Starter prompt to help you begin.", evidence=[])
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

    topics = list(dict.fromkeys([theme.lower() for theme in themes] + recent_focus + similar_focus))[:6]
    if not topics:
        return _starter_prompts(mood, time_budget)

    mood_hint = f"feeling {mood.lower()}" if mood else "right now"
    rng = _seeded_random(user_id + (mood or "") + str(time_budget))

    if mood and mood.lower() in {"sad", "lonely", "stressed", "anxious", "overwhelmed", "irritated", "tired"}:
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
                evidence=[],
            )
        )

    for index, topic in enumerate(topics):
        if len(prompts) >= 4:
            break
        template = templates[index % len(templates)]
        text = template.format(topic=topic, minutes=time_budget, mood_hint=mood_hint)
        evidence_entries = _entries_mentioning(combined_entries, topic, 2)
        prompts.append(
            PromptItem(
                id=f"prompt_{index + 1}",
                text=text,
                reason=f"Based on recent patterns around {topic}." if evidence_entries else "Grounded in your recent reflections.",
                evidence=[
                    PromptEvidence(entry_id=entry.entry_id, snippet=_snippet(entry.text), reason="Mentioned in a recent entry.")
                    for entry in evidence_entries
                ],
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
    user_name: Optional[str] = None,
    allow_llm: bool = False,
) -> ReflectionPlan:
    history = history or []

    if safety.get("crisis") or _answers_safety_check_negatively(history, latest_user_message):
        if not safety.get("crisis"):
            safety = {"crisis": True, "reason": "Negative answer to a safety check-in."}
        return _crisis_plan(safety)

    name_prefix = f"{user_name}, " if user_name else ""

    if _contains_abuse(latest_user_message):
        return _plan(
            "I want to keep this space respectful. I'm here if you want to keep journaling.",
            "We can pause or reset and come back to your experience.",
            "No pressure to write more right now.",
            "If you'd like, name what set that off.",
            "Do you want to continue with your journal?",
            safety,
        )

    if _is_off_topic(latest_user_message):
        return _plan(
            f"{name_prefix}I'm here to support journaling and reflection.",
            "If you'd like, we can stay with how your day felt.",
            "We can keep it grounded in your experience.",
            "A few honest words is enough.",
            "What feels most important to name right now?",
            safety,
        )

    short_plan = _short_reply_plan(latest_user_message, safety)
    if short_plan:
        if user_name:
            short_plan.validation.text = f"{user_name}, {short_plan.validation.text[0].lower()}{short_plan.validation.text[1:]}"
        return short_plan

    recent_user_text = [m.content for m in history if m.role == "user" and m.content.strip()]
    if recent_user_text and recent_user_text[-1].strip() == latest_user_message.strip():
        recent_user_text = recent_user_text[:-1]
    context_text = " ".join(recent_user_text[-2:] + [latest_user_message])

    affect = analyze_affect(context_text)
    keyphrases = extract_keyphrases(latest_user_message, top_n=6) or extract_keyphrases(context_text, top_n=6)
    topic = _pick_topic(keyphrases, latest_user_message)

    feeling = _infer_feeling(latest_user_message) or _infer_feeling(context_text)
    if not feeling and affect.emotion in EMOTION_ADJECTIVE and affect.emotion_confidence >= 0.5:
        feeling = EMOTION_ADJECTIVE[affect.emotion]
    if topic and feeling and feeling in topic:
        topic = None
    shown = _topic_phrase(topic, latest_user_message) if topic else None

    if _contains_profanity(latest_user_message):
        validation = f"{name_prefix}That sounds really intense."
    else:
        phrase = FEELING_VALIDATION.get(feeling or "")
        if not phrase and affect.emotion_confidence >= 0.5:
            phrase = EMOTION_VALIDATION.get(affect.emotion)
        validation = f"{name_prefix}Thanks for sharing that." + (f" That sounds {phrase}." if phrase else "")

    short_message = len(latest_user_message.split()) <= 6
    snippet = _snippet(latest_user_message, 90).rstrip(".!?")
    if feeling and topic:
        core = f"It sounds like you're feeling {feeling} about {shown}."
    elif feeling:
        core = f"It sounds like you're feeling {feeling}."
    elif topic:
        core = f"It sounds like {shown} is on your mind."
    else:
        core = "It sounds like something important is on your mind."
    reflection = core if short_message else f'You wrote, "{snippet}." {core}'
    if mood and (not feeling or mood.lower() != feeling):
        reflection += f" You came in feeling {mood.lower()}."
    if time_budget > 5:
        reflection += " Small details can reveal what you need most."

    mentioned = _entries_mentioning(retrieved_entries, topic, 2)
    similar = [] if mentioned else _similar_entries(retrieved_entries)
    evidence_entries = mentioned or similar
    evidence_cards = [
        EvidenceCard(
            entry_id=entry.entry_id,
            snippet=_snippet(entry.text),
            reason=f"Also mentions {topic}." if mentioned else "Similar to what you wrote today.",
        )
        for entry in evidence_entries
    ]
    if mentioned:
        pattern = f"You've written about {shown} before." if time_budget > 5 else f"A past entry touched on {shown} too."
    elif similar:
        pattern = "This echoes something you wrote before."
    else:
        pattern = "It can help to notice what keeps returning."

    llm_cues = generate_journal_cues(
        message=latest_user_message,
        mood=mood,
        time_budget=time_budget,
        keyphrases=keyphrases,
        evidence_cards=evidence_cards,
        allow_llm=allow_llm,
        user_id=user_id,
    )
    if llm_cues:
        nudge = llm_cues
    elif time_budget <= 5:
        around = f" around {shown}" if topic else ""
        nudge = f"Journal cues: 1) name the moment{around}, 2) name the feeling, 3) name what you needed."
    else:
        with_topic = f" with {shown}" if topic else ""
        nudge = (
            f"Journal cues: 1) what happened{with_topic}, 2) how it landed, "
            "3) what you needed, 4) one gentle next step."
        )

    question = _choose_follow_up(feeling, shown, history)

    return _plan(
        validation,
        reflection,
        pattern,
        nudge,
        question,
        safety,
        evidence=evidence_cards,
        references=[card.entry_id for card in evidence_cards if card.entry_id],
        signals={
            "emotion": affect.emotion,
            "emotion_confidence": affect.emotion_confidence,
            "sentiment": {"label": affect.sentiment_label, "score": affect.sentiment_score},
            "keyphrases": keyphrases,
            "llm_cues": bool(llm_cues),
            "degraded": affect.degraded,
        },
    )


def render_plan_to_message(plan: ReflectionPlan) -> RenderedMessage:
    return RenderedMessage(
        validation=plan.validation.text,
        reflection=plan.reflection.text,
        pattern_connection=plan.pattern_connection.text,
        gentle_nudge=plan.gentle_nudge.text,
        follow_up_question=plan.follow_up_question.text,
    )
