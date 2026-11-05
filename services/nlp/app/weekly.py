from __future__ import annotations

from collections import Counter
from datetime import datetime
from typing import Dict, List, Optional

from .prompts import generate_prompts
from .safety import CRISIS_RESOURCES


def _snippet(text: str, limit: int = 140) -> str:
    cleaned = " ".join(text.split())
    if len(cleaned) <= limit:
        return cleaned
    return f"{cleaned[:limit].rstrip()}..."


def _entry_day(entry: Dict) -> Optional[str]:
    raw = entry.get("entry_date") or entry.get("created_at") or ""
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00")).strftime("%A")
    except ValueError:
        return None


def _score(entry: Dict) -> Optional[float]:
    sentiment = entry.get("sentiment")
    if isinstance(sentiment, dict) and sentiment.get("score") is not None:
        return float(sentiment["score"])
    return None


def _build_theme_evidence(entries: List[Dict], themes: List[Dict]) -> List[Dict]:
    entry_map = {entry["entry_id"]: entry for entry in entries}
    evidence_cards: List[Dict] = []
    seen = set()
    for theme in themes[:3]:
        for member in theme.get("members", [])[:2]:
            entry_id = member.get("entry_id")
            if not entry_id or entry_id in seen or entry_id not in entry_map:
                continue
            snippet = member.get("snippet") or _snippet(entry_map[entry_id].get("text", ""))
            if not snippet:
                continue
            evidence_cards.append(
                {"entry_id": entry_id, "snippet": snippet, "reason": f"Connected to {theme.get('label', 'a theme')}."}
            )
            seen.add(entry_id)
    return evidence_cards


def build_weekly_reflection(entries: List[Dict], themes: List[Dict], safety: Dict) -> Dict:
    if safety.get("crisis"):
        return {
            "summary_blocks": [
                {
                    "title": "You're not alone",
                    "text": "Some of what you wrote this week sounded very painful. " + CRISIS_RESOURCES,
                    "evidence": [],
                }
            ],
            "evidence_cards": [],
            "prompts_next_week": [],
            "safety": safety,
        }

    week_ids = {entry["entry_id"] for entry in entries}
    active_themes = [
        theme for theme in themes
        if theme.get("label") and any(m.get("entry_id") in week_ids for m in theme.get("members", []))
    ]
    theme_labels = [theme["label"] for theme in active_themes][:3]

    phrase_counts: Counter = Counter()
    for entry in entries:
        phrase_counts.update({phrase.lower() for phrase in entry.get("keyphrases", []) if phrase})
    repeated_phrases = [phrase for phrase, count in phrase_counts.most_common(5) if count >= 2]

    scored = [(entry, _score(entry)) for entry in entries]
    scores = [score for _, score in scored if score is not None]
    avg_sentiment = sum(scores) / len(scores) if scores else 0.0

    days = {day for day in (_entry_day(entry) for entry in entries) if day}
    moods = Counter(entry["mood"] for entry in entries if entry.get("mood"))

    evidence_cards = _build_theme_evidence(entries, active_themes)
    blocks: List[Dict] = []

    count = len(entries)
    rhythm = f"You journaled {count} time{'s' if count != 1 else ''}"
    rhythm += f" across {len(days)} day{'s' if len(days) != 1 else ''}." if days else "."
    if moods:
        top_mood, top_count = moods.most_common(1)[0]
        rhythm += f" The mood you picked most was {top_mood.lower()} ({top_count} of {count})."
    if len(scores) >= 3:
        half = len(scores) // 2
        first, second = sum(scores[:half]) / half, sum(scores[half:]) / (len(scores) - half)
        if second - first > 0.15:
            rhythm += " Your entries grew lighter as the week went on."
        elif first - second > 0.15:
            rhythm += " Your entries grew heavier as the week went on."
        else:
            rhythm += " The tone of your entries stayed fairly even."
    blocks.append({"title": "How your week moved", "text": rhythm, "evidence": []})

    if theme_labels:
        blocks.append(
            {
                "title": "Themes you returned to",
                "text": f"You came back to {', '.join(label.lower() for label in theme_labels)}.",
                "evidence": [card["entry_id"] for card in evidence_cards[:2]],
            }
        )
    elif repeated_phrases:
        blocks.append(
            {
                "title": "Words that kept coming up",
                "text": f"You mentioned {', '.join(repeated_phrases[:3])} more than once.",
                "evidence": [],
            }
        )

    positive = [(entry, score) for entry, score in scored if score is not None and score > 0.2]
    if positive:
        best_entry, _ = max(positive, key=lambda item: item[1])
        day = _entry_day(best_entry)
        card = {
            "entry_id": best_entry["entry_id"],
            "snippet": _snippet(best_entry["text"]),
            "reason": "Your most positive entry this week.",
        }
        if all(existing["entry_id"] != card["entry_id"] for existing in evidence_cards):
            evidence_cards.append(card)
        blocks.append(
            {
                "title": "A lighter moment",
                "text": f"Your most positive entry came on {day}." if day else "One entry stood out as more positive.",
                "evidence": [best_entry["entry_id"]],
            }
        )

    negative = [(entry, score) for entry, score in scored if score is not None and score < -0.3]
    if negative:
        hard_entry, _ = min(negative, key=lambda item: item[1])
        if all(existing["entry_id"] != hard_entry["entry_id"] for existing in evidence_cards):
            evidence_cards.append(
                {"entry_id": hard_entry["entry_id"], "snippet": _snippet(hard_entry["text"]), "reason": "A harder moment this week."}
            )

    focus = (theme_labels[0] if theme_labels else (repeated_phrases[0] if repeated_phrases else None))
    blocks.append(
        {
            "title": "Gentle experiment",
            "text": (
                f"Next week, try noticing when {focus.lower()} shows up and jot one line about it."
                if focus
                else "Next week, try a two-minute check-in on the days you don't journal."
            ),
            "evidence": [],
        }
    )

    prompts = generate_prompts(theme_labels or repeated_phrases, avg_sentiment, entries[-1].get("mood") if entries else None)

    return {
        "summary_blocks": blocks,
        "evidence_cards": evidence_cards[:4],
        "prompts_next_week": prompts,
        "safety": safety,
    }
