"""企业评估面试 — 独立于个人模拟面试链路。

支持题库来源：
- ai_only：仅 AI 题库 + 追问
- partial_custom：AI 题库 + 企业自拟题（去重）+ 实时追问
- full_custom：仅企业自拟题（无追问）
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any

from agents.interactive_interview_agent import (
    collect_poll_updates,
    generate_interactive_debrief,
    process_interactive_turn,
    process_next_pending_feedback,
    session_to_response,
    start_interactive_interview,
)
from agents.interview_agent import CUSTOM_STAGE_ID, CUSTOM_STAGE_NAME, parse_custom_questions
from tools.output_language import interview_opening_message
from workflow.state import (
    CopilotState,
    InteractiveInterviewSession,
    InteractiveInterviewTurn,
    InteractiveQuestionQueueItem,
    InterviewStageProgress,
)
from log import get_logger

logger = get_logger("agent")

VALID_QUESTION_MODES = ("ai_only", "partial_custom", "full_custom")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _qid() -> str:
    return f"iq_{uuid.uuid4().hex[:12]}"


def _tid() -> str:
    return f"turn_{uuid.uuid4().hex[:12]}"


def _assert_assessment(session: InteractiveInterviewSession) -> None:
    if getattr(session, "interview_mode", "practice") != "assessment":
        raise ValueError("INTERVIEW_ERR_NOT_ASSESSMENT")


def _strip_brief_feedback_turns(session: InteractiveInterviewSession) -> None:
    """评估面试：删除实时点评 turns，保留追问队列与最终 debrief。"""
    session.turns = [t for t in session.turns if t.turn_type != "brief_feedback"]


def _normalize_question_key(text: str) -> str:
    s = (text or "").lower().strip()
    s = re.sub(r"[^\w\u4e00-\u9fff]+", "", s, flags=re.UNICODE)
    return s


def _questions_similar(a: str, b: str) -> bool:
    na, nb = _normalize_question_key(a), _normalize_question_key(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    # 较长题干互相包含时视为重复（避免 AI 与企业题语义撞车）
    shorter, longer = (na, nb) if len(na) <= len(nb) else (nb, na)
    if len(shorter) >= 10 and shorter in longer:
        return True
    return False


def _employer_queue_items(questions: list[str]) -> list[InteractiveQuestionQueueItem]:
    items: list[InteractiveQuestionQueueItem] = []
    for q in questions:
        text = (q or "").strip()
        if not text:
            continue
        items.append(InteractiveQuestionQueueItem(
            id=_qid(),
            question=text,
            category="Employer question",
            stage_id=CUSTOM_STAGE_ID,
            stage_name=CUSTOM_STAGE_NAME,
            stage_index=0,
            source="employer",
            status="pending",
        ))
    return items


def merge_ai_and_employer_questions(
    ai_items: list[InteractiveQuestionQueueItem],
    employer_questions: list[str],
) -> tuple[list[InteractiveQuestionQueueItem], int]:
    """AI 题库 + 企业题库；去掉与企业题重复的 AI 题。返回 (合并列表, 去重去掉的 AI 题数)。"""
    employer_items = _employer_queue_items(employer_questions)
    if not employer_items:
        return list(ai_items), 0

    kept_ai: list[InteractiveQuestionQueueItem] = []
    dropped = 0
    for ai_q in ai_items:
        if any(_questions_similar(ai_q.question, eq.question) for eq in employer_items):
            dropped += 1
            continue
        kept_ai.append(ai_q)

    # 企业题接在 AI 题之后；企业题 stage_index 单独成段
    employer_stage_index = 1 if kept_ai else 0
    for eq in employer_items:
        eq.stage_index = employer_stage_index

    return kept_ai + employer_items, dropped


def _rebuild_opening(state: CopilotState, session: InteractiveInterviewSession) -> None:
    count = len(session.primary_questions)
    opening = interview_opening_message(state, count, interview_mode="assessment")
    for turn in session.turns:
        if turn.turn_type == "opening":
            turn.content = opening
            return
    session.turns.insert(0, InteractiveInterviewTurn(
        id=_tid(),
        role="interviewer",
        content=opening,
        turn_type="opening",
        created_at=_now_iso(),
    ))


def _start_full_custom_session(
    state: CopilotState,
    *,
    tone: str,
    job_title: str,
    industry: str,
    employer_questions: list[str],
) -> InteractiveInterviewSession:
    if state.candidate_profile is None:
        raise ValueError("INTERVIEW_ERR_NO_PREREQUISITES")
    items = _employer_queue_items(employer_questions)
    if not items:
        raise ValueError("INTERVIEW_ERR_NO_EMPLOYER_QUESTIONS")

    title = job_title or (state.job.title if state.job else "")
    session = InteractiveInterviewSession(
        status="active",
        tone=tone or "professional",
        interview_mode="assessment",
        question_source_mode="full_custom",
        allow_follow_ups=False,
        job_title=title,
        industry=industry or "",
        program_version="custom",
        job_track="general",
        current_stage_index=0,
        stages=[InterviewStageProgress(
            stage_id=CUSTOM_STAGE_ID,
            name=CUSTOM_STAGE_NAME,
            subtitle="Employer-authored questions only",
            max_turns=len(items),
            turn_count=0,
            status="active",
        )],
        max_rounds=len(items),
        round_count=0,
        started_at=_now_iso(),
        phase="primary",
        primary_questions=items,
    )

    _rebuild_opening(state, session)
    first = next((q for q in session.primary_questions if q.status == "pending"), None)
    if first:
        session.round_count = 1
        first.status = "current"
        session.current_question_id = first.id
        session.stages[0].turn_count = 1
        session.turns.append(InteractiveInterviewTurn(
            id=_tid(),
            role="interviewer",
            content=first.question,
            turn_type="question",
            category=first.category,
            round=1,
            stage_index=0,
            stage_name=first.stage_name,
            question_id=first.id,
            created_at=_now_iso(),
        ))
    return session


async def start_assessment_interview(
    state: CopilotState,
    tone: str = "professional",
    job_title: str = "",
    industry: str = "",
    max_rounds: int | None = None,
    program_version: str = "quick",
    specialized_focus: str = "",
    question_source_mode: str = "ai_only",
    custom_questions: list[str] | None = None,
) -> InteractiveInterviewSession:
    """启动企业评估面试（不修改个人模拟面 start 逻辑）。"""
    mode = (question_source_mode or "ai_only").strip().lower()
    if mode not in VALID_QUESTION_MODES:
        mode = "ai_only"

    employer_qs = parse_custom_questions(custom_questions or [])
    if mode in ("partial_custom", "full_custom") and not employer_qs:
        raise ValueError("INTERVIEW_ERR_NO_EMPLOYER_QUESTIONS")

    if mode == "full_custom":
        session = _start_full_custom_session(
            state,
            tone=tone,
            job_title=job_title,
            industry=industry,
            employer_questions=employer_qs,
        )
        logger.info(
            "Assessment interview started (full_custom): session=%s, questions=%d",
            state.session_id,
            len(session.primary_questions),
        )
        return session

    session = await start_interactive_interview(
        state,
        tone=tone,
        job_title=job_title,
        industry=industry,
        max_rounds=max_rounds,
        program_version=program_version,
        specialized_focus=specialized_focus,
    )
    session.interview_mode = "assessment"
    session.question_source_mode = mode
    session.allow_follow_ups = True

    dropped = 0
    if mode == "partial_custom":
        merged, dropped = merge_ai_and_employer_questions(session.primary_questions, employer_qs)
        session.primary_questions = merged
        # 企业题阶段追加到 stages
        if any(q.source == "employer" for q in merged):
            session.stages.append(InterviewStageProgress(
                stage_id=CUSTOM_STAGE_ID,
                name=CUSTOM_STAGE_NAME,
                subtitle="Employer-authored questions",
                max_turns=sum(1 for q in merged if q.source == "employer"),
                turn_count=0,
                status="pending",
            ))
        # 当前题若被去重删掉，重新挂第一道 pending
        current = next(
            (q for q in session.primary_questions if q.id == session.current_question_id),
            None,
        )
        if not current or current.status not in ("current", "pending"):
            # 清掉已展示的旧题 turn（保留 opening）
            session.turns = [t for t in session.turns if t.turn_type == "opening"]
            session.current_question_id = ""
            first = next((q for q in session.primary_questions if q.status == "pending"), None)
            if first:
                session.round_count = 1
                first.status = "current"
                session.current_question_id = first.id
                session.turns.append(InteractiveInterviewTurn(
                    id=_tid(),
                    role="interviewer",
                    content=first.question,
                    turn_type="question",
                    category=first.category,
                    round=1,
                    stage_index=first.stage_index,
                    stage_name=first.stage_name,
                    question_id=first.id,
                    created_at=_now_iso(),
                ))

    _rebuild_opening(state, session)

    logger.info(
        "Assessment interview started: session=%s, mode=%s, questions=%d, dropped_dupes=%d",
        state.session_id,
        mode,
        len(session.primary_questions),
        dropped,
    )
    return session


async def submit_assessment_answer(state: CopilotState, answer: str) -> InteractiveInterviewSession:
    _assert_assessment(state.interactive_interview)
    session = await process_interactive_turn(state, answer)
    _strip_brief_feedback_turns(session)
    return session


async def process_assessment_pending_feedback(state: CopilotState) -> bool:
    _assert_assessment(state.interactive_interview)
    handled = await process_next_pending_feedback(state)
    _strip_brief_feedback_turns(state.interactive_interview)
    return handled


async def generate_assessment_debrief(state: CopilotState) -> InteractiveInterviewSession:
    _assert_assessment(state.interactive_interview)
    _strip_brief_feedback_turns(state.interactive_interview)
    return await generate_interactive_debrief(state)


def assessment_session_to_response(
    session: InteractiveInterviewSession,
    *,
    since_sequence: int = 0,
) -> dict[str, Any]:
    """评估面试响应：隐藏实时点评，保留追问与最终得分。"""
    _assert_assessment(session)
    data = session_to_response(session)
    data["interview_mode"] = "assessment"
    data["question_source_mode"] = session.question_source_mode
    data["allow_follow_ups"] = session.allow_follow_ups
    data["turns"] = [
        t for t in (data.get("turns") or [])
        if t.get("turn_type") != "brief_feedback"
    ]
    data["latest_brief_feedback"] = ""

    updates = collect_poll_updates(session, since_sequence)
    updates["interview_mode"] = "assessment"
    updates["new_feedbacks"] = [
        {
            **fb,
            "brief_feedback": "",
        }
        for fb in (updates.get("new_feedbacks") or [])
    ]
    data["poll_updates"] = updates
    return data
