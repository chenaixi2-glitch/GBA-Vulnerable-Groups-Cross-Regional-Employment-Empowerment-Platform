"""Learning Path Agent — shared gap analysis, then resources + timeline."""

from __future__ import annotations

import json
import math
import re
import uuid
from typing import Any

from agents.gap_analysis_core import has_gap_analysis_context, run_gap_analysis
from agents.json_contracts import (
    LearningPathExpandOutput,
    LearningPathResourcesOutput,
    LearningPathTimelineOutput,
)
from models.llm import get_llm
from tools.output_language_guard import ainvoke_json_with_language_guard
from prompts.learning_path import LEARNING_PATH_EXPAND_PROMPT, LEARNING_PATH_TIMELINE_PROMPT
from prompts.learning_path_resources import LEARNING_PATH_RESOURCES_PROMPT
from tools.output_language import page_prompt_language_kwargs
from tools.target_job_context import build_enriched_job_json
from workflow.state import CopilotState, Gap, LearningPathPhase, LearningPathResource
from workflow.trace import append_trace, summarize_user_message
from log import get_logger

logger = get_logger("agent")

# Temporarily skip curated learning-resources LLM. Set True to re-enable.
LEARNING_PATH_RESOURCES_ENABLED = False

_VALID_UNITS = ("month", "week", "day")
_UNIT_NEXT = {"month": "week", "week": "day"}

_DAILY_HOURS_PATTERN = re.compile(
    r"(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\s*(?:per\s*day|daily|/day|each\s*day|a\s*day)",
    re.IGNORECASE,
)
_TIMELINE_KEYWORDS = re.compile(
    r"(timeline|learning\s*schedule|study\s*plan|generate\s*(?:my\s*)?(?:learning\s*)?timeline)",
    re.IGNORECASE,
)
_EXPAND_PATTERN = re.compile(
    r"expand\s+(?:phase|step)\s+(\d+).*?(?:into|to)\s+(?:a\s+)?(daily|weekly|monthly|day|week|month)",
    re.IGNORECASE,
)
_UNIT_EXPLICIT = re.compile(
    r"(?:timeline[_\s-]*unit|plan\s*granularity|as\s+a)\s*[:=]?\s*"
    r"(monthly|weekly|daily|month|week|day)\b"
    r"|(?:monthly|weekly|daily)\s+(?:plan|timeline|schedule)",
    re.IGNORECASE,
)


def _normalize_unit(raw: str | None) -> str | None:
    if not raw:
        return None
    value = raw.strip().lower()
    if value in {"monthly", "month", "months"}:
        return "month"
    if value in {"weekly", "week", "weeks"}:
        return "week"
    if value in {"daily", "day", "days"}:
        return "day"
    return None


def _extract_daily_hours(user_message: str) -> float | None:
    match = _DAILY_HOURS_PATTERN.search(user_message)
    if match:
        return float(match.group(1))
    alt = re.search(
        r"(?:daily|per\s*day|each\s*day)\s*(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)?",
        user_message,
        re.IGNORECASE,
    )
    if alt:
        return float(alt.group(1))
    return None


def _extract_timeline_unit(user_message: str) -> str | None:
    match = _UNIT_EXPLICIT.search(user_message)
    if not match:
        return None
    for group in match.groups():
        unit = _normalize_unit(group)
        if unit:
            return unit
    return None


def _extract_expand_request(user_message: str) -> tuple[int, str] | None:
    match = _EXPAND_PATTERN.search(user_message)
    if not match:
        return None
    phase_no = int(match.group(1))
    target = _normalize_unit(match.group(2))
    if not target:
        return None
    return phase_no, target


def _is_timeline_phase(state: CopilotState, user_message: str) -> bool:
    if _extract_expand_request(user_message):
        return bool(state.learning_path_timeline)
    daily_hours = _extract_daily_hours(user_message)
    if daily_hours is None:
        return False
    has_prior_analysis = bool(state.gaps or state.learning_path_resources)
    return has_prior_analysis and bool(_TIMELINE_KEYWORDS.search(user_message))


def _compute_duration_stats(total_hours: int, daily_hours: float) -> dict[str, int]:
    if total_hours <= 0 or daily_hours <= 0:
        return {"total_days": 1, "total_weeks": 1, "total_months": 1}
    total_days = max(1, math.ceil(total_hours / daily_hours))
    total_weeks = max(1, math.ceil(total_days / 7))
    total_months = max(1, math.ceil(total_days / 30))
    return {
        "total_days": total_days,
        "total_weeks": total_weeks,
        "total_months": total_months,
    }


def recommend_timeline_unit(total_hours: int, daily_hours: float) -> str:
    """Short → day; up to ~3 months → week; longer → month."""
    stats = _compute_duration_stats(total_hours, daily_hours)
    days = stats["total_days"]
    if days <= 14:
        return "day"
    if days <= 90:
        return "week"
    return "month"


def _span_for_unit(stats: dict[str, int], unit: str) -> int:
    if unit == "month":
        return stats["total_months"]
    if unit == "day":
        return stats["total_days"]
    return stats["total_weeks"]


def _period_end(period: str) -> int:
    match = re.search(r"(\d+)\s*$", period or "")
    if match:
        return int(match.group(1))
    return 0


def estimate_span_from_timeline(timeline: list[LearningPathPhase]) -> int:
    if not timeline:
        return 0
    return max((_period_end(p.period) for p in timeline), default=len(timeline))


def _build_phase(item: Any, fallback_unit: str = "week") -> LearningPathPhase:
    unit = _normalize_unit(getattr(item, "unit", None)) or fallback_unit
    children_raw = getattr(item, "children", None) or []
    return LearningPathPhase(
        phase=getattr(item, "phase", 1) or 1,
        title=getattr(item, "title", "") or "",
        period=getattr(item, "period", "") or "",
        unit=unit,
        skills=list(getattr(item, "skills", None) or []),
        description=getattr(item, "description", "") or "",
        children=[_build_phase(child, unit) for child in children_raw],
    )


def _build_timeline(parsed: LearningPathTimelineOutput, unit: str) -> list[LearningPathPhase]:
    return [_build_phase(item, unit) for item in parsed.timeline]


def _build_resources(parsed: LearningPathResourcesOutput) -> list[LearningPathResource]:
    resources: list[LearningPathResource] = []
    for item in parsed.resources:
        resources.append(LearningPathResource(
            id=item.id or f"res_{uuid.uuid4().hex[:12]}",
            skill=item.skill,
            type=item.type,
            title=item.title,
            platform=item.platform,
            duration=item.duration,
            duration_hours=item.duration_hours,
            url=item.url,
            rating=item.rating,
        ))
    return resources


def _apply_gap_hour_estimates(gaps: list[Gap], parsed: LearningPathResourcesOutput) -> list[Gap]:
    if not parsed.gap_hours:
        return gaps
    hours_by_id = {item.id: item.estimated_hours for item in parsed.gap_hours if item.id}
    if not hours_by_id:
        return gaps
    updated: list[Gap] = []
    for gap in gaps:
        hours = hours_by_id.get(gap.id)
        if hours and hours > 0:
            updated.append(gap.model_copy(update={"estimated_hours": hours}))
        else:
            updated.append(gap)
    return updated


def _infer_total_hours(gaps: list[Gap], parsed: LearningPathResourcesOutput) -> int:
    if parsed.estimated_total_hours > 0:
        return parsed.estimated_total_hours
    gap_hours = sum(max(0, g.estimated_hours) for g in gaps)
    resource_hours = sum(max(0.0, r.duration_hours) for r in parsed.resources)
    total = int(gap_hours or resource_hours)
    return max(total, 1)


async def _run_resources_phase(state: CopilotState, gaps: list[Gap]) -> tuple[list[Gap], list[LearningPathResource], int]:
    gaps_payload = [g.model_dump() for g in gaps]
    lang_kwargs = page_prompt_language_kwargs(state)
    prompt = LEARNING_PATH_RESOURCES_PROMPT.format(
        job_json=build_enriched_job_json(state),
        profile_json=state.candidate_profile.model_dump_json(indent=2),
        gaps_json=json.dumps(gaps_payload, ensure_ascii=False, indent=2),
        **lang_kwargs,
    )
    llm = get_llm()
    parsed = await ainvoke_json_with_language_guard(
        llm,
        prompt,
        LearningPathResourcesOutput,
        logger,
        "Learning Path Agent (resources)",
        lang_kwargs["output_language"],
    )
    gaps = _apply_gap_hour_estimates(gaps, parsed)
    resources = _build_resources(parsed)
    estimated_hours = _infer_total_hours(gaps, parsed)
    logger.info(
        "Learning path resources: %d resources, ~%d hours (from %d gaps)",
        len(resources), estimated_hours, len(gaps),
    )
    return gaps, resources, estimated_hours


def _skip_resources_phase(gaps: list[Gap]) -> tuple[list[Gap], list[LearningPathResource], int]:
    """Skip resources LLM; keep gaps and estimate hours from gaps only."""
    estimated_hours = _infer_total_hours(gaps, LearningPathResourcesOutput())
    logger.info(
        "Learning path resources skipped (disabled): 0 resources, ~%d hours (from %d gaps)",
        estimated_hours, len(gaps),
    )
    return gaps, [], estimated_hours


async def _run_analysis_phase(state: CopilotState) -> dict[str, Any]:
    if state.gaps:
        gaps = list(state.gaps)
        questions = list(state.questions_to_ask)
        logger.info("Learning path reusing %d existing gaps from session", len(gaps))
    else:
        gaps, questions, _removals = await run_gap_analysis(state, resolution_source="learning_path")

    if LEARNING_PATH_RESOURCES_ENABLED:
        gaps, resources, estimated_hours = await _run_resources_phase(state, gaps)
        input_summary = "分析能力缺口并推荐学习资源"
        output_summary = (
            f"缺口分析完成：{len(gaps)} 项缺口，{len(resources)} 个推荐资源，"
            f"预估总学时 {estimated_hours} 小时。"
            f"请选择每日学习时长与计划粒度以生成 timeline。"
        )
    else:
        gaps, resources, estimated_hours = _skip_resources_phase(gaps)
        input_summary = "分析能力缺口（学习资源推荐已暂时关闭）"
        output_summary = (
            f"缺口分析完成：{len(gaps)} 项缺口，预估总学时 {estimated_hours} 小时。"
            f"请选择每日学习时长与计划粒度以生成 timeline。"
        )

    return {
        "gaps": gaps,
        "questions_to_ask": questions,
        "learning_path_resources": resources,
        "learning_path_estimated_hours": estimated_hours,
        "learning_path_timeline": [],
        "learning_path_daily_hours": 0.0,
        "learning_path_timeline_unit": "week",
        "workflow_trace": append_trace(
            state,
            node="learning_path_agent",
            input_summary=input_summary,
            output_summary=output_summary,
            artifacts={
                "phase": "analysis",
                "gap_count": len(gaps),
                "resource_count": len(resources),
                "estimated_total_hours": estimated_hours,
                "resources_enabled": LEARNING_PATH_RESOURCES_ENABLED,
                "reused_gaps": bool(state.gaps),
            },
        ),
    }


async def _run_timeline_phase(
    state: CopilotState,
    daily_hours: float,
    timeline_unit: str | None = None,
) -> dict[str, Any]:
    estimated_hours = state.learning_path_estimated_hours or _infer_total_hours_from_state(state)
    stats = _compute_duration_stats(estimated_hours, daily_hours)
    unit = _normalize_unit(timeline_unit) or recommend_timeline_unit(estimated_hours, daily_hours)
    total_span = _span_for_unit(stats, unit)

    gaps_payload = [g.model_dump() for g in state.gaps]
    resources_payload = [r.model_dump() for r in state.learning_path_resources]

    lang_kwargs = page_prompt_language_kwargs(state)
    prompt = LEARNING_PATH_TIMELINE_PROMPT.format(
        job_json=build_enriched_job_json(state),
        profile_json=state.candidate_profile.model_dump_json(indent=2),
        gaps_json=json.dumps(gaps_payload, ensure_ascii=False, indent=2),
        resources_json=json.dumps(resources_payload, ensure_ascii=False, indent=2),
        estimated_total_hours=estimated_hours,
        daily_hours=daily_hours,
        total_days=stats["total_days"],
        total_weeks=stats["total_weeks"],
        total_months=stats["total_months"],
        timeline_unit=unit,
        total_span=total_span,
        **lang_kwargs,
    )
    llm = get_llm()
    parsed = await ainvoke_json_with_language_guard(
        llm,
        prompt,
        LearningPathTimelineOutput,
        logger,
        "Learning Path Agent (timeline)",
        lang_kwargs["output_language"],
    )

    timeline = _build_timeline(parsed, unit)
    for phase in timeline:
        if phase.unit != unit:
            phase.unit = unit

    logger.info(
        "Learning path timeline: %d phases, %d hours @ %.1f h/day (~%d %ss)",
        len(timeline), estimated_hours, daily_hours, total_span, unit,
    )

    return {
        "learning_path_timeline": timeline,
        "learning_path_daily_hours": daily_hours,
        "learning_path_timeline_unit": unit,
        "workflow_trace": append_trace(
            state,
            node="learning_path_agent",
            input_summary=f"生成学习 timeline（每日 {daily_hours} 小时，粒度 {unit}）",
            output_summary=(
                f"Timeline 已生成：{len(timeline)} 个阶段，"
                f"总学时 {estimated_hours} 小时，每日 {daily_hours} 小时，"
                f"约 {total_span} {unit}(s)。"
            ),
            artifacts={
                "phase": "timeline",
                "phase_count": len(timeline),
                "estimated_total_hours": estimated_hours,
                "daily_hours": daily_hours,
                "timeline_unit": unit,
                "total_days": stats["total_days"],
                "total_weeks": stats["total_weeks"],
                "total_months": stats["total_months"],
                "total_span": total_span,
            },
        ),
    }


async def expand_timeline_phase(
    state: CopilotState,
    phase_index: int,
    target_unit: str,
) -> dict[str, Any]:
    """Expand one top-level phase into finer-grained children (month→week, week→day)."""
    timeline = list(state.learning_path_timeline or [])
    if phase_index < 0 or phase_index >= len(timeline):
        raise ValueError(f"Invalid phase index: {phase_index}")

    parent = timeline[phase_index]
    source_unit = _normalize_unit(parent.unit) or "week"
    target = _normalize_unit(target_unit)
    expected = _UNIT_NEXT.get(source_unit)
    if not target or target != expected:
        raise ValueError(
            f"Phase unit '{source_unit}' can only expand to '{expected}', got '{target_unit}'"
        )

    daily_hours = float(state.learning_path_daily_hours or 1.0)
    estimated_hours = state.learning_path_estimated_hours or _infer_total_hours_from_state(state)
    gaps_payload = [g.model_dump() for g in state.gaps]
    resources_payload = [r.model_dump() for r in state.learning_path_resources]
    lang_kwargs = page_prompt_language_kwargs(state)

    prompt = LEARNING_PATH_EXPAND_PROMPT.format(
        job_json=build_enriched_job_json(state),
        profile_json=state.candidate_profile.model_dump_json(indent=2),
        gaps_json=json.dumps(gaps_payload, ensure_ascii=False, indent=2),
        resources_json=json.dumps(resources_payload, ensure_ascii=False, indent=2),
        estimated_total_hours=estimated_hours,
        daily_hours=daily_hours,
        phase_json=json.dumps(parent.model_dump(), ensure_ascii=False, indent=2),
        source_unit=source_unit,
        target_unit=target,
        **lang_kwargs,
    )
    llm = get_llm()
    parsed = await ainvoke_json_with_language_guard(
        llm,
        prompt,
        LearningPathExpandOutput,
        logger,
        "Learning Path Agent (expand)",
        lang_kwargs["output_language"],
    )
    children = [_build_phase(item, target) for item in parsed.children]
    for child in children:
        child.unit = target
        child.children = []

    updated = parent.model_copy(update={"children": children})
    timeline[phase_index] = updated

    logger.info(
        "Expanded learning path phase %d (%s → %s): %d children",
        phase_index + 1, source_unit, target, len(children),
    )

    return {
        "learning_path_timeline": timeline,
        "workflow_trace": append_trace(
            state,
            node="learning_path_agent",
            input_summary=f"展开阶段 {phase_index + 1} 为 {target} 计划",
            output_summary=f"阶段 {phase_index + 1} 已展开为 {len(children)} 个 {target} 子计划。",
            artifacts={
                "phase": "expand",
                "phase_index": phase_index,
                "source_unit": source_unit,
                "target_unit": target,
                "child_count": len(children),
            },
        ),
    }


async def _run_expand_phase(state: CopilotState, phase_no: int, target_unit: str) -> dict[str, Any]:
    return await expand_timeline_phase(state, phase_no - 1, target_unit)


def _infer_total_hours_from_state(state: CopilotState) -> int:
    resource_hours = sum(max(0.0, r.duration_hours) for r in state.learning_path_resources)
    if resource_hours > 0:
        return max(1, int(resource_hours))
    gap_hours = sum(max(0, g.estimated_hours) for g in state.gaps)
    if gap_hours > 0:
        return gap_hours
    return max(1, len(state.gaps) * 20)


async def learning_path_node_async(state: CopilotState) -> dict[str, Any]:
    """Shared gap analysis, then resources; timeline after daily hours / expand request."""
    logger.info("Learning Path Agent started for session %s", state.session_id)

    if not has_gap_analysis_context(state):
        return {
            "gaps": [],
            "learning_path_timeline": [],
            "learning_path_resources": [],
            "learning_path_estimated_hours": 0,
            "questions_to_ask": [],
            "workflow_trace": append_trace(
                state,
                node="learning_path_agent",
                status="skipped",
                input_summary=f"生成学习路径：{summarize_user_message(state.user_message)}",
                output_summary="缺少岗位或候选人画像，请先提交 JD 和个人材料。",
                artifacts={
                    "has_job": state.job is not None,
                    "has_target_jd": bool((state.meta.target_jd_text or "").strip()),
                    "has_candidate_profile": state.candidate_profile is not None,
                },
            ),
        }

    try:
        expand_req = _extract_expand_request(state.user_message)
        if expand_req and state.learning_path_timeline:
            phase_no, target_unit = expand_req
            return await _run_expand_phase(state, phase_no, target_unit)

        if _is_timeline_phase(state, state.user_message):
            daily_hours = _extract_daily_hours(state.user_message) or 1.0
            unit = _extract_timeline_unit(state.user_message)
            return await _run_timeline_phase(state, daily_hours, unit)
        return await _run_analysis_phase(state)
    except ValueError as exc:
        logger.error("Learning Path Agent validation failed: %s", exc)
        return {
            "workflow_trace": append_trace(
                state,
                node="learning_path_agent",
                status="failed",
                input_summary="生成个性化学习路径",
                output_summary=f"学习路径处理失败：{exc}",
                error=str(exc),
            ),
        }
    except RuntimeError as exc:
        logger.error("Learning Path Agent failed: %s", exc)
        return {
            "workflow_trace": append_trace(
                state,
                node="learning_path_agent",
                status="failed",
                input_summary="生成个性化学习路径",
                output_summary="学习路径生成失败：模型输出格式异常，请重试。",
                error=str(exc),
            ),
        }
