"""Tests for staged interview question bank generation logic."""

from agents.interview_agent import (
    _assign_stages_from_program,
    _ensure_fixed_self_intro,
    _parse_program_from_message,
)
from tools.interview_program import build_interview_program
from workflow.state import InterviewQA


def test_parse_program_from_message():
    msg = "Please generate. Program version: full. Specialized focus: technical."
    version, focus = _parse_program_from_message(msg)
    assert version == "full"
    assert focus == "technical"


def test_assign_stages_from_program_sequential():
    program = build_interview_program(version="quick", job_title="Java开发")
    qas = [
        InterviewQA(id=f"q{i}", category="c", question=f"Q{i}", answer=f"A{i}")
        for i in range(program.max_rounds)
    ]
    staged = _assign_stages_from_program(qas, program)
    assert len(staged) == program.max_rounds
    assert staged[0].stage_id == program.stages[0].stage_id
    assert staged[0].stage_index == 0
    assert staged[5].stage_id == program.stages[1].stage_id
    assert staged[5].stage_index == 1


def test_ensure_fixed_self_intro_with_program():
    program = build_interview_program(version="full", job_title="产品经理")
    qas = [
        InterviewQA(id="q1", category="x", question="自我介绍", answer="intro", stage_index=0),
        InterviewQA(id="q2", category="y", question="其他", answer="a", stage_index=0),
    ]
    result = _ensure_fixed_self_intro(qas, program)
    assert result[0].id == "qa_self_intro"
    assert result[0].question == "自我介绍"
    assert result[0].stage_id == program.stages[0].stage_id
    assert len(result) == 2
