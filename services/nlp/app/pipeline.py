from __future__ import annotations

import hashlib
import os
from functools import lru_cache
from typing import List, Optional, Tuple

import numpy as np

try:
    from sentence_transformers import SentenceTransformer
except Exception:  # pragma: no cover - optional at runtime
    SentenceTransformer = None

try:
    from transformers import pipeline as hf_pipeline
except Exception:  # pragma: no cover - optional at runtime
    hf_pipeline = None

try:
    from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
except Exception:  # pragma: no cover - optional at runtime
    SentimentIntensityAnalyzer = None

try:
    from keybert import KeyBERT
except Exception:  # pragma: no cover - optional at runtime
    KeyBERT = None

try:
    import yake
except Exception:  # pragma: no cover - optional at runtime
    yake = None


EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "all-MiniLM-L6-v2")
SENTIMENT_MODEL_NAME = os.getenv(
    "SENTIMENT_MODEL_NAME", "distilbert-base-uncased-finetuned-sst-2-english"
)
EMOTION_MODEL_NAME = os.getenv("EMOTION_MODEL_NAME", "j-hartmann/emotion-english-distilroberta-base")

MOOD_SCALE = {
    "Sad": 1,
    "Stressed": 2,
    "Neutral": 3,
    "Calm": 4,
    "Happy": 5,
}


@lru_cache(maxsize=1)
def get_embedding_model():
    if SentenceTransformer is None:
        return None
    return SentenceTransformer(EMBEDDING_MODEL_NAME)


@lru_cache(maxsize=1)
def get_sentiment_pipeline():
    if hf_pipeline is None:
        return None
    return hf_pipeline("sentiment-analysis", model=SENTIMENT_MODEL_NAME)


@lru_cache(maxsize=1)
def get_emotion_pipeline():
    if hf_pipeline is None:
        return None
    return hf_pipeline("text-classification", model=EMOTION_MODEL_NAME, top_k=3)


@lru_cache(maxsize=1)
def get_vader():
    if SentimentIntensityAnalyzer is None:
        return None
    return SentimentIntensityAnalyzer()


@lru_cache(maxsize=1)
def get_keybert():
    if KeyBERT is None:
        return None
    model = get_embedding_model()
    if model is None:
        return None
    return KeyBERT(model=model)


@lru_cache(maxsize=1)
def get_yake():
    if yake is None:
        return None
    return yake.KeywordExtractor(lan="en", n=2, top=8)


def _fallback_embedding(text: str, dim: int = 384) -> List[float]:
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    seed = int.from_bytes(digest[:8], "big", signed=False)
    rng = np.random.default_rng(seed)
    vec = rng.standard_normal(dim)
    norm = np.linalg.norm(vec) or 1.0
    return (vec / norm).astype(float).tolist()


def embed_text(text: str) -> List[float]:
    model = get_embedding_model()
    if model is None:
        return _fallback_embedding(text)
    embedding = model.encode([text], normalize_embeddings=True)
    return embedding[0].astype(float).tolist()


def sentiment_from_transformer(text: str) -> Tuple[str, float]:
    pipeline = get_sentiment_pipeline()
    if pipeline is None:
        raise RuntimeError("Sentiment pipeline unavailable")
    result = pipeline(text, truncation=True)
    if not result:
        raise RuntimeError("No sentiment output")
    label = result[0]["label"].lower()
    score = float(result[0]["score"])
    if label == "positive":
        return "positive", score
    if label == "negative":
        return "negative", -score
    return "neutral", 0.0


def sentiment_from_vader(text: str) -> Tuple[str, float]:
    analyzer = get_vader()
    if analyzer is None:
        return "neutral", 0.0
    scores = analyzer.polarity_scores(text)
    compound = float(scores.get("compound", 0.0))
    if compound >= 0.2:
        return "positive", compound
    if compound <= -0.2:
        return "negative", compound
    return "neutral", compound


def get_sentiment(text: str) -> Tuple[str, float]:
    try:
        return sentiment_from_transformer(text)
    except Exception:
        return sentiment_from_vader(text)


def get_emotion(text: str) -> str:
    pipeline = get_emotion_pipeline()
    if pipeline is None:
        return "neutral"
    try:
        result = pipeline(text, truncation=True)
        if isinstance(result, list) and result and isinstance(result[0], list):
            best = max(result[0], key=lambda item: item.get("score", 0))
            return str(best.get("label", "neutral")).lower()
        if isinstance(result, list) and result:
            return str(result[0].get("label", "neutral")).lower()
    except Exception:
        return "neutral"
    return "neutral"


def extract_keyphrases(text: str, top_n: int = 8) -> List[str]:
    text = text.strip()
    if not text:
        return []
    keybert = get_keybert()
    if keybert is not None:
        try:
            phrases = keybert.extract_keywords(
                text, keyphrase_ngram_range=(1, 2), stop_words="english", top_n=top_n
            )
            return [phrase for phrase, _ in phrases]
        except Exception:
            pass
    extractor = get_yake()
    if extractor is not None:
        try:
            phrases = extractor.extract_keywords(text)
            return [phrase for phrase, _ in phrases[:top_n]]
        except Exception:
            return []
    return []


def mood_to_numeric(mood: Optional[str]) -> Optional[int]:
    if not mood:
        return None
    return MOOD_SCALE.get(mood)
