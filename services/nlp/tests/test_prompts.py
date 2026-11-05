from app.prompts import generate_prompts


def test_generate_prompts_basic() -> None:
    prompts = generate_prompts(["Stress"], -0.4, "Sad")
    assert len(prompts) >= 3
    assert any("stress" in prompt.lower() for prompt in prompts)


def test_prompts_use_life_areas_and_read_naturally() -> None:
    from app.companion import build_prompts
    from app.models import ContextEntry

    entries = [
        ContextEntry(entry_id="w", text="Work deadlines keep piling up and my manager added meetings."),
        ContextEntry(entry_id="d", text="Took my dog for a long walk in the park."),
    ]
    prompts = build_prompts("u", entries, [], ["Week & Work Fresh"], None, 5)
    texts = [prompt.text for prompt in prompts]
    assert any("work" in text for text in texts)
    assert "You wrote about your dog recently. What's stayed with you since then?" in texts
    assert not any("piling manager" in text or "week & work" in text.lower() for text in texts)
    work_prompt = next(prompt for prompt in prompts if "work" in prompt.text)
    assert [card.entry_id for card in work_prompt.evidence] == ["w"]
