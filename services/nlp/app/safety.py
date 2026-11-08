import re
from typing import Dict, Tuple

# Deliberately conservative: a false positive shows support resources, a false negative
# misses someone who needs them. Keep in sync with apps/web/lib/safety.ts.
CRISIS_PATTERNS: Tuple[Tuple[str, re.Pattern[str]], ...] = (
    ("suicide", re.compile(r"\bsuicid(e|al)\b")),
    ("self_harm_intent", re.compile(r"\b(kill(ing)?|hang(ing)?|shoot(ing)?)\s+myself\b")),
    ("end_life", re.compile(r"\b(end(ing)?|take|taking)\s+(my|my own)\s+life\b")),
    ("end_it_all", re.compile(r"\bend(ing)?\s+it\s+all\b")),
    (
        "self_harm",
        re.compile(
            r"\b(self[-\s]?harm(ing)?|(hurt|hurting|cut|cutting|harm|harming|burn|burning)\s+myself"
            r"(?!\s+(a|an|some|off|short|loose|free)\b))\b"
        ),
    ),
    ("want_to_die", re.compile(r"\b(want(ed)?|wanna|going)\s+to\s+die\b")),
    ("wish_dead", re.compile(r"\bwish\s+i\s+(was|were)\s+(dead|never\s+born)\b")),
    ("better_off", re.compile(r"\bbetter\s+off\s+(dead|without\s+me)\b")),
    ("no_reason_to_live", re.compile(r"\b(no\s+reason|nothing(\s+left)?)\s+to\s+live(\s+for)?\b")),
    ("cant_go_on", re.compile(r"\b(can'?t|cannot)\s+go\s+on\b")),
    ("dont_want_to_live", re.compile(r"\bdon'?t\s+want\s+to\s+(be\s+alive|live|exist|be\s+here\s+anymore|wake\s+up)\b")),
    ("overdose", re.compile(r"\boverdos(e|ed|ing)\b")),
    # Passive ideation: easy to miss, important to meet with a gentle check-in.
    ("if_i_were_gone", re.compile(r"\b(if|when)\s+i\s+(disappeared|was\s+gone|were\s+gone|died|was\s+dead|wasn'?t\s+(here|around)|weren'?t\s+(here|around))\b")),
    ("want_to_disappear", re.compile(r"\bwant\s+to\s+(disappear|vanish|not\s+exist)\b")),
    ("no_point_living", re.compile(r"\b(no|what'?s\s+the|what\s+is\s+the)\s+point\s+(in|of)\s+(living|life|being\s+alive|going\s+on|anything)\b")),
    ("not_worth_living", re.compile(r"\b(life\s+is\s+)?not\s+worth\s+living\b")),
    ("sleep_forever", re.compile(r"\b(sleep\s+forever|never\s+wake\s+up)\b")),
    ("slang", re.compile(r"\b(kms|unalive|unaliving)\b")),
)

CRISIS_RESOURCES = (
    "If you're in immediate danger, call your local emergency number. "
    "In the US, you can call or text 988 (Suicide & Crisis Lifeline). "
    "Elsewhere, findahelpline.com lists free, confidential support lines."
)


def _normalize(text: str) -> str:
    return text.replace("’", "'").replace("‘", "'").lower()


def detect_crisis(text: str) -> Dict[str, str | bool | None]:
    normalized = _normalize(text or "")
    for _name, pattern in CRISIS_PATTERNS:
        if pattern.search(normalized):
            return {"crisis": True, "reason": "Detected crisis-related language."}
    return {"crisis": False, "reason": None}
