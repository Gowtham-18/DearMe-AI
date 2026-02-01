from app.prompts import generate_prompts


def test_generate_prompts_basic() -> None:
    prompts = generate_prompts(["Stress"], -0.4, "Sad")
    assert len(prompts) >= 3
    assert any("stress" in prompt.lower() for prompt in prompts)
