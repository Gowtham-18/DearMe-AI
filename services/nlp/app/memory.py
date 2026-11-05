"""Remembered facts: the people and upcoming events someone writes about.

Rule-based on purpose: it runs offline, is predictable, and only keeps what was said plainly
("my sister Priya", "my interview is on Friday"). The web app stores the facts (owner-only rows)
and passes them back so prompts and replies can follow up later.
"""
from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Dict, List, Optional, Sequence

from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS

from .models import ExtractedFact, MemoryFact

MAX_PEOPLE = 6
MAX_EVENTS = 4
EVENT_HORIZON_DAYS = 120

# Relation word as written -> the key it merges under ("mom" and "mum" are the same person).
RELATIONS: Dict[str, str] = {
    "mom": "mother", "mum": "mother", "mother": "mother", "mommy": "mother", "mummy": "mother", "amma": "mother",
    "dad": "father", "father": "father", "daddy": "father", "papa": "father", "appa": "father",
    "parents": "parents",
    "sister": "sister", "brother": "brother", "sibling": "sibling",
    "son": "son", "daughter": "daughter", "kids": "kids", "children": "kids",
    "wife": "wife", "husband": "husband", "partner": "partner",
    "boyfriend": "boyfriend", "girlfriend": "girlfriend", "fiance": "fiance", "fiancé": "fiance", "fiancée": "fiance",
    "friend": "friend", "best friend": "best friend", "roommate": "roommate", "flatmate": "roommate",
    "boss": "boss", "manager": "manager", "coworker": "coworker", "co-worker": "coworker", "colleague": "colleague",
    "teacher": "teacher", "professor": "professor", "mentor": "mentor", "therapist": "therapist", "counsellor": "therapist",
    "counselor": "therapist", "doctor": "doctor",
    "grandma": "grandmother", "grandmother": "grandmother", "grandpa": "grandfather", "grandfather": "grandfather",
    "aunt": "aunt", "uncle": "uncle", "cousin": "cousin", "niece": "niece", "nephew": "nephew",
    "neighbour": "neighbour", "neighbor": "neighbour", "ex": "ex",
}
_REL_ALT = "|".join(sorted((re.escape(word) for word in RELATIONS), key=len, reverse=True))
_REL_MODIFIERS = r"(?:(?:close|old|little|big|older|younger|twin|elder|new)\s+)?"
_NAME = r"([A-Z][a-z]{1,20})"
_REL_THEN_NAME_RE = re.compile(rf"\b[Mm]y\s+{_REL_MODIFIERS}({_REL_ALT})\b(?:,?\s+{_NAME}\b)?")
_NAME_THEN_REL_RE = re.compile(rf"\b{_NAME},\s+(?:who(?:'s| is)\s+)?my\s+{_REL_MODIFIERS}({_REL_ALT})\b")

# Capitalised words that are not names.
_NOT_NAMES = {
    "i", "im", "ive", "id", "ill", "the", "a", "an", "and", "but", "so", "or", "then", "today", "tomorrow", "yesterday",
    "tonight", "this", "that", "these", "those", "he", "she", "they", "we", "it", "my", "our", "his", "her", "their",
    "you", "me", "us", "him", "them", "is", "was", "were", "are", "has", "had", "have", "did", "does", "said", "says",
    "called", "texted", "told", "asked", "came", "went", "god", "lord", "mr", "mrs", "ms", "dr", "ok", "okay", "also",
    "just", "still", "again", "later", "now", "finally", "anyway", "who", "when", "what", "why", "how", "because", "after", "before", "if", "not", "no",
    "yes", "maybe", "christmas", "diwali", "eid", "easter", "monday", "tuesday", "wednesday", "thursday", "friday",
    "saturday", "sunday", "january", "february", "march", "april", "may", "june", "july", "august", "september",
    "october", "november", "december", "mom", "mum", "dad", "sister", "brother", "friend", "boss", "manager",
}

EVENT_WORDS = (
    "exam", "exams", "test", "finals", "interview", "presentation", "appointment", "deadline", "surgery", "operation",
    "results", "meeting", "wedding", "trip", "flight", "birthday", "party", "recital", "performance review", "audition",
    "hearing", "scan", "checkup", "check-up", "graduation", "viva", "demo", "launch", "pitch", "concert", "match",
    "first day", "court date", "date night", "therapy session", "driving test", "job interview",
)
_EVENT_ALT = "|".join(sorted((re.escape(word) for word in EVENT_WORDS), key=len, reverse=True))
_EVENT_RE = re.compile(rf"\b(?:(?:my|the|a|an|our|his|her|their)\s+)?(?:([A-Za-z][a-z'’-]+)\s+)?({_EVENT_ALT})\b", re.IGNORECASE)
# Words that can sit before an event word but aren't part of its name.
_NOT_QUALIFIERS = set(ENGLISH_STOP_WORDS) | {
    "got", "having", "attend", "attending", "prep", "prepping", "prepare", "preparing", "nervous", "scared", "worried",
    "stressed", "excited", "upcoming", "coming", "big", "huge", "important", "another", "next", "this", "that", "today",
    "tomorrow", "tonight", "passed", "failed", "pass", "fail", "study", "studying", "for", "about", "had", "have",
    "has", "is", "was", "dreading", "ace", "aced", "the", "mock", "practice",
}
_PAST_RE = re.compile(r"\b(yesterday|last (?:week|night|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|ago|went well|went badly)\b", re.I)

_WEEKDAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
_MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3, "apr": 4, "april": 4, "may": 5,
    "jun": 6, "june": 6, "jul": 7, "july": 7, "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}
_NUMBER_WORDS = {"a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "ten": 10, "couple of": 2, "few": 3}
_MONTH_ALT = "|".join(sorted(_MONTHS, key=len, reverse=True))
_ORD = r"(?:st|nd|rd|th)?"


def _safe_date(year: int, month: int, day: int) -> Optional[date]:
    try:
        return date(year, month, day)
    except ValueError:
        return None


def resolve_date(sentence: str, base: date) -> Optional[date]:
    """The first date a sentence points to, relative to the day it was written."""
    s = sentence.lower()
    if re.search(r"\bday after tomorrow\b", s):
        return base + timedelta(days=2)
    if re.search(r"\btomorrow\b", s):
        return base + timedelta(days=1)
    if re.search(r"\b(today|tonight|this (?:morning|afternoon|evening))\b", s):
        return base
    match = re.search(rf"\bin (\d{{1,3}}|{'|'.join(_NUMBER_WORDS)}) (day|days|week|weeks)\b", s)
    if match:
        raw = match.group(1)
        count = int(raw) if raw.isdigit() else _NUMBER_WORDS[raw]
        return base + timedelta(days=count * (7 if match.group(2).startswith("week") else 1))
    match = re.search(rf"\b(?:({_MONTH_ALT})\.?\s+(\d{{1,2}}){_ORD}|(\d{{1,2}}){_ORD}\s+(?:of\s+)?({_MONTH_ALT}))\b", s)
    if match:
        month = _MONTHS[match.group(1) or match.group(4)]
        day = int(match.group(2) or match.group(3))
        found = _safe_date(base.year, month, day)
        if found and found < base:
            found = _safe_date(base.year + 1, month, day)
        return found
    match = re.search(r"\bthe (\d{1,2})(?:st|nd|rd|th)\b", s)
    if match:
        day = int(match.group(1))
        found = _safe_date(base.year, base.month, day)
        if found is None or found < base:
            year, month = (base.year + 1, 1) if base.month == 12 else (base.year, base.month + 1)
            found = _safe_date(year, month, day)
        return found
    match = re.search(rf"\b(?:(next|this|coming|on)\s+)?({'|'.join(_WEEKDAYS)})\b", s)
    if match:
        delta = (_WEEKDAYS.index(match.group(2)) - base.weekday()) % 7
        if delta == 0 and match.group(1) != "this":
            delta = 7
        return base + timedelta(days=delta)
    if re.search(r"\bthis weekend\b", s):
        return base + timedelta(days=(5 - base.weekday()) % 7)
    if re.search(r"\bnext week\b", s):
        return base + timedelta(days=7)
    return None


def _sentences(text: str) -> List[str]:
    return [part.strip() for part in re.split(r"(?<=[.!?])\s+|\n+", text) if part.strip()]


def _people(text: str, seen_on: str) -> List[ExtractedFact]:
    found: Dict[str, ExtractedFact] = {}

    def add(relation_written: str, name: Optional[str]) -> None:
        relation = relation_written.lower()
        if name and name.lower() not in _NOT_NAMES:
            key = f"person:{name.lower()}"
            found[key] = ExtractedFact(kind="person", key=key, label=name, detail=relation, seen_on=seen_on)
            # A named mention replaces the unnamed one from the same entry ("my sister" ... "my sister Priya").
            found.pop(f"person:rel:{RELATIONS[relation]}", None)
        else:
            key = f"person:rel:{RELATIONS[relation]}"
            named_same = any(f.detail and RELATIONS.get(f.detail) == RELATIONS[relation] for f in found.values())
            if key not in found and not named_same:
                found[key] = ExtractedFact(kind="person", key=key, label=relation, detail=None, seen_on=seen_on)

    for match in _NAME_THEN_REL_RE.finditer(text):
        add(match.group(2), match.group(1))
    for match in _REL_THEN_NAME_RE.finditer(text):
        add(match.group(1), match.group(2))
    return list(found.values())[:MAX_PEOPLE]


def _event_label(qualifier: Optional[str], event: str) -> str:
    event = event.lower()
    if not qualifier:
        return event
    plain = qualifier.lower().replace("’", "'")
    if plain.removesuffix("'s") in _NOT_QUALIFIERS or plain in _NOT_QUALIFIERS:
        return event
    keep_case = qualifier[0].isupper() and plain.endswith("'s")  # "Priya's wedding"
    return f"{qualifier.replace('’', chr(39)) if keep_case else plain} {event}"


def _events(text: str, base: date, seen_on: str) -> List[ExtractedFact]:
    found: Dict[str, ExtractedFact] = {}
    for sentence in _sentences(text):
        if _PAST_RE.search(sentence):
            continue
        event = _EVENT_RE.search(sentence)
        if not event:
            continue
        when = resolve_date(sentence, base)
        if when is None or when < base or (when - base).days > EVENT_HORIZON_DAYS:
            continue
        label = _event_label(event.group(1), event.group(2))
        key = f"event:{label.lower()}:{when.isoformat()}"
        found[key] = ExtractedFact(kind="event", key=key, label=label, event_date=when.isoformat(), seen_on=seen_on)
    return list(found.values())[:MAX_EVENTS]


def extract_facts(text: str, entry_date: Optional[str] = None) -> List[ExtractedFact]:
    """People and dated upcoming events, plainly stated in one entry."""
    try:
        base = date.fromisoformat(entry_date) if entry_date else date.today()
    except ValueError:
        base = date.today()
    seen_on = base.isoformat()
    return _people(text, seen_on) + _events(text, base, seen_on)


# ---------------------------------------------------------------------------------------------
# Using what's remembered


def person_reference(fact: MemoryFact) -> str:
    """'your sister Priya', 'Priya' or 'your boss'."""
    if fact.detail:
        return f"your {fact.detail} {fact.label}"
    if fact.label.lower() in RELATIONS:
        return f"your {fact.label}"
    return fact.label


def event_reference(fact: MemoryFact) -> str:
    """'your job interview' or "Priya's wedding"."""
    first = fact.label.split()[0]
    return fact.label if first.endswith("'s") and first[0].isupper() else f"your {fact.label}"


def day_phrase(day: date, today: date) -> str:
    """'today', 'tomorrow', 'yesterday', 'on Friday', 'on 20 Nov'."""
    delta = (day - today).days
    if delta == 0:
        return "today"
    if delta == 1:
        return "tomorrow"
    if delta == -1:
        return "yesterday"
    if -6 <= delta <= 6:
        return f"{'last ' if delta < 0 and day.weekday() >= today.weekday() else 'on '}{_WEEKDAYS[day.weekday()].title()}"
    return f"on {day.day} {day.strftime('%b')}"


def _parse(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def due_event(facts: Sequence[MemoryFact], today: date) -> Optional[MemoryFact]:
    """The event most worth asking about: one that just happened, then today's, then the next few days'."""
    best = None
    best_rank = None
    for fact in facts:
        when = _parse(fact.event_date)
        if fact.kind != "event" or when is None:
            continue
        answered = _parse(fact.followed_up_on)
        delta = (when - today).days
        if -7 <= delta < 0 and (answered is None or answered <= when):
            rank = (0, -delta)  # most recent past event first
        elif delta == 0 and answered is None:
            rank = (1, 0)
        elif 0 < delta <= 3 and answered is None:
            rank = (2, delta)
        else:
            continue
        if best_rank is None or rank < best_rank:
            best, best_rank = fact, rank
    return best


def recurring_person(facts: Sequence[MemoryFact], today: date) -> Optional[MemoryFact]:
    """Someone mentioned in at least two entries recently, not asked about in the last week."""
    candidates = []
    for fact in facts:
        if fact.kind != "person" or fact.mention_count < 2:
            continue
        seen = _parse(fact.last_seen)
        if seen is None or (today - seen).days > 21:
            continue
        answered = _parse(fact.followed_up_on)
        if answered is not None and (today - answered).days < 7:
            continue
        named = fact.label.lower() not in RELATIONS
        candidates.append(((not named, -fact.mention_count, -(seen.toordinal())), fact))
    return min(candidates, key=lambda item: item[0])[1] if candidates else None


def _mentions(text: str, phrase: str) -> bool:
    return bool(re.search(rf"\b{re.escape(phrase.lower())}\b", text.lower()))


def memory_note(message: str, facts: Sequence[MemoryFact], today: date) -> Optional[str]:
    """One line that shows the companion remembers someone or something the person just brought up."""
    for fact in facts:
        if fact.kind != "person" or not fact.detail or fact.label.lower() in RELATIONS:
            continue
        names_them = _mentions(message, fact.label)
        names_relation = _mentions(message, f"my {fact.detail}")
        if names_them and not _mentions(message, fact.detail):
            return f"You've mentioned {fact.label} before, your {fact.detail}."
        if names_relation and not names_them:
            return f"You've mentioned your {fact.detail} {fact.label} before."
    for fact in facts:
        when = _parse(fact.event_date)
        if fact.kind != "event" or when is None or when < today or (when - today).days > 14:
            continue
        head = fact.label.split()[-1]
        if _mentions(message, head):
            return f"You mentioned {event_reference(fact)} is {day_phrase(when, today)}."
    return None
