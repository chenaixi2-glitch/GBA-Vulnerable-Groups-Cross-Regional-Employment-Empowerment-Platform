"""Interactive Interview Agent — 多轮对话式模拟面试与复盘。"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from agents.json_contracts import (
    InteractiveInterviewDebriefOutput,
    InteractiveInterviewTurnOutput,
)
from models.llm import get_llm, ainvoke_json_with_schema
from prompts.interactive_interview import (
    INTERACTIVE_INTERVIEW_DEBRIEF_PROMPT,
    INTERACTIVE_INTERVIEW_START_PROMPT,
    INTERACTIVE_INTERVIEW_TURN_PROMPT,
)
from workflow.state import (
    CopilotState,
    InteractiveInterviewDebrief,
    InteractiveInterviewKeyMoment,
    InteractiveInterviewSession,
    InteractiveInterviewTurn,
)
from log import get_logger

logger = get_logger("agent")

DEFAULT_MAX_ROUNDS = 10


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _turn_id() -> str:
    return f"turn_{uuid.uuid4().hex[:12]}"


def _format_conversation(turns: list[InteractiveInterviewTurn]) -> str:
    lines: list[str] = []
    for turn in turns:
        label = "面试官" if turn.role == "interviewer" else "候选人"
        prefix = f"[{turn.category}] " if turn.category and turn.role == "interviewer" else ""
        lines.append(f"{label}{prefix}：{turn.content}")
    return "\n".join(lines) if lines else "（尚无对话）"


def _context_json(state: CopilotState) -> tuple[str, str, str]:
    job_json = state.job.model_dump_json(indent=2) if state.job else "{}"
    resume_json = state.resume_content_json.model_dump_json(indent=2) if state.resume_content_json else "{}"
    profile_json = state.candidate_profile.model_dump_json(indent=2) if state.candidate_profile else "{}"
    return job_json, resume_json, profile_json


def _prerequisites_ok(state: CopilotState) -> bool:
    return (
        state.job is not None
        and state.candidate_profile is not None
        and state.resume_content_json is not None
    )


async def start_interactive_interview(
    state: CopilotState,
    tone: str = "professional",
    job_title: str = "",
    industry: str = "",
    max_rounds: int = DEFAULT_MAX_ROUNDS,
) -> InteractiveInterviewSession:
    """开启交互式模拟面试，生成开场与首个问题。"""
    if not _prerequisites_ok(state):
        raise ValueError("缺少岗位、候选人画像或简历内容，无法开始模拟面试")

    job_json, resume_json, profile_json = _context_json(state)
    title = job_title or (state.job.title if state.job else "")

    prompt = INTERACTIVE_INTERVIEW_START_PROMPT.format(
        tone=tone,
        job_title=title,
        industry=industry or (state.job.industry if state.job else ""),
        job_json=job_json,
        resume_json=resume_json,
        profile_json=profile_json,
    )

    llm = get_llm()
    parsed = await ainvoke_json_with_schema(
        llm, prompt, InteractiveInterviewTurnOutput, logger, "Interactive Interview Start"
    )

    opening_turn = InteractiveInterviewTurn(
        id=_turn_id(),
        role="interviewer",
        content=parsed.interviewer_message,
        turn_type="opening",
        category=parsed.category or "简历深挖与个人经历",
        round=1,
        created_at=_now_iso(),
    )

    session = InteractiveInterviewSession(
        status="active",
        tone=tone,
        job_title=title,
        industry=industry,
        max_rounds=max_rounds,
        round_count=1,
        turns=[opening_turn],
        started_at=_now_iso(),
    )
    logger.info("Interactive interview started: session=%s, tone=%s", state.session_id, tone)
    return session


async def process_interactive_turn(
    state: CopilotState,
    answer: str,
) -> InteractiveInterviewSession:
    """处理候选人回答，生成点评与追问/新题。"""
    session = state.interactive_interview
    if session.status != "active":
        raise ValueError("当前没有进行中的模拟面试")

    answer = answer.strip()
    if not answer:
        raise ValueError("请提供回答内容")

    candidate_turn = InteractiveInterviewTurn(
        id=_turn_id(),
        role="candidate",
        content=answer,
        turn_type="answer",
        round=session.round_count,
        created_at=_now_iso(),
    )
    session.turns.append(candidate_turn)

    job_json, resume_json, profile_json = _context_json(state)
    history = _format_conversation(session.turns)

    prompt = INTERACTIVE_INTERVIEW_TURN_PROMPT.format(
        tone=session.tone,
        job_title=session.job_title,
        round_count=session.round_count,
        max_rounds=session.max_rounds,
        job_json=job_json,
        resume_json=resume_json,
        profile_json=profile_json,
        conversation_history=history,
        latest_answer=answer,
    )

    llm = get_llm()
    parsed = await ainvoke_json_with_schema(
        llm, prompt, InteractiveInterviewTurnOutput, logger, "Interactive Interview Turn"
    )

    if parsed.brief_feedback:
        session.turns.append(InteractiveInterviewTurn(
            id=_turn_id(),
            role="interviewer",
            content=parsed.brief_feedback,
            turn_type="brief_feedback",
            category=parsed.category,
            round=session.round_count,
            created_at=_now_iso(),
        ))

    should_end = parsed.should_end or parsed.follow_up_type == "end"
    if session.round_count >= session.max_rounds:
        should_end = True

    if should_end:
        session.turns.append(InteractiveInterviewTurn(
            id=_turn_id(),
            role="interviewer",
            content=parsed.interviewer_message or "感谢您参加本次模拟面试，我们可以结束面试了。",
            turn_type="end",
            category=parsed.category,
            round=session.round_count,
            created_at=_now_iso(),
        ))
        session.status = "completed"
        session.ended_at = _now_iso()
    else:
        turn_type = "follow_up" if parsed.follow_up_type == "follow_up" else "question"
        session.round_count += 1
        session.turns.append(InteractiveInterviewTurn(
            id=_turn_id(),
            role="interviewer",
            content=parsed.interviewer_message,
            turn_type=turn_type,
            category=parsed.category,
            round=session.round_count,
            created_at=_now_iso(),
        ))

    logger.info(
        "Interactive interview turn processed: session=%s, round=%d, ended=%s",
        state.session_id, session.round_count, should_end,
    )
    return session


async def generate_interactive_debrief(state: CopilotState) -> InteractiveInterviewSession:
    """生成模拟面试复盘报告。"""
    session = state.interactive_interview
    if not session.turns:
        raise ValueError("没有对话记录，无法生成复盘")

    if session.status == "active":
        session.status = "completed"
        session.ended_at = _now_iso()

    job_json, resume_json, _ = _context_json(state)
    history = _format_conversation(session.turns)

    prompt = INTERACTIVE_INTERVIEW_DEBRIEF_PROMPT.format(
        job_title=session.job_title,
        tone=session.tone,
        round_count=session.round_count,
        job_json=job_json,
        resume_json=resume_json,
        conversation_history=history,
    )

    llm = get_llm()
    parsed = await ainvoke_json_with_schema(
        llm, prompt, InteractiveInterviewDebriefOutput, logger, "Interactive Interview Debrief"
    )

    key_moments = [
        InteractiveInterviewKeyMoment(
            question=m.question,
            your_answer_summary=m.your_answer_summary,
            analysis=m.analysis,
            improved_answer=m.improved_answer,
            score=m.score,
        )
        for m in parsed.key_moments
    ]

    session.debrief = InteractiveInterviewDebrief(
        overall_score=parsed.overall_score,
        summary=parsed.summary,
        strengths=list(parsed.strengths),
        weaknesses=list(parsed.weaknesses),
        key_moments=key_moments,
        recommendations=list(parsed.recommendations),
        category_scores=dict(parsed.category_scores),
        generated_at=_now_iso(),
    )

    logger.info("Interactive interview debrief generated: session=%s, score=%d", state.session_id, parsed.overall_score)
    return session


def session_to_response(session: InteractiveInterviewSession) -> dict[str, Any]:
    """序列化会话供 API 返回。"""
    data = session.model_dump()
    if session.turns:
        last = session.turns[-1]
        data["latest_interviewer_message"] = last.content if last.role == "interviewer" else ""
        data["latest_brief_feedback"] = (
            last.content if last.role == "interviewer" and last.turn_type == "brief_feedback" else ""
        )
    return data
