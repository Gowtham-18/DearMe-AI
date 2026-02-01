from app.companion import build_chat_turn, build_prompts
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


def test_build_chat_turn_has_follow_up() -> None:
    assistant = build_chat_turn(
        user_id="user-1",
        selected_prompt="What felt steady today?",
        latest_user_message="I felt overwhelmed but relieved after talking to a friend.",
        retrieved_entries=[],
        time_budget=5,
        mood="Stressed",
    )
    assert assistant.follow_up_question
