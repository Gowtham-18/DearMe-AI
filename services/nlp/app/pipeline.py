from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Dict, List, Optional, Tuple

os.environ.setdefault("TRANSFORMERS_NO_TF", "1")
os.environ.setdefault("TRANSFORMERS_NO_FLAX", "1")

try:
    import torch

    torch.set_num_threads(max(1, int(os.getenv("TORCH_NUM_THREADS", "1"))))
    torch.set_grad_enabled(False)
except Exception:  # pragma: no cover - optional at runtime
    torch = None

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


logger = logging.getLogger("nlp-service")

EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "all-MiniLM-L6-v2")
SENTIMENT_MODEL_NAME = os.getenv(
    "SENTIMENT_MODEL_NAME", "distilbert-base-uncased-finetuned-sst-2-english"
)
EMOTION_MODEL_NAME = os.getenv("EMOTION_MODEL_NAME", "j-hartmann/emotion-english-distilroberta-base")

# "emotion" (default): sentiment is derived from the emotion model's full probability
#   distribution, blended with VADER. One model, consistent signals, real neutral class.
# "transformer": the binary SST-2 model (loads a third model, ~260 MB more memory).
# "vader": lexicon only.
SENTIMENT_SOURCE = os.getenv("SENTIMENT_SOURCE", "emotion").strip().lower()

# Low-memory mode skips the emotion transformer and uses lexicon emotion + VADER sentiment.
LOW_MEMORY = os.getenv("NLP_LOW_MEMORY", "false").strip().lower() in {"1", "true", "yes"}

EMBEDDING_DIM = 384

# Valence weight per emotion label (j-hartmann/emotion-english-distilroberta-base labels).
EMOTION_VALENCE = {
    "joy": 1.0,
    "surprise": 0.15,
    "neutral": 0.0,
    "sadness": -1.0,
    "anger": -0.85,
    "fear": -0.8,
    "disgust": -0.85,
}

MOOD_SCALE = {
    "Sad": 1,
    "Stressed": 2,
    "Neutral": 3,
    "Calm": 4,
    "Happy": 5,
    "Anxious": 2,
    "Tired": 2,
    "Lonely": 2,
    "Overwhelmed": 2,
    "Grateful": 5,
    "Irritated": 2,
    "Hopeful": 5,
    "Focused": 4,
}

# Small lexicon used when the emotion model is unavailable (low-memory mode or load failure).
_EMOTION_LEXICON: Dict[str, Tuple[str, ...]] = {
    "sadness": ("sad", "down", "lonely", "cry", "cried", "crying", "grief", "miss", "hurt", "empty", "hopeless"),
    "fear": ("anxious", "anxiety", "scared", "afraid", "worried", "worry", "nervous", "panic", "dread"),
    "anger": ("angry", "furious", "mad", "irritated", "annoyed", "frustrated", "resent", "unfair"),
    "joy": ("happy", "grateful", "glad", "excited", "proud", "joy", "relieved", "calm", "peaceful", "love"),
    "surprise": ("surprised", "unexpected", "shocked", "suddenly"),
    "disgust": ("disgusted", "gross", "sick of", "repulsed"),
}


@dataclass
class Affect:
    sentiment_label: str
    sentiment_score: float
    emotion: str
    emotion_confidence: float
    emotion_scores: Dict[str, float] = field(default_factory=dict)
    degraded: List[str] = field(default_factory=list)


@lru_cache(maxsize=1)
def get_embedding_model():
    if SentenceTransformer is None:
        return None
    try:
        return SentenceTransformer(EMBEDDING_MODEL_NAME)
    except Exception:
        logger.warning("embedding model failed to load")
        return None


@lru_cache(maxsize=1)
def get_sentiment_pipeline():
    if hf_pipeline is None or SENTIMENT_SOURCE != "transformer":
        return None
    try:
        return hf_pipeline("sentiment-analysis", model=SENTIMENT_MODEL_NAME, framework="pt")
    except Exception:
        logger.warning("sentiment model failed to load")
        return None


@lru_cache(maxsize=1)
def get_emotion_pipeline():
    if hf_pipeline is None or LOW_MEMORY:
        return None
    try:
        return hf_pipeline("text-classification", model=EMOTION_MODEL_NAME, top_k=None, framework="pt")
    except Exception:
        logger.warning("emotion model failed to load")
        return None


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


def models_status() -> Dict[str, bool]:
    return {
        "embedding": get_embedding_model.cache_info().currsize > 0 and get_embedding_model() is not None,
        "emotion": get_emotion_pipeline.cache_info().currsize > 0 and get_emotion_pipeline() is not None,
    }


def embed_text(text: str) -> Optional[List[float]]:
    """Return a normalized 384-d embedding, or None when the model is unavailable.

    No placeholder vectors: a fake embedding stored in pgvector would silently
    corrupt similarity search and theme clustering.
    """
    model = get_embedding_model()
    if model is None or not text.strip():
        return None
    try:
        embedding = model.encode([text], normalize_embeddings=True)
        return embedding[0].astype(float).tolist()
    except Exception:
        logger.warning("embedding failed")
        return None


def _normalize_label_scores(result) -> Dict[str, float]:
    if isinstance(result, list) and result and isinstance(result[0], list):
        result = result[0]
    if isinstance(result, dict):
        result = [result]
    scores: Dict[str, float] = {}
    for item in result or []:
        label = str(item.get("label", "")).lower()
        if label:
            scores[label] = float(item.get("score", 0.0))
    return scores


def get_emotion_scores(text: str) -> Optional[Dict[str, float]]:
    pipeline = get_emotion_pipeline()
    if pipeline is None or not text.strip():
        return None
    try:
        scores = _normalize_label_scores(pipeline(text, truncation=True))
        return scores or None
    except Exception:
        return None


def _lexicon_emotion(text: str) -> Tuple[str, float]:
    lowered = text.lower()
    counts: Dict[str, int] = {}
    for label, words in _EMOTION_LEXICON.items():
        for word in words:
            if re.search(rf"\b{re.escape(word)}\b", lowered):
                counts[label] = counts.get(label, 0) + 1
    if not counts:
        return "neutral", 0.5
    label = max(counts, key=counts.get)
    return label, min(0.9, 0.4 + 0.15 * counts[label])


def _vader_compound(text: str) -> Optional[float]:
    analyzer = get_vader()
    if analyzer is None:
        return None
    return float(analyzer.polarity_scores(text).get("compound", 0.0))


def _label_for(score: float, threshold: float = 0.15) -> str:
    if score >= threshold:
        return "positive"
    if score <= -threshold:
        return "negative"
    return "neutral"


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
    compound = _vader_compound(text)
    if compound is None:
        return "neutral", 0.0
    return _label_for(compound, 0.2), compound


def analyze_affect(text: str) -> Affect:
    """Emotion + sentiment from a single model pass (plus cheap VADER)."""
    degraded: List[str] = []
    scores = get_emotion_scores(text)
    if scores:
        emotion = max(scores, key=scores.get)
        confidence = scores[emotion]
    else:
        degraded.append("emotion_model_unavailable")
        emotion, confidence = _lexicon_emotion(text)
        scores = {emotion: confidence}

    vader = _vader_compound(text)

    if SENTIMENT_SOURCE == "transformer":
        try:
            label, score = sentiment_from_transformer(text)
            return Affect(label, round(score, 4), emotion, round(confidence, 4), scores, degraded)
        except Exception:
            degraded.append("sentiment_model_unavailable")

    if SENTIMENT_SOURCE == "vader" or "emotion_model_unavailable" in degraded:
        score = vader if vader is not None else 0.0
        label = _label_for(score, 0.2)
    else:
        valence = sum(prob * EMOTION_VALENCE.get(name, 0.0) for name, prob in scores.items())
        score = valence if vader is None else 0.7 * valence + 0.3 * vader
        score = max(-1.0, min(1.0, score))
        label = _label_for(score)

    return Affect(label, round(score, 4), emotion, round(confidence, 4), scores, degraded)


def get_sentiment(text: str) -> Tuple[str, float]:
    affect = analyze_affect(text)
    return affect.sentiment_label, affect.sentiment_score


def get_emotion(text: str) -> str:
    return analyze_affect(text).emotion


def extract_keyphrases(text: str, top_n: int = 8) -> List[str]:
    text = text.strip()
    if not text:
        return []
    keybert = get_keybert()
    if keybert is not None:
        try:
            phrases = keybert.extract_keywords(
                text,
                keyphrase_ngram_range=(1, 2),
                stop_words="english",
                top_n=top_n,
                use_mmr=True,
                diversity=0.5,
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
