from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional, Tuple

os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")

import numpy as np  # noqa: E402

try:
    import onnxruntime as ort
    from huggingface_hub import hf_hub_download
    from tokenizers import Tokenizer
except Exception:  # pragma: no cover - optional at runtime
    ort = None
    hf_hub_download = None
    Tokenizer = None

try:
    from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
except Exception:  # pragma: no cover - optional at runtime
    SentimentIntensityAnalyzer = None

try:
    from sklearn.feature_extraction.text import CountVectorizer
except Exception:  # pragma: no cover - optional at runtime
    CountVectorizer = None

try:
    import yake
except Exception:  # pragma: no cover - optional at runtime
    yake = None


logger = logging.getLogger("nlp-service")

# Models run on ONNX Runtime rather than torch: the same networks in ~270 MB instead of
# ~730 MB, which fits a 512 MB instance. Revisions are pinned so a re-upload upstream
# can't silently change (or tamper with) what the service runs.
EMBEDDING_REPO = os.getenv("EMBEDDING_MODEL_REPO", "sentence-transformers/all-MiniLM-L6-v2")
EMBEDDING_REVISION = os.getenv("EMBEDDING_MODEL_REVISION", "1110a243fdf4706b3f48f1d95db1a4f5529b4d41")
EMBEDDING_ONNX_FILE = "onnx/model.onnx"  # fp32 export: same vectors as the torch model
# ONNX export of j-hartmann/emotion-english-distilroberta-base. The int8 file is 82 MB
# (vs 328 MB fp32) and matched the torch model's top label in local checks.
EMOTION_REPO = os.getenv("EMOTION_MODEL_REPO", "onnx-community/emotion-english-distilroberta-base-ONNX")
EMOTION_REVISION = os.getenv("EMOTION_MODEL_REVISION", "f4407dc20b99ae081ab2e4f089595e70c1609f59")
EMOTION_ONNX_FILE = os.getenv("EMOTION_ONNX_FILE", "onnx/model_quantized.onnx")
MODEL_DIR = os.getenv("NLP_MODEL_DIR", str(Path(__file__).resolve().parent.parent / ".models"))
NLP_THREADS = max(1, int(os.getenv("NLP_THREADS", "1")))
MAX_KEYPHRASE_CANDIDATES = 400

# "emotion" (default): sentiment is derived from the emotion model's full probability
#   distribution, blended with VADER. One model, consistent signals, real neutral class.
# "vader": lexicon only.
SENTIMENT_SOURCE = os.getenv("SENTIMENT_SOURCE", "emotion").strip().lower()
if SENTIMENT_SOURCE not in {"emotion", "vader"}:
    logger.warning("SENTIMENT_SOURCE=%s is not supported; using 'emotion'", SENTIMENT_SOURCE)
    SENTIMENT_SOURCE = "emotion"

# Low-memory mode skips the emotion model and uses lexicon emotion + VADER sentiment.
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


def _download(repo: str, revision: str, filename: str) -> str:
    return hf_hub_download(repo, filename, revision=revision, cache_dir=MODEL_DIR)


def _session(path: str):
    options = ort.SessionOptions()
    options.intra_op_num_threads = NLP_THREADS
    options.inter_op_num_threads = 1
    options.enable_cpu_mem_arena = False  # keeps resident memory close to the model size
    options.enable_mem_pattern = False  # no pre-planned activation buffers held between runs
    return ort.InferenceSession(path, options, providers=["CPUExecutionProvider"])


# One inference at a time: on a small instance parallel runs add no throughput (one vCPU or
# less) but each holds its own activations, so concurrency is what would push memory past
# the limit. Requests queue for a few milliseconds instead.
_inference_lock = threading.Lock()


def _run(session, feed: Dict[str, np.ndarray]):
    with _inference_lock:
        return session.run(None, feed)


def _feed(session, encodings) -> Dict[str, np.ndarray]:
    ids = np.array([e.ids for e in encodings], dtype=np.int64)
    mask = np.array([e.attention_mask for e in encodings], dtype=np.int64)
    available = {"input_ids": ids, "attention_mask": mask, "token_type_ids": np.zeros_like(ids)}
    return {i.name: available[i.name] for i in session.get_inputs() if i.name in available}


class OnnxEmbedder:
    """all-MiniLM-L6-v2 with mean pooling + L2 normalisation, as sentence-transformers does."""

    def __init__(self) -> None:
        self.tokenizer = Tokenizer.from_file(_download(EMBEDDING_REPO, EMBEDDING_REVISION, "tokenizer.json"))
        self.tokenizer.enable_truncation(256)
        pad_id = self.tokenizer.token_to_id("[PAD]") or 0
        self.tokenizer.enable_padding(pad_id=pad_id, pad_token="[PAD]")
        self.session = _session(_download(EMBEDDING_REPO, EMBEDDING_REVISION, EMBEDDING_ONNX_FILE))

    def encode(self, texts: List[str], batch_size: int = 32) -> np.ndarray:
        batches = []
        for start in range(0, len(texts), batch_size):
            encodings = self.tokenizer.encode_batch(texts[start : start + batch_size])
            feed = _feed(self.session, encodings)
            hidden = _run(self.session, feed)[0]
            mask = feed["attention_mask"][..., None].astype(np.float32)
            pooled = (hidden * mask).sum(axis=1) / np.clip(mask.sum(axis=1), 1e-9, None)
            pooled /= np.clip(np.linalg.norm(pooled, axis=1, keepdims=True), 1e-12, None)
            batches.append(pooled.astype(np.float32))
        return np.vstack(batches) if batches else np.zeros((0, EMBEDDING_DIM), dtype=np.float32)


class OnnxEmotionClassifier:
    """7-way emotion distribution (anger, disgust, fear, joy, neutral, sadness, surprise)."""

    def __init__(self) -> None:
        self.tokenizer = Tokenizer.from_file(_download(EMOTION_REPO, EMOTION_REVISION, "tokenizer.json"))
        self.tokenizer.enable_truncation(512)
        self.tokenizer.no_padding()
        with open(_download(EMOTION_REPO, EMOTION_REVISION, "config.json"), encoding="utf-8") as handle:
            id2label = json.load(handle)["id2label"]
        self.labels = [str(id2label[str(i)]).lower() for i in range(len(id2label))]
        self.session = _session(_download(EMOTION_REPO, EMOTION_REVISION, EMOTION_ONNX_FILE))

    def __call__(self, text: str) -> Dict[str, float]:
        logits = _run(self.session, _feed(self.session, [self.tokenizer.encode(text)]))[0][0]
        probs = np.exp(logits - logits.max())
        probs /= probs.sum()
        return {label: float(p) for label, p in zip(self.labels, probs)}


# Each model is loaded once, under a lock: the startup warm-up thread and an early request
# must never both load one (two copies would not fit a 512 MB instance).
_load_lock = threading.Lock()
_loaded: Dict[str, object] = {}
_failed_at: Dict[str, float] = {}
_RETRY_AFTER_S = 60.0


def _load(name: str, factory):
    if name in _loaded:
        return _loaded[name]
    with _load_lock:
        if name in _loaded:
            return _loaded[name]
        failed = _failed_at.get(name)
        if failed is not None and time.monotonic() - failed < _RETRY_AFTER_S:
            return None
        try:
            started = time.monotonic()
            _loaded[name] = factory()
            _failed_at.pop(name, None)
            logger.info("%s model loaded in %.1fs", name, time.monotonic() - started)
            return _loaded[name]
        except Exception:
            _failed_at[name] = time.monotonic()
            logger.exception("%s model failed to load", name)
            return None


def get_embedding_model() -> Optional[OnnxEmbedder]:
    if ort is None:
        return None
    return _load("embedding", OnnxEmbedder)


def get_emotion_model() -> Optional[OnnxEmotionClassifier]:
    if ort is None or LOW_MEMORY:
        return None
    return _load("emotion", OnnxEmotionClassifier)


def warm_models() -> None:
    get_embedding_model()
    get_emotion_model()


def download_models() -> None:
    """Fetch model files into MODEL_DIR without loading them (used at build time)."""
    for repo, revision, files in (
        (EMBEDDING_REPO, EMBEDDING_REVISION, ("tokenizer.json", EMBEDDING_ONNX_FILE)),
        (EMOTION_REPO, EMOTION_REVISION, ("tokenizer.json", "config.json", EMOTION_ONNX_FILE)),
    ):
        for filename in files:
            _download(repo, revision, filename)


@lru_cache(maxsize=1)
def get_vader():
    if SentimentIntensityAnalyzer is None:
        return None
    return SentimentIntensityAnalyzer()


@lru_cache(maxsize=1)
def get_yake():
    if yake is None:
        return None
    return yake.KeywordExtractor(lan="en", n=2, top=8)


def models_status() -> Dict[str, bool]:
    """Which models are loaded right now (never triggers a load)."""
    return {"embedding": "embedding" in _loaded, "emotion": "emotion" in _loaded}


def embed_text(text: str) -> Optional[List[float]]:
    """Return a normalized 384-d embedding, or None when the model is unavailable.

    No placeholder vectors: a fake embedding stored in pgvector would silently
    corrupt similarity search and theme clustering.
    """
    model = get_embedding_model()
    if model is None or not text.strip():
        return None
    try:
        return model.encode([text])[0].astype(float).tolist()
    except Exception:
        logger.warning("embedding failed")
        return None


def get_emotion_scores(text: str) -> Optional[Dict[str, float]]:
    model = get_emotion_model()
    if model is None or not text.strip():
        return None
    try:
        return model(text) or None
    except Exception:
        logger.warning("emotion inference failed")
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


def _mmr_keyphrases(text: str, top_n: int, diversity: float = 0.5) -> Optional[List[str]]:
    """KeyBERT-style extraction: 1-2 gram candidates ranked by similarity to the whole text,
    diversified with maximal marginal relevance. Returns None if the embedder is unavailable."""
    model = get_embedding_model()
    if model is None or CountVectorizer is None:
        return None
    try:
        vectorizer = CountVectorizer(ngram_range=(1, 2), stop_words="english")
        counts = vectorizer.fit_transform([text])
        vocabulary = vectorizer.get_feature_names_out()
    except ValueError:  # only stop words / no tokens
        return []
    frequency = counts.toarray()[0]
    order = np.argsort(-frequency, kind="stable")[:MAX_KEYPHRASE_CANDIDATES]
    candidates = [str(vocabulary[i]) for i in order]
    if not candidates:
        return []

    doc_vec = model.encode([text])[0]
    cand_vecs = model.encode(candidates)
    relevance = cand_vecs @ doc_vec
    top_n = min(top_n, len(candidates))
    chosen = [int(np.argmax(relevance))]
    remaining = [i for i in range(len(candidates)) if i != chosen[0]]
    while len(chosen) < top_n and remaining:
        redundancy = (cand_vecs[remaining] @ cand_vecs[chosen].T).max(axis=1)
        mmr = (1 - diversity) * relevance[remaining] - diversity * redundancy
        best = remaining[int(np.argmax(mmr))]
        chosen.append(best)
        remaining.remove(best)
    return [candidates[i] for i in chosen]


def extract_keyphrases(text: str, top_n: int = 8) -> List[str]:
    text = text.strip()
    if not text:
        return []
    try:
        phrases = _mmr_keyphrases(text, top_n)
        if phrases is not None:
            return phrases
    except Exception:
        logger.warning("keyphrase extraction failed; falling back to YAKE")
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
