"""Tests for employer custom question merge / dedupe in assessment interviews."""

from agents.assessment_interview_agent import (
    merge_ai_and_employer_questions,
    _questions_similar,
)
from workflow.state import InteractiveQuestionQueueItem


def _ai(text: str) -> InteractiveQuestionQueueItem:
    return InteractiveQuestionQueueItem(
        id="ai1",
        question=text,
        category="AI",
        source="bank",
        status="pending",
    )


def test_questions_similar_exact_and_containment():
    assert _questions_similar("Tell me about yourself", "tell me about yourself!")
    assert _questions_similar("请介绍一下你自己的项目经验", "介绍一下你自己的项目经验")
    assert not _questions_similar("What is your strength?", "Where do you see yourself in 5 years?")


def test_merge_drops_ai_duplicates_keeps_employer():
    ai = [
        _ai("Tell me about yourself"),
        _ai("Describe a conflict you resolved"),
        _ai("Why do you want this role?"),
    ]
    employer = [
        "Tell me about yourself.",
        "How do you collaborate across the GBA?",
    ]
    merged, dropped = merge_ai_and_employer_questions(ai, employer)
    assert dropped == 1
    texts = [q.question for q in merged]
    assert "Describe a conflict you resolved" in texts
    assert "Why do you want this role?" in texts
    assert "How do you collaborate across the GBA?" in texts
    assert sum(1 for q in merged if "Tell me about yourself" in q.question) == 1
    assert any(q.source == "employer" for q in merged)


def test_merge_without_employer_keeps_ai():
    ai = [_ai("Q1"), _ai("Q2")]
    merged, dropped = merge_ai_and_employer_questions(ai, [])
    assert dropped == 0
    assert len(merged) == 2
