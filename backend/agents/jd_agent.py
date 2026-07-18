"""JD Agent — 解析岗位描述，输出结构化 Job（支持 JD 缓存复用）。"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any

from agents.json_contracts import JDAnalysisOutput, JDTitleGenerationOutput
from models.llm import get_llm
from tools.output_language_guard import ainvoke_json_with_language_guard
from prompts.jd_analysis import JD_ANALYSIS_PROMPT
from tools.output_language import prompt_language_kwargs
from services.jd_title_service import generate_jd_from_title_for_profile
from services.jd_cache_service import (
    lookup_jd_cache_by_hash,
    lookup_jd_cache_by_title,
    save_jd_cache,
)
from tools.jd_cache import (
    analysis_output_to_parsed_job,
    extract_title_from_jd,
    is_title_only,
    jd_text_hash,
    parsed_job_to_job_fields,
)
from workflow.state import CopilotState, Job
from workflow.trace import append_trace, summarize_user_message
from log import get_logger

logger = get_logger("agent")


def _build_job(
    state: CopilotState,
    *,
    source: str,
    parsed: JDAnalysisOutput | None = None,
    parsed_dict: dict[str, Any] | None = None,
) -> Job:
    now = datetime.now(timezone.utc).isoformat()
    job_id = f"job_{uuid.uuid4().hex[:12]}"
    version = 1
    if state.job is not None:
        version = state.job.version + 1

    fields = parsed_job_to_job_fields(parsed_dict) if parsed_dict else {}
    if parsed is not None:
        fields = parsed_job_to_job_fields(analysis_output_to_parsed_job(parsed))

    return Job(
        id=job_id,
        source=source,
        parsed_at=now,
        version=version,
        industry=fields.get("industry") or "",
        title=fields.get("title") or "",
        tech_stack=fields.get("tech_stack") or [],
        keywords=fields.get("keywords") or [],
        hard_skills=fields.get("hard_skills") or [],
        soft_skills=fields.get("soft_skills") or [],
        responsibilities=fields.get("responsibilities") or [],
        education_requirement=fields.get("education_requirement") or "",
        experience_requirement=fields.get("experience_requirement") or "",
        implicit_preferences=fields.get("implicit_preferences") or [],
        bonus_items=fields.get("bonus_items") or [],
    )


def _job_result(
    state: CopilotState,
    job: Job,
    *,
    input_summary: str,
    output_summary: str,
    cache_hit: bool = False,
) -> dict[str, Any]:
    meta = state.meta.model_copy(update={
        "dirty_flags": state.meta.dirty_flags.model_copy(update={
            "content_dirty": True,
            "render_dirty": True,
            "interview_dirty": True,
        })
    })
    return {
        "job": job,
        "meta": meta,
        "workflow_trace": append_trace(
            state,
            node="jd_agent",
            input_summary=input_summary,
            output_summary=output_summary,
            artifacts={
                "job_title": job.title,
                "industry": job.industry,
                "tech_stack_count": len(job.tech_stack),
                "hard_skill_count": len(job.hard_skills),
                "responsibility_count": len(job.responsibilities),
                "version": job.version,
                "cache_hit": cache_hit,
            },
        ),
    }


async def _parse_jd_with_llm(jd_text: str, state: CopilotState) -> JDAnalysisOutput:
    lang_kwargs = prompt_language_kwargs(state)
    prompt = JD_ANALYSIS_PROMPT.format(
        jd_text=jd_text,
        **lang_kwargs,
    )
    llm = get_llm()
    return await ainvoke_json_with_language_guard(
        llm,
        prompt,
        JDAnalysisOutput,
        logger,
        "JD Agent",
        lang_kwargs["output_language"],
    )


async def _generate_jd_from_title(state: CopilotState, job_title: str) -> tuple[str, str]:
    parsed = await generate_jd_from_title_for_profile(state, job_title)
    title = (parsed.title or job_title).strip()
    jd_text = (parsed.jd_text or "").strip()
    if not jd_text:
        raise RuntimeError("Job description generation returned empty result")
    return title, jd_text


async def jd_node_async(state: CopilotState) -> dict[str, Any]:
    """JD Agent 异步节点函数。"""
    logger.info("JD Agent started for session %s", state.session_id)

    raw_input = (state.user_message or "").strip()
    input_summary = f"解析岗位文本：{summarize_user_message(raw_input)}"
    title_only = is_title_only(raw_input)
    text_hash = jd_text_hash(raw_input)

    # 1) 完整 JD 文本哈希命中
    cached = await lookup_jd_cache_by_hash(text_hash)
    if cached and cached.get("parsed_job"):
        job = _build_job(state, source=cached.get("jd_text") or raw_input, parsed_dict=cached["parsed_job"])
        logger.info("JD cache hit by hash: %s", job.title)
        return _job_result(
            state,
            job,
            input_summary=input_summary,
            output_summary=f"已从缓存加载岗位：{job.title}（{job.industry}）。",
            cache_hit=True,
        )

    # 2) 岗位名称命中（含仅岗位名输入）— 有候选人画像时跳过缓存，按简历重新生成
    lookup_title = extract_title_from_jd(raw_input)
    if not (title_only and state.candidate_profile is not None):
        cached = await lookup_jd_cache_by_title(lookup_title)
        if cached:
            effective_jd = cached.get("jd_text") or raw_input
            if cached.get("parsed_job"):
                job = _build_job(state, source=effective_jd, parsed_dict=cached["parsed_job"])
            else:
                parsed = await _parse_jd_with_llm(effective_jd, state)
                await save_jd_cache(
                    jd_text=effective_jd,
                    title=parsed.title,
                    job_title=lookup_title,
                    source=cached.get("source") or "generated",
                    parsed_job=analysis_output_to_parsed_job(parsed),
                )
                job = _build_job(state, source=effective_jd, parsed=parsed)
            logger.info("JD cache hit by title: %s", job.title)
            return _job_result(
                state,
                job,
                input_summary=input_summary,
                output_summary=f"已从缓存加载岗位：{job.title}（{job.industry}）。",
                cache_hit=True,
            )

    # 3) 仅岗位名称且无缓存 — 结合简历生成完整 JD 再解析
    jd_text = raw_input
    generated_from_title = False
    if title_only:
        try:
            _, jd_text = await _generate_jd_from_title(state, raw_input)
            generated_from_title = True
            logger.info("Generated profile-aware JD from title-only input: %s", raw_input)
        except RuntimeError as exc:
            logger.error("JD title generation failed: %s", exc)
            return {
                "workflow_trace": append_trace(
                    state,
                    node="jd_agent",
                    status="failed",
                    input_summary=input_summary,
                    output_summary="Failed to generate job description: model output format was invalid. Please retry.",
                    error=str(exc),
                ),
            }

    # 4) LLM 解析 JD
    try:
        parsed = await _parse_jd_with_llm(jd_text, state)
    except RuntimeError as exc:
        logger.error("JD Agent failed: %s", exc)
        return {
            "workflow_trace": append_trace(
                state,
                node="jd_agent",
                status="failed",
                input_summary=input_summary,
                output_summary="Failed to parse job description: model output format was invalid. Please retry.",
                error=str(exc),
            ),
        }

    job = _build_job(state, source=jd_text, parsed=parsed)

    # 5) 写入缓存（岗位名称 + JD 文本 + 解析结果）
    source = "generated" if generated_from_title else "uploaded"
    await save_jd_cache(
        jd_text=jd_text,
        title=job.title,
        job_title=raw_input if title_only else (job.title or lookup_title),
        source=source,
        parsed_job=analysis_output_to_parsed_job(parsed),
    )

    logger.info("JD parsed: %s (v%d)", job.title, job.version)
    return _job_result(
        state,
        job,
        input_summary=input_summary,
        output_summary=f"已解析岗位：{job.title}（{job.industry}）。",
        cache_hit=False,
    )


def jd_node(state: CopilotState) -> dict[str, Any]:
    """JD Agent 同步兼容入口。"""
    return asyncio.run(jd_node_async(state))
