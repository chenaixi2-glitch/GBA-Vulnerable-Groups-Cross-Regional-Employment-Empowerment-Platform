"""Tests for Planner routing golden-set evaluation."""

from __future__ import annotations

import json
from pathlib import Path

from evaluation.planner_routing.metrics import build_planner_routing_report, evaluate_routing_case

FIXTURES = Path(__file__).resolve().parents[1] / "evaluation" / "planner_routing" / "fixtures" / "golden_cases.json"


def _load_cases() -> list[dict]:
    with open(FIXTURES, encoding="utf-8") as f:
        return json.load(f)


def test_all_golden_cases_pass_rule_layer():
    cases = _load_cases()
    report = build_planner_routing_report(cases, generated_at="test", mode="rule_only")
    assert report.intent_accuracy == 1.0
    assert report.plan_accuracy == 1.0


def test_intent_confusion_matrix_diagonal_only():
    cases = _load_cases()
    report = build_planner_routing_report(cases, generated_at="test", mode="rule_only")
    matrix = report.intent_report.confusion_matrix
    for label in report.intent_report.labels:
        for other in report.intent_report.labels:
            if label == other:
                assert matrix[label][other] >= 1
            else:
                assert matrix[label].get(other, 0) == 0


def test_learning_path_override_case():
    cases = _load_cases()
    case = next(c for c in cases if c["id"] == "learning_path_override_gap")
    result = evaluate_routing_case(case)
    assert result.predicted_intent == "learning_path"
    assert result.predicted_plan == ["learning_path_agent"]
