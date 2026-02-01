from app.safety import detect_crisis


def test_detects_crisis_language() -> None:
    result = detect_crisis("I want to kill myself and disappear.")
    assert result["crisis"] is True


def test_ignores_non_crisis_language() -> None:
    result = detect_crisis("I felt tired today but I'm okay.")
    assert result["crisis"] is False
