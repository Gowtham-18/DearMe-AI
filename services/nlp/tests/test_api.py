import importlib

from fastapi.testclient import TestClient


def _client(monkeypatch, token=""):
    monkeypatch.setenv("NLP_INTERNAL_TOKEN", token)
    import app.main as main

    main = importlib.reload(main)
    return TestClient(main.app)


def test_health_is_open(monkeypatch) -> None:
    client = _client(monkeypatch, token="secret")
    assert client.get("/health").status_code == 200


def test_post_requires_internal_token_when_configured(monkeypatch) -> None:
    client = _client(monkeypatch, token="secret")
    body = {"text": "hello there"}
    assert client.post("/v1/embed", json=body).status_code == 401
    assert client.post("/v1/embed", json=body, headers={"X-Internal-Token": "wrong"}).status_code == 401
    ok = client.post("/v1/embed", json=body, headers={"X-Internal-Token": "secret"})
    assert ok.status_code == 200
    assert len(ok.json()["embedding"]) in (0, 384)


def test_chat_turn_v1_end_to_end(monkeypatch) -> None:
    client = _client(monkeypatch)
    response = client.post(
        "/v1/chat/turn",
        json={
            "user_id": "u1",
            "chat_id": "c1",
            "user_message": "I'm anxious about my exam tomorrow",
            "retrieved_entries": [{"entry_id": "e1", "text": "Exam prep all week.", "similarity": 0.7}],
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["follow_up_question"].endswith("?")
    assert data["mode"] == "deterministic"
    assert data["extracted"]["sentiment"]["label"] in {"positive", "neutral", "negative"}


def test_analyze_entry_reports_degraded_embedding(monkeypatch) -> None:
    client = _client(monkeypatch)
    import app.main as main

    monkeypatch.setattr(main, "embed_text", lambda text: None)
    data = client.post("/analyze-entry", json={"user_id": "u", "entry_id": "e", "text": "A calm day."}).json()
    assert data["embedding"] == []
    assert "embedding_unavailable" in data["degraded"]
