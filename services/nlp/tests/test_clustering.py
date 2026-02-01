from app.themes import choose_cluster_method


def test_choose_cluster_method_kmeans() -> None:
    assert choose_cluster_method(5) == "kmeans"


def test_choose_cluster_method_hdbscan() -> None:
    assert choose_cluster_method(25) == "hdbscan"
