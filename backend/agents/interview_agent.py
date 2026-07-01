"""Interview Agent — 生成面试问答集。"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any

from agents.json_contracts import InterviewGenerationOutput
from models.llm import get_llm, ainvoke_json_with_schema
from prompts.interview_generation import (
    INTERVIEW_GENERATION_PROMPT,
    STANDALONE_INTERVIEW_GENERATION_PROMPT,
)
from tools.target_job_context import build_enriched_job_json
from workflow.state import CopilotState, InterviewQA
from workflow.trace import append_trace
from log import get_logger

logger = get_logger("agent")

FIXED_SELF_INTRO_ID = "qa_self_intro"
FIXED_SELF_INTRO_CATEGORY = "简历深挖与个人经历"
FIXED_SELF_INTRO_QUESTION = "自我介绍"


def _is_self_intro_question(question: str) -> bool:
    return "自我介绍" in question.strip()


def _ensure_fixed_self_intro(interview_qa: list[InterviewQA]) -> list[InterviewQA]:
    """Ensure the first QA is always the fixed self-introduction question."""
    intro_answer = ""
    intro_refs: list[str] = []
    remaining: list[InterviewQA] = []

    for item in interview_qa:
        if _is_self_intro_question(item.question):
            if not intro_answer:
                intro_answer = item.answer
                intro_refs = list(item.source_refs)
            continue
        remaining.append(item)

    fixed_intro = InterviewQA(
        id=FIXED_SELF_INTRO_ID,
        category=FIXED_SELF_INTRO_CATEGORY,
        question=FIXED_SELF_INTRO_QUESTION,
        answer=intro_answer,
        source_refs=intro_refs,
        version=1,
    )
    return [fixed_intro, *remaining]


def _build_interview_qa(parsed: InterviewGenerationOutput) -> list[InterviewQA]:
    interview_qa: list[InterviewQA] = []
    for item in parsed.interview_qa:
        interview_qa.append(InterviewQA(
            id=item.id or f"qa_{uuid.uuid4().hex[:12]}",
            category=item.category,
            question=item.question,
            answer=item.answer,
            source_refs=item.source_refs,
            version=item.version,
        ))
    return interview_qa


def _has_full_context(state: CopilotState) -> bool:
    return (
        state.job is not None
        and state.candidate_profile is not None
        and state.resume_content_json is not None
    )


async def interview_node_async(state: CopilotState) -> dict[str, Any]:
    """Interview Agent 异步节点函数。"""
    logger.info("Interview Agent started for session %s", state.session_id)

    llm = get_llm()
    standalone = not _has_full_context(state)

    if standalone:
        logger.info("Interview Agent using standalone mode (partial session context)")
        prompt = STANDALONE_INTERVIEW_GENERATION_PROMPT.format(
            user_message=state.user_message or "",
            job_json=build_enriched_job_json(state),
            profile_json=state.candidate_profile.model_dump_json(indent=2) if state.candidate_profile else "{}",
            resume_json=state.resume_content_json.model_dump_json(indent=2) if state.resume_content_json else "{}",
        )
        input_summary = "基于用户消息与已有部分上下文生成面试题（独立模式）。"
    else:
        prompt = INTERVIEW_GENERATION_PROMPT.format(
            job_json=build_enriched_job_json(state),
            profile_json=state.candidate_profile.model_dump_json(indent=2),
            resume_json=state.resume_content_json.model_dump_json(indent=2),
        )
        input_summary = "读取岗位、候选人画像和简历内容生成面试问答。"

    try:
        parsed = await ainvoke_json_with_schema(llm, prompt, InterviewGenerationOutput, logger, "Interview Agent")
    except RuntimeError as exc:
        logger.error("Interview Agent failed: %s", exc)
        return {
            "interview_qa": [],
            "workflow_trace": append_trace(
                state,
                node="interview_agent",
                status="failed",
                input_summary=input_summary,
                output_summary="面试问答生成失败：模型输出格式异常，请重试。",
                error=str(exc),
            ),
        }

    interview_qa = _ensure_fixed_self_intro(_build_interview_qa(parsed))

    if not interview_qa or (len(interview_qa) == 1 and not (interview_qa[0].answer or interview_qa[0].question)):
        logger.warning("Interview Agent produced no usable questions")
        return {
            "interview_qa": [],
            "workflow_trace": append_trace(
                state,
                node="interview_agent",
                status="failed",
                input_summary=input_summary,
                output_summary="未能生成有效面试题，请补充岗位或简历信息后重试。",
            ),
        }

    logger.info("Interview Agent generated %d QAs (standalone=%s)", len(interview_qa), standalone)

    meta = state.meta.model_copy(update={
        "dirty_flags": state.meta.dirty_flags.model_copy(update={
            "interview_dirty": False,
        })
    })

    mode_note = "（独立模式，基于岗位描述生成）" if standalone else ""
    return {
        "interview_qa": interview_qa,
        "meta": meta,
        "workflow_trace": append_trace(
            state,
            node="interview_agent",
            input_summary=input_summary,
            output_summary=f"面试问答已生成，共 {len(interview_qa)} 条{mode_note}。",
            artifacts={
                "interview_qa_count": len(interview_qa),
                "standalone_mode": standalone,
                "categories": sorted({item.category for item in interview_qa}),
            },
        ),
    }


def interview_node(state: CopilotState) -> dict[str, Any]:
    """Interview Agent 同步兼容入口。"""
    return asyncio.run(interview_node_async(state))
