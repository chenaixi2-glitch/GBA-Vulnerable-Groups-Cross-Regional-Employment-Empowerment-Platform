"""从岗位名称 + 候选人画像生成 JD（供用户确认后再进入优化流程）。"""

from __future__ import annotations

from agents.json_contracts import JDTitleGenerationOutput
from models.llm import get_llm
from tools.output_language_guard import ainvoke_json_with_language_guard
from prompts.jd_title_generation import JD_TITLE_GENERATION_PROMPT
from tools.jd_cache import ensure_title_in_jd_text, extract_title_from_jd
from tools.resume_profile_context import build_profile_json
from tools.resume_layout import employer_type_label, normalize_employer_type, normalize_language, jd_output_language_instruction
from workflow.state import CopilotState
from log import get_logger

logger = get_logger("agent")


async def generate_jd_from_title_for_profile(
    state: CopilotState,
    job_title: str,
    *,
    industry: str = "",
    employer_type: str = "",
    experience_level: str = "",
    language: str = "",
) -> JDTitleGenerationOutput:
    """根据岗位名称与候选人画像生成定向 JD，不写入缓存（需用户确认）。"""
    if state.candidate_profile is None:
        raise ValueError("Please upload a resume first to extract the candidate profile")

    employer_key = normalize_employer_type(employer_type or (state.meta.employer_type if state.meta else ""))
    employer_text = employer_type_label(employer_key) or "未指定"
    profile_json = build_profile_json(state)

    output_lang = normalize_language(language)

    prompt = JD_TITLE_GENERATION_PROMPT.format(
        job_title=job_title.strip(),
        industry=(industry or state.meta.target_industry or "未指定").strip(),
        employer_type=employer_text,
        experience_level=(experience_level or state.meta.target_experience_level or "未指定").strip(),
        profile_json=profile_json,
        output_language_instruction=jd_output_language_instruction(output_lang),
    )

    llm = get_llm()
    parsed = await ainvoke_json_with_language_guard(
        llm,
        prompt,
        JDTitleGenerationOutput,
        logger,
        "JD Title Generation",
        output_lang,
    )
    if not (parsed.jd_text or "").strip():
        raise RuntimeError("Job description generation returned empty result")

    resolved_title = (parsed.title or job_title).strip()
    jd_text = ensure_title_in_jd_text(resolved_title, (parsed.jd_text or "").strip(), output_lang)
    if not jd_text:
        raise RuntimeError("Job description generation returned empty result")

    return parsed.model_copy(update={
        "title": resolved_title or extract_title_from_jd(jd_text),
        "jd_text": jd_text,
    })
