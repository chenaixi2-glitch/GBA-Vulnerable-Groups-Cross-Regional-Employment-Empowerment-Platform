"""Resolve UI/API output language for LLM prompts and session state."""

from __future__ import annotations

from workflow.state import CopilotState, RenderConfig
from tools.resume_layout import VALID_RESUME_LANGUAGES, language_label, normalize_language

OUTPUT_LANGUAGE_INSTRUCTIONS: dict[str, str] = {
    "zh": (
        "请使用简体中文撰写所有自然语言字段"
        "（如 description、question、answer、title、interviewer_message、strengths 等）。"
        "JSON 的 key 仍使用英文。"
    ),
    "zh-TW": (
        "請使用繁體中文撰寫所有自然語言字段"
        "（如 description、question、answer、title、interviewer_message、strengths 等）。"
        "JSON 的 key 仍使用英文。"
    ),
    "en": (
        "Write all natural-language fields "
        "(description, question, answer, title, interviewer_message, strengths, etc.) in English. "
        "Keep JSON keys in English."
    ),
    "pt": (
        "Escreva todos os campos de texto natural "
        "(description, question, answer, title, interviewer_message, strengths, etc.) "
        "em português (Macau). Mantenha as chaves JSON em inglês."
    ),
}


def resolve_output_language(state: CopilotState) -> str:
    if state.render_config and state.render_config.language:
        return normalize_language(state.render_config.language)
    if state.resume_content_json and state.resume_content_json.meta.language:
        return normalize_language(state.resume_content_json.meta.language)
    return "zh"


def output_language_instruction(language: str | None) -> str:
    code = normalize_language(language)
    return OUTPUT_LANGUAGE_INSTRUCTIONS.get(code, OUTPUT_LANGUAGE_INSTRUCTIONS["zh"])


def apply_session_language(state: CopilotState, language: str | None) -> CopilotState:
    if not language or not str(language).strip():
        return state
    lang = normalize_language(language)
    if lang not in VALID_RESUME_LANGUAGES:
        return state
    if state.render_config:
        state.render_config = state.render_config.model_copy(update={"language": lang})
    else:
        state.render_config = RenderConfig(language=lang)
    return state


def prompt_language_kwargs(state: CopilotState) -> dict[str, str]:
    lang = resolve_output_language(state)
    return {
        "output_language": lang,
        "output_language_label": language_label(lang),
        "output_language_instruction": output_language_instruction(lang),
    }
