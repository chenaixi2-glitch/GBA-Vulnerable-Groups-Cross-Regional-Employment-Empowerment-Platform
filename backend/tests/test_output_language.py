"""Tests for UI → API output language wiring."""

from workflow.state import CopilotState, Meta, RenderConfig
from tools.output_language import (
    apply_chat_output_language,
    apply_interview_output_language,
    apply_resume_target_language,
    apply_session_language,
    gap_output_language_instruction,
    gap_prompt_language_kwargs,
    output_language_instruction,
    page_prompt_language_kwargs,
    prompt_language_kwargs,
    resolve_gap_prompt_language,
    resolve_output_language,
    resolve_page_ui_language,
    resolve_resume_target_language,
)
from prompts.gap_analysis import GAP_ANALYSIS_PROMPT


def test_apply_resume_target_language_updates_render_config():
    state = CopilotState(session_id="sess_test")
    apply_resume_target_language(state, "en")
    assert state.render_config.language == "en"


def test_apply_session_language_is_alias_for_resume_target():
    state = CopilotState(session_id="sess_test")
    apply_session_language(state, "zh-CN")
    assert state.render_config.language == "zh"


def test_apply_chat_output_language_does_not_change_render_config():
    state = CopilotState(
        session_id="sess_test",
        render_config=RenderConfig(language="en"),
    )
    apply_chat_output_language(state, "zh")
    assert state.chat_output_language == "zh"
    assert state.render_config.language == "en"


def test_resolve_output_language_prefers_chat_locale():
    state = CopilotState(
        session_id="sess_test",
        render_config=RenderConfig(language="en"),
        chat_output_language="zh",
    )
    assert resolve_output_language(state) == "zh"


def test_resolve_resume_target_language_ignores_chat_locale():
    state = CopilotState(
        session_id="sess_test",
        render_config=RenderConfig(language="en"),
        chat_output_language="zh",
    )
    assert resolve_resume_target_language(state) == "en"


def test_resolve_output_language_falls_back_to_render_config():
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


def test_apply_chat_output_language_persists_ui_meta_language():
    state = CopilotState(session_id="sess_test", render_config=RenderConfig(language="zh"))
    apply_chat_output_language(state, "en")
    assert state.chat_output_language == "en"
    assert state.meta.ui_output_language == "en"
    assert state.render_config.language == "zh"


def test_resolve_gap_prompt_language_prefers_ui_meta_over_render():
    from workflow.state import Meta

    state = CopilotState(
        session_id="sess_test",
        render_config=RenderConfig(language="zh"),
        meta=Meta(ui_output_language="en"),
    )
    assert resolve_gap_prompt_language(state) == "en"


def test_gap_prompt_language_kwargs_includes_mandatory_block():
    state = CopilotState(session_id="sess_test", chat_output_language="en")
    kwargs = gap_prompt_language_kwargs(state)
    assert kwargs["output_language"] == "en"
    assert "MANDATORY OUTPUT LANGUAGE" in gap_output_language_instruction("en")
    prompt = GAP_ANALYSIS_PROMPT.format(
        job_json="{}",
        profile_json="{}",
        **kwargs,
    )
    assert "MANDATORY OUTPUT LANGUAGE" in prompt
    assert "FINAL REMINDER" in prompt
    assert "English" in prompt


def test_apply_interview_output_language_does_not_change_meta():
    state = CopilotState(
        session_id="sess_test",
        meta=Meta(ui_output_language="zh"),
    )
    apply_interview_output_language(state, "en")
    assert state.chat_output_language == "en"
    assert state.meta.ui_output_language == "zh"


def test_resolve_page_ui_language_ignores_resume_target():
    state = CopilotState(
        session_id="sess_test",
        render_config=RenderConfig(language="en"),
    )
    assert resolve_page_ui_language(state) == "zh"


def test_page_prompt_language_kwargs_follows_page_locale():
    state = CopilotState(
        session_id="sess_test",
        render_config=RenderConfig(language="en"),
        chat_output_language="zh-TW",
    )
    kwargs = page_prompt_language_kwargs(state)
    assert kwargs["output_language"] == "zh-TW"
    assert "繁體" in kwargs["output_language_instruction"]


def test_prompt_language_kwargs_prefers_chat_locale():
    state = CopilotState(
        session_id="sess_test",
        render_config=RenderConfig(language="zh"),
        chat_output_language="en",
    )
    kwargs = prompt_language_kwargs(state)
    assert kwargs["output_language"] == "en"
    assert "English" in kwargs["output_language_instruction"]
