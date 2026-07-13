"""Evaluate Planner intent classification and downstream agent routing."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

from agents.planner import _build_execution_plan, resolve_intent
from evaluation.shared.classification_metrics import ClassificationReport, compute_classification_report
from workflow.state import CopilotState


@dataclass
class RoutingCaseResult:
    case_id: str
    user_message: str
    expected_intent: str
    predicted_intent: str
    expected_plan: list[str]
    predicted_plan: list[str]
    intent_correct: bool
    plan_correct: bool
    mode: str
    notes: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class PlannerRoutingReport:
    generated_at: str
    mode: str
    total_cases: int
    intent_accuracy: float
    plan_accuracy: float
    intent_report: ClassificationReport
    plan_report: ClassificationReport
    cases: list[RoutingCaseResult] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "generated_at": self.generated_at,
            "mode": self.mode,
            "total_cases": self.total_cases,
            "intent_accuracy": self.intent_accuracy,
            "plan_accuracy": self.plan_accuracy,
            "intent_report": self.intent_report.to_dict(),
            "plan_report": self.plan_report.to_dict(),
            "cases": [c.to_dict() for c in self.cases],
        }


def _state_from_case(case: dict[str, Any]) -> CopilotState:
    state_data = dict(case.get("state") or {})
    state_data.setdefault("session_id", case.get("id", "eval"))
    return CopilotState.model_validate(state_data)


def evaluate_routing_case(case: dict[str, Any]) -> RoutingCaseResult:
    """Evaluate one golden case using rule layer (resolve_intent + plan builder)."""
    state = _state_from_case(case)
    raw_intent = (case.get("raw_llm_intent") or case.get("expected_intent") or "ask_question").strip()
    predicted_intent = resolve_intent(raw_intent, case.get("user_message", ""), state)

    context_scope = (state.context_scope or "").strip().lower()
    if context_scope == "resume_edit" and not state.forced_intent:
        from agents.planner import _clamp_intent_to_scope

        predicted_intent = _clamp_intent_to_scope(predicted_intent, context_scope)

    predicted_plan = _build_execution_plan(predicted_intent, state)
    expected_intent = case["expected_intent"]
    expected_plan = list(case.get("expected_execution_plan") or [])

    return RoutingCaseResult(
        case_id=case["id"],
        user_message=case.get("user_message", ""),
        expected_intent=expected_intent,
        predicted_intent=predicted_intent,
        expected_plan=expected_plan,
        predicted_plan=predicted_plan,
        intent_correct=predicted_intent == expected_intent,
        plan_correct=predicted_plan == expected_plan,
        mode=case.get("mode", "rule_only"),
        notes=case.get("notes", ""),
    )


def build_planner_routing_report(
    cases: list[dict[str, Any]],
    *,
    generated_at: str,
    mode: str = "rule_only",
) -> PlannerRoutingReport:
    """Run all cases and compute intent/plan metrics."""
    results = [evaluate_routing_case(case) for case in cases]
    y_true_intent = [r.expected_intent for r in results]
    y_pred_intent = [r.predicted_intent for r in results]
    y_true_plan = [" -> ".join(r.expected_plan) or "(empty)" for r in results]
    y_pred_plan = [" -> ".join(r.predicted_plan) or "(empty)" for r in results]

    misclassified = [
        {
            "case_id": r.case_id,
            "expected_intent": r.expected_intent,
            "predicted_intent": r.predicted_intent,
            "expected_plan": r.expected_plan,
            "predicted_plan": r.predicted_plan,
            "user_message": r.user_message[:120],
        }
        for r in results
        if not r.intent_correct or not r.plan_correct
    ]

    intent_report = compute_classification_report(y_true_intent, y_pred_intent, misclassified_details=misclassified)
    plan_report = compute_classification_report(y_true_plan, y_pred_plan)

    n = len(results) or 1
    return PlannerRoutingReport(
        generated_at=generated_at,
        mode=mode,
        total_cases=len(results),
        intent_accuracy=round(sum(1 for r in results if r.intent_correct) / n, 4),
        plan_accuracy=round(sum(1 for r in results if r.plan_correct) / n, 4),
        intent_report=intent_report,
        plan_report=plan_report,
        cases=results,
    )
