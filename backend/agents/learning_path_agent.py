"""Learning Path Agent — gaps + resources first, then timeline after daily hours."""

from __future__ import annotations

import json
import math
import re
import uuid
from typing import Any

from agents.json_contracts import LearningPathAnalysisOutput, LearningPathTimelineOutput
from models.llm import get_llm, ainvoke_json_with_schema
from prompts.learning_path import LEARNING_PATH_ANALYSIS_PROMPT, LEARNING_PATH_TIMELINE_PROMPT
from tools.target_job_context import build_enriched_job_json
from workflow.state import CopilotState, Gap, LearningPathPhase, LearningPathResource, Question
from workflow.trace import append_trace, summarize_user_message
from log import get_logger

logger = get_logger("agent")

_DAILY_HOURS_PATTERN = re.compile(
    r"(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\s*(?:per\s*day|daily|/day|each\s*day|a\s*day)",
    re.IGNORECASE,
)
_TIMELINE_KEYWORDS = re.compile(
    r"(timeline|learning\s*schedule|study\s*plan|generate\s*(?:my\s*)?(?:learning\s*)?timeline)",
    re.IGNORECASE,
)


def _extract_daily_hours(user_message: str) -> float | None:
    match = _DAILY_HOURS_PATTERN.search(user_message)
    if match:
        return float(match.group(1))
    # "2 hours daily" / "daily 2 hours"
    alt = re.search(
        r"(?:daily|per\s*day|each\s*day)\s*(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)?",
        user_message,
        re.IGNORECASE,
    )
    if alt:
        return float(alt.group(1))
    return None


def _is_timeline_phase(state: CopilotState, user_message: str) -> bool:
    daily_hours = _extract_daily_hours(user_message)
    if daily_hours is None:
        return False
    has_prior_analysis = bool(state.gaps or state.learning_path_resources)
    return has_prior_analysis and bool(_TIMELINE_KEYWORDS.search(user_message))


def _compute_total_weeks(total_hours: int, daily_hours: float) -> int:
    if total_hours <= 0 or daily_hours <= 0:
        return 1
    return max(1, math.ceil(total_hours / (daily_hours * 7)))


def _build_gaps_from_analysis(parsed: LearningPathAnalysisOutput) -> list[Gap]:
    gaps: list[Gap] = []
    for item in parsed.gaps:
        gaps.append(Gap(
            id=item.id or f"gap_{uuid.uuid4().hex[:12]}",
            type=item.type,
            severity=item.severity,
            description=item.description,
            estimated_hours=item.estimated_hours,
            related_section_ids=item.related_section_ids,
            resolved=item.resolved,
            resolution_source=item.resolution_source or "learning_path",
        ))
    return gaps


def _build_questions(parsed: LearningPathAnalysisOutput) -> list[Question]:
    questions: list[Question] = []
    for item in parsed.questions_to_ask:
        questions.append(Question(
            id=item.id or f"q_{uuid.uuid4().hex[:12]}",
            question=item.question,
            reason=item.reason,
            target_field=item.target_field,
            priority=item.priority,
            status=item.status,
            answer_ref=item.answer_ref,
        ))
    return questions


def _build_timeline(parsed: LearningPathTimelineOutput) -> list[LearningPathPhase]:
    phases: list[LearningPathPhase] = []
    for item in parsed.timeline:
        phases.append(LearningPathPhase(
            phase=item.phase,
            title=item.title,
            weeks=item.weeks,
            skills=list(item.skills),
            description=item.description,
        ))
    return phases


def _build_resources(parsed: LearningPathAnalysisOutput) -> list[LearningPathResource]:
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


def _infer_total_hours(parsed: LearningPathAnalysisOutput) -> int:
    if parsed.estimated_total_hours > 0:
        return parsed.estimated_total_hours
    gap_hours = sum(max(0, g.estimated_hours) for g in parsed.gaps)
    resource_hours = sum(max(0.0, r.duration_hours) for r in parsed.resources)
    total = int(gap_hours or resource_hours)
    return max(total, 1)


async def _run_analysis_phase(state: CopilotState) -> dict[str, Any]:
    prompt = LEARNING_PATH_ANALYSIS_PROMPT.format(
        job_json=build_enriched_job_json(state),
        profile_json=state.candidate_profile.model_dump_json(indent=2),
    )
    llm = get_llm()
    parsed = await ainvoke_json_with_schema(
        llm, prompt, LearningPathAnalysisOutput, logger, "Learning Path Agent (analysis)"
    )

    gaps = _build_gaps_from_analysis(parsed)
    questions = _build_questions(parsed)
    resources = _build_resources(parsed)
    estimated_hours = _infer_total_hours(parsed)

    logger.info(
        "Learning path analysis: %d gaps, %d resources, ~%d hours",
        len(gaps), len(resources), estimated_hours,
    )

    return {
        "gaps": gaps,
        "questions_to_ask": questions,
        "learning_path_resources": resources,
        "learning_path_estimated_hours": estimated_hours,
        "learning_path_timeline": [],
        "learning_path_daily_hours": 0.0,
        "workflow_trace": append_trace(
            state,
            node="learning_path_agent",
            input_summary="分析能力缺口并推荐学习资源",
            output_summary=(
                f"缺口分析完成：{len(gaps)} 项缺口，{len(resources)} 个推荐资源，"
                f"预估总学时 {estimated_hours} 小时。"
                f"请选择每日学习时长以生成 timeline。"
            ),
            artifacts={
                "phase": "analysis",
                "gap_count": len(gaps),
                "resource_count": len(resources),
                "estimated_total_hours": estimated_hours,
            },
        ),
    }


async def _run_timeline_phase(state: CopilotState, daily_hours: float) -> dict[str, Any]:
    estimated_hours = state.learning_path_estimated_hours or _infer_total_hours_from_state(state)
    total_weeks = _compute_total_weeks(estimated_hours, daily_hours)

    gaps_payload = [g.model_dump() for g in state.gaps]
    resources_payload = [r.model_dump() for r in state.learning_path_resources]

    prompt = LEARNING_PATH_TIMELINE_PROMPT.format(
        job_json=build_enriched_job_json(state),
        profile_json=state.candidate_profile.model_dump_json(indent=2),
        gaps_json=json.dumps(gaps_payload, ensure_ascii=False, indent=2),
        resources_json=json.dumps(resources_payload, ensure_ascii=False, indent=2),
        estimated_total_hours=estimated_hours,
        daily_hours=daily_hours,
        total_weeks=total_weeks,
    )
    llm = get_llm()
    parsed = await ainvoke_json_with_schema(
        llm, prompt, LearningPathTimelineOutput, logger, "Learning Path Agent (timeline)"
    )

    timeline = _build_timeline(parsed)

    logger.info(
        "Learning path timeline: %d phases, %d hours @ %.1f h/day (~%d weeks)",
        len(timeline), estimated_hours, daily_hours, total_weeks,
    )

    return {
        "learning_path_timeline": timeline,
        "learning_path_daily_hours": daily_hours,
        "workflow_trace": append_trace(
            state,
            node="learning_path_agent",
            input_summary=f"生成学习 timeline（每日 {daily_hours} 小时）",
            output_summary=(
                f"Timeline 已生成：{len(timeline)} 个阶段，"
                f"总学时 {estimated_hours} 小时，每日 {daily_hours} 小时，约 {total_weeks} 周。"
            ),
            artifacts={
                "phase": "timeline",
                "phase_count": len(timeline),
                "estimated_total_hours": estimated_hours,
                "daily_hours": daily_hours,
                "total_weeks": total_weeks,
            },
        ),
    }


def _infer_total_hours_from_state(state: CopilotState) -> int:
    resource_hours = sum(max(0.0, r.duration_hours) for r in state.learning_path_resources)
    if resource_hours > 0:
        return max(1, int(resource_hours))
    return max(1, len(state.gaps) * 20)


async def learning_path_node_async(state: CopilotState) -> dict[str, Any]:
    """Analyze gaps/resources first; generate timeline after user picks daily hours."""
    logger.info("Learning Path Agent started for session %s", state.session_id)

    has_job_context = state.job is not None or bool((state.meta.target_jd_text or "").strip())
    if not has_job_context or state.candidate_profile is None:
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
        if _is_timeline_phase(state, state.user_message):
            daily_hours = _extract_daily_hours(state.user_message) or 1.0
            return await _run_timeline_phase(state, daily_hours)
        return await _run_analysis_phase(state)
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
