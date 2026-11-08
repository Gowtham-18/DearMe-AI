"""Reading a journal message the way a careful listener would (no LLM needed).

- Feelings respect negation ("I'm not sad, just tired" is tired), common typos ("tird"), emoji,
  everyday Hinglish ("thak gaya") and obvious sarcasm ("great, another Monday").
- Events ("my interview", "we broke up") get their own acknowledgement and questions, so the
  companion talks about what happened instead of a broad life area.
- Intents that need a different kind of reply: questions about the companion itself, "I don't
  want to talk about it", attempts to override its instructions, and "I don't know".
"""
from __future__ import annotations

import difflib
import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence, Tuple


def norm(text: str) -> str:
    return " ".join(text.replace("’", "'").replace("‘", "'").lower().split())


def _word_re(words: Sequence[str]) -> re.Pattern[str]:
    ordered = sorted(set(words), key=len, reverse=True)
    return re.compile(r"\b(" + "|".join(re.escape(word) for word in ordered) + r")\b")


# --- feelings ---------------------------------------------------------------------------------

FEELING_CUES: Dict[str, Tuple[str, ...]] = {
    "anxious": ("anxious", "anxiety", "nervous", "on edge", "worried", "worrying", "panicky", "uneasy", "scared",
                "overthinking", "overthink", "can't stop thinking", "cant stop thinking", "spiralling", "spiraling",
                "afraid", "dreading", "what if"),
    "overwhelmed": ("overwhelmed", "too much", "swamped", "drowning", "can't keep up", "cant keep up"),
    "stressed": ("stressed", "stress", "pressure", "tense"),
    "sad": ("sad", "feeling down", "felt down", "so down", "feeling low", "felt low", "heartbroken", "upset",
            "crying", "cried", "miserable", "gloomy"),
    "hurt": ("hurt", "hurts", "hurting", "betrayed", "rejected", "ignored", "unappreciated", "left out", "let me down",
             "excluded", "didn't invite me", "didnt invite me", "wasn't invited", "not invited"),
    "embarrassed": ("embarrassed", "embarrassing", "ashamed", "humiliated", "humiliating", "cringe", "mortified"),
    "guilty": ("guilty", "guilt", "my fault", "regret", "regretting", "feel terrible", "feel awful", "feel bad", "felt bad",
               "felt terrible", "shouldn't have", "shouldnt have", "didn't deserve it", "didnt deserve it"),
    "disappointed": ("disappointed", "disappointing", "let down", "letdown"),
    "tired": ("tired", "exhausted", "drained", "burned out", "burnt out", "worn out", "sleepy", "fatigued"),
    "angry": ("angry", "frustrated", "frustrating", "irritated", "mad", "furious", "annoyed", "fed up", "pissed"),
    "lonely": ("lonely", "alone", "isolated"),
    "confused": ("confused", "torn", "unsure", "don't know what to do", "dont know what to do"),
    "numb": ("numb", "feel empty", "feeling empty", "felt empty", "feel flat", "feeling flat", "feel nothing"),
    "hopeful": ("hopeful", "optimistic", "encouraged"),
    "relieved": ("relieved", "relief"),
    "calm": ("calm", "peaceful", "grounded", "at ease", "relaxed"),
    "grateful": ("grateful", "thankful", "appreciative", "blessed"),
    "proud": ("proud",),
    "excited": ("excited", "can't wait", "cant wait", "thrilled", "pumped"),
    "happy": ("happy", "glad", "joyful", "great day", "good day", "amazing day", "lol", "haha"),
    "focused": ("focused", "clear-headed", "productive", "intentional"),
}
POSITIVE_FEELINGS = {"hopeful", "relieved", "calm", "grateful", "proud", "excited", "happy", "focused"}
_FEELING_RES = {label: _word_re(words) for label, words in FEELING_CUES.items()}
FEELING_WORDS = {word for words in FEELING_CUES.values() for word in words} | {"worry", "feel", "feeling"}
_SINGLE_FEELING_WORDS = sorted(
    {word for words in FEELING_CUES.values() for word in words if " " not in word and len(word) >= 5}
)
# Real words that sit one letter away from a feeling word and must not be "corrected".
_NOT_TYPOS = {
    "tried", "passed", "pressed", "missed", "messed", "tires", "tide", "tied", "cried", "dried", "fried", "pride", "stress", "stresses", "angel", "angle",
    "relived", "sadly", "madly", "calmly", "proudly", "grated", "focus", "focuses",
    "hopefully", "worries", "empty", "exhaust", "upsetting", "nervy", "scares", "afraidd",
}

EMOJI_FEELINGS = {
    "😭": "crying", "😢": "sad", "😞": "sad", "😔": "sad", "💔": "heartbroken", "☹": "sad", "🙁": "sad",
    "😡": "angry", "😠": "angry", "🤬": "angry", "😤": "frustrated",
    "😰": "anxious", "😟": "worried", "😨": "scared", "😬": "nervous",
    "😴": "tired", "🥱": "tired", "😩": "exhausted", "😫": "exhausted",
    "😊": "happy", "😄": "happy", "😁": "happy", "🙂": "happy", "🥳": "excited", "😍": "happy", "❤": "happy",
    "🙏": "grateful", "😌": "relieved", "😐": "numb", "😶": "numb",
}

# Everyday Hinglish words mapped to the English cue they carry (used for understanding only).
HINGLISH = {
    "bekar": "bad", "bekaar": "bad", "bura": "bad", "buri": "bad", "kharab": "bad",
    "thak": "tired", "thaka": "tired", "thaki": "tired", "thakan": "tired", "thakaan": "tired",
    "pareshan": "stressed", "pareshaan": "stressed", "tension": "stressed",
    "dukhi": "sad", "udaas": "sad", "udas": "sad", "rona": "crying", "roya": "cried", "royi": "cried",
    "gussa": "angry", "naraz": "angry", "naraaz": "angry", "chidh": "irritated",
    "khush": "happy", "mazaa": "happy", "maza": "happy",
    "akela": "lonely", "akeli": "lonely", "akelapan": "lonely",
    "dar": "scared", "darr": "scared", "ghabrahat": "anxious", "ghabra": "nervous",
    "neend": "sleep", "kaam": "work", "naukri": "job", "padhai": "studies", "pariksha": "exam",
    "ghar": "home", "gharwale": "family", "mummy": "mum", "papa": "dad", "maa": "mum", "dost": "friend",
    "dosti": "friendship", "ladai": "argument", "jhagda": "argument", "jhagra": "argument", "paisa": "money",
    "paise": "money", "sharam": "embarrassed", "sukoon": "calm", "shukriya": "grateful",
}

_NEGATORS = re.compile(r"\b(not|never|no|isn't|wasn't|aren't|weren't|don't|didn't|doesn't|hardly|barely|no longer)\b")
_SARCASM_RE = re.compile(
    r"^(oh\s+)?(great|perfect|wonderful|awesome|fantastic|lovely|brilliant|just great|so fun|yay)[,.!\s]+"
    r"(another|more|just|exactly what|what i needed)\b"
    r"|\b(love it|loving it|just great|so much fun)\b[.!]*\s*$"
)
_NEGATIVE_CONTEXT_RE = re.compile(
    r"\b(monday|again|another|traffic|deadline|meeting|overtime|ignored|cancelled|late|stuck|broke|lost)\b"
)


def expand(text: str) -> str:
    """Lower-cased text with emoji, Hinglish and feeling-word typos turned into plain cue words."""
    for emoji, word in EMOJI_FEELINGS.items():
        if emoji in text:
            text = text.replace(emoji, f" {word} ")
    words = []
    for token in norm(text).split():
        bare = token.strip(".,!?;:\"'()")
        if bare in HINGLISH:
            words.append(HINGLISH[bare])
        elif (
            len(bare) >= 4
            and bare.isalpha()
            and bare not in _NOT_TYPOS
            and bare not in FEELING_WORDS
        ):
            close = difflib.get_close_matches(bare, _SINGLE_FEELING_WORDS, n=1, cutoff=0.85)
            words.append(close[0] if close and close[0][0] == bare[0] else token)
        else:
            words.append(token)
    return " ".join(words)


def _negated(text: str, start: int) -> bool:
    """A negator in the three words right before the cue: "not sad", "don't feel sad", "not really sad".

    "I don't know why it hurts" isn't negated (the "don't" belongs to "know"), and "never felt so
    happy" means very happy.
    """
    before = re.split(r"[,.;!?]|\bbut\b|\bjust\b", text[:start])[-1].split()[-3:]
    window = " ".join(before)
    if re.search(r"\bnever (felt|been) so\b", window):
        return False
    return bool(_NEGATORS.search(window))


# "I just want her to be proud of me" is a wish, not a feeling the person has right now.
_WISH_RE = re.compile(r"\b(want|wanted|wish|hope|hoping|need|needed|would love|trying|try)\b(?:\s+\S+){0,5}\s*$")


def _wished(text: str, start: int) -> bool:
    before = re.split(r"[,.;!?]|\bbut\b", text[:start])[-1]
    return bool(_WISH_RE.search(before))


def is_sarcastic(text: str) -> bool:
    lowered = norm(text)
    return bool(_SARCASM_RE.search(lowered)) and bool(_NEGATIVE_CONTEXT_RE.search(lowered) or lowered.startswith(("great", "oh great", "perfect")))


def named_feelings(text: str) -> List[str]:
    """Feelings the person actually named, most-mentioned first; negated ones are left out."""
    expanded = expand(text)
    found: List[Tuple[int, int, str]] = []
    for label, pattern in _FEELING_RES.items():
        hits = [
            m for m in pattern.finditer(expanded)
            if not _negated(expanded, m.start()) and not (label in POSITIVE_FEELINGS and _wished(expanded, m.start()))
        ]
        if hits:
            found.append((-len(hits), hits[0].start(), label))
    found.sort()
    labels = [label for _, _, label in found]
    if is_sarcastic(text):
        labels = ["angry"] + [label for label in labels if label not in POSITIVE_FEELINGS and label != "angry"]
    # "happy" from "lol" shouldn't outrank a real feeling like "tired".
    if len(labels) > 1 and labels[0] == "happy" and re.search(r"\b(lol|haha)\b", expanded) and not re.search(r"\b(happy|glad|joyful)\b", expanded):
        labels = labels[1:] + ["happy"]
    return labels


def first_feeling(text: str) -> Optional[str]:
    labels = named_feelings(text)
    return labels[0] if labels else None


NEGATIVE_WORDS_RE = re.compile(
    r"\b(bad|badly|terrible|awful|horrible|worst|rough|hard|tough|messed up|blew it|bombed|froze|failed|fail|"
    r"heavy|struggl\w*|can't (sleep|stop|cope|focus|handle|breathe|do this)|didn't go well|went wrong|not good|"
    r"not great|sucked|sucks|nothing went (right|well)|nothing good|no good|didn't invite|wasn't invited)\b"
)
POSITIVE_WORDS_RE = re.compile(
    r"\b(good|great|amazing|awesome|nailed|went well|loved|fun|best(?! friend)|finally|proud|won|passed (my|the)|got the|"
    r"made me smile|smiled|laughed|lol|haha|yay)\b|!\s*$"
)


_WISH_CLAUSE_RE = re.compile(r"(want|wish|hope|need)[^.,!?]*")


def tone(text: str) -> str:
    """'negative', 'positive' or 'neutral' from feelings first, then plain words."""
    labels = named_feelings(text)
    if labels:
        return "positive" if labels[0] in POSITIVE_FEELINGS else "negative"
    lowered = _WISH_CLAUSE_RE.sub(" ", expand(text))  # "I want her to be proud" is a wish, not good news
    negative = bool(NEGATIVE_WORDS_RE.search(lowered))
    positive = bool(POSITIVE_WORDS_RE.search(lowered))
    if negative and not positive:
        return "negative"
    if positive and not negative:
        return "positive"
    return "neutral"


_POSITIVE_PROMPT_RE = re.compile(
    r"\b(smile|smiled|grateful|thankful|went right|went well|proud|good moment|joy|happy|win|wins|highlight|"
    r"enjoy|enjoyed|best part|looking forward|gave .* back|lighter|fun|laugh|kind)\b"
)
_NEGATIVE_PROMPT_RE = re.compile(r"\b(heavy|hard|hardest|drain|drained|difficult|stress|worr|upset|tough|weigh)")


def prompt_tone(prompt: str) -> str:
    lowered = norm(prompt)
    if _NEGATIVE_PROMPT_RE.search(lowered):
        return "negative"
    if _POSITIVE_PROMPT_RE.search(lowered):
        return "positive"
    return "neutral"


# --- events -----------------------------------------------------------------------------------


@dataclass(frozen=True)
class Event:
    key: str
    words: Tuple[str, ...]
    acks: Dict[str, str]  # by tone: negative / positive / neutral
    questions: Dict[str, Tuple[str, ...]]  # by tone; ordered from "what happened" to "what might help"
    default_tone: str = "neutral"

    @property
    def pattern(self) -> re.Pattern[str]:
        return _EVENT_RES[self.key]


EVENTS: Tuple[Event, ...] = (
    Event(
        "interview",
        ("interview", "interviews", "interviewed", "interviewer", "hr round", "job interview"),
        {
            "negative": "Interviews can feel so exposing, especially when one doesn't go the way you hoped.",
            "positive": "That's a big step, and it sounds like it went well.",
            "neutral": "Interviews can take a lot out of you.",
        },
        {
            "negative": (
                "Which moment from the interview keeps replaying in your head?",
                "What do you wish you'd been able to say in that moment?",
                "What would you tell a friend who walked out of an interview feeling like this?",
                "What's one thing you'd want to carry into the next one?",
            ),
            "positive": (
                "Which part are you proudest of?",
                "What did you do to get ready that paid off?",
                "What would it mean to you if this works out?",
            ),
            "neutral": (
                "How are you feeling about how it went?",
                "Which moment from it stands out most?",
                "What are you hoping happens next?",
            ),
        },
    ),
    Event(
        "exam",
        ("exam", "exams", "test results", "results", "marks", "midterm", "midterms", "finals", "quiz", "pariksha"),
        {
            "negative": "Exams can put so much pressure on you.",
            "positive": "That's a real result to be proud of.",
            "neutral": "Exams can take up a lot of headspace.",
        },
        {
            "negative": (
                "What part of the exam is weighing on you most?",
                "What are you most worried might happen?",
                "What would 'good enough' look like for you this time?",
                "What's one small step that would make the next few days feel more manageable?",
            ),
            "positive": ("What made the difference this time?", "How do you want to celebrate it, even a little?"),
            "neutral": ("How are you feeling about it?", "What part of it is on your mind most?", "What would help you feel ready?"),
        },
    ),
    Event(
        "presentation",
        ("presentation", "presenting", "present tomorrow", "speech", "pitch", "demo", "public speaking", "talk tomorrow"),
        {
            "negative": "Standing up in front of people takes a lot.",
            "positive": "It sounds like it went really well.",
            "neutral": "Presentations can bring up a lot.",
        },
        {
            "negative": (
                "What part of it are you most nervous about?",
                "What's the worst-case picture your mind keeps showing you?",
                "What do you know you're good at that'll be in the room with you?",
                "What would help you feel a little steadier right before you start?",
            ),
            "positive": ("Which moment felt best?", "What did you do that you want to remember next time?"),
            "neutral": ("How are you feeling about it?", "What part of it is on your mind most?", "What would help you feel ready?"),
        },
    ),
    Event(
        "breakup",
        ("broke up", "break up", "breakup", "broken up", "divorce", "divorced", "separated", "dumped", "ended things", "split up"),
        {
            "negative": "I'm so sorry. The end of a relationship can shake everything up.",
            "positive": "It sounds like ending it brought some relief, even if it's complicated.",
            "neutral": "I'm sorry. The end of a relationship can shake everything up.",
        },
        {
            "negative": (
                "What's been the hardest part of the days since?",
                "When does the missing hit hardest?",
                "What do you want to remember about who you are, outside of the relationship?",
                "What has been even a little comforting lately?",
            ),
            "positive": ("What feels lighter now?", "What are you looking forward to for yourself?"),
            "neutral": (
                "What's been the hardest part of the days since?",
                "What do you want to remember about who you are, outside of the relationship?",
                "What has been even a little comforting lately?",
            ),
        },
        default_tone="negative",
    ),
    Event(
        "conflict",
        ("argument", "argued", "arguing", "fight", "fought", "fighting", "yelled", "shouted", "screamed", "blamed"),
        {
            "negative": "Conflict with someone can stay with you long after it's over.",
            "positive": "It sounds like you worked through it, which isn't easy.",
            "neutral": "Conflict with someone can stay with you long after it's over.",
        },
        {
            "negative": (
                "What was said that's stuck with you most?",
                "What did you need from them in that moment?",
                "What would you want them to understand about how it felt?",
                "What would help you feel more settled about it, even if nothing changes?",
            ),
            "positive": ("What helped you get through it?", "What do you want to remember about how you handled it?"),
            "neutral": (
                "What was said that's stuck with you most?",
                "What did you need from them in that moment?",
                "What would help you feel more settled about it?",
            ),
        },
        default_tone="negative",
    ),
    Event(
        "rejection",
        ("rejected", "rejection", "didn't get the", "didnt get the", "turned down", "ghosted", "ignored my", "ignored me",
         "left on read", "passed over", "not selected", "didn't invite me", "didnt invite me", "wasn't invited", "excluded"),
        {
            "negative": "Being passed over or ignored really stings.",
            "positive": "It sounds like you're finding your feet after it.",
            "neutral": "Being passed over or ignored really stings.",
        },
        {
            "negative": (
                "What part of it hurt the most?",
                "What story has your mind been telling you about why it happened?",
                "What would you say to a friend who went through the same thing?",
                "What's helped you bounce back from something like this before?",
            ),
            "positive": ("What's helping you move forward?",),
            "neutral": ("What part of it hurt the most?", "What would you say to a friend who went through the same thing?"),
        },
        default_tone="negative",
    ),
    Event(
        "quitting",
        ("quit my job", "quitting my job", "thinking of quitting", "thinking about quitting", "thought about quitting", "quitting", "want to quit", "quit", "resign", "resigning", "resignation", "leave my job", "leaving my job", "leave this job"),
        {
            "negative": "That's a big thing to be weighing.",
            "positive": "That sounds like a big, brave step.",
            "neutral": "That's a big thing to be weighing.",
        },
        {
            "negative": (
                "What's pulling you toward leaving, and what's holding you back?",
                "What would you need to feel sure, either way?",
                "If you imagine a year from now, which choice feels more like you?",
            ),
            "positive": ("What made you sure it was time?", "What are you most looking forward to?"),
            "neutral": (
                "What's pulling you toward leaving, and what's holding you back?",
                "What would you need to feel sure, either way?",
            ),
        },
    ),
    Event(
        "achievement",
        ("promoted", "promotion", "got the job", "job offer", "got an offer", "got in", "got accepted", "accepted into",
         "i passed", "passed my", "passed the", "won", "finished my", "graduated", "graduation", "got a raise", "pay raise"),
        {
            "negative": "Even good news can come with complicated feelings.",
            "positive": "That's worth celebrating.",
            "neutral": "That's a big moment.",
        },
        {
            "negative": ("What part of it feels complicated?", "What would help you enjoy it a little more?"),
            "positive": (
                "What made this one feel so good?",
                "What did it take from you to get here?",
                "What does this show you about yourself?",
                "How could you mark this moment, even in a small way?",
            ),
            "neutral": ("How are you feeling about it?", "What did it take from you to get here?"),
        },
        default_tone="positive",
    ),
    Event(
        "exercise",
        ("gym", "workout", "worked out", "went for a run", "went running", "yoga", "went for a walk", "long walk", "swim", "cycling"),
        {
            "negative": "Even when it's hard, you showed up for yourself.",
            "positive": "Getting yourself there counts for a lot.",
            "neutral": "Moving your body can shift a whole day.",
        },
        {
            "negative": ("What made it feel hard today?", "What would make it a little easier next time?"),
            "positive": ("How did you feel afterwards?", "What helped you get there today?", "What would help you keep that going?"),
            "neutral": ("How did you feel afterwards?", "What helped you get there today?"),
        },
        default_tone="positive",
    ),
    Event(
        "pet",
        ("dog", "puppy", "cat", "kitten", "my pet", "pets"),
        {
            "negative": "Worrying about a pet can be really hard.",
            "positive": "Pets have a way of making a day lighter.",
            "neutral": "Pets have a way of making a day lighter.",
        },
        {
            "negative": ("What's been happening with them?", "What would help you feel a little less worried?"),
            "positive": ("What's a moment with them today you want to remember?", "What do they bring to your days?"),
            "neutral": ("What's a moment with them today you want to remember?",),
        },
        default_tone="positive",
    ),
    Event(
        "scrolling",
        ("scrolling", "doomscrolling", "on my phone", "reels", "social media"),
        {
            "negative": "Scrolling is so easy to fall into, especially when you're running on empty.",
            "positive": "Sometimes switching off is exactly what's needed.",
            "neutral": "Scrolling is so easy to fall into, especially when you're running on empty.",
        },
        {
            "negative": (
                "What's usually going on in your head when you reach for your phone?",
                "What would you want your evenings to feel like instead?",
                "What's one small thing that might make putting it down easier?",
            ),
            "positive": ("What did you enjoy about it?",),
            "neutral": (
                "What's usually going on in your head when you reach for your phone?",
                "What would you want your evenings to feel like instead?",
            ),
        },
        default_tone="negative",
    ),
    Event(
        "waiting_reply",
        ("text i sent", "message i sent", "hasn't replied", "hasnt replied", "hasn't texted", "no reply", "not replied",
         "haven't heard back", "havent heard back", "waiting for a reply", "waiting for him to reply", "waiting for her to reply"),
        {
            "negative": "Waiting on a reply can make every minute feel long.",
            "positive": "It sounds like the wait is over.",
            "neutral": "Waiting on a reply can make every minute feel long.",
        },
        {
            "negative": (
                "What's the story your mind is telling you while you wait?",
                "What are you most afraid the silence means?",
                "What would help you feel okay, whatever the reply turns out to be?",
            ),
            "positive": ("How did it feel when you heard back?",),
            "neutral": (
                "What's the story your mind is telling you while you wait?",
                "What would help you feel okay, whatever the reply turns out to be?",
            ),
        },
        default_tone="negative",
    ),
    Event(
        "bad_day",
        ("bad day", "rough day", "terrible day", "awful day", "worst day", "long day", "hard day", "tough day", "din bad"),
        {
            "negative": "Sounds like a rough day.",
            "positive": "Sounds like a rough day.",
            "neutral": "Sounds like a rough day.",
        },
        {
            "negative": ("What made it so rough?", "Which part is still sitting with you?", "What would help you put today down tonight?"),
            "positive": ("What made it so rough?",),
            "neutral": ("What made it so rough?", "Which part is still sitting with you?"),
        },
        default_tone="negative",
    ),
)
_EVENT_RES = {event.key: _word_re(event.words) for event in EVENTS}


def detect_event(text: str) -> Optional[Event]:
    expanded = expand(text)
    best: Optional[Tuple[int, Event]] = None
    for event in EVENTS:
        match = event.pattern.search(expanded)
        if match and (best is None or match.start() < best[0]):
            best = (match.start(), event)
    return best[1] if best else None


def event_tone(event: Event, text: str, context_tone: str = "neutral") -> str:
    message_tone = tone(text)
    if message_tone != "neutral":
        return message_tone
    if context_tone != "neutral":
        return context_tone
    return event.default_tone


# --- intents ----------------------------------------------------------------------------------

_INJECTION_RE = re.compile(
    r"\b(ignore|disregard|forget|override|bypass)\s+(all\s+|any\s+|the\s+|your\s+|my\s+)*"
    r"(previous|prior|above|earlier|system|original)?\s*(instructions?|prompts?|rules|guidelines|programming)\b"
    r"|\b(system|hidden|initial|original|developer)\s+(prompt|message|instructions?)\b"
    r"|\b(reveal|show|print|repeat|tell me)\s+(me\s+)?(your|the)\s+(prompt|instructions|rules|configuration)\b"
    r"|\b(developer|god|jailbreak|dan)\s+mode\b|\bjailbreak\b|\byou are now\b|\bdo anything now\b"
    r"|\bact as (an? )?(unfiltered|unrestricted|different|evil)\b|\bwithout (any )?(restrictions|filters|rules)\b"
)
_IDENTITY_RE = re.compile(
    r"^(hey |hi |so |wait |um |just )?(are|r)\s+(you|u)\s+(a\s+|an\s+)?(real|human|bot|robot|ai|person|chatgpt|machine|therapist)\b"
    r"|^(who|what)\s+(are|r)\s+(you|u)\b|\bam i (talking|speaking|chatting) (to|with) (a |an )?(bot|human|person|real person|ai|machine)\b"
    r"|\bis this (a |an )?(bot|ai|real person|human)\b"
)
_LISTEN_RE = re.compile(
    r"^(can you |could you |will you |would you |please )?(just )?(talk to me|listen( to me)?|be there for me|chat with me)\b"
    r"|\b(like a friend|as a friend|be my friend)\b"
)
_DECLINE_RE = re.compile(
    r"\b(don't|dont|do not|rather not|not ready to|can't|cant)\s+(want to\s+|wanna\s+)?(talk|write|get into|go into|think)\s+about\s+(it|this|that)\b"
    r"|^(i'd )?rather not( say| talk about it)?[.!]*$|^(leave it|drop it|forget it|nevermind|never mind)[.!]*$"
    r"|\b(don't|dont|do not) want to (talk|write)( anymore| right now)?[.!]*$"
)
_DONT_KNOW_RE = re.compile(
    r"^(idk|i don't know|i dont know|dunno|not sure|no idea|i'm not sure|im not sure|no clue|hard to say|"
    r"i can't say|i cant say|nothing|nothing really|not much|meh|eh)[.!? ]*$"
)
_YES_RE = re.compile(r"^(yes|yeah|yep|yup|ya|yea|sure|definitely|absolutely|kind of|kinda|sort of|i guess|maybe|a little|a bit|true)[.!? ]*$")
_NO_RE = re.compile(r"^(no|nope|nah|not really|not at all|no not really)[.!? ]*$")
_STRENGTH_RE = re.compile(
    r"\b(practi[sc]ed|prepared|i tried my best|tried my best|managed to|did it anyway|still did|showed up|"
    r"handled it|got through|kept going|stood up for myself|spoke up|i('ve| have) worked hard)\b"
)


def is_injection(text: str) -> bool:
    return bool(_INJECTION_RE.search(norm(text)))


def asks_identity(text: str) -> bool:
    return bool(_IDENTITY_RE.search(norm(text)))


def wants_listener(text: str) -> bool:
    lowered = norm(text)
    return len(lowered.split()) <= 14 and bool(_LISTEN_RE.search(lowered))


def declines(text: str) -> bool:
    return bool(_DECLINE_RE.search(norm(text)))


def dont_know(text: str) -> bool:
    return bool(_DONT_KNOW_RE.match(norm(text)))


def yes_answer(text: str) -> bool:
    return bool(_YES_RE.match(norm(text)))


def no_answer(text: str) -> bool:
    return bool(_NO_RE.match(norm(text)))


def shows_strength(text: str) -> bool:
    return bool(_STRENGTH_RE.search(norm(text)))


def is_yes_no_question(question: str) -> bool:
    return bool(re.match(r"^(is|are|was|were|do|does|did|has|have|had|can|could|would|will|should)\b", norm(question)))


# --- short noun answers -------------------------------------------------------------------------

_CLAUSE_WORDS = set(
    (
        "i i'm im i've i'd i'll we we're he she they it it's there's that's am is are was were been be do does did "
        "have has had feel feels felt want wanted need needed think thought know knew can could will would should "
        "might must get got go went make made keep kept love hate hope wish try tried learned slept woke ate ran saw told "
        "came left took gave said met lost won sat stood fell broke spent paid sent bought thought brought"
    ).split()
)
_NOT_NOUN_WORDS = {"no", "not", "to", "either", "too", "also", "and", "or", "but", "so", "very", "really", "again"}
_STATUS_WORDS = {
    "fine", "ok", "okay", "good", "great", "bad", "alright", "normal", "same", "busy", "decent", "average", "meh",
    "whatever", "lol", "haha", "hmm", "cool", "sure", "thanks", "thank", "bye", "hi", "hello", "hey",
}
GENERIC_NOUNS = {
    "work", "job", "office", "health", "family", "school", "college", "studies", "study", "money", "sleep", "life",
    "relationship", "friends", "everything", "stuff", "things", "thing", "nothing", "today", "it", "this", "that",
    "people", "myself", "me",
}


def noun_answer(text: str) -> Optional[str]:
    """A short naming answer ("my manager", "maths"), flipped to second person, else None."""
    cleaned = norm(text).strip(" .!?")
    words = cleaned.split()
    if not re.fullmatch(r"[a-z0-9' -]+", cleaned):
        return None
    if not 1 <= len(words) <= 4 or any(word in _CLAUSE_WORDS for word in words):
        return None
    if any((word.endswith("ed") and len(word) > 3) or word in _STATUS_WORDS or word in _NOT_NOUN_WORDS for word in words):
        return None
    if dont_know(cleaned) or yes_answer(cleaned) or no_answer(cleaned):
        return None
    if all(word in GENERIC_NOUNS or word in FEELING_WORDS or word in {"my", "your", "the", "our", "a"} for word in words):
        return None
    if any(word in FEELING_WORDS for word in words):
        return None
    flipped = re.sub(r"\bmy\b", "your", cleaned)
    flipped = re.sub(r"\bour\b", "your", flipped)
    return re.sub(r"\b(about|abt)\s+", "", flipped)


_MADE_YOU_RE = re.compile(r"^what (made|makes) you (.+?)\??$")


def question_about(phrase: str, prompt: str, context_tone: str, asked: Sequence[str]) -> str:
    """A question built from a short answer, so the next step is about what they named."""
    match = _MADE_YOU_RE.match(norm(prompt))
    if context_tone == "positive":
        options = []
        if match:
            options.append(f"What is it about {phrase} that {match.group(1)} you {match.group(2)}?")
        options += [f"What about {phrase} felt good today?", f"What do you want to remember about {phrase}?"]
    elif context_tone == "negative":
        options = [
            f"What about {phrase} is weighing on you most?",
            f"How has {phrase} been affecting you?",
            f"What's been happening with {phrase}?",
        ]
    else:
        options = [
            f"What's been happening with {phrase}?",
            f"What about {phrase} is on your mind most?",
            f"How has {phrase} been affecting you?",
        ]
    said = " ".join(norm(text) for text in asked)
    for option in options:
        if norm(option) not in said:
            return option
    return options[-1]
