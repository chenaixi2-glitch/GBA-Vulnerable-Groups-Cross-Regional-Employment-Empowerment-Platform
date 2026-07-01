"""Gap Analysis Agent — 比对 JD 与候选人画像，输出能力缺口和待追问问题。"""

from __future__ import annotations

import asyncio
from typing import Any

from agents.gap_analysis_core import has_gap_analysis_context, run_gap_analysis
from workflow.state import CopilotState
from workflow.trace import append_trace
from log import get_logger

logger = get_logger("agent")


async def gap_node_async(state: CopilotState) -> dict[str, Any]:
    """Gap Analysis Agent 异步节点函数。"""
    logger.info("Gap Analysis Agent started for session %s", state.session_id)

    if not has_gap_analysis_context(state):
        logger.warning("Gap Analysis skipped due to missing job or profile")
        return {
            "gaps": [],
            "questions_to_ask": [],
            "workflow_trace": append_trace(
                state,
                node="gap_agent",
                status="skipped",
                input_summary="读取岗位和候选人画像用于缺口分析。",
                output_summary="缺少岗位或候选人画像，暂时无法完成缺失信息分析。",
                artifacts={
                    "has_job": state.job is not None,
                    "has_target_jd": bool((state.meta.target_jd_text or "").strip()),
                    "has_candidate_profile": state.candidate_profile is not None,
                },
            ),
        }

    try:
        gaps, questions = await run_gap_analysis(state, resolution_source="gap_analysis")
    except RuntimeError as exc:
        logger.error("Gap Analysis Agent failed: %s", exc)
        return {
            "gaps": [],
            "questions_to_ask": [],
            "workflow_trace": append_trace(
                state,
                node="gap_agent",
                status="failed",
                input_summary="读取岗位和候选人画像用于缺口分析。",
                output_summary="缺失信息分析失败：模型输出格式异常，请重试。",
                error=str(exc),
            ),
        }

    logger.info("Gap Analysis generated %d gaps and %d questions", len(gaps), len(questions))

    return {
        "gaps": gaps,
        "questions_to_ask": questions,
        "workflow_trace": append_trace(
            state,
            node="gap_agent",
            input_summary="读取岗位和候选人画像用于缺口分析。",
            output_summary=f"缺失信息分析已完成，发现 {len(gaps)} 项缺口，生成 {len(questions)} 个待追问问题。",
            artifacts={
                "gap_count": len(gaps),
                "question_count": len(questions),
                "high_severity_gap_count": sum(1 for gap in gaps if gap.severity == "high"),
            },
        ),
    }


def gap_node(state: CopilotState) -> dict[str, Any]:
    """Gap Analysis Agent 同步兼容入口。"""
    return asyncio.run(gap_node_async(state))
