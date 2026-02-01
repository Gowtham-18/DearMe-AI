from app import pipeline


def test_get_emotion_fallback(monkeypatch) -> None:
    monkeypatch.setattr(pipeline, "get_emotion_pipeline", lambda: None)
    assert pipeline.get_emotion("I feel okay.") == "neutral"
