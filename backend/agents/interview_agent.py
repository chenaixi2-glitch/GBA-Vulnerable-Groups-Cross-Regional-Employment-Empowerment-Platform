"""Interview Agent — 按结构化阶段生成面试问答集。"""

from __future__ import annotations

import asyncio
import re
import uuid
from typing import Any

from agents.json_contracts import InterviewGenerationOutput
from models.llm import get_llm, ainvoke_json_with_schema
from prompts.interview_custom_answer import CUSTOM_INTERVIEW_ANSWER_PROMPT
from prompts.interview_generation import (
    INTERVIEW_GENERATION_PROMPT,
    STANDALONE_INTERVIEW_GENERATION_PROMPT,
)
from tools.interview_program import (
    InterviewProgramConfig,
    build_interview_program,
    format_stages_generation_spec,
)
from tools.target_job_context import build_enriched_job_json
from workflow.state import CopilotState, InterviewQA
from workflow.trace import append_trace
from log import get_logger

logger = get_logger("agent")

FIXED_SELF_INTRO_ID = "qa_self_intro"
FIXED_SELF_INTRO_CATEGORY = "简历深挖与个人经历"
FIXED_SELF_INTRO_QUESTION = "自我介绍"
MAX_CUSTOM_QUESTIONS = 30
CUSTOM_STAGE_ID = "custom"
CUSTOM_STAGE_NAME = "自定义题目"


def _is_self_intro_question(question: str) -> bool:
    return "自我介绍" in question.strip()


def _parse_program_from_message(message: str) -> tuple[str, str]:
    """从用户消息解析面试程序版本与专项方向。"""
    version = "quick"
    focus = ""
    if match := re.search(r"Program version:\s*(quick|full|specialized)", message, re.I):
        version = match.group(1).lower()
    if match := re.search(r"Specialized focus:\s*(technical|final_negotiation|resume_deep_dive)", message, re.I):
        focus = match.group(1).lower()
    return version, focus


def _extract_job_title(state: CopilotState, message: str) -> str:
    if state.job and state.job.title:
        return state.job.title
    if match := re.search(r"Target role:\s*([^.]+)", message, re.I):
        return match.group(1).strip()
    return ""


def _ensure_fixed_self_intro(
    interview_qa: list[InterviewQA],
    program: InterviewProgramConfig | None = None,
) -> list[InterviewQA]:
    """Ensure the first QA is always the fixed self-introduction in stage 0."""
    intro_answer = ""
    intro_refs: list[str] = []
    remaining: list[InterviewQA] = []
    first_stage = program.stages[0] if program and program.stages else None

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
        stage_id=first_stage.stage_id if first_stage else "screening",
        stage_name=first_stage.name if first_stage else "初筛面试",
        stage_index=0,
    )
    return [fixed_intro, *remaining]


def _assign_stages_from_program(
    interview_qa: list[InterviewQA],
    program: InterviewProgramConfig,
) -> list[InterviewQA]:
    """按程序配置为题目补全或规范化阶段信息。"""
    if not interview_qa or not program.stages:
        return interview_qa

    if any(qa.stage_index > 0 or qa.stage_id for qa in interview_qa):
        normalized: list[InterviewQA] = []
        for qa in interview_qa:
            idx = max(0, min(qa.stage_index, len(program.stages) - 1))
            stage = program.stages[idx]
            normalized.append(qa.model_copy(update={
                "stage_id": stage.stage_id,
                "stage_name": stage.name,
                "stage_index": idx,
            }))
        return normalized

    result: list[InterviewQA] = []
    cursor = 0
    for stage_index, stage in enumerate(program.stages):
        chunk = interview_qa[cursor: cursor + stage.max_turns]
        for qa in chunk:
            result.append(qa.model_copy(update={
                "stage_id": stage.stage_id,
                "stage_name": stage.name,
                "stage_index": stage_index,
            }))
        cursor += stage.max_turns

    last = program.stages[-1]
    for qa in interview_qa[cursor:]:
        result.append(qa.model_copy(update={
            "stage_id": last.stage_id,
            "stage_name": last.name,
            "stage_index": len(program.stages) - 1,
        }))
    return result


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
            stage_id=item.stage_id,
            stage_name=item.stage_name,
            stage_index=item.stage_index,
        ))
    return interview_qa


def _has_full_context(state: CopilotState) -> bool:
    return (
        state.job is not None
        and state.candidate_profile is not None
        and state.resume_content_json is not None
    )


def parse_custom_questions(raw: str | list[str]) -> list[str]:
    """Normalize user-provided interview questions from text or list."""
    if isinstance(raw, list):
        lines = [str(item).strip() for item in raw if str(item).strip()]
    else:
        text = (raw or "").replace("\r\n", "\n").replace("\r", "\n")
        lines = []
        for line in text.split("\n"):
            cleaned = line.strip()
            if not cleaned:
                continue
            if cleaned.startswith(("Q:", "Q：", "问:", "问：", "Question:", "Question：")):
                cleaned = re.sub(r"^(Q|问|Question)[:：]\s*", "", cleaned, flags=re.I).strip()
            cleaned = re.sub(r"^\d+[.)、]\s*", "", cleaned).strip()
            if cleaned:
                lines.append(cleaned)
    seen: set[str] = set()
    unique: list[str] = []
    for q in lines:
        key = q.lower()
        if key not in seen:
            seen.add(key)
            unique.append(q)
    return unique[:MAX_CUSTOM_QUESTIONS]


def _assign_custom_stage(interview_qa: list[InterviewQA]) -> list[InterviewQA]:
    return [
        qa.model_copy(update={
            "stage_id": CUSTOM_STAGE_ID,
            "stage_name": CUSTOM_STAGE_NAME,
            "stage_index": 0,
        })
        for qa in interview_qa
    ]


def _align_custom_questions(
    user_questions: list[str],
    interview_qa: list[InterviewQA],
) -> list[InterviewQA]:
    """Ensure output order and question text match user input."""
    by_question = {item.question.strip(): item for item in interview_qa}
    aligned: list[InterviewQA] = []
    for index, question in enumerate(user_questions):
        matched = by_question.get(question)
        if matched is None:
            for key, item in by_question.items():
                if key.lower() == question.lower():
                    matched = item
                    break
        if matched is None and index < len(interview_qa):
            matched = interview_qa[index]
        if matched is None:
            matched = InterviewQA(
                id=f"qa_custom_{uuid.uuid4().hex[:12]}",
                category="用户自定义",
                question=question,
                answer="",
            )
        aligned.append(matched.model_copy(update={
            "id": matched.id or f"qa_custom_{uuid.uuid4().hex[:12]}",
            "question": question,
            "category": matched.category or "用户自定义",
        }))
    return aligned


async def custom_interview_answers_async(
    state: CopilotState,
    questions: list[str],
) -> dict[str, Any]:
    """Generate reference answers for user-provided interview questions."""
    logger.info(
        "Custom interview answers started for session %s (%d questions)",
        state.session_id,
        len(questions),
    )

    if not _has_full_context(state):
        return {
            "interview_qa": [],
            "workflow_trace": append_trace(
                state,
                node="custom_interview_agent",
                status="failed",
                input_summary=f"用户上传 {len(questions)} 道自定义面试题。",
                output_summary="请先完成候选人画像、岗位 JD 与简历内容后再生成参考答案。",
            ),
        }

    if not questions:
        return {
            "interview_qa": [],
            "workflow_trace": append_trace(
                state,
                node="custom_interview_agent",
                status="failed",
                input_summary="用户未提供有效面试题。",
                output_summary="请至少输入一道面试题。",
            ),
        }

    questions_list = "\n".join(f"{i + 1}. {q}" for i, q in enumerate(questions))
    prompt = CUSTOM_INTERVIEW_ANSWER_PROMPT.format(
        question_count=len(questions),
        questions_list=questions_list,
        job_json=build_enriched_job_json(state),
        profile_json=state.candidate_profile.model_dump_json(indent=2),
        resume_json=state.resume_content_json.model_dump_json(indent=2),
    )

    try:
        llm = get_llm()
        parsed = await ainvoke_json_with_schema(
            llm, prompt, InterviewGenerationOutput, logger, "Custom Interview Agent",
        )
    except RuntimeError as exc:
        logger.error("Custom Interview Agent failed: %s", exc)
        return {
            "interview_qa": [],
            "workflow_trace": append_trace(
                state,
                node="custom_interview_agent",
                status="failed",
                input_summary=f"用户上传 {len(questions)} 道自定义面试题。",
                output_summary="参考答案生成失败：模型输出格式异常，请重试。",
                error=str(exc),
            ),
        }

    interview_qa = _align_custom_questions(questions, _build_interview_qa(parsed))
    interview_qa = _assign_custom_stage(interview_qa)

    if not any(qa.answer.strip() for qa in interview_qa):
        return {
            "interview_qa": [],
            "workflow_trace": append_trace(
                state,
                node="custom_interview_agent",
                status="failed",
                input_summary=f"用户上传 {len(questions)} 道自定义面试题。",
                output_summary="未能生成有效参考答案，请重试。",
            ),
        }

    meta = state.meta.model_copy(update={
        "dirty_flags": state.meta.dirty_flags.model_copy(update={
            "interview_dirty": False,
        })
    })

    logger.info("Custom Interview Agent generated %d reference answers", len(interview_qa))
    return {
        "interview_qa": interview_qa,
        "meta": meta,
        "workflow_trace": append_trace(
            state,
            node="custom_interview_agent",
            input_summary=f"为用户上传的 {len(questions)} 道自定义面试题生成参考答案。",
            output_summary=f"已生成 {len(interview_qa)} 条基于画像与 JD 的参考答案。",
            artifacts={
                "interview_qa_count": len(interview_qa),
                "custom_questions": True,
                "categories": sorted({item.category for item in interview_qa}),
            },
        ),
    }


async def interview_node_async(state: CopilotState) -> dict[str, Any]:
    """Interview Agent 异步节点函数。"""
    logger.info("Interview Agent started for session %s", state.session_id)

    llm = get_llm()
    standalone = not _has_full_context(state)
    user_message = state.user_message or ""

    if standalone:
        logger.info("Interview Agent using standalone mode (partial session context)")
        prompt = STANDALONE_INTERVIEW_GENERATION_PROMPT.format(
            user_message=user_message,
            job_json=build_enriched_job_json(state),
            profile_json=state.candidate_profile.model_dump_json(indent=2) if state.candidate_profile else "{}",
            resume_json=state.resume_content_json.model_dump_json(indent=2) if state.resume_content_json else "{}",
        )
        input_summary = "基于用户消息与已有部分上下文分阶段生成面试题（独立模式）。"
        program = None
    else:
        program_version, specialized_focus = _parse_program_from_message(user_message)
        job_title = _extract_job_title(state, user_message)
        jd_text = (state.meta.target_jd_text or "") if state.meta else ""
        program = build_interview_program(
            version=program_version,
            specialized_focus=specialized_focus,
            job_title=job_title,
            jd_text=jd_text,
        )
        prompt = INTERVIEW_GENERATION_PROMPT.format(
            stages_generation_spec=format_stages_generation_spec(program),
            total_questions=program.max_rounds,
            job_json=build_enriched_job_json(state),
            profile_json=state.candidate_profile.model_dump_json(indent=2),
            resume_json=state.resume_content_json.model_dump_json(indent=2),
        )
        input_summary = (
            f"按{program.version}程序分{program.stage_count}阶段生成面试问答"
            f"（共{program.max_rounds}条，赛道={program.job_track}）。"
        )

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

    interview_qa = _build_interview_qa(parsed)
    if program:
        interview_qa = _assign_stages_from_program(interview_qa, program)
    interview_qa = _ensure_fixed_self_intro(interview_qa, program)

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

    logger.info(
        "Interview Agent generated %d QAs (standalone=%s, stages=%s)",
        len(interview_qa),
        standalone,
        sorted({item.stage_name for item in interview_qa if item.stage_name}),
    )

    meta = state.meta.model_copy(update={
        "dirty_flags": state.meta.dirty_flags.model_copy(update={
            "interview_dirty": False,
        })
    })

    mode_note = "（独立模式，基于岗位描述生成）" if standalone else ""
    stage_names = [s.name for s in program.stages] if program else []
    return {
        "interview_qa": interview_qa,
        "meta": meta,
        "workflow_trace": append_trace(
            state,
            node="interview_agent",
            input_summary=input_summary,
            output_summary=f"面试问答已按阶段生成，共 {len(interview_qa)} 条{mode_note}。",
            artifacts={
                "interview_qa_count": len(interview_qa),
                "standalone_mode": standalone,
                "categories": sorted({item.category for item in interview_qa}),
                "program_version": program.version if program else "standalone",
                "stage_names": stage_names,
                "stages": [
                    {
                        "stage_id": s.stage_id,
                        "stage_name": s.name,
                        "stage_index": i,
                        "question_count": sum(1 for q in interview_qa if q.stage_index == i),
                    }
                    for i, s in enumerate(program.stages)
                ] if program else [],
            },
        ),
    }


def interview_node(state: CopilotState) -> dict[str, Any]:
    """Interview Agent 同步兼容入口。"""
    return asyncio.run(interview_node_async(state))
