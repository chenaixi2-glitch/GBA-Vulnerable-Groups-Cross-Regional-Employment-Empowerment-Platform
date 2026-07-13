"""Tests for cross-agent chain consistency."""

from __future__ import annotations

import json
from pathlib import Path

from evaluation.chain_consistency.metrics import build_chain_consistency_report, evaluate_chain_case

FIXTURES = Path(__file__).resolve().parents[1] / "evaluation" / "chain_consistency" / "fixtures" / "golden_chains.json"


def _load_cases() -> list[dict]:
    with open(FIXTURES, encoding="utf-8") as f:
        return json.load(f)


def test_happy_path_passes():
    cases = _load_cases()
    case = next(c for c in cases if c["id"] == "gap_content_render_happy")
    result = evaluate_chain_case(case)
    assert result.passed


def test_profile_mismatch_fails():
    cases = _load_cases()
    case = next(c for c in cases if c["id"] == "profile_mismatch_fail")
    result = evaluate_chain_case(case)
    assert not result.passed


def test_expected_pass_rate():
    cases = _load_cases()
    report = build_chain_consistency_report(cases, generated_at="test")
    assert report.passed_cases == 2
    assert report.total_cases == 5
