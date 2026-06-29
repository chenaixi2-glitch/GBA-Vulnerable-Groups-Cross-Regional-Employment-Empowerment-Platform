"""Golden-set and schema tests for answer evaluation (CI-friendly)."""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from agents.json_contracts import AnswerEvaluationOutput, LLMJudgeRubricOutput, LearningPathOutput
from tests.evaluation_utils import (
    combine_evaluation_text,
    cosine_similarity,
    keyword_coverage,
    validate_golden_case,
)

GOLDEN_PATH = Path(__file__).resolve().parent / "golden" / "answer_evaluation_golden.json"


def _load_golden_cases() -> list[dict]:
    with open(GOLDEN_PATH, encoding="utf-8") as f:
        return json.load(f)


class TestAnswerEvaluationSchema:
    def test_answer_evaluation_output_defaults(self):
        out = AnswerEvaluationOutput()
        assert out.score == 0
        assert out.strengths == []
        assert out.improvements == []
        assert out.suggestions == []
        assert isinstance(out.judge_scores, LLMJudgeRubricOutput)

    def test_learning_path_output_schema(self):
        from agents.json_contracts import LearningPathAnalysisOutput, LearningPathTimelineOutput
        analysis = LearningPathAnalysisOutput()
        assert analysis.gaps == []
        assert analysis.resources == []
        assert analysis.estimated_total_hours == 0
        timeline = LearningPathTimelineOutput()
        assert timeline.timeline == []


class TestGoldenSetKeywordValidation:
    @pytest.fixture
    def golden_cases(self):
        return _load_golden_cases()

    def test_golden_file_has_enough_cases(self, golden_cases):
        assert len(golden_cases) >= 5

    @pytest.mark.parametrize("case", _load_golden_cases(), ids=lambda c: c["id"])
    def test_reference_evaluation_passes_keyword_checks(self, case):
        evaluation = case["reference_evaluation"]
        ok, errors = validate_golden_case(evaluation, case, min_keyword_coverage=0.25)
        assert ok, f"{case['id']}: {errors}"

    def test_keyword_coverage_detects_missing_terms(self):
        text = "Good structure and clear communication"
        cov = keyword_coverage(text, ["star", "quantify", "metric"])
        assert cov < 0.34

    def test_keyword_coverage_detects_present_terms(self):
        text = "Use STAR format with a quantified metric and specific result"
        cov = keyword_coverage(text, ["star", "quantify", "metric"])
        assert cov >= 0.66


class TestGoldenSetEmbeddingValidation:
    @pytest.fixture
    def golden_cases(self):
        return _load_golden_cases()

    @pytest.mark.skipif(
        not os.environ.get("DASHSCOPE_API_KEY"),
        reason="DASHSCOPE_API_KEY not set — skip embedding similarity checks",
    )
    def test_reference_evaluations_embedding_similarity(self, golden_cases):
        import asyncio
        from models.embedding import aembed_query

        async def _run():
            for case in golden_cases:
                expected_text = combine_evaluation_text(case["reference_evaluation"])
                actual_text = " ".join([
                    case["user_answer"],
                    case.get("reference_answer", ""),
                ])
                vec_expected = await aembed_query(expected_text)
                vec_actual = await aembed_query(actual_text)
                similarity = cosine_similarity(vec_expected, vec_actual)
                assert similarity >= 0.15, (
                    f"{case['id']}: embedding similarity {similarity:.3f} unexpectedly low"
                )

        asyncio.run(_run())


class TestAnswerEvaluationAgentParsing:
    def test_evaluate_message_pattern(self):
        from agents.answer_evaluation_agent import _parse_evaluation_request

        parsed = _parse_evaluation_request(
            "Evaluate my answer to question q_abc123: I handled 80 tickets daily."
        )
        assert parsed == ("q_abc123", "I handled 80 tickets daily.")

    def test_evaluate_message_pattern_rejects_other_messages(self):
        from agents.answer_evaluation_agent import _parse_evaluation_request

        assert _parse_evaluation_request("What is my target job?") is None
