"""Reply craft for the journaling companion (no LLM needed).

Three ideas keep replies specific instead of vague:
1. Life areas. "my health" and "my manager" call for different questions, so each common area
   (health, work, family, ...) has its own acknowledgement and a ladder of questions.
2. Conversation stages. Each turn moves one step deeper:
   what's happening -> how it affects you -> what it means / what you need -> what might help.
3. Reflection in the person's own words, flipped to second person
   ("my manager yelled at me" -> "your manager yelled at you"), never a template.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, List, Optional, Sequence, Tuple


def _norm(text: str) -> str:
    return " ".join(text.replace("’", "'").replace("‘", "'").lower().split())


def _word_re(words: Iterable[str]) -> re.Pattern[str]:
    ordered = sorted(set(words), key=len, reverse=True)
    return re.compile(r"\b(" + "|".join(re.escape(word) for word in ordered) + r")\b")


@dataclass(frozen=True)
class LifeArea:
    key: str
    words: Tuple[str, ...]
    ack: Tuple[str, ...]
    # Question ladder: [0] what's happening, [1] impact, [2] meaning / need, [3] what might help.
    stages: Tuple[Tuple[str, ...], Tuple[str, ...], Tuple[str, ...], Tuple[str, ...]]

    @property
    def pattern(self) -> re.Pattern[str]:
        return _AREA_RES[self.key]


LIFE_AREAS: Tuple[LifeArea, ...] = (
    LifeArea(
        "health",
        (
            "health", "sick", "sickness", "illness", "unwell", "doctor", "doctors", "hospital", "pain",
            "ache", "aches", "headache", "headaches", "migraine", "migraines", "fever", "injury", "injured",
            "symptom", "symptoms", "diagnosis", "diagnosed", "surgery", "scan", "test results", "blood test",
            "checkup", "check-up", "medication", "medicine", "meds", "chronic", "flu", "covid", "infection",
            "allergy", "allergies", "back pain", "blood pressure", "diabetes", "my body", "weight",
        ),
        (
            "Health worries can quietly take up a lot of space.",
            "Your health touches everything else in a day.",
        ),
        (
            (
                "What's been going on with your health lately — something physical, or more how you've been feeling in yourself?",
                "What's been on your mind about your health?",
            ),
            (
                "How has it been affecting your days — your energy, your plans, or your mood?",
                "What part of this worries you the most?",
            ),
            (
                "What goes through your mind when it's at its worst?",
                "What has this been asking of you lately?",
            ),
            (
                "What kind of support would make this feel a little lighter right now?",
                "What's one small way you could look after yourself this week?",
            ),
        ),
    ),
    LifeArea(
        "sleep",
        ("sleep", "slept", "sleeping", "insomnia", "nightmare", "nightmares", "restless", "can't sleep", "cant sleep"),
        ("Sleep has a way of coloring the whole day.", "Rest affects so much of how a day feels."),
        (
            (
                "What's been happening with your sleep — trouble falling asleep, waking up, or something on your mind at night?",
            ),
            (
                "How has the lack of rest been showing up in your days?",
                "What tends to be on your mind when you can't sleep?",
            ),
            ("What do you think is keeping your mind busy at night?",),
            ("What usually helps you wind down, even a little?",),
        ),
    ),
    LifeArea(
        "work",
        (
            "work", "job", "boss", "manager", "deadline", "deadlines", "office", "meeting", "meetings",
            "colleague", "colleagues", "coworker", "coworkers", "project", "career", "promotion", "interview",
            "client", "clients", "workload", "shift", "layoff", "laid off", "fired", "resign", "quit my job",
        ),
        ("Work can take up so much room in a day.", "Work stress has a way of following you home."),
        (
            ("What's been happening at work?", "What's going on at work that's on your mind?"),
            ("Which part of it is weighing on you the most?", "How has it been affecting you outside of work?"),
            ("What would you want to be different about it?", "What does this situation bring up for you?"),
            (
                "What's one thing within your control that might ease it a little?",
                "Who could you lean on while this is going on?",
            ),
        ),
    ),
    LifeArea(
        "study",
        (
            "exam", "exams", "school", "college", "university", "class", "classes", "assignment", "assignments",
            "homework", "grades", "grade", "study", "studying", "studies", "semester", "thesis", "lecture",
            "professor", "teacher",
        ),
        ("Studies can bring a lot of pressure.", "That kind of academic pressure can be a lot."),
        (
            ("What's happening with your studies right now?",),
            ("What part of it feels most stressful?", "How has it been affecting how you feel day to day?"),
            ("What are you most worried might happen?", "What would doing 'well enough' look like to you?"),
            ("What's one small step that would make it feel more manageable?",),
        ),
    ),
    LifeArea(
        "family",
        (
            "family", "mom", "mum", "mother", "dad", "father", "parents", "parent", "brother", "sister",
            "sibling", "siblings", "son", "daughter", "kids", "children", "child", "grandma", "grandpa",
            "grandmother", "grandfather", "aunt", "uncle", "cousin", "in-laws",
        ),
        ("Family things can run really deep.", "Family can stir up a lot."),
        (
            ("What's been going on with your family?",),
            ("What part of it is staying with you the most?", "How did that leave you feeling?"),
            ("What do you wish they understood about you?", "What would you want from them right now?"),
            ("What would help you feel a bit more at peace with it?",),
        ),
    ),
    LifeArea(
        "relationship",
        (
            "partner", "boyfriend", "girlfriend", "husband", "wife", "spouse", "relationship", "marriage",
            "breakup", "broke up", "my ex", "dating", "fiance", "fiancé", "crush",
        ),
        ("Relationships can bring up so much.", "That sounds like it matters a lot to you."),
        (
            ("What's been happening in your relationship?",),
            ("What part of it keeps coming back to you?", "How has it been making you feel?"),
            (
                "What do you need from them that you haven't been getting?",
                "What would you want them to understand?",
            ),
            ("What would feel like a small step toward what you need?",),
        ),
    ),
    LifeArea(
        "friends",
        ("friend", "friends", "friendship", "best friend", "bestie", "roommate"),
        ("Friendships can matter so much.", "Things with friends can really stay with you."),
        (
            ("What's been going on with your friends?",),
            ("What part of it is staying with you the most?", "How did that leave you feeling?"),
            ("What would you want to say to them if you could?", "What do you value most in that friendship?"),
            ("What would help you feel more connected?",),
        ),
    ),
    LifeArea(
        "money",
        (
            "money", "rent", "bills", "debt", "loan", "loans", "salary", "paycheck", "finances", "financial",
            "budget", "expenses", "savings", "afford", "mortgage", "emi",
        ),
        ("Money worries can feel relentless.", "Financial stress can sit in the background of everything."),
        (
            ("What's been going on with money lately?",),
            ("What part of it worries you the most?", "How has it been affecting your peace of mind?"),
            ("What would feeling a little more secure look like for you?",),
            ("What's one small thing within your control right now?",),
        ),
    ),
    LifeArea(
        "loss",
        ("died", "passed away", "death", "funeral", "grief", "grieving", "bereavement", "mourning"),
        ("I'm so sorry. Loss can be incredibly hard to carry.",),
        (
            ("What's been coming up for you around this loss?",),
            ("How have you been holding up?", "What moments bring it back most strongly?"),
            ("What do you miss the most?", "What would you want to remember?"),
            ("What has given you even a little comfort lately?",),
        ),
    ),
    LifeArea(
        "self",
        (
            "myself", "confidence", "self-esteem", "self esteem", "self-worth", "self worth", "insecure",
            "insecurity", "not good enough", "failure", "motivation", "procrastinating", "procrastination",
            "purpose", "lazy",
        ),
        ("That's an honest thing to look at.", "It takes courage to look at that."),
        (
            ("What's been bringing this up for you lately?",),
            ("When do you notice it the most?", "How has it been affecting what you do day to day?"),
            ("What would you say to a friend who felt this way?", "Where do you think that voice comes from?"),
            ("What's one small thing that helps you feel more like yourself?",),
        ),
    ),
    LifeArea(
        "future",
        ("future", "uncertain", "uncertainty", "decision", "decisions", "decide", "deciding", "direction", "crossroads"),
        ("Uncertainty about what's ahead can be really unsettling.",),
        (
            ("What's the decision or uncertainty on your mind?",),
            ("What feels most unclear right now?", "What are you hoping for, underneath it all?"),
            ("What matters most to you as you think about it?",),
            ("What's one small thing that would make the next step clearer?",),
        ),
    ),
)
_AREA_RES = {area.key: _word_re(area.words) for area in LIFE_AREAS}

GENERIC_STAGES: Tuple[Tuple[str, ...], ...] = (
    ("Can you tell me a bit more about what's going on?", "What happened that brought this up for you?"),
    ("What part of it is staying with you the most?", "How did that leave you feeling?"),
    ("What do you think you needed in that moment?", "What does this bring up for you?"),
    ("Is there one small thing that might help, even a little?", "What would make tomorrow feel a bit lighter?"),
)
POSITIVE_QUESTIONS = (
    "What made that moment stand out?",
    "What did it mean to you?",
    "What made it feel so good?",
    "What do you want to remember about this?",
    "What does this tell you about what matters to you?",
    "How could you make room for more moments like this?",
)
ADVICE_QUESTIONS = (
    "What options are you weighing right now?",
    "If a close friend were in your shoes, what would you hope for them?",
    "What feels most important to you as you decide?",
)
WRAP_UP_QUESTION = "Before you wrap up, what's one thing you want to take away from writing this today?"

POSITIVE_FEELINGS = {"hopeful", "relieved", "calm", "grateful", "proud", "excited", "happy", "focused"}
FEELING_ACKS = {
    "anxious": "That sounds really unsettling.",
    "stressed": "That's a lot to carry.",
    "sad": "I'm sorry it's been feeling so heavy.",
    "tired": "That sounds draining.",
    "angry": "That sounds really frustrating.",
    "lonely": "Feeling alone with something is hard.",
    "hopeful": "It's good to hear some hope in that.",
    "calm": "That sounds really steadying.",
    "grateful": "That sounds like a meaningful moment.",
    "happy": "That's lovely to hear.",
    "focused": "That sounds like a good rhythm.",
    "overwhelmed": "That sounds like a lot to hold all at once.",
    "hurt": "That sounds like it really hurt.",
    "embarrassed": "Embarrassment can sting long after the moment has passed.",
    "guilty": "Guilt can be a heavy thing to sit with.",
    "disappointed": "Disappointment like that can really knock the wind out of you.",
    "confused": "It's hard when things feel this unclear.",
    "numb": "Feeling flat or numb can be its own kind of hard.",
    "relieved": "That sounds like a weight lifting.",
    "proud": "You've got every reason to feel proud of that.",
    "excited": "I love the excitement in that.",
}
EMOTION_ACKS = {  # only used for longer messages where the emotion model is confident
    "sadness": "That sounds heavy.",
    "fear": "That sounds unsettling.",
    "anger": "That sounds frustrating.",
    "disgust": "That sounds upsetting.",
    "joy": "That sounds really good.",
}
NEUTRAL_ACKS = ("I'm listening.", "Thanks for putting that into words.", "Okay, I'm with you.")

_ADVICE_RE = re.compile(
    r"\b(what should i do|what do i do|what can i do|any advice|give me advice|need advice"
    r"|how (do|can) i (fix|stop|deal|handle|cope|get over)|should i)\b"
)
_SUBJECT_START_RE = re.compile(
    r"^(i|i'm|im|i've|i'd|i'll|my|our|we|we're|the|this|that|it|it's|he|she|they|his|her|their|everyone|"
    r"nobody|someone|everything|nothing|work|today|yesterday|me and)\b"
)
_LEADING_CONJUNCTION_RE = re.compile(r"^(and|but|so|because|though|also|then|plus|anyway|well|honestly)\s+")
_HEDGE_RE = re.compile(r"^(i guess|i think|i suppose|i mean|maybe|honestly|really|just)\s+")
_FLIPS = (
    (re.compile(r"\bi feel like\b"), "you feel"),
    (
        re.compile(
            r"\bmy (wife|husband|partner|mom|mum|mother|dad|father|parents|sister|brother|friend|friends|boyfriend|"
            r"girlfriend|family|kids|son|daughter|boss|manager|roommate|colleague|team|cousin|fiance|fiancee) and i\b"
        ),
        r"you and your \1",
    ),
    (re.compile(r"\bme and my\b"), "you and your"),
    (re.compile(r"\bi was\b"), "you were"),
    (re.compile(r"\bi am\b"), "you are"),
    (re.compile(r"\bi'm\b|\bim\b"), "you're"),
    (re.compile(r"\bi've\b"), "you've"),
    (re.compile(r"\bi'd\b"), "you'd"),
    (re.compile(r"\bi'll\b"), "you'll"),
    (re.compile(r"\bmyself\b"), "yourself"),
    (re.compile(r"\bmine\b"), "yours"),
    (re.compile(r"\bmy\b"), "your"),
    (re.compile(r"\bme\b"), "you"),
    (re.compile(r"\bi\b"), "you"),
    (re.compile(r"\bwe're\b"), "you're"),
    (re.compile(r"\bwe\b"), "you"),
    (re.compile(r"\bour\b"), "your"),
    (re.compile(r"\bus\b"), "you"),
)


def _area_matches(text: str) -> List[Tuple[LifeArea, int, int]]:
    lowered = _norm(text)
    found = []
    for area in LIFE_AREAS:
        matches = list(area.pattern.finditer(lowered))
        if matches:
            found.append((area, len(matches), matches[0].start()))
    return found


def detect_area(text: str) -> Optional[LifeArea]:
    found = _area_matches(text)
    for area, _, _ in found:
        if area.key == "loss":  # a bereavement outranks whatever else is mentioned
            return area
    if not found:
        return None
    return min(found, key=lambda item: (-item[1], item[2]))[0]


def conversation_area(message: str, previous_user_messages: Sequence[str]) -> Optional[LifeArea]:
    """The area of this message, staying with the ongoing topic unless the person clearly moved on."""
    previous = detect_area(" ".join(previous_user_messages[-2:])) if previous_user_messages else None
    current = detect_area(message)
    if current is None:
        return previous
    if previous and current.key != previous.key and current.key != "loss":
        strength = next(count for area, count, _ in _area_matches(message) if area.key == current.key)
        if strength <= 1 and not previous.pattern.search(_norm(message)):
            return previous
    return current


def is_brief(text: str) -> bool:
    return len(text.split()) <= 5


def asks_for_advice(text: str) -> bool:
    return bool(_ADVICE_RE.search(_norm(text)))


_CASE_FLIPS = tuple(
    # "us" stays case-sensitive so "the US" isn't flipped.
    (pattern if pattern.pattern == r"\bus\b" else re.compile(pattern.pattern, re.IGNORECASE), replacement)
    for pattern, replacement in _FLIPS
)
# Clauses about what the person feels, knows or needs say more than scene-setting ones.
_INNER_RE = re.compile(r"\b(feel|felt|know|knew|think|miss|want|need|wish|can't|couldn't|don't|didn't|froze|keep)\b")


def flip_to_second_person(clause: str) -> str:
    """'my manager yelled at me' -> 'your manager yelled at you', keeping other words' capitals."""
    flipped = " ".join(clause.replace("’", "'").replace("‘", "'").split())
    for pattern, replacement in _CASE_FLIPS:
        flipped = pattern.sub(replacement, flipped)
    return flipped


def reflect_clause(text: str, focus_words: Sequence[str], banned: re.Pattern[str]) -> Optional[str]:
    """The clause that best carries what the person said, in second person, or None."""
    original = " ".join(text.replace("’", "'").replace("‘", "'").split())
    parts = re.split(r"[.!?;\n]+|,\s+|\s+but\s+|\s+-+\s+|\s+—\s+", original, flags=re.IGNORECASE)
    best: Optional[Tuple[int, str]] = None
    for raw in parts:
        clause = raw.strip(" \"'")
        clause = re.sub(_LEADING_CONJUNCTION_RE.pattern, "", clause, flags=re.IGNORECASE).strip()
        clause = re.sub(_HEDGE_RE.pattern, "", clause, flags=re.IGNORECASE).strip()
        lowered = clause.lower()
        words = clause.split()
        if not (3 <= len(words) <= 20) or banned.search(lowered) or not _SUBJECT_START_RE.match(lowered):
            continue
        score = sum(3 for word in focus_words if word and re.search(rf"\b{re.escape(word)}\b", lowered))
        score += 1 if 5 <= len(words) <= 16 else 0
        score += 2 if _INNER_RE.search(lowered) else 0
        if best is None or score > best[0]:
            best = (score, clause)
    if not best:
        return None
    flipped = flip_to_second_person(best[1])
    # Every candidate starts with a common subject word ("I", "my", "the"), so lower-casing is safe.
    return flipped[0].lower() + flipped[1:]


def area_stage(history_user_messages: Sequence[str], area: Optional[LifeArea], message: str) -> int:
    """How far into this topic the conversation is (0-3)."""
    if is_brief(message) and not history_user_messages:
        return 0
    if area is None:
        stage = len(history_user_messages)
    else:
        first = next(
            (i for i, text in enumerate(history_user_messages) if area.pattern.search(_norm(text))), None
        )
        stage = 0 if first is None else len(history_user_messages) - first
    # A long first message already says what happened, so start one step deeper.
    if len(message.split()) >= 12:
        stage = max(stage, 1)
    return min(stage, 3)


def wrap_up_due(history_user_messages: Sequence[str], time_budget: int) -> bool:
    threshold = 4 if time_budget <= 5 else 6 if time_budget <= 10 else 8
    return len(history_user_messages) >= threshold


def question_candidates(
    *,
    area: Optional[LifeArea],
    stage: int,
    feeling: Optional[str],
    feeling_follow_ups: Sequence[str],
    positive: bool,
    advice: bool,
    wrap_up: bool,
) -> List[str]:
    options: List[str] = []
    if wrap_up:
        options.append(WRAP_UP_QUESTION)
    if advice:
        options.extend(ADVICE_QUESTIONS)
    if positive:
        options.extend(feeling_follow_ups)
        options.extend(POSITIVE_QUESTIONS)
        return options
    if area is None:
        options.extend(feeling_follow_ups)
    ladder = area.stages if area else GENERIC_STAGES
    for step in range(stage, len(ladder)):
        for question in ladder[step]:
            # Don't ask "how did that make you feel" when they've just told us.
            if feeling and "feel" in question.lower() and step == 1:
                continue
            options.append(question)
        if step == stage and area is not None:
            options.extend(feeling_follow_ups)
    options.extend(GENERIC_STAGES[min(stage, 3)])
    return options


def first_unasked(options: Sequence[str], history_assistant_messages: Sequence[str]) -> str:
    asked = " ".join(_norm(text) for text in history_assistant_messages)
    for option in options:
        if _norm(option) not in asked:
            return option
    return options[0] if options else GENERIC_STAGES[0][0]


REFLECTION_LEADS = ("It sounds like", "So", "From what you're saying,")


def coverage(clause: str, message: str) -> float:
    """Share of the message's words that the reflected clause repeats (1.0 = pure echo)."""
    words = _norm(message).split()
    return len(flip_to_second_person(clause).split()) / max(1, len(words))


def pick(options: Sequence[str], seed_text: str) -> str:
    if not options:
        return ""
    return options[sum(ord(ch) for ch in seed_text) % len(options)]


# --- naming things: theme labels and prompt topics ----------------------------------------

AREA_LABELS = {
    "health": "Health", "sleep": "Sleep", "work": "Work", "study": "Studies", "family": "Family",
    "relationship": "Relationship", "friends": "Friendships", "money": "Money", "loss": "Grief & loss",
    "self": "Self-worth", "future": "The future",
}
AREA_TOPICS = {  # reads naturally inside a prompt: "What part of {topic} feels most tender?"
    "health": "your health", "sleep": "your sleep", "work": "work", "study": "your studies",
    "family": "your family", "relationship": "your relationship", "friends": "your friendships",
    "money": "money", "loss": "this loss", "self": "how you see yourself", "future": "what's ahead",
}
FEELING_NOUNS = {
    "anxious": "worry", "stressed": "stress", "sad": "sadness", "tired": "exhaustion", "angry": "frustration",
    "lonely": "loneliness", "hopeful": "hope", "calm": "calm", "grateful": "gratitude", "happy": "joy",
    "focused": "focus", "overwhelmed": "overwhelm", "hurt": "hurt", "embarrassed": "embarrassment", "guilty": "guilt",
    "disappointed": "disappointment", "confused": "uncertainty", "numb": "numbness", "relieved": "relief", "proud": "pride",
    "excited": "excitement",
}
_KEYWORD_NOISE = {
    "feel", "feeling", "felt", "feels", "week", "day", "days", "today", "tonight", "morning", "evening",
    "night", "time", "lot", "really", "just", "barely", "again", "another", "thing", "things", "way",
    "once", "still", "even", "much", "bit", "little", "took", "got", "went", "made", "came", "long",
}
_AREA_VOCAB = {word for area in LIFE_AREAS for word in area.words}


def clean_keyword(phrase: str, feeling_words: Iterable[str] = ()) -> bool:
    """True for phrases that name a thing ("work deadlines"), not fragments ("added meetings")."""
    tokens = _norm(phrase).split()
    if not tokens:
        return False
    feelings = set(feeling_words)
    for token in tokens:
        if token in _KEYWORD_NOISE or token in feelings:
            return False
        if token in _AREA_VOCAB:
            continue
        if (token.endswith("ed") and len(token) > 4) or (token.endswith("ing") and not token.endswith("ings")):
            return False
    return True


def area_label_to_topic(label: str) -> str:
    head = label.split(" & ")[0].strip()
    for key, name in AREA_LABELS.items():
        if name.lower() == head.lower():
            return AREA_TOPICS[key]
    return head.lower()
