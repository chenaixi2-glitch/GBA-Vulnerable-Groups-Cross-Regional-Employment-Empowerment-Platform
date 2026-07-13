"""Tests for RAG retrieval metrics."""

from __future__ import annotations

import json
from pathlib import Path

import asyncio

from evaluation.rag_retrieval.metrics import reciprocal_rank, recall_at_k
from evaluation.rag_retrieval.runner import evaluate_case

FIXTURES = Path(__file__).resolve().parents[1] / "evaluation" / "rag_retrieval" / "fixtures" / "golden_queries.json"


def _load_cases() -> list[dict]:
    with open(FIXTURES, encoding="utf-8") as f:
        return json.load(f)


def test_recall_at_k_perfect():
    assert recall_at_k({"a", "b"}, ["a", "b", "c"], k=2) == 1.0


def test_mrr_first_rank():
    assert reciprocal_rank({"job:title"}, ["job:skills", "job:title"]) == 0.5


def test_lexical_retrieval_hits_relevant_chunks():
    cases = _load_cases()
    for case in cases:
        result = asyncio.run(evaluate_case(case, mode="lexical_fallback", k_values=[1, 5]))
        assert result.hit, f"{case['id']} missed relevant chunks: {result.retrieved_chunk_ids[:5]}"
