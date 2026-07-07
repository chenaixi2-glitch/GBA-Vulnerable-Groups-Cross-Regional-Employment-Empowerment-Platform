"""Planner Agent — 意图分类 + 执行计划生成 + 事件记录。"""

from __future__ import annotations

import asyncio
import re
import uuid
from typing import Any

from agents.json_contracts import IntentClassificationOutput
from models.llm import get_llm, ainvoke_json_with_schema
from prompts.intent_classification import INTENT_CLASSIFICATION_PROMPT
from workflow.state import CopilotState
from workflow.trace import append_trace, summarize_user_message
from log import get_logger

logger = get_logger("agent")

# Intent → 执行链路
_INTENT_PLAN: dict[str, list[str]] = {
    "upload_jd": ["jd_agent", "gap_agent"],
    "upload_profile": ["profile_agent"],
    "gap_analysis": ["gap_agent"],
    "learning_path": ["learning_path_agent"],
    "content_edit": ["content_agent", "render_agent"],
    "language_convert": ["content_agent", "render_agent"],
    "render_edit": ["render_agent"],
    "export": [],
    "start_interview": ["interview_agent"],
    "evaluate_answer": ["answer_evaluation_agent"],
    "ask_question": ["question_agent"],
}

_LEARNING_RESOURCE_PATTERN = re.compile(
    r"(learning\s*resources?|recommend\s+(?:learning\s*)?(?:resources?|courses?)|"
    r"study\s*hours?|estimated\s*(?:study\s*)?hours?|courses?\s*to\s*learn|"
    r"学习资源|推荐.*课程|预估.*学时)",
    re.IGNORECASE,
)
_LEARNING_PATH_PATTERN = re.compile(
    r"(learning\s*path|learning\s*timeline|study\s*plan|learning\s*schedule|"
    r"学习路线|学习路径|学习计划)",
    re.IGNORECASE,
)
_TIMELINE_PATTERN = re.compile(
    r"(timeline|learning\s*schedule|study\s*plan|generate\s*(?:my\s*)?(?:learning\s*)?timeline|"
    r"学习时间表|时间线)",
    re.IGNORECASE,
)
_DAILY_HOURS_PATTERN = re.compile(
    r"(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\s*(?:per\s*day|daily|/day|each\s*day|a\s*day)|"
    r"(?:daily|per\s*day|each\s*day)\s*(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)?|"
    r"每日\s*\d+(?:\.\d+)?\s*小时",
    re.IGNORECASE,
)
_VALID_FORCED_INTENTS = frozenset(_INTENT_PLAN.keys())


def resolve_intent(raw_intent: str, user_message: str, state: CopilotState | None = None) -> str:
    """Apply deterministic routing rules after LLM intent classification."""
    intent = (raw_intent or "ask_question").strip()
    message = (user_message or "").strip()
    if not message:
        return intent

    wants_learning_path = bool(
        _LEARNING_RESOURCE_PATTERN.search(message)
        or _LEARNING_PATH_PATTERN.search(message)
        or (_TIMELINE_PATTERN.search(message) and _DAILY_HOURS_PATTERN.search(message))
    )

    if wants_learning_path and intent in {"gap_analysis", "ask_question"}:
        logger.info(
            "Intent override: %s -> learning_path (learning-path keywords detected)",
            intent,
        )
        return "learning_path"

    if state and intent == "gap_analysis" and state.candidate_profile is None:
        if state.profile_replace_mode or state.user_attachments:
            logger.info(
                "Intent override: gap_analysis -> upload_profile (profile upload in progress)",
            )
            return "upload_profile"
        # Long pasted resume/profile text may mention "gap analysis" in passing — treat as material.
        if len(message) >= 80:
            logger.info(
                "Intent override: gap_analysis -> upload_profile (long material, no profile yet)",
            )
            return "upload_profile"

    return intent


async def _classify_intent_async(state: CopilotState) -> IntentClassificationOutput:
    """异步调用 LLM 进行意图分类。"""
    prompt = INTENT_CLASSIFICATION_PROMPT.format(
        has_job=state.job is not None,
        has_profile=state.candidate_profile is not None,
        has_resume=state.resume_content_json is not None,
        user_message=state.user_message,
    )
    llm = get_llm()
    result = await ainvoke_json_with_schema(llm, prompt, IntentClassificationOutput, logger, "Planner Agent")
    logger.info("Intent classified: %s (reason: %s)", result.intent, result.reason)
    return result


def _build_execution_plan(intent: str, state: CopilotState) -> list[str]:
    """根据 intent 和当前状态构建执行计划。"""
    base_plan = _INTENT_PLAN.get(intent, [])

    # 跳过逻辑
    if intent == "upload_jd" and state.candidate_profile is None:
        # 没有候选人数据，不能生成简历
        return ["jd_agent"]

    return list(base_plan)


async def planner_node_async(state: CopilotState) -> dict[str, Any]:
    """Planner Agent 异步节点函数。"""
    logger.info("Planner Agent started for session %s", state.session_id)

    forced = (state.forced_intent or "").strip()
    if forced in _VALID_FORCED_INTENTS:
        intent = forced
        reason = f"client forced intent: {forced}"
        logger.info("Using forced intent: %s", intent)
    else:
        # 1. 意图分类
        try:
            intent_result = await _classify_intent_async(state)
        except RuntimeError as exc:
            logger.error("Planner Agent failed: %s", exc)
            return {
                "current_intent": "ask_question",
                "execution_plan": [],
                "triggered_agents": [],
                "workflow_trace": append_trace(
                    state,
                    node="planner",
                    status="failed",
                    input_summary=f"用户输入：{summarize_user_message(state.user_message)}",
                    output_summary="意图识别失败：模型输出格式异常，请稍后重试。",
                    error=str(exc),
                ),
            }

        intent = intent_result.intent or "ask_question"
        reason = intent_result.reason or ""
        intent = resolve_intent(intent, state.user_message, state)

    # 2. 构建执行计划
    plan = _build_execution_plan(intent, state)
    logger.info("Execution plan: %s", plan)

    # 3. 生成消息 ID 和事件
    message_id = f"msg_{uuid.uuid4().hex[:12]}"

    updates: dict[str, Any] = {
        "current_intent": intent,
        "execution_plan": plan,
        "triggered_agents": list(plan),
        "workflow_trace": append_trace(
            state,
            node="planner",
            input_summary=f"用户输入：{summarize_user_message(state.user_message)}",
            output_summary=f"识别意图为 {intent}，执行计划为 {' -> '.join(plan) if plan else '无后续 Agent'}。",
            artifacts={
                "intent": intent,
                "reason": reason,
                "execution_plan": plan,
                "forced_intent": bool(forced),
            },
        ),
    }

    # 无需执行 Agent 的意图直接回复
    if not plan:
        if intent == "export":
            updates["workflow_trace"] = append_trace(
                state.model_copy(update={"workflow_trace": updates["workflow_trace"]}),
                node="export",
                status="completed",
                input_summary="用户请求导出。",
                output_summary="请使用页面上方的导出按钮（PDF / DOCX / HTML 等），或调用 /api/export/pdf 接口下载简历。",
                artifacts={"supported": True, "formats": ["pdf", "docx", "html", "json", "markdown"]},
            )

    updates["meta"] = state.meta.model_copy(update={
        "last_user_message_id": message_id,
    })

    return updates


def planner_node(state: CopilotState) -> dict[str, Any]:
    """Planner Agent 同步兼容入口。"""
    return asyncio.run(planner_node_async(state))
