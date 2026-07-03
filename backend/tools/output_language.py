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


def resolve_page_ui_language(state: CopilotState) -> str:
    """Language for page-scoped features (learning path, gap follow-ups) — never resume target."""
    if state.chat_output_language:
        return normalize_language(state.chat_output_language)
    if state.meta and (state.meta.ui_output_language or "").strip():
        return normalize_language(state.meta.ui_output_language)
    return "zh"


def resolve_gap_prompt_language(state: CopilotState) -> str:
    """Language for gap-analysis follow-up questions — always prefer page UI locale."""
    return resolve_page_ui_language(state)


def resolve_output_language(state: CopilotState) -> str:
    """Language for JD/interview agent prompts — prefers per-request locale."""
    if state.chat_output_language:
        return normalize_language(state.chat_output_language)
    if state.meta and (state.meta.ui_output_language or "").strip():
        return normalize_language(state.meta.ui_output_language)
    if state.render_config and state.render_config.language:
        return normalize_language(state.render_config.language)
    if state.resume_content_json and state.resume_content_json.meta.language:
        return normalize_language(state.resume_content_json.meta.language)
    return "zh"


def resolve_resume_target_language(state: CopilotState) -> str:
    """Language for resume content generation — never follows transient chat UI locale."""
    if state.render_config and state.render_config.language:
        return normalize_language(state.render_config.language)
    if state.resume_content_json and state.resume_content_json.meta.language:
        return normalize_language(state.resume_content_json.meta.language)
    return "zh"


def output_language_instruction(language: str | None) -> str:
    code = normalize_language(language)
    return OUTPUT_LANGUAGE_INSTRUCTIONS.get(code, OUTPUT_LANGUAGE_INSTRUCTIONS["zh"])


def gap_output_language_instruction(language: str | None) -> str:
    """Strong, gap-specific language rule placed at the top of the gap analysis prompt."""
    lang = normalize_language(language)
    label = language_label(lang)
    if lang == "en":
        return (
            f"MANDATORY OUTPUT LANGUAGE: English ({label}). "
            "Every gap description and every follow-up question/reason MUST be written in English. "
            "Do NOT use Chinese or any other language, even when the job description or candidate profile is in Chinese."
        )
    if lang == "pt":
        return (
            f"IDIOMA DE SAÍDA OBRIGATÓRIO: português ({label}). "
            "Todas as descrições de lacunas e todas as perguntas/razões de seguimento DEVEM estar em português. "
            "Não use chinês nem outro idioma, mesmo que a JD ou o perfil estejam noutra língua."
        )
    if lang == "zh-TW":
        return (
            f"強制輸出語言：繁體中文（{label}）。"
            "所有缺口 description 以及追問的 question、reason 必須使用繁體中文，"
            "即使崗位描述或候選人畫像為其他語言也不得混用。"
        )
    return (
        f"强制输出语言：简体中文（{label}）。"
        "所有缺口 description 以及追问的 question、reason 必须使用简体中文，"
        "即使岗位描述或候选人画像是其他语言也不得混用。"
    )


def apply_chat_output_language(state: CopilotState, language: str | None) -> CopilotState:
    """Set page UI locale for this request (learning path, gap analysis, JD hints)."""
    if not language or not str(language).strip():
        state.chat_output_language = ""
        return state
    lang = normalize_language(language)
    if lang not in VALID_RESUME_LANGUAGES:
        state.chat_output_language = ""
        return state
    state.chat_output_language = lang
    state.meta = state.meta.model_copy(update={"ui_output_language": lang})
    return state


def apply_interview_output_language(state: CopilotState, language: str | None) -> CopilotState:
    """Set interview output language for this request only; does not change page UI locale."""
    if not language or not str(language).strip():
        state.chat_output_language = ""
        return state
    lang = normalize_language(language)
    if lang not in VALID_RESUME_LANGUAGES:
        state.chat_output_language = ""
        return state
    state.chat_output_language = lang
    return state


def apply_resume_target_language(state: CopilotState, language: str | None) -> CopilotState:
    """Persist user-selected resume generation target language."""
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


def apply_session_language(state: CopilotState, language: str | None) -> CopilotState:
    """Backward-compatible alias — updates resume target, not chat UI locale."""
    return apply_resume_target_language(state, language)


def prompt_language_kwargs(state: CopilotState) -> dict[str, str]:
    lang = resolve_output_language(state)
    return {
        "output_language": lang,
        "output_language_label": language_label(lang),
        "output_language_instruction": output_language_instruction(lang),
    }


def gap_prompt_language_kwargs(state: CopilotState) -> dict[str, str]:
    """Prompt kwargs for gap analysis — includes a stronger top-of-prompt language block."""
    lang = resolve_gap_prompt_language(state)
    return {
        "output_language": lang,
        "output_language_label": language_label(lang),
        "output_language_instruction": output_language_instruction(lang),
        "gap_output_language_instruction": gap_output_language_instruction(lang),
    }


def page_prompt_language_kwargs(state: CopilotState) -> dict[str, str]:
    """Prompt kwargs for page-scoped agents (learning path) — follows UI locale only."""
    lang = resolve_page_ui_language(state)
    return {
        "output_language": lang,
        "output_language_label": language_label(lang),
        "output_language_instruction": output_language_instruction(lang),
    }
