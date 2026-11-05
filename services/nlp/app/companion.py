from __future__ import annotations

import hashlib
import random
import re
from datetime import date, datetime, timezone
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
from .pipeline import analyze_affect, extract_keyphrases
from .responder import (
    EMOTION_ACKS,
    FEELING_ACKS,
    NEUTRAL_ACKS,
    POSITIVE_FEELINGS,
    AREA_TOPICS,
    LIFE_AREAS,
    REFLECTION_LEADS,
    area_label_to_topic,
    detect_area,
    area_stage,
    asks_for_advice,
    conversation_area,
    coverage,
    first_unasked,
    is_brief,
    pick,
    question_candidates,
    reflect_clause,
    wrap_up_due,
)
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


def determined_nouns(text: str) -> List[str]:
    """Nouns the person introduced with a determiner ("my dog", "the park"), in order."""
    return [m.group(2) for m in _DETERMINER_NOUN_RE.finditer(_norm(text)) if _usable_topic_word(m.group(2))]


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
    """Concrete openers for people with no history yet. Each has an example answer to lower the bar."""
    pace = "A few lines is plenty." if time_budget <= 5 else "Take your time and add detail."
    if mood:
        first = PromptItem(
            id="starter_1",
            text=f'You picked "{mood}". What happened today that fits that feeling?',
            reason=f"Starts from your mood. {pace}",
            example=f"e.g. I felt {mood.lower()} after the meeting ran late and I missed my workout.",
        )
    else:
        first = PromptItem(
            id="starter_1",
            text="What's one moment from today that stands out, and why does it stick with you?",
            reason=f"One specific moment is easier than the whole day. {pace}",
            example="e.g. Lunch with an old friend. It was the first proper laugh I've had all week.",
        )
    return [
        first,
        PromptItem(
            id="starter_2",
            text="What's taking up the most space in your head right now?",
            reason=f"Name the loudest thought first. {pace}",
            example="e.g. The presentation on Friday. I keep rehearsing it while I'm trying to sleep.",
        ),
        PromptItem(
            id="starter_3",
            text="What drained your energy today, and what gave some of it back?",
            reason="Helps you spot patterns over time.",
            example="e.g. Back-to-back calls drained me. The walk after dinner helped.",
        ),
        PromptItem(
            id="starter_4",
            text="What's one small thing that went right today?",
            reason="Small wins are easy to forget and good to look back on.",
            example="e.g. I finally replied to the email I'd been avoiding for a week.",
        ),
    ]


# A sample answer per life area, so a prompt about "work" shows what a concrete answer looks like.
AREA_EXAMPLES = {
    "health": "e.g. My back has been sore all week and it's making me short with people.",
    "sleep": "e.g. I've been up past 1am scrolling, then dragging myself through the morning.",
    "work": "e.g. My manager liked the report, but I still feel behind on everything else.",
    "study": "e.g. The exam is in two weeks and I haven't started the hardest chapter.",
    "family": "e.g. Mum called and we argued about the trip again. I wish I'd said it differently.",
    "relationship": "e.g. We barely talked this week. I miss how easy it used to feel.",
    "friends": "e.g. I haven't heard from the group in a while and I'm not sure who should reach out.",
    "money": "e.g. Rent went up and I keep checking my account before buying anything.",
    "loss": "e.g. I saw something that reminded me of them today and had to stop for a minute.",
    "self": "e.g. I keep comparing myself to people at work and coming up short.",
    "future": "e.g. I don't know if I want to stay in this city next year.",
}
_GENERIC_EXAMPLE = "e.g. It came up again today when I was on my way home."
_DAY_NAMES = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")


def _parse_day(value: Optional[str]) -> Optional[date]:
    """A calendar day from 'YYYY-MM-DD' or an ISO timestamp (timestamps are read in UTC)."""
    if not value:
        return None
    try:
        if len(value) == 10:
            return date.fromisoformat(value)
        stamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if stamp.tzinfo is not None:
        stamp = stamp.astimezone(timezone.utc)
    return stamp.date()


def _when_phrase(entry_day: Optional[str], today: Optional[str] = None) -> str:
    """'Yesterday', 'On Tuesday' or 'In your last entry'. Both days should be in the person's calendar."""
    day = _parse_day(entry_day)
    if day is None:
        return "In your last entry"
    current = _parse_day(today) or datetime.now(timezone.utc).date()
    days = (current - day).days
    if days < 0:
        return "In your last entry"
    if days == 0:
        return "Earlier today"
    if days == 1:
        return "Yesterday"
    if days < 7:
        return f"On {_DAY_NAMES[day.weekday()]}"
    return "In your last entry"


def _follow_up_prompt(
    recent_entries: Sequence[ContextEntry], today: Optional[str] = None
) -> Optional[Tuple[PromptItem, str]]:
    """Pick up where the person left off: their latest entry about a life area, and how they felt then.

    Returns the prompt and the life-area key it follows up on.
    """
    for entry in recent_entries[:3]:
        area = detect_area(entry.text)
        if not area:
            continue
        feeling = (entry.mood or "").strip().lower() or _infer_feeling(entry.text)
        when = _when_phrase(entry.entry_date or entry.created_at, today)
        if area.key == "loss":
            text = f"{when} you wrote about a loss. How are you carrying it today?"
        else:
            felt = f" and felt {feeling}" if feeling and feeling != "neutral" else ""
            text = f"{when} you wrote about {AREA_TOPICS[area.key]}{felt}. Has anything shifted since then?"
        prompt = PromptItem(
            id="prompt_follow_up",
            text=text,
            reason="Following up on your last entry.",
            example="e.g. A bit better than last time, but it still catches me off guard some days.",
            evidence=[PromptEvidence(entry_id=entry.entry_id, snippet=_snippet(entry.text), reason="What you wrote last time.")],
        )
        return prompt, area.key
    return None


_TOPIC_AREA = {topic: key for key, topic in AREA_TOPICS.items()}


def _entry_area_topic(text: str) -> Optional[str]:
    area = detect_area(text)
    return AREA_TOPICS[area.key] if area else None


def _entries_about(entries: Sequence[ContextEntry], topic: str, count: int = 2) -> List[ContextEntry]:
    key = _TOPIC_AREA.get(topic)
    if key is None:
        return _entries_mentioning(entries, topic, count)
    area = next(area for area in LIFE_AREAS if area.key == key)
    return [entry for entry in entries if area.pattern.search(_norm(entry.text))][:count]


def build_prompts(
    user_id: str,
    recent_entries: List[ContextEntry],
    similar_entries: List[ContextEntry],
    themes: List[str],
    mood: Optional[str],
    time_budget: int,
    today: Optional[str] = None,
) -> List[PromptItem]:
    combined = {entry.entry_id: entry for entry in recent_entries + similar_entries}
    combined_entries = list(combined.values())

    if not combined_entries:
        return _starter_prompts(mood, time_budget)

    # Topics are life areas ("work", "your health"): they read naturally in every template.
    theme_topics = [area_label_to_topic(theme) for theme in themes if theme]
    entry_topics = [_entry_area_topic(entry.text) for entry in recent_entries[:3] + similar_entries[:3]]
    topics = list(dict.fromkeys([t for t in theme_topics + entry_topics if t in _TOPIC_AREA]))[:6]
    # A recent entry outside those areas still gets a personal prompt about what the person named.
    moment = next(
        ((entry, nouns[0]) for entry in recent_entries[:3] if not detect_area(entry.text)
         for nouns in [determined_nouns(entry.text)] if nouns),
        None,
    )
    if not topics and not moment and not _follow_up_prompt(recent_entries, today):
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
    follow_up = _follow_up_prompt(recent_entries, today)
    if follow_up:
        prompt, followed_key = follow_up
        prompts.append(prompt)
        topics = [topic for topic in topics if _TOPIC_AREA.get(topic) != followed_key]
    if mood:
        prompts.append(
            PromptItem(
                id="prompt_mood",
                text=f"When you're feeling {mood.lower()}, what helps you feel a little steadier?",
                reason="Tailored to your current mood.",
                example="e.g. A short walk, texting my sister, or putting my phone in another room.",
                evidence=[],
            )
        )

    for index, topic in enumerate(topics):
        if len(prompts) >= 4:
            break
        template = templates[index % len(templates)]
        text = template.format(topic=topic, minutes=time_budget, mood_hint=mood_hint)
        evidence_entries = _entries_about(combined_entries, topic, 2)
        prompts.append(
            PromptItem(
                id=f"prompt_{index + 1}",
                text=text,
                reason=f"Based on recent patterns around {topic}." if evidence_entries else "Grounded in your recent reflections.",
                example=AREA_EXAMPLES.get(_TOPIC_AREA.get(topic, ""), _GENERIC_EXAMPLE),
                evidence=[
                    PromptEvidence(entry_id=entry.entry_id, snippet=_snippet(entry.text), reason="Mentioned in a recent entry.")
                    for entry in evidence_entries
                ],
            )
        )

    if moment and len(prompts) < 4:
        entry, noun = moment
        phrase = f"your {noun}" if re.search(rf"\bmy\s+{re.escape(noun)}\b", _norm(entry.text)) else f"the {noun}"
        prompts.append(
            PromptItem(
                id="prompt_moment",
                text=f"You wrote about {phrase} recently. What's stayed with you since then?",
                reason="From a recent entry.",
                example="e.g. I keep coming back to it, especially when the house is quiet.",
                evidence=[PromptEvidence(entry_id=entry.entry_id, snippet=_snippet(entry.text), reason="Your recent entry.")],
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

    name_prefix = f"{user_name.split()[0]}, " if (user_name or "").strip() else ""

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
        short_plan.reflection.text = short_plan.pattern_connection.text = short_plan.gentle_nudge.text = ""
        if (user_name or "").strip() and not any(m.role == "assistant" for m in history):
            text = short_plan.validation.text
            short_plan.validation.text = f"{user_name.split()[0]}, {text if text.startswith('I') else text[0].lower() + text[1:]}"
        return short_plan

    recent_user_text = [m.content for m in history if m.role == "user" and m.content.strip()]
    if recent_user_text and recent_user_text[-1].strip() == latest_user_message.strip():
        recent_user_text = recent_user_text[:-1]
    context_text = " ".join(recent_user_text[-2:] + [latest_user_message])

    affect = analyze_affect(context_text)
    keyphrases = extract_keyphrases(latest_user_message, top_n=6) or extract_keyphrases(context_text, top_n=6)
    topic = _pick_topic(keyphrases, latest_user_message)

    # Only claim a feeling the person named. The emotion model is used for longer messages only,
    # and never turned into "you're feeling X": two words like "my health" carry no feeling.
    explicit_feeling = _infer_feeling(latest_user_message)
    feeling = explicit_feeling or _infer_feeling(context_text)
    long_message = len(latest_user_message.split()) >= 8
    model_confident = long_message and affect.emotion_confidence >= 0.7
    if topic and feeling and feeling in topic:
        topic = None
    shown = _topic_phrase(topic, latest_user_message) if topic else None

    prior_user = [m.content for m in history if m.role == "user" and m.content.strip()]
    if prior_user and prior_user[-1].strip() == latest_user_message.strip():
        prior_user = prior_user[:-1]
    prior_assistant = [m.content for m in history if m.role == "assistant" and m.content.strip()]
    # The session opens with the chosen prompt as an assistant turn; that isn't a reply yet.
    prior_replies = [t for t in prior_assistant if _norm(t) != _norm(selected_prompt or "")]

    area = conversation_area(latest_user_message, prior_user)
    stage = area_stage(prior_user, area, latest_user_message)
    advice = asks_for_advice(latest_user_message)
    positive = (explicit_feeling in POSITIVE_FEELINGS) or (
        not explicit_feeling and model_confident and affect.emotion == "joy"
    )

    # 1) Acknowledge: specific to what they named, never a stock "thanks for sharing".
    if _contains_profanity(latest_user_message):
        ack = "That sounds really intense."
    elif advice:
        ack = "I can't tell you what's right for you, but we can think it through together."
    elif explicit_feeling:
        ack = FEELING_ACKS.get(explicit_feeling, "")
    elif area and (is_brief(latest_user_message) or stage == 0):
        ack = pick(area.ack, latest_user_message)
    elif model_confident and affect.emotion in EMOTION_ACKS and not prior_assistant:
        ack = EMOTION_ACKS[affect.emotion]
    else:
        ack = ""
    said_before = " ".join(_norm(t) for t in prior_assistant)
    if ack and _norm(ack) in said_before:
        ack = ""
    first_name = (user_name or "").split()[0] if (user_name or "").strip() else ""
    if first_name and not prior_replies:
        if not ack:
            ack = pick(NEUTRAL_ACKS, latest_user_message)
        keep_case = ack.startswith(("I ", "I'm", "I'"))
        ack = f"{first_name}, {ack if keep_case else ack[0].lower() + ack[1:]}"

    # 2) Reflect their own words back (skipped for very short messages: nothing to reflect yet).
    reflection = ""
    last_reply = _norm(prior_assistant[-1]) if prior_assistant else ""
    last_reflected = any(f"{lead.lower()} " in last_reply for lead in REFLECTION_LEADS)
    if not is_brief(latest_user_message):
        focus = [word for word in [topic or ""] + list(keyphrases[:3]) if word]
        clause = reflect_clause(latest_user_message, focus, _PROFANITY_RE)
        # Echoing a whole message back turn after turn reads as parroting; vary it.
        echo = clause is not None and coverage(clause, latest_user_message) > 0.8
        short_echo = echo and len(latest_user_message.split()) <= 8
        if area and area.key == "loss" and stage == 0:
            clause = None  # after "I'm so sorry", repeating the loss back reads as cold
        if clause and not short_echo and not (last_reflected and echo):
            leads = [lead for lead in REFLECTION_LEADS if f"{lead.lower()} " not in last_reply]
            if "sound" in ack.lower():
                leads = [lead for lead in leads if "sound" not in lead.lower()] or ["So"]
            reflection = f"{pick(leads, clause)} {clause}."
            reflection = reflection[0].upper() + reflection[1:]
    if not ack and not reflection:
        unused = [a for a in NEUTRAL_ACKS if _norm(a) not in said_before] or list(NEUTRAL_ACKS)
        ack = pick(unused, latest_user_message)

    # 3) Connect to a past entry only when one really mentions the same thing, once per session.
    mentioned = _entries_mentioning(retrieved_entries, topic, 2)
    similar = [] if mentioned else _similar_entries(retrieved_entries, threshold=0.6)
    evidence_entries = mentioned or similar
    evidence_cards = [
        EvidenceCard(
            entry_id=entry.entry_id,
            snippet=_snippet(entry.text),
            reason=f"Also mentions {topic}." if mentioned else "Similar to what you wrote today.",
        )
        for entry in evidence_entries
    ]
    already_linked = any("you've written about" in _norm(t) or "echoes something" in _norm(t) for t in prior_assistant)
    pattern = ""
    if evidence_entries and not already_linked:
        quote = _snippet(evidence_entries[0].text, 70)
        if mentioned:
            pattern = f"You've written about {shown} before: \u201c{quote}\u201d"
        else:
            pattern = f"This echoes something you wrote recently: \u201c{quote}\u201d"

    # 4) One specific question that moves the conversation a step deeper.
    options = question_candidates(
        area=area,
        stage=stage,
        feeling=explicit_feeling,
        feeling_follow_ups=FOLLOW_UPS.get(feeling or "", ()),
        positive=positive,
        advice=advice,
        wrap_up=wrap_up_due(prior_user, time_budget),
    )
    question = first_unasked(options, prior_assistant)

    return _plan(
        ack,
        reflection,
        pattern,
        "",
        question,
        safety,
        evidence=evidence_cards,
        references=[card.entry_id for card in evidence_cards if card.entry_id],
        signals={
            "emotion": affect.emotion,
            "emotion_confidence": affect.emotion_confidence,
            "sentiment": {"label": affect.sentiment_label, "score": affect.sentiment_score},
            "keyphrases": keyphrases,
            "life_area": area.key if area else None,
            "stage": stage,
            "feeling": explicit_feeling,
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
