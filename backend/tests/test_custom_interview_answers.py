"""Tests for custom interview question answer generation helpers."""

from agents.interview_agent import (
    _align_custom_questions,
    _assign_custom_stage,
    parse_custom_questions,
)
from workflow.state import InterviewQA


def test_parse_custom_questions_from_text():
    raw = """
    1. 请介绍一下你自己
    Q: 你最大的优点是什么？
    2) 为什么选择这个岗位
    """
    result = parse_custom_questions(raw)
    assert result == [
        "请介绍一下你自己",
        "你最大的优点是什么？",
        "为什么选择这个岗位",
    ]


def test_parse_custom_questions_deduplicates():
    raw = "问题A\n问题A\n\n问题B"
    assert parse_custom_questions(raw) == ["问题A", "问题B"]


def test_parse_custom_questions_from_list():
    assert parse_custom_questions(["  Q1  ", "", "Q2"]) == ["Q1", "Q2"]


def test_assign_custom_stage():
    qas = [
        InterviewQA(id="q1", category="x", question="Q1", answer="A1"),
        InterviewQA(id="q2", category="y", question="Q2", answer="A2", stage_index=2),
    ]
    staged = _assign_custom_stage(qas)
    assert all(qa.stage_id == "custom" for qa in staged)
    assert all(qa.stage_name == "自定义题目" for qa in staged)
    assert all(qa.stage_index == 0 for qa in staged)


def test_align_custom_questions_preserves_user_order():
    user_questions = ["题目一", "题目二"]
    generated = [
        InterviewQA(id="g1", category="c", question="题目二", answer="A2"),
        InterviewQA(id="g2", category="c", question="题目一", answer="A1"),
    ]
    aligned = _align_custom_questions(user_questions, generated)
    assert [qa.question for qa in aligned] == user_questions
    assert aligned[0].answer == "A1"
    assert aligned[1].answer == "A2"
