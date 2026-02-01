from __future__ import annotations

from dataclasses import dataclass
import uuid
from typing import Dict, List, Optional, Sequence

import numpy as np

from .pipeline import extract_keyphrases

try:
    from sklearn.cluster import KMeans
except Exception:  # pragma: no cover - optional at runtime
    KMeans = None

try:
    import hdbscan
except Exception:  # pragma: no cover - optional at runtime
    hdbscan = None


@dataclass
class ThemeMember:
    entry_id: str
    score: float
    snippet: str
    reason: str


@dataclass
class ThemeResult:
    temp_theme_id: str
    label: str
    keywords: List[str]
    strength: float
    members: List[ThemeMember]


def choose_cluster_method(count: int) -> str:
    return "kmeans" if count < 20 else "hdbscan"


def _snippet(text: str, limit: int = 160) -> str:
    cleaned = " ".join(text.split())
    if len(cleaned) <= limit:
        return cleaned
    return f"{cleaned[:limit].rstrip()}..."


def _label_from_keywords(keywords: Sequence[str]) -> str:
    if not keywords:
        return "Unlabeled theme"
    if len(keywords) == 1:
        return keywords[0].title()
    return f"{keywords[0].title()} & {keywords[1].title()}"


def _cluster_kmeans(embeddings: np.ndarray) -> np.ndarray:
    if KMeans is None:
        raise RuntimeError("KMeans unavailable")
    count = embeddings.shape[0]
    k = min(5, max(2, count // 5))
    model = KMeans(n_clusters=k, n_init=10, random_state=42)
    return model.fit_predict(embeddings)


def _cluster_hdbscan(embeddings: np.ndarray) -> np.ndarray:
    if hdbscan is None:
        raise RuntimeError("HDBSCAN unavailable")
    model = hdbscan.HDBSCAN(min_cluster_size=3, min_samples=2)
    return model.fit_predict(embeddings)


def _cluster_embeddings(embeddings: np.ndarray) -> np.ndarray:
    method = choose_cluster_method(len(embeddings))
    if method == "hdbscan":
        try:
            return _cluster_hdbscan(embeddings)
        except Exception:
            return _cluster_kmeans(embeddings)
    return _cluster_kmeans(embeddings)


def recompute_themes(entries: List[Dict]) -> List[ThemeResult]:
    if len(entries) < 2:
        return []

    embeddings = np.array([entry["embedding"] for entry in entries], dtype=float)
    labels = _cluster_embeddings(embeddings)

    themes: List[ThemeResult] = []
    label_ids = sorted({label for label in labels if label != -1})
    if not label_ids:
        return []

    for idx in label_ids:
        cluster_entries = [
            entry for entry, label in zip(entries, labels, strict=False) if label == idx
        ]
        if not cluster_entries:
            continue

        keyword_counts: Dict[str, int] = {}
        for entry in cluster_entries:
            for phrase in extract_keyphrases(entry["text"], top_n=5):
                keyword_counts[phrase] = keyword_counts.get(phrase, 0) + 1

        keywords = [item[0] for item in sorted(keyword_counts.items(), key=lambda v: v[1], reverse=True)]
        keywords = keywords[:5] if keywords else []

        members: List[ThemeMember] = []
        for entry in cluster_entries[:3]:
            members.append(
                ThemeMember(
                    entry_id=entry["entry_id"],
                    score=float(entry.get("score", 0.5)),
                    snippet=_snippet(entry["text"]),
                    reason="Frequently linked to this theme.",
                )
            )

        themes.append(
            ThemeResult(
                temp_theme_id=str(uuid.uuid4()),
                label=_label_from_keywords(keywords),
                keywords=keywords,
                strength=round(len(cluster_entries) / len(entries), 3),
                members=members,
            )
        )

    return themes
