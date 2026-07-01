"""Resume Content Agent — 生成/更新 resume_content_json。"""

from __future__ import annotations

import asyncio
import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from agents.json_contracts import ResumeGenerationOutput
from models.llm import get_llm, ainvoke_json_with_schema
from prompts.resume_generation import RESUME_GENERATION_PROMPT, RESUME_SECTION_UPDATE_PROMPT
from prompts.resume_language_convert import RESUME_LANGUAGE_CONVERT_PROMPT
from prompts.resume_constraints import RESUME_A4_ONE_PAGE_CONSTRAINTS
from tools.resume_layout import (
    apply_a4_compact_render_config,
    language_label,
    normalize_language,
    opposite_language,
)
from tools.target_job_context import build_enriched_job_json
from workflow.state import (
    CopilotState, ResumeContent, ResumeProfile, ResumeContentMeta,
    SectionItem, Education,
)
from workflow.trace import append_trace, summarize_user_message
from log import get_logger

logger = get_logger("agent")


def _resolve_target_language(state: CopilotState) -> str:
    if state.resume_language_target:
        return normalize_language(state.resume_language_target)
    if state.render_config and state.render_config.language:
        return normalize_language(state.render_config.language)
    if state.resume_content_json and state.resume_content_json.meta.language:
        return normalize_language(state.resume_content_json.meta.language)
    return "zh"


def _merge_profile_extras_from_candidate(
    resume_content: ResumeContent,
    state: CopilotState,
) -> ResumeContent:
    """Preserve user-uploaded extras (e.g. photo) from draft / prior resume."""
    cand_extras: dict[str, str] = {}
    if state.candidate_profile and state.candidate_profile.profile_basic:
        cand_extras = dict(state.candidate_profile.profile_basic.extras or {})

    prev_extras: dict[str, str] = {}
    if state.resume_content_json and state.resume_content_json.profile:
        prev_extras = dict(state.resume_content_json.profile.extras or {})

    merged = {**prev_extras, **{k: v for k, v in cand_extras.items() if v}}
    lang = normalize_language(resume_content.meta.language)

    if lang == "zh":
        photo = merged.get("photo_url") or merged.get("photo_data")
        if photo:
            resume_content.profile.extras["photo_url"] = photo
            resume_content.profile.extras["has_photo"] = "true"
        for key in ("age", "gender", "native_place", "political_status"):
            if merged.get(key) and not resume_content.profile.extras.get(key):
                resume_content.profile.extras[key] = merged[key]
    else:
        resume_content.profile.extras.pop("photo_url", None)
        resume_content.profile.extras.pop("photo_data", None)
        resume_content.profile.extras["has_photo"] = "false"

    return resume_content


def _build_resume_from_parsed(
    parsed: ResumeGenerationOutput,
    state: CopilotState,
    *,
    language: str | None = None,
) -> ResumeContent:
    """从 LLM 返回的 JSON 构建 ResumeContent 对象。"""
    now = datetime.now(timezone.utc).isoformat()
    lang = normalize_language(language or parsed.language or _resolve_target_language(state))

    profile_data = parsed.profile
    education_list = []
    for ed in profile_data.education:
        education_list.append(Education(
            id=ed.id,
            school=ed.school,
            major=ed.major,
            degree=ed.degree,
            start_date=ed.start_date,
            end_date=ed.end_date,
        ))

    resume_profile = ResumeProfile(
        name=profile_data.name,
        email=profile_data.email,
        phone=profile_data.phone,
        city=profile_data.city,
        github=profile_data.github,
        linkedin=getattr(profile_data, "linkedin", "") or "",
        address=getattr(profile_data, "address", "") or "",
        education=education_list,
        extras=getattr(profile_data, "extras", None) or {},
    )

    def _parse_items(items: list[Any]) -> list[SectionItem]:
        return [SectionItem(
            id=item.id,
            title=item.title,
            content=item.content,
            source_refs=item.source_refs,
            updated_at=now,
        ) for item in items]

    content_json = json.dumps(parsed.model_dump(), ensure_ascii=False, sort_keys=True)
    content_hash = hashlib.sha256(content_json.encode()).hexdigest()[:16]

    version = 1
    if state.resume_content_json:
        version = state.resume_content_json.meta.version + 1

    target_role = ""
    if state.job:
        target_role = state.job.title
    elif state.resume_content_json:
        target_role = state.resume_content_json.meta.target_role

    return ResumeContent(
        profile=resume_profile,
        summary=parsed.summary,
        skills=_parse_items(parsed.skills),
        internships=_parse_items(parsed.internships),
        projects=_parse_items(parsed.projects),
        awards=_parse_items(parsed.awards),
        papers=_parse_items(parsed.papers),
        meta=ResumeContentMeta(
            target_role=target_role,
            language=lang,
            version=version,
            last_updated_at=now,
            content_hash=content_hash,
        ),
    )


async def content_node_async(state: CopilotState) -> dict[str, Any]:
    """Resume Content Agent 异步节点函数。"""
    logger.info("Resume Content Agent started for session %s", state.session_id)

    intent = state.current_intent
    llm = get_llm()

    if intent == "language_convert":
        if state.resume_content_json is None:
            return {
                "workflow_trace": append_trace(
                    state,
                    node="content_agent",
                    status="skipped",
                    input_summary=f"中英文简历互转：{summarize_user_message(state.user_message)}",
                    output_summary="暂无简历内容，无法转换。请先生成或上传简历。",
                ),
            }

        source_lang = normalize_language(state.resume_content_json.meta.language)
        target_lang = normalize_language(state.resume_language_target) if state.resume_language_target else opposite_language(source_lang)

        prompt = RESUME_LANGUAGE_CONVERT_PROMPT.format(
            source_language_label=language_label(source_lang),
            target_language_label=language_label(target_lang),
            target_language=target_lang,
            current_resume_json=state.resume_content_json.model_dump_json(indent=2),
            job_json=build_enriched_job_json(state) if state.job or state.meta.target_jd_text else "{}",
            RESUME_A4_ONE_PAGE_CONSTRAINTS=RESUME_A4_ONE_PAGE_CONSTRAINTS,
        )
    elif intent == "content_edit" and state.resume_content_json:
        lang = normalize_language(state.resume_content_json.meta.language)
        prompt = RESUME_SECTION_UPDATE_PROMPT.format(
            RESUME_A4_ONE_PAGE_CONSTRAINTS=RESUME_A4_ONE_PAGE_CONSTRAINTS,
            target_language_label=language_label(lang),
            current_resume_json=state.resume_content_json.model_dump_json(indent=2),
            job_json=build_enriched_job_json(state) if state.job or state.meta.target_jd_text else "{}",
            edit_instruction=state.user_message,
        )
    else:
        lang = _resolve_target_language(state)
        job_json = build_enriched_job_json(state) if state.job or state.meta.target_jd_text else "{}"
        profile_json = state.candidate_profile.model_dump_json(indent=2) if state.candidate_profile else "{}"

        edit_instruction = ""
        if intent == "content_edit":
            edit_instruction = f"用户修改指令：{state.user_message}"

        prompt = RESUME_GENERATION_PROMPT.format(
            target_language=lang,
            target_language_label=language_label(lang),
            RESUME_A4_ONE_PAGE_CONSTRAINTS=RESUME_A4_ONE_PAGE_CONSTRAINTS,
            job_json=job_json,
            profile_json=profile_json,
            edit_instruction=edit_instruction,
        )

    try:
        parsed = await ainvoke_json_with_schema(llm, prompt, ResumeGenerationOutput, logger, "Resume Content Agent")
    except RuntimeError as exc:
        logger.error("Resume Content Agent failed: %s", exc)
        return {
            "workflow_trace": append_trace(
                state,
                node="content_agent",
                status="failed",
                input_summary=f"根据岗位、候选人画像和用户指令生成简历内容：{summarize_user_message(state.user_message)}",
                output_summary="简历内容生成失败：模型输出格式异常，请重试。",
                error=str(exc),
            ),
        }

    target_lang = normalize_language(
        state.resume_language_target
        or parsed.language
        or (state.resume_content_json.meta.language if state.resume_content_json else "zh")
    )
    resume_content = _build_resume_from_parsed(parsed, state, language=target_lang)
    resume_content = _merge_profile_extras_from_candidate(resume_content, state)

    logger.info("Resume content generated v%d, hash=%s, lang=%s",
                resume_content.meta.version, resume_content.meta.content_hash, resume_content.meta.language)

    render_config = apply_a4_compact_render_config(state.render_config, resume_content.meta.language)

    meta = state.meta.model_copy(update={
        "active_resume_content_version": resume_content.meta.version,
        "dirty_flags": state.meta.dirty_flags.model_copy(update={
            "content_dirty": False,
            "render_dirty": True,
            "interview_dirty": True,
            "export_dirty": True,
        })
    })

    output_summary = f"简历内容已生成（v{resume_content.meta.version}，{language_label(resume_content.meta.language)}，A4 单页）。"
    if intent == "language_convert":
        output_summary = (
            f"简历已转换为{language_label(resume_content.meta.language)}版本"
            f"（v{resume_content.meta.version}，A4 单页）。"
        )

    return {
        "resume_content_json": resume_content,
        "render_config": render_config,
        "meta": meta,
        "workflow_trace": append_trace(
            state,
            node="content_agent",
            input_summary=f"根据岗位、候选人画像和用户指令生成简历内容：{summarize_user_message(state.user_message)}",
            output_summary=output_summary,
            artifacts={
                "resume_content_version": resume_content.meta.version,
                "target_role": resume_content.meta.target_role,
                "language": resume_content.meta.language,
                "skill_count": len(resume_content.skills),
                "project_count": len(resume_content.projects),
                "internship_count": len(resume_content.internships),
                "content_hash": resume_content.meta.content_hash,
            },
        ),
    }


def content_node(state: CopilotState) -> dict[str, Any]:
    """Resume Content Agent 同步兼容入口。"""
    return asyncio.run(content_node_async(state))
