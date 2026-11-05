import json
from types import SimpleNamespace

from app import openai_rewriter
from app.weekly import build_weekly_reflection

SAFE = {"crisis": False, "reason": None}


def _entry(entry_id, day, score, text, mood=None, keyphrases=None):
    return {
        "entry_id": entry_id,
        "text": text,
        "created_at": f"2026-11-0{day}T10:00:00Z",
        "entry_date": f"2026-11-0{day}",
        "mood": mood,
        "sentiment": {"label": "x", "score": score},
        "keyphrases": keyphrases or [],
    }


def test_weekly_reflection_is_grounded_in_entries() -> None:
    entries = [
        _entry("a", 2, -0.6, "Rough day, the deadline at work crushed me.", "Stressed", ["deadline"]),
        _entry("b", 3, -0.2, "Still about the deadline.", "Stressed", ["deadline"]),
        _entry("c", 5, 0.7, "Dinner with friends felt wonderful.", "Happy", ["friends"]),
    ]
    result = build_weekly_reflection(entries, [], SAFE)
    text = " ".join(block["text"] for block in result["summary_blocks"])
    assert "3 times across 3 days" in text
    assert "stressed" in text
    assert "deadline" in text
    assert "lighter" in text
    assert "small resets" not in text
    assert {card["entry_id"] for card in result["evidence_cards"]} >= {"c", "a"}


def test_weekly_crisis_includes_resources() -> None:
    result = build_weekly_reflection([_entry("a", 2, -0.9, "x")], [], {"crisis": True, "reason": "x"})
    assert "988" in result["summary_blocks"][0]["text"]


def _fake_client(content: str):
    calls = []

    def create(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content, refusal=None))])

    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    return client, calls


def _reply(**overrides):
    params = dict(
        message="my health",
        history=[],
        selected_prompt="What feels most important to explore right now?",
        mood=None,
        first_name="Asha",
        analysis={"life_area": "health", "conversation_stage": 0},
        evidence_cards=[],
        draft="Health worries can take up a lot of space. What's been going on?",
        user_id="u1",
    )
    params.update(overrides)
    return openai_rewriter.generate_reply(**params)


def _enable(monkeypatch, client) -> None:
    monkeypatch.setenv("ENABLE_ENHANCED_LANGUAGE", "true")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(openai_rewriter, "_get_client", lambda: client)
    monkeypatch.setattr(openai_rewriter, "_budget_day", "")


def test_generate_reply_uses_strict_schema_and_returns_text(monkeypatch) -> None:
    good = {
        "reply": "Asha, health can quietly shape everything else in a day.",
        "question": "What's been happening with your health lately, something physical or more how you've been feeling?",
    }
    client, calls = _fake_client(json.dumps(good))
    _enable(monkeypatch, client)
    assert _reply() == good
    assert calls[0]["response_format"]["json_schema"]["strict"] is True
    sent = json.loads(calls[0]["messages"][1]["content"])
    assert sent["latest_message"] == "my health" and sent["is_first_reply"] is True


def test_generate_reply_falls_back_to_json_object_when_schema_unsupported(monkeypatch) -> None:
    class BadRequestError(Exception):
        pass

    calls = []

    def create(**kwargs):
        calls.append(kwargs)
        if kwargs["response_format"]["type"] == "json_schema":
            raise BadRequestError("json_schema not supported")
        content = json.dumps({"reply": "That sounds like a lot.", "question": "What happened?"})
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content, refusal=None))])

    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    _enable(monkeypatch, client)
    assert _reply()["question"] == "What happened?"
    assert [c["response_format"]["type"] for c in calls] == ["json_schema", "json_object"]


def test_generate_reply_rejects_advice_and_bad_shape(monkeypatch) -> None:
    for bad in (
        {"reply": "You should see a therapist.", "question": "Will you?"},
        {"reply": "Hmm.", "question": "Two? Questions?"},
        {"reply": "Is that hard?", "question": "What happened?"},
        {"reply": "Okay.", "question": "No question mark"},
    ):
        client, _ = _fake_client(json.dumps(bad))
        _enable(monkeypatch, client)
        assert _reply() is None, bad


def test_generate_reply_disabled_without_server_flag(monkeypatch) -> None:
    monkeypatch.delenv("ENABLE_ENHANCED_LANGUAGE", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    assert _reply() is None


def test_daily_budget_caps_calls(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_DAILY_LIMIT_PER_USER", "2")
    monkeypatch.setattr(openai_rewriter, "_budget_day", "")
    assert openai_rewriter._consume_budget("cap-user")
    assert openai_rewriter._consume_budget("cap-user")
    assert not openai_rewriter._consume_budget("cap-user")
