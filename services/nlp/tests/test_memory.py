import importlib
from datetime import date

from fastapi.testclient import TestClient

from app.companion import build_prompts, build_reflection_plan
from app.memory import day_phrase, due_event, extract_facts, memory_note, recurring_person, resolve_date
from app.models import ContextEntry, MemoryFact

TODAY = date(2026, 11, 5)  # a Thursday


def _facts(text, entry_date="2026-11-05"):
    return {(f.kind, f.label, f.detail, f.event_date) for f in extract_facts(text, entry_date)}


def test_extracts_named_people_relations_and_dated_events() -> None:
    facts = _facts("My sister Priya called and we argued. My job interview is on Friday and I'm nervous.")
    assert ("person", "Priya", "sister", None) in facts
    assert ("event", "job interview", None, "2026-11-06") in facts

    facts = _facts("Priya, my best friend, says my exam on the 20th will be fine. I told my boss.")
    assert ("person", "Priya", "best friend", None) in facts
    assert ("person", "boss", None, None) in facts
    assert ("event", "exam", None, "2026-11-20") in facts

    assert ("event", "Sam's wedding", None, "2026-11-28") in _facts("Sam's wedding is on Nov 28th.")


def test_skips_past_events_names_that_are_not_names_and_undated_events() -> None:
    assert _facts("I had my exam yesterday.") == set()
    assert _facts("I have an interview coming up at some point.") == set()
    labels = {label for _, label, _, _ in _facts("My friend Today was weird. My manager And I talked.")}
    assert labels == {"friend", "manager"}  # 'Today' and 'And' are not names
    # A named mention replaces the bare relation from the same entry.
    assert _facts("My sister was upset. Later my sister Priya called.") == {("person", "Priya", "sister", None)}


def test_resolve_date_handles_common_phrasings() -> None:
    assert resolve_date("it's tomorrow", TODAY) == date(2026, 11, 6)
    assert resolve_date("the day after tomorrow", TODAY) == date(2026, 11, 7)
    assert resolve_date("on Monday", TODAY) == date(2026, 11, 9)
    assert resolve_date("on Thursday", TODAY) == date(2026, 11, 12)  # same weekday means next week
    assert resolve_date("in two weeks", TODAY) == date(2026, 11, 19)
    assert resolve_date("on 3 Jan", TODAY) == date(2027, 1, 3)
    assert resolve_date("on the 2nd", TODAY) == date(2026, 12, 2)
    assert resolve_date("nothing here", TODAY) is None


def _event(label, when, followed=None, fid="e1"):
    return MemoryFact(id=fid, kind="event", label=label, event_date=when, followed_up_on=followed)


def test_due_event_asks_after_then_on_then_before() -> None:
    past = _event("exam", "2026-11-04", fid="past")
    today = _event("interview", "2026-11-05", fid="today")
    soon = _event("trip", "2026-11-07", fid="soon")
    assert due_event([soon, today, past], TODAY).id == "past"
    assert due_event([soon, today], TODAY).id == "today"
    assert due_event([soon], TODAY).id == "soon"
    # Answering on the day doesn't stop the "how did it go?" afterwards; answering afterwards does.
    assert due_event([_event("exam", "2026-11-04", followed="2026-11-04")], TODAY) is not None
    assert due_event([_event("exam", "2026-11-04", followed="2026-11-05")], TODAY) is None
    assert due_event([_event("exam", "2026-10-01")], TODAY) is None


def test_prompts_follow_up_on_remembered_event_and_person() -> None:
    memories = [
        _event("job interview", "2026-11-04", fid="ev1"),
        MemoryFact(id="p1", kind="person", label="Priya", detail="sister", mention_count=3, last_seen="2026-11-03"),
    ]
    entries = [ContextEntry(entry_id="x", text="Long day, nothing much.", entry_date="2026-11-04")]
    prompts = build_prompts("u1", entries, [], [], None, 5, today="2026-11-05", memories=memories)
    texts = [p.text for p in prompts]
    assert texts[0] == "How did your job interview go? You mentioned it was yesterday."
    assert prompts[0].id == "memory:ev1"
    assert any("your sister Priya" in t and "How are things with Priya" in t for t in texts)
    assert all(p.example for p in prompts)


def test_prompts_without_entries_still_use_memories() -> None:
    prompts = build_prompts("u1", [], [], [], None, 5, today="2026-11-05", memories=[_event("exam", "2026-11-06")])
    assert prompts[0].text == "Your exam is tomorrow. What's on your mind about it?"


def test_recurring_person_needs_repeat_mentions_and_rests_after_asking() -> None:
    priya = MemoryFact(id="p", kind="person", label="Priya", detail="sister", mention_count=2, last_seen="2026-11-01")
    assert recurring_person([priya], TODAY) is priya
    assert recurring_person([priya.model_copy(update={"mention_count": 1})], TODAY) is None
    assert recurring_person([priya.model_copy(update={"followed_up_on": "2026-11-02"})], TODAY) is None
    assert recurring_person([priya.model_copy(update={"last_seen": "2026-09-01"})], TODAY) is None


def test_memory_note_in_chat_and_once_per_session() -> None:
    memories = [
        MemoryFact(kind="person", label="Priya", detail="sister"),
        _event("presentation", "2026-11-09"),
    ]
    assert memory_note("Priya didn't call back", memories, TODAY) == "You've mentioned Priya before, your sister."
    assert memory_note("my sister is ignoring me", memories, TODAY) == "You've mentioned your sister Priya before."
    assert memory_note("dreading the presentation", memories, TODAY) == "You mentioned your presentation is on Monday."
    assert memory_note("my sister Priya is fine", memories, TODAY) is None

    plan = build_reflection_plan(
        user_id="u1", selected_prompt="What's on your mind?", latest_user_message="Priya didn't call me back again today",
        retrieved_entries=[], time_budget=5, mood=None, safety={"crisis": False}, memories=memories, today="2026-11-05",
    )
    assert plan.pattern_connection.text == "You've mentioned Priya before, your sister."

    from app.models import ChatMessage

    history = [ChatMessage(role="assistant", content="You've mentioned Priya before, your sister. What happened?")]
    again = build_reflection_plan(
        user_id="u1", selected_prompt="What's on your mind?", latest_user_message="Priya didn't call me back again today",
        retrieved_entries=[], time_budget=5, mood=None, safety={"crisis": False}, memories=memories, today="2026-11-05",
        history=history,
    )
    assert "mentioned" not in again.pattern_connection.text

    # Opening a session from a memory follow-up doesn't count as having noted it already.
    opened = build_reflection_plan(
        user_id="u1", selected_prompt="How did your presentation go? You mentioned it was yesterday.",
        latest_user_message="Priya didn't call me back again today", retrieved_entries=[], time_budget=5, mood=None,
        safety={"crisis": False}, memories=memories, today="2026-11-05",
        history=[ChatMessage(role="assistant", content="How did your presentation go? You mentioned it was yesterday.")],
    )
    assert opened.pattern_connection.text == "You've mentioned Priya before, your sister."


def test_day_phrase() -> None:
    assert day_phrase(date(2026, 11, 4), TODAY) == "yesterday"
    assert day_phrase(date(2026, 11, 2), TODAY) == "on Monday"
    assert day_phrase(date(2026, 10, 30), TODAY) == "last Friday"
    assert day_phrase(date(2026, 11, 9), TODAY) == "on Monday"
    assert day_phrase(date(2026, 11, 28), TODAY) == "on 28 Nov"


def test_analyze_entry_returns_memories(monkeypatch) -> None:
    monkeypatch.setenv("NLP_INTERNAL_TOKEN", "")
    import app.main as main

    client = TestClient(importlib.reload(main).app)
    response = client.post(
        "/analyze-entry",
        json={"user_id": "u", "entry_id": "e", "text": "My exam is tomorrow and my sister Priya is helping me.", "entry_date": "2026-11-05"},
    )
    assert response.status_code == 200
    memories = {(m["kind"], m["label"]) for m in response.json()["memories"]}
    assert memories == {("person", "Priya"), ("event", "exam")}
