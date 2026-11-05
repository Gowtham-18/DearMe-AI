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


def test_follow_up_prompt_remembers_last_entry_and_feeling() -> None:
    from app.companion import _follow_up_prompt, _when_phrase
    from app.models import ContextEntry

    today = "2026-11-05"  # a Thursday, in the person's calendar
    entries = [
        ContextEntry(
            entry_id="w", text="My manager moved the deadline and work is piling up.",
            created_at="2026-11-05T08:00:00Z", entry_date="2026-11-03", mood="Stressed",
        ),
    ]
    result = _follow_up_prompt(entries, today)
    assert result is not None
    prompt, area_key = result
    assert area_key == "work"
    assert prompt.text == "On Tuesday you wrote about work and felt stressed. Has anything shifted since then?"
    assert prompt.example and prompt.example.startswith("e.g.")
    assert [card.entry_id for card in prompt.evidence] == ["w"]

    assert _when_phrase("2026-11-04", today) == "Yesterday"
    assert _when_phrase("2026-11-04T23:00:00Z", today) == "Yesterday"
    assert _when_phrase("2026-11-05", today) == "Earlier today"
    assert _when_phrase("2026-10-01", today) == "In your last entry"
    assert _when_phrase(None, today) == "In your last entry"


def test_follow_up_handles_loss_gently_and_skips_entries_without_an_area() -> None:
    from app.companion import _follow_up_prompt
    from app.models import ContextEntry

    assert _follow_up_prompt([ContextEntry(entry_id="x", text="Nice weather, nothing much.")]) is None
    result = _follow_up_prompt([ContextEntry(entry_id="l", text="It's been a month since my grandmother passed away.")])
    assert result is not None
    assert "a loss" in result[0].text and "felt" not in result[0].text


def test_every_prompt_has_a_concrete_example() -> None:
    from app.companion import build_prompts
    from app.models import ContextEntry

    starters = build_prompts("u", [], [], [], "Tired", 3)
    assert len(starters) == 4 and all(p.example and p.example.startswith("e.g.") for p in starters)
    assert '"Tired"' in starters[0].text

    entries = [
        ContextEntry(entry_id="h", text="My health has been bad, my back hurts every morning.", mood="Anxious"),
        ContextEntry(entry_id="f", text="Argued with my family about the holidays."),
    ]
    prompts = build_prompts("u", entries, [], [], None, 5)
    assert prompts[0].id == "prompt_follow_up" and "your health" in prompts[0].text
    assert all(p.example for p in prompts)
    # The follow-up's topic isn't repeated by a second prompt.
    assert sum("your health" in p.text for p in prompts) == 1
