import numpy as np

from app import pipeline


def test_get_emotion_falls_back_to_lexicon(monkeypatch) -> None:
    monkeypatch.setattr(pipeline, "get_emotion_model", lambda: None)
    assert pipeline.get_emotion("I feel okay.") == "neutral"
    assert pipeline.get_emotion("I'm so anxious and worried") == "fear"


def test_affect_reports_degraded_when_model_missing(monkeypatch) -> None:
    monkeypatch.setattr(pipeline, "get_emotion_model", lambda: None)
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


def test_onnx_embedding_is_unit_length_and_semantic() -> None:
    vectors = [pipeline.embed_text(t) for t in ("I feel anxious about work", "Work is making me nervous", "I baked bread")]
    assert all(v is not None and len(v) == pipeline.EMBEDDING_DIM for v in vectors)
    a, b, c = (np.array(v) for v in vectors)
    assert abs(np.linalg.norm(a) - 1.0) < 1e-4
    assert a @ b > a @ c


def test_onnx_emotion_model_on_clear_cases() -> None:
    cases = {
        "I'm so anxious about my exam tomorrow, I can't sleep.": "fear",
        "I miss my grandmother so much, the house feels empty.": "sadness",
        "My manager yelled at me in front of everyone and I'm furious.": "anger",
        "Finally finished the project, I'm proud and relieved.": "joy",
    }
    for text, expected in cases.items():
        affect = pipeline.analyze_affect(text)
        assert affect.degraded == []
        assert affect.emotion == expected, (text, affect.emotion_scores)
        assert abs(sum(affect.emotion_scores.values()) - 1.0) < 1e-3


def test_keyphrases_come_from_the_text() -> None:
    text = "Work deadlines keep piling up and my manager keeps adding meetings. I barely sleep before deadlines."
    phrases = pipeline.extract_keyphrases(text, top_n=5)
    assert 1 <= len(phrases) <= 5
    assert len(set(phrases)) == len(phrases)
    assert all(word in text.lower() for phrase in phrases for word in phrase.split())
    assert any("deadline" in phrase or "manager" in phrase for phrase in phrases)
