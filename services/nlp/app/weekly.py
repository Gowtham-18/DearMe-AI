from __future__ import annotations

from typing import Dict, List

from .prompts import generate_prompts


def _snippet(text: str, limit: int = 140) -> str:
    cleaned = " ".join(text.split())
    if len(cleaned) <= limit:
        return cleaned
    return f"{cleaned[:limit].rstrip()}..."


def _build_theme_evidence(entries: List[Dict], themes: List[Dict]) -> List[Dict]:
    entry_map = {entry["entry_id"]: entry for entry in entries}
    evidence_cards: List[Dict] = []
    seen = set()

    for theme in themes[:3]:
        members = theme.get("members", [])
        for member in members[:2]:
            entry_id = member.get("entry_id")
            if not entry_id or entry_id in seen:
                continue
            entry = entry_map.get(entry_id)
            snippet = member.get("snippet") or (entry and _snippet(entry.get("text", "")))
            if not snippet:
                continue
            evidence_cards.append(
                {
                    "entry_id": entry_id,
                    "snippet": snippet,
                    "reason": member.get("reason") or f"Connected to {theme.get('label', 'a theme')}.",
                }
            )
            seen.add(entry_id)

    return evidence_cards


def build_weekly_reflection(entries: List[Dict], themes: List[Dict], safety: Dict) -> Dict:
    if safety.get("crisis"):
        return {
            "summary_blocks": [
                {
                    "title": "You're not alone",
                    "text": "If you're feeling overwhelmed, consider reaching out to someone you trust.",
                    "evidence": [],
                }
            ],
            "evidence_cards": [],
            "prompts_next_week": [],
            "safety": safety,
        }

    sentiments = [entry["sentiment"]["score"] for entry in entries if entry.get("sentiment")]
    avg_sentiment = sum(sentiments) / len(sentiments) if sentiments else 0.0

    theme_labels = [theme.get("label") for theme in themes if theme.get("label")][:3]
    top_theme = theme_labels[0] if theme_labels else "steady rhythms"

    evidence_cards = _build_theme_evidence(entries, themes)
    if not evidence_cards:
        for entry in sorted(entries, key=lambda e: abs(e.get("sentiment", {}).get("score", 0.0)), reverse=True)[:3]:
            evidence_cards.append(
                {
                    "entry_id": entry["entry_id"],
                    "snippet": _snippet(entry["text"]),
                    "reason": "Notable emotional signal this week.",
                }
            )

    summary_blocks = [
        {
            "title": "Themes you returned to",
            "text": f"You revisited {', '.join(theme_labels) if theme_labels else 'a few steady ideas'}.",
            "evidence": [card["entry_id"] for card in evidence_cards[:2]],
        },
        {
            "title": "What helped",
            "text": "You created space for small resets and steady habits.",
            "evidence": [card["entry_id"] for card in evidence_cards[1:3]],
        },
        {
            "title": "Gentle experiment",
            "text": f"Try a tiny ritual that supports {top_theme.lower()}.",
            "evidence": [],
        },
    ]

    prompts = generate_prompts(theme_labels, avg_sentiment, entries[-1].get("mood") if entries else None)

    return {
        "summary_blocks": summary_blocks,
        "evidence_cards": evidence_cards,
        "prompts_next_week": prompts,
        "safety": safety,
    }