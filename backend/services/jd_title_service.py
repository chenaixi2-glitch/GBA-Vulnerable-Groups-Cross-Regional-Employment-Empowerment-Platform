"""从岗位名称 + 候选人画像生成 JD（供用户确认后再进入优化流程）。"""

from __future__ import annotations

from agents.json_contracts import JDTitleGenerationOutput
from models.llm import get_llm, ainvoke_json_with_schema
from prompts.jd_title_generation import JD_TITLE_GENERATION_PROMPT
from tools.resume_layout import employer_type_label, normalize_employer_type
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
) -> JDTitleGenerationOutput:
    """根据岗位名称与候选人画像生成定向 JD，不写入缓存（需用户确认）。"""
    if state.candidate_profile is None:
        raise ValueError("请先上传简历以提取候选人画像")

    employer_key = normalize_employer_type(employer_type or (state.meta.employer_type if state.meta else ""))
    employer_text = employer_type_label(employer_key) or "未指定"
    profile_json = state.candidate_profile.model_dump_json(indent=2)

    prompt = JD_TITLE_GENERATION_PROMPT.format(
        job_title=job_title.strip(),
        industry=(industry or state.meta.target_industry or "未指定").strip(),
        employer_type=employer_text,
        experience_level=(experience_level or state.meta.target_experience_level or "未指定").strip(),
        profile_json=profile_json,
    )

    llm = get_llm()
    parsed = await ainvoke_json_with_schema(llm, prompt, JDTitleGenerationOutput, logger, "JD Title Generation")
    if not (parsed.jd_text or "").strip():
        raise RuntimeError("岗位描述生成结果为空")
    return parsed
