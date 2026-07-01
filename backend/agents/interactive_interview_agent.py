"""Interactive Interview Agent — 结构化三轮模拟面试与复盘。"""

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
    INTERACTIVE_INTERVIEW_STAGE_TRANSITION_PROMPT,
    INTERACTIVE_INTERVIEW_START_PROMPT,
    INTERACTIVE_INTERVIEW_TURN_PROMPT,
)
from tools.interview_program import (
    InterviewProgramConfig,
    InterviewStageConfig,
    build_interview_program,
    format_program_overview,
    format_stage_context,
)
from tools.target_job_context import build_enriched_job_json
from workflow.state import (
    CopilotState,
    InteractiveInterviewDebrief,
    InteractiveInterviewKeyMoment,
    InteractiveInterviewSession,
    InteractiveInterviewTurn,
    InterviewStageProgress,
)
from log import get_logger

logger = get_logger("agent")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _turn_id() -> str:
    return f"turn_{uuid.uuid4().hex[:12]}"


def _format_conversation(turns: list[InteractiveInterviewTurn]) -> str:
    lines: list[str] = []
    for turn in turns:
        label = "面试官" if turn.role == "interviewer" else "候选人"
        prefix_parts: list[str] = []
        if turn.stage_name:
            prefix_parts.append(turn.stage_name)
        if turn.category and turn.role == "interviewer":
            prefix_parts.append(turn.category)
        prefix = f"[{' · '.join(prefix_parts)}] " if prefix_parts else ""
        lines.append(f"{label}{prefix}：{turn.content}")
    return "\n".join(lines) if lines else "（尚无对话）"


def _context_json(state: CopilotState) -> tuple[str, str, str]:
    job_json = build_enriched_job_json(state)
    resume_json = state.resume_content_json.model_dump_json(indent=2) if state.resume_content_json else "{}"
    profile_json = state.candidate_profile.model_dump_json(indent=2) if state.candidate_profile else "{}"
    return job_json, resume_json, profile_json


def _has_job_context(state: CopilotState) -> bool:
    return state.job is not None or bool((state.meta.target_jd_text or "").strip())


def _prerequisites_ok(state: CopilotState) -> bool:
    return (
        _has_job_context(state)
        and state.candidate_profile is not None
        and state.resume_content_json is not None
    )


def _program_from_state(state: CopilotState, session: InteractiveInterviewSession) -> InterviewProgramConfig:
    jd_text = (state.meta.target_jd_text or "") if state.meta else ""
    return build_interview_program(
        version=session.program_version,
        specialized_focus=session.specialized_focus,
        job_title=session.job_title,
        jd_text=jd_text,
    )


def _stages_from_program(program: InterviewProgramConfig) -> list[InterviewStageProgress]:
    return [
        InterviewStageProgress(
            stage_id=stage.stage_id,
            name=stage.name,
            subtitle=stage.subtitle,
            max_turns=stage.max_turns,
            turn_count=0,
            status="pending",
        )
        for stage in program.stages
    ]


def _current_stage_config(
    program: InterviewProgramConfig, session: InteractiveInterviewSession
) -> InterviewStageConfig | None:
    idx = session.current_stage_index
    if idx < 0 or idx >= len(program.stages):
        return None
    return program.stages[idx]


def _current_stage_progress(session: InteractiveInterviewSession) -> InterviewStageProgress | None:
    idx = session.current_stage_index
    if idx < 0 or idx >= len(session.stages):
        return None
    return session.stages[idx]


def _stages_summary(session: InteractiveInterviewSession) -> str:
    lines: list[str] = []
    for i, stage in enumerate(session.stages, 1):
        lines.append(
            f"阶段{i}：{stage.name}（{stage.turn_count}/{stage.max_turns}轮，状态：{stage.status}）"
        )
    return "\n".join(lines) if lines else "（无阶段信息）"


def _make_interviewer_turn(
    content: str,
    turn_type: str,
    session: InteractiveInterviewSession,
    category: str = "",
) -> InteractiveInterviewTurn:
    stage = _current_stage_progress(session)
    return InteractiveInterviewTurn(
        id=_turn_id(),
        role="interviewer",
        content=content,
        turn_type=turn_type,
        category=category,
        round=session.round_count,
        stage_index=session.current_stage_index,
        stage_name=stage.name if stage else "",
        created_at=_now_iso(),
    )


async def _generate_stage_transition(
    state: CopilotState,
    session: InteractiveInterviewSession,
    program: InterviewProgramConfig,
    prev_stage_name: str,
) -> InteractiveInterviewTurnOutput:
    stage = _current_stage_config(program, session)
    if stage is None:
        raise ValueError("无法进入下一阶段：阶段配置缺失")

    job_json, resume_json, _ = _context_json(state)
    history = _format_conversation(session.turns)

    prompt = INTERACTIVE_INTERVIEW_STAGE_TRANSITION_PROMPT.format(
        program_overview=format_program_overview(program),
        prev_stage_name=prev_stage_name,
        stage_context=format_stage_context(stage, program.job_track),
        tone=session.tone,
        job_title=session.job_title,
        job_json=job_json,
        resume_json=resume_json,
        conversation_history=history,
    )

    llm = get_llm()
    return await ainvoke_json_with_schema(
        llm, prompt, InteractiveInterviewTurnOutput, logger, "Interactive Interview Stage Transition"
    )


async def _advance_to_next_stage(
    state: CopilotState,
    session: InteractiveInterviewSession,
    program: InterviewProgramConfig,
) -> bool:
    """进入下一阶段并生成过渡开场。返回 False 表示已是最后阶段。"""
    current = _current_stage_progress(session)
    if current:
        current.status = "completed"

    next_index = session.current_stage_index + 1
    if next_index >= len(program.stages):
        return False

    prev_name = current.name if current else "上一阶段"
    session.current_stage_index = next_index
    next_stage = _current_stage_progress(session)
    if next_stage:
        next_stage.status = "active"

    parsed = await _generate_stage_transition(state, session, program, prev_name)
    session.turns.append(_make_interviewer_turn(
        parsed.interviewer_message,
        "stage_transition",
        session,
        parsed.category or "",
    ))
    session.round_count += 1
    if next_stage:
        next_stage.turn_count = 1
    return True


async def start_interactive_interview(
    state: CopilotState,
    tone: str = "professional",
    job_title: str = "",
    industry: str = "",
    max_rounds: int | None = None,
    program_version: str = "quick",
    specialized_focus: str = "",
) -> InteractiveInterviewSession:
    """开启结构化模拟面试，生成开场与首个问题。"""
    if not _prerequisites_ok(state):
        raise ValueError("缺少岗位、候选人画像或简历内容，无法开始模拟面试")

    job_json, resume_json, profile_json = _context_json(state)
    title = job_title or (state.job.title if state.job else "")
    jd_text = (state.meta.target_jd_text or "") if state.meta else ""

    program = build_interview_program(
        version=program_version,
        specialized_focus=specialized_focus,
        job_title=title,
        jd_text=jd_text,
    )
    stage = program.stages[0]

    prompt = INTERACTIVE_INTERVIEW_START_PROMPT.format(
        program_overview=format_program_overview(program),
        stage_context=format_stage_context(stage, program.job_track),
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

    stages = _stages_from_program(program)
    stages[0].status = "active"
    stages[0].turn_count = 1

    session = InteractiveInterviewSession(
        status="active",
        tone=tone,
        job_title=title,
        industry=industry,
        program_version=program.version,
        specialized_focus=program.specialized_focus,
        job_track=program.job_track,
        current_stage_index=0,
        stages=stages,
        max_rounds=max_rounds if max_rounds else program.max_rounds,
        round_count=1,
        started_at=_now_iso(),
    )

    session.turns.append(_make_interviewer_turn(
        parsed.interviewer_message,
        "opening",
        session,
        parsed.category or "简历深挖与个人经历",
    ))

    logger.info(
        "Interactive interview started: session=%s, version=%s, track=%s, stages=%d",
        state.session_id, program.version, program.job_track, len(program.stages),
    )
    return session


async def process_interactive_turn(
    state: CopilotState,
    answer: str,
) -> InteractiveInterviewSession:
    """处理候选人回答，生成点评与追问/新题/阶段切换。"""
    session = state.interactive_interview
    if session.status != "active":
        raise ValueError("当前没有进行中的模拟面试")

    answer = answer.strip()
    if not answer:
        raise ValueError("请提供回答内容")

    program = _program_from_state(state, session)
    stage_progress = _current_stage_progress(session)
    stage_config = _current_stage_config(program, session)

    candidate_turn = InteractiveInterviewTurn(
        id=_turn_id(),
        role="candidate",
        content=answer,
        turn_type="answer",
        round=session.round_count,
        stage_index=session.current_stage_index,
        stage_name=stage_progress.name if stage_progress else "",
        created_at=_now_iso(),
    )
    session.turns.append(candidate_turn)

    job_json, resume_json, profile_json = _context_json(state)
    history = _format_conversation(session.turns)

    stage_turn_count = stage_progress.turn_count if stage_progress else session.round_count
    stage_max_turns = stage_progress.max_turns if stage_progress else session.max_rounds

    prompt = INTERACTIVE_INTERVIEW_TURN_PROMPT.format(
        program_overview=format_program_overview(program),
        stage_context=format_stage_context(stage_config, program.job_track) if stage_config else "",
        stage_turn_count=stage_turn_count,
        stage_max_turns=stage_max_turns,
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
        session.turns.append(_make_interviewer_turn(
            parsed.brief_feedback,
            "brief_feedback",
            session,
            parsed.category,
        ))

    stage_exhausted = stage_progress and stage_progress.turn_count >= stage_progress.max_turns
    should_end_program = (
        parsed.should_end
        or parsed.follow_up_type == "end"
        or session.round_count >= session.max_rounds
        or stage_exhausted
    )

    if should_end_program and session.current_stage_index < len(program.stages) - 1:
        if parsed.interviewer_message and not stage_exhausted:
            session.turns.append(_make_interviewer_turn(
                parsed.interviewer_message,
                "end",
                session,
                parsed.category,
            ))
        advanced = await _advance_to_next_stage(state, session, program)
        if advanced:
            logger.info(
                "Advanced to stage %d: session=%s",
                session.current_stage_index, state.session_id,
            )
            return session

    if should_end_program:
        session.turns.append(_make_interviewer_turn(
            parsed.interviewer_message or "感谢您参加本次模拟面试，我们可以结束面试了。",
            "end",
            session,
            parsed.category,
        ))
        if stage_progress:
            stage_progress.status = "completed"
        for s in session.stages:
            if s.status == "pending":
                s.status = "completed"
        session.status = "completed"
        session.ended_at = _now_iso()
    else:
        turn_type = "follow_up" if parsed.follow_up_type == "follow_up" else "question"
        session.round_count += 1
        if stage_progress:
            stage_progress.turn_count += 1
        session.turns.append(_make_interviewer_turn(
            parsed.interviewer_message,
            turn_type,
            session,
            parsed.category,
        ))

    logger.info(
        "Interactive interview turn processed: session=%s, round=%d, stage=%d, ended=%s",
        state.session_id, session.round_count, session.current_stage_index, session.status == "completed",
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

    program = _program_from_state(state, session)
    job_json, resume_json, _ = _context_json(state)
    history = _format_conversation(session.turns)

    prompt = INTERACTIVE_INTERVIEW_DEBRIEF_PROMPT.format(
        job_title=session.job_title,
        tone=session.tone,
        program_overview=format_program_overview(program),
        stages_summary=_stages_summary(session),
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
        stage_scores=dict(parsed.stage_scores),
        generated_at=_now_iso(),
    )

    logger.info("Interactive interview debrief generated: session=%s, score=%d", state.session_id, parsed.overall_score)
    return session


def session_to_response(session: InteractiveInterviewSession) -> dict[str, Any]:
    """序列化会话供 API 返回。"""
    data = session.model_dump()
    current_stage = None
    if session.stages and 0 <= session.current_stage_index < len(session.stages):
        current_stage = session.stages[session.current_stage_index]
    data["current_stage"] = current_stage.model_dump() if current_stage else None
    data["program_label"] = {
        "quick": "极速版 (~30分钟)",
        "full": "完整版 (~60分钟)",
        "specialized": "专项版",
    }.get(session.program_version, session.program_version)
    if session.turns:
        last = session.turns[-1]
        data["latest_interviewer_message"] = last.content if last.role == "interviewer" else ""
        data["latest_brief_feedback"] = (
            last.content if last.role == "interviewer" and last.turn_type == "brief_feedback" else ""
        )
    return data
