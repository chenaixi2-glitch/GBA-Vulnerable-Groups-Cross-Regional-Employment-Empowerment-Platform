"""交互式面试题库队列逻辑单元测试（无 LLM）。"""

from __future__ import annotations

import asyncio

from workflow.state import (
    CopilotState,
    InteractiveInterviewSession,
    InteractivePendingFeedback,
    InteractiveQuestionQueueItem,
    Meta,
)
from agents.interactive_interview_agent import (
    _try_enter_follow_up_phase,
    submit_interactive_answer,
    collect_poll_updates,
    _make_interviewer_turn,
)


def _make_session_with_primary(count: int = 2) -> InteractiveInterviewSession:
    primary = [
        InteractiveQuestionQueueItem(
            id=f"q{i}",
            question=f"Question {i}",
            category="General",
            stage_index=0,
            stage_name="Stage 1",
            source="bank",
            status="pending",
        )
        for i in range(1, count + 1)
    ]
    session = InteractiveInterviewSession(
        status="active",
        phase="primary",
        primary_questions=primary,
        current_question_id=primary[0].id,
        round_count=1,
    )
    session.turns.append(_make_interviewer_turn(primary[0].question, "question", session, primary[0].category, primary[0].id))
    primary[0].status = "current"
    return session


def test_submit_answer_advances_primary_without_blocking():
    state = CopilotState(session_id="sess_test", meta=Meta())
    session = _make_session_with_primary(2)
    state.interactive_interview = session

    result = asyncio.run(submit_interactive_answer(state, "My answer to Q1"))

    assert result.primary_questions[0].status == "answered"
    assert result.pending_feedbacks[0].status == "pending"
    assert result.pending_feedbacks[0].answer == "My answer to Q1"
    assert result.current_question_id == "q2"
    assert result.phase == "primary"
    assert any(t.turn_type == "answer" for t in result.turns)


def test_last_primary_enters_follow_up_wait():
    state = CopilotState(session_id="sess_test2", meta=Meta())
    session = _make_session_with_primary(1)
    state.interactive_interview = session

    result = asyncio.run(submit_interactive_answer(state, "Only answer"))

    assert result.phase == "follow_up_wait"
    assert result.current_question_id == ""
    assert len(result.pending_feedbacks) == 1


def test_enter_follow_up_phase_after_feedbacks_complete():
    session = _make_session_with_primary(1)
    session.primary_questions[0].status = "answered"
    session.phase = "follow_up_wait"
    session.pending_feedbacks.append(InteractivePendingFeedback(
        id="fb1",
        question_id="q1",
        question="Question 1",
        answer="A1",
        status="completed",
        brief_feedback="Good answer",
        completed_at="2026-01-01T00:00:00Z",
    ))
    session.follow_up_questions.append(InteractiveQuestionQueueItem(
        id="fu1",
        question="Follow up 1",
        category="Follow-up",
        source="follow_up",
        status="pending",
    ))

    state = CopilotState(session_id="sess_fu", meta=Meta())
    entered = _try_enter_follow_up_phase(state, session)

    assert entered is True
    assert session.phase == "follow_up"
    assert session.current_question_id == "fu1"


def test_poll_updates_reports_waiting_state():
    session = _make_session_with_primary(2)
    session.phase = "follow_up_wait"
    session.current_question_id = ""

    updates = collect_poll_updates(session)

    assert updates["waiting_for_follow_ups"] is True
    assert updates["phase"] == "follow_up_wait"
