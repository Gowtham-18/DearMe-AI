import pytest

from app.safety import detect_crisis


@pytest.mark.parametrize(
    "text",
    [
        "I want to kill myself and disappear.",
        "I don’t want to be alive anymore",
        "everyone would be better off without me",
        "I've been cutting myself again",
        "there's nothing left to live for",
        "I just want to end it all",
        "I keep thinking about taking my own life",
        "I can't go on like this",
        "thinking about suicide",
    ],
)
def test_detects_crisis_language(text: str) -> None:
    assert detect_crisis(text)["crisis"] is True


@pytest.mark.parametrize(
    "text",
    [
        "I felt tired today but I'm okay.",
        "This deadline is killing me but we shipped it.",
        "I cut myself a slice of cake to celebrate.",
        "Trying to cut myself some slack this week.",
        "Live music tonight was the best.",
    ],
)
def test_ignores_non_crisis_language(text: str) -> None:
    assert detect_crisis(text)["crisis"] is False
