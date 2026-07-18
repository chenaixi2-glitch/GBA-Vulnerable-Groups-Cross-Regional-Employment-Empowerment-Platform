"""Interactive Interview Agent — 题库预生成 + 异步点评/追问 + 非阻塞答题。"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from agents.interview_agent import interview_node_async
from agents.json_contracts import (
    InteractiveBankFeedbackOutput,
    InteractiveInterviewDebriefOutput,
)
from models.llm import get_llm
from tools.output_language_guard import ainvoke_json_with_language_guard
from prompts.interactive_interview import (
    INTERACTIVE_BANK_FEEDBACK_PROMPT,
    INTERACTIVE_INTERVIEW_DEBRIEF_PROMPT,
)
from services.llm_queue import LlmTask, llm_queue_slot
from tools.interview_program import (
    InterviewProgramConfig,
    build_interview_program,
    format_program_overview,
)
from tools.output_language import (
    interview_closing_mismatch,
    interview_closing_normal,
    interview_closing_thanks,
    interview_end_reason_default,
    interview_feedback_prompt_language_kwargs,
    interview_opening_message,
    interview_phase_label,
    interview_turn_prompt_language_kwargs,
)
from services.interview_memory import (
    build_prompt_history,
    maybe_compress_interview_history_safe,
)
from tools.target_job_context import build_enriched_job_json
from workflow.state import (
    CopilotState,
    InteractiveInterviewDebrief,
    InteractiveInterviewKeyMoment,
    InteractiveInterviewSession,
    InteractiveInterviewTurn,
    InteractivePendingFeedback,
    InteractiveQuestionQueueItem,
    InterviewStageProgress,
)
from log import get_logger

logger = get_logger("agent")

_END_CHECKLIST_KEYS = (
    "dimensions_covered",
    "resume_cleared",
    "can_decide",
    "no_more_value",
    "hard_mismatch",
    "high_match",
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _turn_id() -> str:
    return f"turn_{uuid.uuid4().hex[:12]}"


def _feedback_id() -> str:
    return f"fb_{uuid.uuid4().hex[:12]}"


def _question_id() -> str:
    return f"iq_{uuid.uuid4().hex[:12]}"


def _context_json(state: CopilotState) -> tuple[str, str]:
    job_json = build_enriched_job_json(state)
    profile_json = state.candidate_profile.model_dump_json(indent=2) if state.candidate_profile else "{}"
    return job_json, profile_json


def _prerequisites_ok(state: CopilotState) -> bool:
    return state.candidate_profile is not None


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


def _format_qa_history(
    session: InteractiveInterviewSession,
    *,
    for_debrief: bool = False,
    anchor_category: str = "",
    anchor_stage_index: int | None = None,
) -> str:
    """组装注入 LLM 的问答历史（类别加权窗口 + 摘要），完整 turns 仍保留在 session。"""
    return build_prompt_history(
        session,
        for_debrief=for_debrief,
        anchor_category=anchor_category,
        anchor_stage_index=anchor_stage_index,
    )


def _stages_summary(session: InteractiveInterviewSession) -> str:
    lines: list[str] = []
    for i, stage in enumerate(session.stages, 1):
        lines.append(
            f"Stage {i}: {stage.name} ({stage.turn_count}/{stage.max_turns} turns, status: {stage.status})"
        )
    return "\n".join(lines) if lines else "(no stage info)"


def _find_question(
    session: InteractiveInterviewSession, question_id: str
) -> InteractiveQuestionQueueItem | None:
    for item in session.primary_questions + session.follow_up_questions:
        if item.id == question_id:
            return item
    return None


def _count_answered_primary(session: InteractiveInterviewSession) -> int:
    return sum(1 for q in session.primary_questions if q.status == "answered")


def _count_answered_follow_up(session: InteractiveInterviewSession) -> int:
    return sum(1 for q in session.follow_up_questions if q.status == "answered")


def _all_feedbacks_done(session: InteractiveInterviewSession) -> bool:
    return all(f.status in ("completed", "failed") for f in session.pending_feedbacks)


def _has_pending_feedback(session: InteractiveInterviewSession) -> bool:
    return any(f.status in ("pending", "processing") for f in session.pending_feedbacks)


def _qa_to_queue_items(interview_qa: list) -> list[InteractiveQuestionQueueItem]:
    items: list[InteractiveQuestionQueueItem] = []
    for qa in interview_qa:
        items.append(InteractiveQuestionQueueItem(
            id=qa.id or _question_id(),
            question=qa.question,
            category=qa.category or "",
            stage_id=qa.stage_id or "",
            stage_name=qa.stage_name or "",
            stage_index=qa.stage_index or 0,
            source="bank",
            status="pending",
        ))
    return items


def _make_interviewer_turn(
    content: str,
    turn_type: str,
    session: InteractiveInterviewSession,
    category: str = "",
    question_id: str = "",
) -> InteractiveInterviewTurn:
    stage_name = ""
    stage_index = 0
    if question_id:
        q = _find_question(session, question_id)
        if q:
            stage_name = q.stage_name
            stage_index = q.stage_index
    return InteractiveInterviewTurn(
        id=_turn_id(),
        role="interviewer",
        content=content,
        turn_type=turn_type,
        category=category,
        round=session.round_count,
        stage_index=stage_index,
        stage_name=stage_name,
        question_id=question_id,
        created_at=_now_iso(),
    )


def _update_stage_progress(session: InteractiveInterviewSession, question: InteractiveQuestionQueueItem) -> None:
    if not session.stages:
        return
    idx = min(max(question.stage_index, 0), len(session.stages) - 1)
    session.current_stage_index = idx
    for i, stage in enumerate(session.stages):
        if i < idx:
            stage.status = "completed"
        elif i == idx:
            stage.status = "active"
            stage.turn_count += 1
        else:
            if stage.status == "active":
                stage.status = "completed"


def _next_pending_question(
    session: InteractiveInterviewSession, source: str
) -> InteractiveQuestionQueueItem | None:
    pool = session.primary_questions if source == "bank" else session.follow_up_questions
    return next((q for q in pool if q.status == "pending"), None)


def _present_question(
    session: InteractiveInterviewSession, question: InteractiveQuestionQueueItem
) -> None:
    question.status = "current"
    session.current_question_id = question.id
    session.turns.append(_make_interviewer_turn(
        question.question,
        "follow_up" if question.source == "follow_up" else "question",
        session,
        question.category,
        question.id,
    ))


def _complete_session(session: InteractiveInterviewSession, closing_message: str, end_reason: str = "") -> None:
    session.phase = "completed"
    session.status = "completed"
    session.ended_at = _now_iso()
    session.end_reason = end_reason
    session.closing_message = closing_message
    session.current_question_id = ""
    if closing_message:
        session.turns.append(_make_interviewer_turn(closing_message, "end", session))
    for stage in session.stages:
        if stage.status in ("pending", "active"):
            stage.status = "completed"


def _try_enter_follow_up_phase(state: CopilotState, session: InteractiveInterviewSession) -> bool:
    """预设题答完后，若异步点评均已返回，则进入追问阶段或收尾。"""
    if session.phase != "follow_up_wait":
        return False
    if not _all_feedbacks_done(session):
        return False

    if not session.allow_follow_ups:
        closing = interview_closing_normal(state)
        _complete_session(session, closing, session.end_reason or interview_end_reason_default(state))
        return True

    if session.end_reason or any(f.should_end for f in session.pending_feedbacks if f.status == "completed"):
        for fb in session.pending_feedbacks:
            if fb.should_end and fb.closing_message:
                _complete_session(session, fb.closing_message, fb.end_reason)
                return True
        if session.closing_message:
            _complete_session(session, session.closing_message, session.end_reason)
            return True

    next_fu = _next_pending_question(session, "follow_up")
    if next_fu:
        session.phase = "follow_up"
        _present_question(session, next_fu)
        return True

    closing = interview_closing_normal(state)
    session.phase = "candidate_qa"
    session.closing_message = closing
    session.turns.append(_make_interviewer_turn(closing, "end", session))
    session.status = "completed"
    session.ended_at = _now_iso()
    session.current_question_id = ""
    return True


def _try_advance_after_follow_up_answer(state: CopilotState, session: InteractiveInterviewSession) -> None:
    if session.phase != "follow_up":
        return
    if _has_pending_feedback(session):
        return

    if session.end_reason or any(f.should_end for f in session.pending_feedbacks if f.status == "completed"):
        for fb in reversed(session.pending_feedbacks):
            if fb.should_end and fb.closing_message:
                _complete_session(session, fb.closing_message, fb.end_reason)
                return

    next_fu = _next_pending_question(session, "follow_up")
    if next_fu:
        _present_question(session, next_fu)
        return

    closing = session.closing_message or interview_closing_thanks(state)
    _complete_session(session, closing, session.end_reason)


def _build_interview_message(
    job_title: str,
    industry: str,
    tone: str,
    program_version: str,
    specialized_focus: str,
) -> str:
    return " ".join(filter(None, [
        "Please generate interview questions based on my candidate profile and optional job description.",
        f"Target role: {job_title}.",
        f"Industry: {industry}." if industry else "",
        f"Interview tone: {tone}.",
        f"Program version: {program_version}.",
        f"Specialized focus: {specialized_focus}." if specialized_focus else "",
    ]))


async def start_interactive_interview(
    state: CopilotState,
    tone: str = "professional",
    job_title: str = "",
    industry: str = "",
    max_rounds: int | None = None,
    program_version: str = "quick",
    specialized_focus: str = "",
) -> InteractiveInterviewSession:
    """预生成面试题库并展示第一题。（个人端模拟面试专用，始终为 practice）"""
    if not _prerequisites_ok(state):
        raise ValueError("INTERVIEW_ERR_NO_PREREQUISITES")

    title = job_title or (state.job.title if state.job else "")
    jd_text = (state.meta.target_jd_text or "") if state.meta else ""

    program = build_interview_program(
        version=program_version,
        specialized_focus=specialized_focus,
        job_title=title,
        jd_text=jd_text,
    )

    prev_message = state.user_message
    state.user_message = _build_interview_message(
        title, industry or (state.job.industry if state.job else ""),
        tone, program_version, specialized_focus,
    )
    try:
        result = await interview_node_async(state)
    finally:
        state.user_message = prev_message

    interview_qa = result.get("interview_qa") or []
    if not interview_qa:
        raise ValueError("INTERVIEW_ERR_NO_BANK")

    primary = _qa_to_queue_items(interview_qa)
    stages = _stages_from_program(program)
    if stages:
        stages[0].status = "active"

    session = InteractiveInterviewSession(
        status="active",
        tone=tone,
        interview_mode="practice",
        job_title=title,
        industry=industry,
        program_version=program.version,
        specialized_focus=program.specialized_focus,
        job_track=program.job_track,
        current_stage_index=0,
        stages=stages,
        max_rounds=max_rounds if max_rounds else program.max_rounds,
        round_count=0,
        started_at=_now_iso(),
        phase="primary",
        primary_questions=primary,
    )

    opening = interview_opening_message(state, len(primary))
    session.turns.append(_make_interviewer_turn(opening, "opening", session))

    first = _next_pending_question(session, "bank")
    if first:
        session.round_count = 1
        _update_stage_progress(session, first)
        _present_question(session, first)

    if result.get("interview_qa"):
        state.interview_qa = result["interview_qa"]

    logger.info(
        "Interactive interview started (bank mode): session=%s, questions=%d",
        state.session_id, len(primary),
    )
    return session


async def submit_interactive_answer(
    state: CopilotState,
    answer: str,
) -> InteractiveInterviewSession:
    """记录回答、排队异步点评，并立即推进下一道预设/追问题（不等待 LLM）。"""
    session = state.interactive_interview
    if session.status != "active":
        raise ValueError("INTERVIEW_ERR_NOT_ACTIVE")

    answer = answer.strip()
    if not answer:
        raise ValueError("INTERVIEW_ERR_EMPTY_ANSWER")

    current_q = _find_question(session, session.current_question_id)
    if not current_q:
        raise ValueError("INTERVIEW_ERR_NO_CURRENT_QUESTION")

    answer_turn_id = _turn_id()
    session.turns.append(InteractiveInterviewTurn(
        id=answer_turn_id,
        role="candidate",
        content=answer,
        turn_type="answer",
        category=current_q.category,
        round=session.round_count,
        stage_index=current_q.stage_index,
        stage_name=current_q.stage_name,
        question_id=current_q.id,
        created_at=_now_iso(),
    ))
    current_q.status = "answered"

    session.pending_feedbacks.append(InteractivePendingFeedback(
        id=_feedback_id(),
        question_id=current_q.id,
        question=current_q.question,
        answer=answer,
        category=current_q.category,
        status="pending",
        created_at=_now_iso(),
    ))

    session.current_question_id = ""

    if session.phase == "primary":
        next_q = _next_pending_question(session, "bank")
        if next_q:
            session.round_count += 1
            _update_stage_progress(session, next_q)
            _present_question(session, next_q)
        else:
            session.phase = "follow_up_wait"
    elif session.phase == "follow_up":
        session.round_count += 1
        _try_advance_after_follow_up_answer(state, session)

    logger.info(
        "Answer submitted (non-blocking): session=%s, phase=%s, pending_fb=%d",
        state.session_id, session.phase, len(session.pending_feedbacks),
    )
    return session


async def process_next_pending_feedback(state: CopilotState) -> bool:
    """处理一条待生成点评（供 poll 端点调用）。返回是否处理了任务。"""
    session = state.interactive_interview
    if session.status != "active" and session.phase not in ("follow_up_wait", "follow_up"):
        return False

    pending = next((f for f in session.pending_feedbacks if f.status == "pending"), None)
    if not pending:
        _try_enter_follow_up_phase(state, session)
        _try_advance_after_follow_up_answer(state, session)
        return False

    pending.status = "processing"
    pending_q = _find_question(session, pending.question_id)
    anchor_category = pending.category or (pending_q.category if pending_q else "")
    anchor_stage_index = pending_q.stage_index if pending_q else None
    await maybe_compress_interview_history_safe(
        session,
        anchor_category=anchor_category,
        anchor_stage_index=anchor_stage_index,
    )
    program = _program_from_state(state, session)
    job_json, profile_json = _context_json(state)
    phase_label = interview_phase_label(state, session.phase)

    q_lang_kwargs = interview_turn_prompt_language_kwargs(state)
    prompt = INTERACTIVE_BANK_FEEDBACK_PROMPT.format(
        program_overview=format_program_overview(program),
        tone=session.tone,
        job_title=session.job_title,
        phase_label=phase_label,
        answered_count=_count_answered_primary(session) + _count_answered_follow_up(session),
        primary_total=len(session.primary_questions),
        follow_up_total=len(session.follow_up_questions),
        job_json=job_json,
        profile_json=profile_json,
        conversation_history=_format_qa_history(
            session,
            anchor_category=anchor_category,
            anchor_stage_index=anchor_stage_index,
        ),
        current_question=pending.question,
        current_category=pending.category,
        latest_answer=pending.answer,
        **q_lang_kwargs,
    )

    slot_key = f"{state.session_id}:fb:{pending.id}"
    try:
        async with llm_queue_slot(slot_key, LlmTask.INTERVIEW_FEEDBACK):
            llm = get_llm()
            parsed = await ainvoke_json_with_language_guard(
                llm,
                prompt,
                InteractiveBankFeedbackOutput,
                logger,
                "Interactive Bank Feedback",
                q_lang_kwargs["feedback_output_language"],
                field_languages={
                    "follow_up_questions": q_lang_kwargs["question_output_language"],
                    "brief_feedback": q_lang_kwargs["feedback_output_language"],
                    "closing_message": q_lang_kwargs["feedback_output_language"],
                    "end_reason": q_lang_kwargs["feedback_output_language"],
                },
            )
    except Exception as exc:
        logger.error("Pending feedback failed: %s", exc, exc_info=True)
        pending.status = "failed"
        pending.completed_at = _now_iso()
        return True

    pending.brief_feedback = parsed.brief_feedback.strip()
    pending.should_end = parsed.should_end
    pending.end_reason = parsed.end_reason.strip()
    pending.closing_message = parsed.closing_message.strip()
    pending.status = "completed"
    pending.completed_at = _now_iso()

    if pending.brief_feedback:
        session.turns.append(InteractiveInterviewTurn(
            id=_turn_id(),
            role="interviewer",
            content=pending.brief_feedback,
            turn_type="brief_feedback",
            category=pending.category,
            round=session.round_count,
            question_id=pending.question_id,
            created_at=_now_iso(),
        ))

    for i, fq in enumerate(parsed.follow_up_questions):
        if not session.allow_follow_ups:
            break
        fq_text = (fq or "").strip()
        if not fq_text:
            continue
        cat = ""
        if i < len(parsed.follow_up_categories):
            cat = (parsed.follow_up_categories[i] or "").strip()
        session.follow_up_questions.append(InteractiveQuestionQueueItem(
            id=_question_id(),
            question=fq_text,
            category=cat or pending.category or "Follow-up",
            stage_id=current_q.stage_id if (current_q := _find_question(session, pending.question_id)) else "",
            stage_name=current_q.stage_name if current_q else "",
            stage_index=current_q.stage_index if current_q else 0,
            source="follow_up",
            parent_answer_id=pending.id,
            status="pending",
        ))
        pending.follow_up_questions.append(session.follow_up_questions[-1])

    checklist_true = sum(1 for k in _END_CHECKLIST_KEYS if getattr(parsed, k, False))
    if parsed.should_end or checklist_true >= 3:
        pending.should_end = True
        if not pending.end_reason:
            pending.end_reason = interview_end_reason_default(state)
        if not pending.closing_message:
            if parsed.hard_mismatch:
                pending.closing_message = interview_closing_mismatch(state)
            else:
                pending.closing_message = interview_closing_normal(state)
        session.end_reason = pending.end_reason

    session.poll_sequence += 1

    if pending.should_end and parsed.hard_mismatch and session.phase == "primary":
        _complete_session(session, pending.closing_message, pending.end_reason)
    else:
        _try_enter_follow_up_phase(state, session)
        _try_advance_after_follow_up_answer(state, session)

    logger.info(
        "Feedback completed: session=%s, fb=%s, follow_ups=%d, should_end=%s",
        state.session_id, pending.id, len(pending.follow_up_questions), pending.should_end,
    )
    return True


async def process_interactive_turn(
    state: CopilotState,
    answer: str,
) -> InteractiveInterviewSession:
    """兼容旧 API：非阻塞提交回答。"""
    return await submit_interactive_answer(state, answer)


def collect_poll_updates(
    session: InteractiveInterviewSession,
    since_sequence: int = 0,
) -> dict[str, Any]:
    """收集自上次 poll 以来的新点评与状态变化。"""
    new_feedbacks = [
        {
            "id": fb.id,
            "question_id": fb.question_id,
            "question": fb.question,
            "brief_feedback": fb.brief_feedback,
            "follow_up_count": len(fb.follow_up_questions),
            "should_end": fb.should_end,
            "end_reason": fb.end_reason,
            "status": fb.status,
            "completed_at": fb.completed_at,
        }
        for fb in session.pending_feedbacks
        if fb.status == "completed" and fb.brief_feedback
    ]

    current_q = _find_question(session, session.current_question_id) if session.current_question_id else None

    return {
        "poll_sequence": session.poll_sequence,
        "has_updates": session.poll_sequence > since_sequence,
        "phase": session.phase,
        "status": session.status,
        "new_feedbacks": new_feedbacks,
        "pending_feedback_count": sum(1 for f in session.pending_feedbacks if f.status in ("pending", "processing")),
        "follow_up_queued": len([q for q in session.follow_up_questions if q.status == "pending"]),
        "current_question": {
            "id": current_q.id,
            "question": current_q.question,
            "category": current_q.category,
            "source": current_q.source,
        } if current_q else None,
        "waiting_for_follow_ups": session.phase == "follow_up_wait",
        "end_reason": session.end_reason,
        "closing_message": session.closing_message,
        "progress": {
            "primary_answered": _count_answered_primary(session),
            "primary_total": len(session.primary_questions),
            "follow_up_answered": _count_answered_follow_up(session),
            "follow_up_total": len(session.follow_up_questions),
            "round_count": session.round_count,
        },
    }


async def generate_interactive_debrief(state: CopilotState) -> InteractiveInterviewSession:
    """生成模拟面试复盘报告。"""
    session = state.interactive_interview
    if not session.turns:
        raise ValueError("INTERVIEW_ERR_NO_TURNS")

    if session.status == "active":
        session.status = "completed"
        session.ended_at = _now_iso()

    await maybe_compress_interview_history_safe(session, for_debrief=True)
    program = _program_from_state(state, session)
    job_json, profile_json = _context_json(state)
    history = _format_qa_history(session, for_debrief=True)

    feedback_lang_kwargs = interview_feedback_prompt_language_kwargs(state)
    prompt = INTERACTIVE_INTERVIEW_DEBRIEF_PROMPT.format(
        job_title=session.job_title,
        tone=session.tone,
        program_overview=format_program_overview(program),
        stages_summary=_stages_summary(session),
        round_count=session.round_count,
        job_json=job_json,
        profile_json=profile_json,
        conversation_history=history,
        **feedback_lang_kwargs,
    )

    llm = get_llm()
    parsed = await ainvoke_json_with_language_guard(
        llm,
        prompt,
        InteractiveInterviewDebriefOutput,
        logger,
        "Interactive Interview Debrief",
        feedback_lang_kwargs["output_language"],
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
        "quick": "Quick (~30 min)",
        "full": "Full (~60 min)",
        "specialized": "Specialized",
    }.get(session.program_version, session.program_version)

    current_q = _find_question(session, session.current_question_id) if session.current_question_id else None
    data["current_question"] = current_q.model_dump() if current_q else None
    data["poll_updates"] = collect_poll_updates(session)

    if session.turns:
        last = session.turns[-1]
        data["latest_interviewer_message"] = last.content if last.role == "interviewer" else ""
        data["latest_brief_feedback"] = (
            last.content if last.role == "interviewer" and last.turn_type == "brief_feedback" else ""
        )
    return data
