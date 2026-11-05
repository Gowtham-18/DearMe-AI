from app import pipeline


def test_get_emotion_falls_back_to_lexicon(monkeypatch) -> None:
    monkeypatch.setattr(pipeline, "get_emotion_pipeline", lambda: None)
    assert pipeline.get_emotion("I feel okay.") == "neutral"
    assert pipeline.get_emotion("I'm so anxious and worried") == "fear"


def test_affect_reports_degraded_when_model_missing(monkeypatch) -> None:
    monkeypatch.setattr(pipeline, "get_emotion_pipeline", lambda: None)
    affect = pipeline.analyze_affect("I'm grateful for a calm evening")
    assert "emotion_model_unavailable" in affect.degraded
    assert affect.sentiment_label == "positive"


def test_sentiment_from_emotion_distribution(monkeypatch) -> None:
    monkeypatch.setattr(pipeline, "get_emotion_scores", lambda text: {"sadness": 0.8, "neutral": 0.2})
    monkeypatch.setattr(pipeline, "_vader_compound", lambda text: None)
    affect = pipeline.analyze_affect("whatever")
    assert affect.emotion == "sadness"
    assert affect.sentiment_label == "negative"
    assert -0.81 <= affect.sentiment_score <= -0.79


def test_neutral_text_can_be_neutral(monkeypatch) -> None:
    monkeypatch.setattr(pipeline, "get_emotion_scores", lambda text: {"neutral": 0.9, "joy": 0.1})
    monkeypatch.setattr(pipeline, "_vader_compound", lambda text: 0.0)
    assert pipeline.analyze_affect("I went to the store.").sentiment_label == "neutral"


def test_no_fake_embedding_when_model_missing(monkeypatch) -> None:
    monkeypatch.setattr(pipeline, "get_embedding_model", lambda: None)
    assert pipeline.embed_text("anything") is None
