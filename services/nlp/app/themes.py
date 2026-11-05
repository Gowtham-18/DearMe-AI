from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence

import numpy as np

from .pipeline import extract_keyphrases

try:
    from sklearn.cluster import KMeans
    from sklearn.metrics import silhouette_score
except Exception:  # pragma: no cover - optional at runtime
    KMeans = None
    silhouette_score = None

try:
    import hdbscan
except Exception:  # pragma: no cover - optional at runtime
    hdbscan = None

MIN_ENTRIES_FOR_THEMES = 4
MIN_CLUSTER_SIZE = 2
MAX_THEMES = 6


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


def _normalize_rows(embeddings: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return embeddings / norms


def _cluster_kmeans(embeddings: np.ndarray) -> np.ndarray:
    if KMeans is None:
        raise RuntimeError("KMeans unavailable")
    count = embeddings.shape[0]
    max_k = min(MAX_THEMES, count // MIN_CLUSTER_SIZE)
    if max_k < 2:
        return np.zeros(count, dtype=int)

    best_labels: Optional[np.ndarray] = None
    best_score = -1.0
    for k in range(2, max_k + 1):
        labels = KMeans(n_clusters=k, n_init=10, random_state=42).fit_predict(embeddings)
        if len(set(labels)) < 2:
            continue
        try:
            score = float(silhouette_score(embeddings, labels, metric="cosine"))
        except Exception:
            score = -1.0
        if score > best_score:
            best_score, best_labels = score, labels
    if best_labels is None:
        return np.zeros(count, dtype=int)
    return best_labels


def _cluster_hdbscan(embeddings: np.ndarray) -> np.ndarray:
    if hdbscan is None:
        raise RuntimeError("HDBSCAN unavailable")
    model = hdbscan.HDBSCAN(min_cluster_size=3, min_samples=2)
    return model.fit_predict(embeddings)


def _cluster_embeddings(embeddings: np.ndarray) -> np.ndarray:
    if choose_cluster_method(len(embeddings)) == "hdbscan":
        try:
            labels = _cluster_hdbscan(embeddings)
            if len({label for label in labels if label != -1}) >= 2:
                return labels
        except Exception:
            pass
    return _cluster_kmeans(embeddings)


def _entry_keyphrases(entry: Dict) -> List[str]:
    provided = entry.get("keyphrases")
    if isinstance(provided, list) and provided:
        return [str(phrase).lower() for phrase in provided if str(phrase).strip()][:6]
    return [phrase.lower() for phrase in extract_keyphrases(entry.get("text", ""), top_n=5)]


def _rank_keywords(cluster_phrases: Sequence[List[str]], other_counts: Dict[str, int]) -> List[str]:
    counts: Dict[str, int] = {}
    for phrases in cluster_phrases:
        for phrase in set(phrases):
            counts[phrase] = counts.get(phrase, 0) + 1
    scored = sorted(
        counts.items(),
        key=lambda item: (item[1] / (1 + 0.5 * other_counts.get(item[0], 0)), item[1]),
        reverse=True,
    )
    ranked: List[str] = []
    for phrase, _ in scored:
        if any(phrase in existing or existing in phrase for existing in ranked):
            continue
        ranked.append(phrase)
        if len(ranked) == 5:
            break
    return ranked


def _label_from_keywords(keywords: Sequence[str]) -> str:
    if not keywords:
        return "Unlabeled theme"
    if len(keywords) == 1:
        return keywords[0].title()
    return f"{keywords[0].title()} & {keywords[1].title()}"


def recompute_themes(entries: List[Dict]) -> List[ThemeResult]:
    entries = [entry for entry in entries if entry.get("embedding")]
    if len(entries) < MIN_ENTRIES_FOR_THEMES:
        return []

    embeddings = _normalize_rows(np.array([entry["embedding"] for entry in entries], dtype=float))
    labels = _cluster_embeddings(embeddings)
    phrases_by_entry = [_entry_keyphrases(entry) for entry in entries]

    cluster_ids = [label for label in sorted(set(labels)) if label != -1]
    clusters = {
        cid: [i for i, label in enumerate(labels) if label == cid]
        for cid in cluster_ids
    }
    clusters = {cid: idx for cid, idx in clusters.items() if len(idx) >= MIN_CLUSTER_SIZE}
    if not clusters:
        return []

    total_counts: Dict[str, int] = {}
    for phrases in phrases_by_entry:
        for phrase in set(phrases):
            total_counts[phrase] = total_counts.get(phrase, 0) + 1

    themes: List[ThemeResult] = []
    for cid, indexes in clusters.items():
        cluster_phrases = [phrases_by_entry[i] for i in indexes]
        in_cluster: Dict[str, int] = {}
        for phrases in cluster_phrases:
            for phrase in set(phrases):
                in_cluster[phrase] = in_cluster.get(phrase, 0) + 1
        other_counts = {phrase: total_counts[phrase] - in_cluster.get(phrase, 0) for phrase in total_counts}
        keywords = _rank_keywords(cluster_phrases, other_counts)

        centroid = embeddings[indexes].mean(axis=0)
        centroid /= np.linalg.norm(centroid) or 1.0
        scored = sorted(
            ((i, float(np.clip(embeddings[i] @ centroid, 0.0, 1.0))) for i in indexes),
            key=lambda item: item[1],
            reverse=True,
        )
        members = [
            ThemeMember(
                entry_id=entries[i]["entry_id"],
                score=round(score, 4),
                snippet=_snippet(entries[i].get("text", "")),
                reason="Closely linked to this theme." if score >= 0.6 else "Related to this theme.",
            )
            for i, score in scored
        ]

        themes.append(
            ThemeResult(
                temp_theme_id=str(uuid.uuid4()),
                label=_label_from_keywords(keywords),
                keywords=keywords,
                strength=round(len(indexes) / len(entries), 3),
                members=members,
            )
        )

    themes.sort(key=lambda theme: theme.strength, reverse=True)
    return themes[:MAX_THEMES]
