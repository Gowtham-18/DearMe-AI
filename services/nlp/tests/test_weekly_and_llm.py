from types import SimpleNamespace

from app import openai_rewriter
from app.companion import build_reflection_plan
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


def _plan():
    return build_reflection_plan(
        user_id="u1",
        selected_prompt="",
        latest_user_message="Work was stressful again today, the deadline is close.",
        retrieved_entries=[],
        time_budget=5,
        mood=None,
        safety=SAFE,
    )


def test_rewrite_uses_chat_completions_with_strict_schema(monkeypatch) -> None:
    plan = _plan()
    rewrite = {
        "validation": plan.validation.text,
        "reflection": plan.reflection.text,
        "pattern_connection": plan.pattern_connection.text,
        "gentle_nudge": plan.gentle_nudge.text,
        "follow_up_question": plan.follow_up_question.text,
    }
    import json

    client, calls = _fake_client(json.dumps(rewrite))
    monkeypatch.setenv("ENABLE_ENHANCED_LANGUAGE", "true")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(openai_rewriter, "_get_client", lambda: client)
    result = openai_rewriter.rewrite_plan(plan, plan.evidence_cards, plan.constraints, user_id="u1")
    assert result is not None
    assert calls[0]["response_format"]["json_schema"]["strict"] is True


def test_rewrite_rejects_advice(monkeypatch) -> None:
    plan = _plan()
    bad = (
        '{"validation":"You should see a therapist.","reflection":"x","pattern_connection":"x",'
        '"gentle_nudge":"x","follow_up_question":"x?"}'
    )
    client, _ = _fake_client(bad)
    monkeypatch.setenv("ENABLE_ENHANCED_LANGUAGE", "true")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(openai_rewriter, "_get_client", lambda: client)
    assert openai_rewriter.rewrite_plan(plan, [], plan.constraints) is None


def test_rewrite_disabled_without_server_flag(monkeypatch) -> None:
    monkeypatch.delenv("ENABLE_ENHANCED_LANGUAGE", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    plan = _plan()
    assert openai_rewriter.rewrite_plan(plan, [], plan.constraints) is None


def test_daily_budget_caps_calls(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_DAILY_LIMIT_PER_USER", "2")
    monkeypatch.setattr(openai_rewriter, "_budget_day", "")
    assert openai_rewriter._consume_budget("cap-user")
    assert openai_rewriter._consume_budget("cap-user")
    assert not openai_rewriter._consume_budget("cap-user")
