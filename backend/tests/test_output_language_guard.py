"""Tests for post-validation and translation repair of UI-language agent outputs."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock

from agents.json_contracts import GapAnalysisOutput, GapOutput, QuestionOutput
from tools.output_language_guard import (
    _apply_field_repairs,
    find_language_violations,
    guard_text_output,
    repair_language_violations,
    text_violates_language,
)


def test_text_violates_language_en_rejects_chinese():
    assert text_violates_language("缺少 Java 后端实习经历", "en") is True


def test_text_violates_language_en_accepts_english():
    assert text_violates_language("Missing Java backend internship experience", "en") is False


def test_text_violates_language_zh_rejects_english_prose():
    assert text_violates_language("Please describe your internship experience in detail.", "zh") is True


def test_text_violates_language_skips_short_ids():
    assert text_violates_language("gap_abc123", "en") is False


def test_find_language_violations_on_gap_output():
    parsed = GapAnalysisOutput(
        gaps=[GapOutput(description="缺少量化成果描述")],
        questions_to_ask=[QuestionOutput(question="请补充项目细节", reason="简历未体现")],
    )
    violations = find_language_violations(parsed, "en")
    paths = {item.path for item in violations}
    assert "gaps[0].description" in paths
    assert "questions_to_ask[0].question" in paths
    assert "questions_to_ask[0].reason" in paths


def test_apply_field_repairs_updates_nested_fields():
    parsed = GapAnalysisOutput(
        gaps=[GapOutput(description="old")],
        questions_to_ask=[QuestionOutput(question="old q", reason="old r")],
    )
    repaired = _apply_field_repairs(parsed, {
        "gaps[0].description": "Missing quantified results",
        "questions_to_ask[0].question": "Can you add metrics?",
    })
    assert repaired.gaps[0].description == "Missing quantified results"
    assert repaired.questions_to_ask[0].question == "Can you add metrics?"
    assert repaired.questions_to_ask[0].reason == "old r"


def test_repair_language_violations_translates_fields():
    parsed = GapAnalysisOutput(
        gaps=[GapOutput(description="缺少 Java 实习经历")],
        questions_to_ask=[],
    )
    llm = MagicMock()
    llm.ainvoke = AsyncMock(return_value=MagicMock(content="Missing Java internship experience"))

    logger = MagicMock()
    repaired = asyncio.run(repair_language_violations(
        parsed,
        find_language_violations(parsed, "en"),
        llm,
        logger,
        "Test Agent",
    ))
    assert repaired.gaps[0].description == "Missing Java internship experience"


def test_guard_text_output_repairs_free_text():
    llm = MagicMock()
    llm.ainvoke = AsyncMock(return_value=MagicMock(content="Your profile is missing internship experience."))
    logger = MagicMock()

    result = asyncio.run(guard_text_output(
        llm,
        "你的画像缺少实习经历。",
        "en",
        logger,
        "Question Agent",
    ))
    assert result == "Your profile is missing internship experience."


def test_field_language_overrides_for_follow_up_questions():
    from agents.json_contracts import InteractiveBankFeedbackOutput

    parsed = InteractiveBankFeedbackOutput(
        brief_feedback="Good answer structure.",
        follow_up_questions=["请补充你在项目中的具体职责"],
        closing_message="Thanks for sharing.",
    )
    violations = find_language_violations(
        parsed,
        "en",
        field_languages={
            "follow_up_questions": "en",
            "brief_feedback": "en",
            "closing_message": "en",
        },
    )
    paths = {item.path for item in violations}
    assert "follow_up_questions[0]" in paths
    assert "brief_feedback" not in paths
