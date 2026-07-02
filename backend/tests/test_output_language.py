"""Tests for UI → API output language wiring."""

from workflow.state import CopilotState, RenderConfig
from tools.output_language import (
    apply_session_language,
    output_language_instruction,
    prompt_language_kwargs,
    resolve_output_language,
)


def test_apply_session_language_updates_render_config():
    state = CopilotState(session_id="sess_test")
    apply_session_language(state, "en")
    assert state.render_config.language == "en"


def test_apply_session_language_normalizes_ui_locale():
    state = CopilotState(session_id="sess_test")
    apply_session_language(state, "zh-CN")
    assert state.render_config.language == "zh"


def test_resolve_output_language_prefers_render_config():
    state = CopilotState(
        session_id="sess_test",
        render_config=RenderConfig(language="pt"),
    )
    assert resolve_output_language(state) == "pt"


def test_output_language_instruction_english():
    text = output_language_instruction("en")
    assert "English" in text


def test_prompt_language_kwargs():
    state = CopilotState(
        session_id="sess_test",
        render_config=RenderConfig(language="zh-TW"),
    )
    kwargs = prompt_language_kwargs(state)
    assert kwargs["output_language"] == "zh-TW"
    assert "繁體" in kwargs["output_language_instruction"]
