"""合并用户填写的 JD 文本与下拉框（行业 / 单位性质 / 经验等级）为 Agent 可用的岗位上下文。"""

from __future__ import annotations

import json
from typing import Any

from tools.resume_layout import employer_type_label, normalize_employer_type
from workflow.state import CopilotState


def build_enriched_job_dict(state: CopilotState) -> dict[str, Any]:
    """将 session 中的 job 与用户目标表单字段合并。"""
    meta = state.meta
    base: dict[str, Any] = state.job.model_dump() if state.job else {}

    target_jd = (meta.target_jd_text or "").strip()
    if not target_jd and state.job:
        target_jd = (state.job.source or "").strip()

    industry = (meta.target_industry or "").strip() or (base.get("industry") or "").strip()
    employer_type = normalize_employer_type(meta.employer_type or "")
    employer_label = employer_type_label(employer_type) if employer_type else ""
    experience_level = (meta.target_experience_level or "").strip()
    if not experience_level:
        experience_level = (base.get("experience_requirement") or "").strip()

    enriched = dict(base)
    if industry:
        enriched["industry"] = industry
    if experience_level:
        enriched["experience_requirement"] = experience_level
    if target_jd:
        enriched["source"] = target_jd
    if not enriched.get("title") and target_jd:
        first_line = target_jd.splitlines()[0].strip()
        if first_line and len(first_line) <= 120:
            enriched["title"] = first_line

    enriched["user_target_context"] = {
        "jd_text": target_jd,
        "industry": industry,
        "employer_type": employer_type,
        "employer_type_label": employer_label,
        "experience_level": experience_level,
    }
    return enriched


def build_enriched_job_json(state: CopilotState, *, indent: int = 2) -> str:
    return json.dumps(build_enriched_job_dict(state), ensure_ascii=False, indent=indent)
