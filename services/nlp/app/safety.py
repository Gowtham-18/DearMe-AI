import re
from typing import Dict, Tuple


CRISIS_PATTERNS: Tuple[re.Pattern[str], ...] = (
    re.compile(r"\b(suicid(e|al)|kill myself|end my life)\b", re.IGNORECASE),
    re.compile(r"\b(self[-\s]?harm|hurt myself)\b", re.IGNORECASE),
    re.compile(r"\b(no reason to live|want to die|can't go on)\b", re.IGNORECASE),
)


def detect_crisis(text: str) -> Dict[str, str | bool | None]:
    for pattern in CRISIS_PATTERNS:
        if pattern.search(text):
            return {"crisis": True, "reason": "Detected crisis-related language."}
    return {"crisis": False, "reason": None}
