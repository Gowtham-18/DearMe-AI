from __future__ import annotations

from typing import List, Optional


def generate_prompts(
    themes: List[str],
    sentiment_avg: float,
    last_mood: Optional[str],
) -> List[str]:
    prompts: List[str] = []

    if sentiment_avg <= -0.2:
        prompts.append("What felt heaviest this week, and what helped you move through it?")
    elif sentiment_avg >= 0.2:
        prompts.append("What moments brought you the most ease, and why do they matter?")
    else:
        prompts.append("What felt most steady this week, even in small ways?")

    if themes:
        prompts.append(f"When {themes[0].lower()} showed up, what did you need most?")

    if last_mood:
        prompts.append(f"Looking back on feeling {last_mood.lower()}, what would you tell yourself now?")

    fallback = [
        "What is one small intention you want to carry into tomorrow?",
        "Where did you show yourself care this week?",
        "What would a gentler next step look like?",
    ]

    for item in fallback:
        if len(prompts) >= 4:
            break
        if item not in prompts:
            prompts.append(item)

    return prompts[:4]
