"""Resolve UI/API output language for LLM prompts and session state."""

from __future__ import annotations

from workflow.state import CopilotState, RenderConfig
from tools.resume_layout import VALID_RESUME_LANGUAGES, language_label, normalize_language

# Content-language pickers omitted on interview / learning-path / JD UIs.
# Resume target language follows the uploaded resume (see resolve_resume_target_language).
FORCE_OUTPUT_LANGUAGE = "en"

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
    return FORCE_OUTPUT_LANGUAGE


def resolve_gap_prompt_language(state: CopilotState) -> str:
    """Language for gap-analysis follow-up questions — always prefer page UI locale."""
    return FORCE_OUTPUT_LANGUAGE


def resolve_interview_question_language(state: CopilotState) -> str:
    """Language for interview questions — follows uploaded resume language by default."""
    if state.chat_question_output_language:
        return normalize_language(state.chat_question_output_language)
    if state.meta and (state.meta.interview_question_language or "").strip():
        return normalize_language(state.meta.interview_question_language)
    return resolve_resume_target_language(state)


def resolve_interview_feedback_language(state: CopilotState) -> str:
    """Language for interview feedback — follows question / resume language by default."""
    if state.chat_feedback_output_language:
        return normalize_language(state.chat_feedback_output_language)
    if state.meta and (state.meta.interview_feedback_language or "").strip():
        return normalize_language(state.meta.interview_feedback_language)
    return resolve_interview_question_language(state)


def resolve_output_language(state: CopilotState) -> str:
    """Language for JD agent prompts — prefers page locale, not interview."""
    return FORCE_OUTPUT_LANGUAGE


def resolve_resume_target_language(state: CopilotState) -> str:
    """Language for resume content generation — never follows transient chat UI locale.

    Prefers an explicit render_config / profile / resume meta language (set from
    uploaded resume language or user language conversion).
    """
    if state.render_config and state.render_config.language:
        return normalize_language(state.render_config.language)
    if state.candidate_profile and (state.candidate_profile.language or "").strip():
        return normalize_language(state.candidate_profile.language)
    if state.resume_content_json and state.resume_content_json.meta.language:
        return normalize_language(state.resume_content_json.meta.language)
    return "en"


def output_language_instruction(language: str | None) -> str:
    code = normalize_language(language)
    return OUTPUT_LANGUAGE_INSTRUCTIONS.get(code, OUTPUT_LANGUAGE_INSTRUCTIONS["en"])


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
    # Force English while content-language pickers are omitted.
    lang = FORCE_OUTPUT_LANGUAGE
    state.chat_output_language = lang
    state.meta = state.meta.model_copy(update={"ui_output_language": lang})
    return state


def apply_interview_question_language(state: CopilotState, language: str | None) -> CopilotState:
    """Persist interview question language; empty input falls back to uploaded resume language."""
    if language and str(language).strip():
        lang = normalize_language(language)
        if lang not in VALID_RESUME_LANGUAGES:
            lang = resolve_resume_target_language(state)
    else:
        lang = resolve_resume_target_language(state)
    state.chat_question_output_language = lang
    state.meta = state.meta.model_copy(update={"interview_question_language": lang})
    return state


def apply_interview_feedback_language(state: CopilotState, language: str | None) -> CopilotState:
    """Persist interview feedback language; empty input follows question / resume language."""
    if language and str(language).strip():
        lang = normalize_language(language)
        if lang not in VALID_RESUME_LANGUAGES:
            lang = resolve_interview_question_language(state)
    else:
        lang = resolve_interview_question_language(state)
    state.chat_feedback_output_language = lang
    state.meta = state.meta.model_copy(update={"interview_feedback_language": lang})
    return state


def apply_interview_languages(
    state: CopilotState,
    question_language: str | None = None,
    feedback_language: str | None = None,
) -> CopilotState:
    """Apply question and/or feedback language for a single request."""
    if question_language is not None:
        apply_interview_question_language(state, question_language)
    if feedback_language is not None:
        apply_interview_feedback_language(state, feedback_language)
    return state

def apply_resume_target_language(state: CopilotState, language: str | None) -> CopilotState:
    """Persist resume generation target language (from upload detection or user selection)."""
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


def _language_kwargs(lang: str) -> dict[str, str]:
    return {
        "output_language": lang,
        "output_language_label": language_label(lang),
        "output_language_instruction": output_language_instruction(lang),
    }


def interview_question_prompt_language_kwargs(state: CopilotState) -> dict[str, str]:
    """Prompt kwargs for interview question / reference answer generation."""
    return _language_kwargs(resolve_interview_question_language(state))


def interview_feedback_prompt_language_kwargs(state: CopilotState) -> dict[str, str]:
    """Prompt kwargs for interview feedback / debrief generation."""
    return _language_kwargs(resolve_interview_feedback_language(state))


def interview_turn_prompt_language_kwargs(state: CopilotState) -> dict[str, str]:
    """Prompt kwargs when one turn produces both feedback and follow-up questions."""
    q_lang = resolve_interview_question_language(state)
    f_lang = resolve_interview_feedback_language(state)
    return {
        **_language_kwargs(q_lang),
        "question_output_language": q_lang,
        "question_output_language_label": language_label(q_lang),
        "question_output_language_instruction": output_language_instruction(q_lang),
        "feedback_output_language": f_lang,
        "feedback_output_language_label": language_label(f_lang),
        "feedback_output_language_instruction": output_language_instruction(f_lang),
    }


def prompt_language_kwargs(state: CopilotState) -> dict[str, str]:
    lang = resolve_output_language(state)
    return _language_kwargs(lang)


def gap_prompt_language_kwargs(state: CopilotState) -> dict[str, str]:
    """Prompt kwargs for gap analysis — includes a stronger top-of-prompt language block."""
    lang = resolve_gap_prompt_language(state)
    return {
        **_language_kwargs(lang),
        "gap_output_language_instruction": gap_output_language_instruction(lang),
    }


def page_prompt_language_kwargs(state: CopilotState) -> dict[str, str]:
    """Prompt kwargs for page-scoped agents (learning path) — follows UI locale only."""
    return _language_kwargs(resolve_page_ui_language(state))


# ---- Interactive interview UI strings (opening/closing shown to candidate) ----

_INTERVIEW_OPENING: dict[str, str] = {
    "zh": (
        "你好，欢迎参加本次结构化模拟面试。我们将按预设题库依次提问，共 {count} 道核心题；"
        "你作答后我会异步给出点评，必要时追加追问。请放松，我们开始第一题。"
    ),
    "zh-TW": (
        "你好，歡迎參加本次結構化模擬面試。我們將按預設題庫依次提問，共 {count} 道核心題；"
        "你作答後我會異步給出點評，必要時追加追問。請放鬆，我們開始第一題。"
    ),
    "en": (
        "Hello, welcome to this structured mock interview. We will go through {count} core questions "
        "from a preset bank. After each answer I will give asynchronous feedback and add follow-ups "
        "when needed. Let us begin with the first question."
    ),
    "pt": (
        "Olá, bem-vindo(a) a esta simulação estruturada. Vamos percorrer {count} perguntas principais "
        "do banco pré-definido. Após cada resposta darei feedback de forma assíncrona e, se necessário, "
        "farei perguntas de seguimento. Vamos começar pela primeira pergunta."
    ),
}

_INTERVIEW_CLOSING_NORMAL: dict[str, str] = {
    "zh": (
        "今天关于岗位、你的过往经历我们沟通得比较全面，你这边还有什么想了解公司、团队或者岗位的问题吗？"
        "如果没有，今天的面试就先到这里，后续我们会统一汇总所有面试官意见，1–3 个工作日内给你反馈。"
    ),
    "zh-TW": (
        "今天關於崗位、你的過往經歷我們溝通得比較全面，你這邊還有什麼想了解公司、團隊或者崗位的問題嗎？"
        "如果沒有，今天的面試就先到此為止，後續我們會統一匯總所有面試官意見，1–3 個工作日內給你反饋。"
    ),
    "en": (
        "We have covered the role and your background in good depth. Do you have any questions about "
        "the company, team, or role? If not, we will wrap up here; you should hear consolidated "
        "feedback within 1–3 business days."
    ),
    "pt": (
        "Já abordámos o cargo e a sua experiência com bastante profundidade. Tem alguma pergunta sobre "
        "a empresa, equipa ou função? Se não, encerramos aqui; receberá feedback consolidado em 1–3 dias úteis."
    ),
}

_INTERVIEW_CLOSING_MISMATCH: dict[str, str] = {
    "zh": (
        "感谢你今天过来沟通，综合咱们岗位的硬性要求和你的情况，匹配度差距比较大，"
        "我就不多占用你的时间了，后续就不再推进流程，祝你找到合适的工作。"
    ),
    "zh-TW": (
        "感謝你今天過來溝通，綜合咱們崗位的硬性要求和你的情況，匹配度差距比較大，"
        "我就不多佔用你的時間了，後續就不再推進流程，祝你找到合適的工作。"
    ),
    "en": (
        "Thank you for your time today. Based on the role requirements and your profile, "
        "the fit gap is significant, so we will not continue the process. We wish you success "
        "in finding a suitable role."
    ),
    "pt": (
        "Obrigado pelo seu tempo hoje. Com base nos requisitos do cargo e no seu perfil, "
        "a adequação é limitada, por isso não avançaremos o processo. Desejamos-lhe sucesso "
        "na procura de um cargo adequado."
    ),
}

_INTERVIEW_CLOSING_THANKS: dict[str, str] = {
    "zh": "感谢你今天参加模拟面试，今天的沟通到此结束，后续可查看复盘报告改进表现。",
    "zh-TW": "感謝你今天參加模擬面試，今天的溝通到此結束，後續可查看覆盤報告改進表現。",
    "en": "Thank you for joining this mock interview. You may review the debrief report to improve next time.",
    "pt": "Obrigado por participar nesta simulação. Consulte o relatório de debrief para melhorar na próxima vez.",
}

_INTERVIEW_PHASE_LABEL: dict[str, dict[str, str]] = {
    "primary": {
        "zh": "预设题库阶段",
        "zh-TW": "預設題庫階段",
        "en": "Preset question bank",
        "pt": "Banco de perguntas pré-definido",
    },
    "follow_up_wait": {
        "zh": "等待追问生成",
        "zh-TW": "等待追問生成",
        "en": "Awaiting follow-up generation",
        "pt": "A aguardar perguntas de seguimento",
    },
    "follow_up": {
        "zh": "追问阶段",
        "zh-TW": "追問階段",
        "en": "Follow-up phase",
        "pt": "Fase de seguimento",
    },
}

_INTERVIEW_END_REASON_DEFAULT: dict[str, str] = {
    "zh": "核心信息已充分收集或匹配度已明确",
    "zh-TW": "核心資訊已充分收集或匹配度已明確",
    "en": "Core information collected or fit decision is clear",
    "pt": "Informação essencial recolhida ou adequação já definida",
}


def _pick_lang_text(table: dict[str, str], language: str | None) -> str:
    code = normalize_language(language)
    return table.get(code) or table.get("en", "")


def interview_opening_message(state: CopilotState, question_count: int) -> str:
    lang = resolve_interview_question_language(state)
    template = _pick_lang_text(_INTERVIEW_OPENING, lang)
    return template.format(count=question_count)


def interview_closing_normal(state: CopilotState) -> str:
    return _pick_lang_text(_INTERVIEW_CLOSING_NORMAL, resolve_interview_question_language(state))


def interview_closing_mismatch(state: CopilotState) -> str:
    return _pick_lang_text(_INTERVIEW_CLOSING_MISMATCH, resolve_interview_question_language(state))


def interview_closing_thanks(state: CopilotState) -> str:
    return _pick_lang_text(_INTERVIEW_CLOSING_THANKS, resolve_interview_question_language(state))


def interview_phase_label(state: CopilotState, phase: str) -> str:
    labels = _INTERVIEW_PHASE_LABEL.get(phase, {})
    return _pick_lang_text(labels, resolve_interview_question_language(state)) or phase


def interview_end_reason_default(state: CopilotState) -> str:
    return _pick_lang_text(_INTERVIEW_END_REASON_DEFAULT, resolve_interview_feedback_language(state))
