"""RAG metrics tests for resume optimization golden cases."""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path

import pytest

from evaluation.resume_rag.metrics import compare_before_after, evaluate_resume_case

FIXTURES_PATH = (
    Path(__file__).resolve().parents[1]
    / "evaluation"
    / "resume_rag"
    / "fixtures"
    / "golden_cases.json"
)


def _load_cases() -> list[dict]:
    with open(FIXTURES_PATH, encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture
def golden_cases() -> list[dict]:
    return _load_cases()


class TestResumeRagGoldenCases:
    def test_fixture_has_cases(self, golden_cases):
        assert len(golden_cases) >= 2

    @pytest.mark.parametrize("case", _load_cases(), ids=lambda c: c["id"])
    def test_optimized_resume_improves_rag_metrics(self, case):
        async def _run():
            before = await evaluate_resume_case(case, variant="before", use_embeddings=False)
            after = await evaluate_resume_case(case, variant="after", use_embeddings=False)
            return compare_before_after(before, after)

        comparison = asyncio.run(_run())

        expect = case.get("expect") or {}
        min_jd_delta = expect.get("min_jd_keyword_coverage_delta", 0.1)
        min_match_delta = expect.get("min_match_score_delta", 1)
        max_ground_drop = expect.get("max_groundedness_drop", 0.1)

        assert comparison.jd_keyword_coverage_delta >= min_jd_delta, (
            f"{case['id']}: JD coverage delta {comparison.jd_keyword_coverage_delta} < {min_jd_delta}"
        )
        assert comparison.match_score_delta >= min_match_delta, (
            f"{case['id']}: match score delta {comparison.match_score_delta} < {min_match_delta}"
        )
        assert comparison.profile_groundedness_delta >= -max_ground_drop, (
            f"{case['id']}: groundedness dropped {comparison.profile_groundedness_delta}"
        )
        assert comparison.improved, (
            f"{case['id']}: not marked improved — {comparison.regression_flags}"
        )

    def test_after_has_higher_jd_coverage_than_before(self, golden_cases):
        async def _run():
            for case in golden_cases:
                before = await evaluate_resume_case(case, variant="before", use_embeddings=False)
                after = await evaluate_resume_case(case, variant="after", use_embeddings=False)
                assert after.jd_keyword_coverage >= before.jd_keyword_coverage

        asyncio.run(_run())


class TestResumeRagEmbeddingMetrics:
    @pytest.mark.skipif(
        not os.environ.get("DASHSCOPE_API_KEY"),
        reason="DASHSCOPE_API_KEY not set — skip embedding RAG checks",
    )
    def test_embedding_jd_similarity_increases_after_optimization(self, golden_cases):
        async def _run():
            for case in golden_cases:
                before = await evaluate_resume_case(case, variant="before", use_embeddings=True)
                after = await evaluate_resume_case(case, variant="after", use_embeddings=True)
                assert before.jd_embedding_similarity is not None
                assert after.jd_embedding_similarity is not None
                assert after.jd_embedding_similarity >= before.jd_embedding_similarity - 0.05

        asyncio.run(_run())
