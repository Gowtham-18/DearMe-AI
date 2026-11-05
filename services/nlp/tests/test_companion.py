from app.companion import (
    _contains_abuse,
    _infer_feeling,
    _is_off_topic,
    _pick_topic,
    build_prompts,
    build_reflection_plan,
    render_plan_to_message,
)
from app.models import ChatMessage, ContextEntry

SAFE = {"crisis": False, "reason": None}


def _plan(message, **kwargs):
    params = dict(
        user_id="user-1",
        selected_prompt="What felt steady today?",
        latest_user_message=message,
        retrieved_entries=[],
        time_budget=5,
        mood=None,
        safety=SAFE,
    )
    params.update(kwargs)
    return build_reflection_plan(**params)


def test_build_prompts_returns_items() -> None:
    prompts = build_prompts(
        user_id="user-1",
        recent_entries=[ContextEntry(entry_id="1", text="I felt calm after a long walk.")],
        similar_entries=[],
        themes=["calm"],
        mood="Calm",
        time_budget=5,
    )
    assert len(prompts) >= 1
    assert prompts[0].text


def test_build_prompts_returns_starters_when_empty() -> None:
    prompts = build_prompts(user_id="user-1", recent_entries=[], similar_entries=[], themes=[], mood=None, time_budget=5)
    assert len(prompts) >= 3


def test_build_reflection_plan_has_sections() -> None:
    plan = _plan("I felt overwhelmed but relieved after talking to a friend.", mood="Stressed")
    assert plan.validation.text
    assert plan.follow_up_question.text
    assert plan.constraints.no_medical_claims
    assert plan.signals and "sentiment" in plan.signals


def test_render_plan_to_message_returns_text() -> None:
    rendered = render_plan_to_message(_plan("I felt overwhelmed but relieved after talking to a friend."))
    assert rendered.validation
    assert rendered.follow_up_question


def test_user_name_is_optional_and_used() -> None:
    plan = _plan("Work was stressful again today.", user_name="Asha")
    assert plan.validation.text.startswith("Asha, ")


def test_build_reflection_plan_crisis_includes_resources() -> None:
    plan = _plan("I can't go on.", safety={"crisis": True, "reason": "x"})
    assert plan.safety.crisis
    assert "988" in plan.reflection.text
    assert plan.follow_up_question.text == "Are you safe right now?"


def test_negative_answer_to_safety_check_escalates() -> None:
    history = [
        ChatMessage(role="assistant", content="You don't have to carry this alone. Are you safe right now?"),
        ChatMessage(role="user", content="no"),
    ]
    plan = _plan("no", history=history)
    assert plan.safety.crisis


# --- guardrails: journaling content must not be mistaken for off-topic or abuse -------------


def test_journaling_about_hobbies_is_on_topic() -> None:
    assert not _is_off_topic("I listened to music and watched a movie with my sister, felt better.")
    assert not _is_off_topic("How to cope with grief when everyone else has moved on")
    assert not _is_off_topic("What is wrong with me lately")
    assert not _is_off_topic("Spent all day trying to deploy to Vercel and it kept failing")


def test_real_off_topic_requests_are_caught() -> None:
    assert _is_off_topic("How do I deploy a Next.js app to Vercel?")
    assert _is_off_topic("write me a python script")
    assert _is_off_topic("what is the bitcoin price")


def test_abuse_only_when_directed_at_companion() -> None:
    assert not _contains_abuse("I felt stupid in the meeting today.")
    assert not _contains_abuse("I wanted to tell him to shut up.")
    assert _contains_abuse("you are useless")
    assert _contains_abuse("fuck you")


def test_feeling_matching_uses_word_boundaries() -> None:
    assert _infer_feeling("Please follow up and allow me to explain, I made it") is None
    assert _infer_feeling("I'm so anxious about tomorrow") == "anxious"
    assert _infer_feeling("feeling low and tired, mostly tired") == "tired"


def test_profanity_does_not_erase_content() -> None:
    plan = _plan("Had a shit day, my manager yelled at me in front of everyone")
    assert "intense" in plan.validation.text
    assert "manager yelled" in plan.reflection.text


def test_topic_prefers_words_the_person_wrote() -> None:
    assert _pick_topic(["snapped partner", "partner"], "I snapped at my partner") == "partner"


# --- evidence must be truthful ---------------------------------------------------------------


def test_pattern_claim_requires_matching_past_entry() -> None:
    unrelated = [ContextEntry(entry_id="e1", text="Went hiking with friends, lovely weather.")]
    plan = _plan("My exam results come out tomorrow and the exam is all I think about", retrieved_entries=unrelated)
    assert plan.evidence_cards == []
    assert "before" not in plan.pattern_connection.text


def test_pattern_claim_when_past_entry_mentions_topic() -> None:
    entries = [ContextEntry(entry_id="e1", text="The exam prep is wearing me down.")]
    plan = _plan("Worried about the exam tomorrow", retrieved_entries=entries)
    assert [card.entry_id for card in plan.evidence_cards] == ["e1"]


def test_follow_up_question_does_not_repeat() -> None:
    first = _plan("I'm so anxious about tomorrow")
    history = [
        ChatMessage(role="assistant", content=first.follow_up_question.text),
        ChatMessage(role="user", content="Still anxious about it"),
    ]
    second = _plan("Still anxious about it", history=history)
    assert second.follow_up_question.text != first.follow_up_question.text


def test_llm_cues_not_called_without_consent(monkeypatch) -> None:
    calls = []
    monkeypatch.setattr("app.openai_rewriter._chat_json", lambda *a, **k: calls.append(1) or {"cues": ["a b", "c d"]})
    monkeypatch.setenv("ENABLE_ENHANCED_LANGUAGE", "true")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    _plan("Work was stressful again today.", allow_llm=False)
    assert calls == []
