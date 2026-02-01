from app.companion import build_prompts, build_reflection_plan, render_plan_to_message
from app.models import ContextEntry


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


def test_build_reflection_plan_has_sections() -> None:
    plan = build_reflection_plan(
        user_id="user-1",
        selected_prompt="What felt steady today?",
        latest_user_message="I felt overwhelmed but relieved after talking to a friend.",
        retrieved_entries=[],
        time_budget=5,
        mood="Stressed",
        safety={"crisis": False, "reason": None},
    )
    assert plan.validation.text
    assert plan.follow_up_question.text
    assert plan.constraints.no_medical_claims


def test_render_plan_to_message_returns_text() -> None:
    plan = build_reflection_plan(
        user_id="user-1",
        selected_prompt="What felt steady today?",
        latest_user_message="I felt overwhelmed but relieved after talking to a friend.",
        retrieved_entries=[],
        time_budget=5,
        mood="Stressed",
        safety={"crisis": False, "reason": None},
    )
    rendered = render_plan_to_message(plan)
    assert rendered.validation
    assert rendered.follow_up_question


def test_build_reflection_plan_crisis() -> None:
    plan = build_reflection_plan(
        user_id="user-1",
        selected_prompt="",
        latest_user_message="I can't go on.",
        retrieved_entries=[],
        time_budget=5,
        mood=None,
        safety={"crisis": True, "reason": "Detected crisis-related language."},
    )
    assert plan.safety.crisis
    assert "emergency" in plan.reflection.text.lower()
