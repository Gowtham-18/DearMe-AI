import numpy as np

from app.themes import choose_cluster_method, recompute_themes


def test_choose_cluster_method_kmeans() -> None:
    assert choose_cluster_method(5) == "kmeans"


def test_choose_cluster_method_hdbscan() -> None:
    assert choose_cluster_method(25) == "hdbscan"


def _vec(axis: int, noise: float, seed: int) -> list:
    rng = np.random.default_rng(seed)
    v = rng.normal(0, noise, 384)
    v[axis] += 1.0
    return (v / np.linalg.norm(v)).tolist()


def test_too_few_entries_produce_no_themes() -> None:
    entries = [{"entry_id": str(i), "text": "x", "embedding": _vec(0, 0.01, i), "keyphrases": ["work"]} for i in range(3)]
    assert recompute_themes(entries) == []


def test_two_clear_groups_become_two_themes_with_all_members() -> None:
    work = [
        {"entry_id": f"w{i}", "text": "deadline at work", "embedding": _vec(0, 0.02, i), "keyphrases": ["work", "deadline"]}
        for i in range(4)
    ]
    family = [
        {"entry_id": f"f{i}", "text": "dinner with family", "embedding": _vec(1, 0.02, 10 + i), "keyphrases": ["family", "dinner"]}
        for i in range(3)
    ]
    themes = recompute_themes(work + family)
    assert len(themes) == 2
    by_label = {theme.label: theme for theme in themes}
    work_theme = next(t for t in themes if "Work" in t.label or "Deadline" in t.label)
    assert {m.entry_id for m in work_theme.members} == {f"w{i}" for i in range(4)}
    assert all(0.0 <= m.score <= 1.0 for t in themes for m in t.members)
    assert abs(sum(t.strength for t in by_label.values()) - 1.0) < 1e-6


def test_theme_label_uses_life_area_and_shared_feeling() -> None:
    from app.themes import _theme_label

    texts = [
        "My mom called and we argued about my career again. I felt so frustrated after.",
        "Dinner with my mom went better, but I'm still angry about what she said.",
    ]
    assert _theme_label(texts, ["piling manager"], []) == "Family & frustration"


def test_theme_label_falls_back_to_a_shared_noun_and_stays_unique() -> None:
    from app.themes import _theme_label

    texts = ["Walked my dog in the park.", "The dog chased a ball, lovely morning."]
    assert _theme_label(texts, [], []) == "Dog"
    assert _theme_label(texts, [], ["Dog"]) != "Dog"


def test_keyword_cleanup_drops_fragments() -> None:
    from app.responder import clean_keyword

    assert clean_keyword("work deadlines")
    assert not clean_keyword("added meetings")
    assert not clean_keyword("meetings feel")
    assert not clean_keyword("barely slept")
