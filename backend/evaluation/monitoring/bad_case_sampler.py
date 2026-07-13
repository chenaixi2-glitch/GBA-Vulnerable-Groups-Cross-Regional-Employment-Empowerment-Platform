"""Sample bad cases from workflow traces for human review."""

from __future__ import annotations

import csv
import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from workflow.state import CopilotState, WorkflowTraceItem

DEFAULT_THRESHOLDS = {
    "min_answer_score": 60,
    "flag_failed_nodes": True,
    "flag_empty_reply": True,
    "flag_routing_mismatch": True,
}


@dataclass
class BadCase:
    case_id: str
    session_id: str
    intent: str
    execution_plan: list[str]
    reason: str
    severity: str  # high | medium | low
    reply_preview: str = ""
    failed_nodes: list[str] = field(default_factory=list)
    trace_summary: str = ""
    langsmith_run_name: str = ""
    review_status: str = "pending"  # pending | reviewed | confirmed_bug | false_positive

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class BadCaseReport:
    generated_at: str
    total_sessions: int
    flagged_count: int
    by_reason: dict[str, int]
    cases: list[BadCase] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "generated_at": self.generated_at,
            "total_sessions": self.total_sessions,
            "flagged_count": self.flagged_count,
            "by_reason": self.by_reason,
            "cases": [c.to_dict() for c in self.cases],
        }


def _trace_failed_nodes(trace: list[WorkflowTraceItem]) -> list[str]:
    return [item.node for item in trace if item.status == "failed"]


def _trace_summary(trace: list[WorkflowTraceItem]) -> str:
    parts = [f"{item.node}[{item.status}]" for item in trace[:8]]
    return " → ".join(parts)


def analyze_session(
    state: CopilotState,
    *,
    expected_plan: list[str] | None = None,
    thresholds: dict[str, Any] | None = None,
) -> list[BadCase]:
    """Return zero or more bad-case flags for a single session state."""
    thresholds = {**DEFAULT_THRESHOLDS, **(thresholds or {})}
    cases: list[BadCase] = []
    session_id = state.session_id or "unknown"
    base_id = session_id

    failed = _trace_failed_nodes(state.workflow_trace)
    if thresholds["flag_failed_nodes"] and failed:
        cases.append(BadCase(
            case_id=f"{base_id}_failed_node",
            session_id=session_id,
            intent=state.current_intent or "",
            execution_plan=list(state.execution_plan),
            reason="failed_agent_node",
            severity="high",
            reply_preview=(state.reply_message or "")[:200],
            failed_nodes=failed,
            trace_summary=_trace_summary(state.workflow_trace),
        ))

    if thresholds["flag_empty_reply"] and state.current_intent not in ("export",) and not (state.reply_message or "").strip():
        if state.execution_plan:
            cases.append(BadCase(
                case_id=f"{base_id}_empty_reply",
                session_id=session_id,
                intent=state.current_intent or "",
                execution_plan=list(state.execution_plan),
                reason="empty_assistant_reply",
                severity="medium",
                trace_summary=_trace_summary(state.workflow_trace),
            ))

    if thresholds["flag_routing_mismatch"] and expected_plan is not None:
        actual = list(state.execution_plan)
        if actual != expected_plan:
            cases.append(BadCase(
                case_id=f"{base_id}_routing_mismatch",
                session_id=session_id,
                intent=state.current_intent or "",
                execution_plan=actual,
                reason=f"routing_mismatch: expected {expected_plan}, got {actual}",
                severity="medium",
                trace_summary=_trace_summary(state.workflow_trace),
            ))

    evaluation = state.last_answer_evaluation
    min_score = int(thresholds.get("min_answer_score", 60))
    if evaluation and evaluation.score < min_score:
        cases.append(BadCase(
            case_id=f"{base_id}_low_eval_score",
            session_id=session_id,
            intent="evaluate_answer",
            execution_plan=list(state.execution_plan),
            reason=f"low_answer_score: {evaluation.score} < {min_score}",
            severity="low",
            reply_preview=(state.reply_message or "")[:200],
            trace_summary=_trace_summary(state.workflow_trace),
        ))

    return cases


def analyze_sessions(
    sessions: list[dict[str, Any]],
    *,
    thresholds: dict[str, Any] | None = None,
) -> BadCaseReport:
    """Analyze multiple session snapshots."""
    all_cases: list[BadCase] = []
    for entry in sessions:
        state = CopilotState.model_validate(entry.get("state") or entry)
        expected = entry.get("expected_execution_plan")
        all_cases.extend(analyze_session(state, expected_plan=expected, thresholds=thresholds))

    by_reason: dict[str, int] = {}
    for case in all_cases:
        key = case.reason.split(":")[0]
        by_reason[key] = by_reason.get(key, 0) + 1

    return BadCaseReport(
        generated_at=datetime.now(timezone.utc).isoformat(),
        total_sessions=len(sessions),
        flagged_count=len(all_cases),
        by_reason=by_reason,
        cases=all_cases,
    )


def export_review_csv(report: BadCaseReport, path: Path) -> None:
    """Export bad cases to CSV for human blind review."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "case_id", "session_id", "intent", "execution_plan", "reason", "severity",
        "reply_preview", "failed_nodes", "trace_summary", "review_status",
        "reviewer_notes", "root_cause", "fix_priority",
    ]
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for case in report.cases:
            row = {
                "case_id": case.case_id,
                "session_id": case.session_id,
                "intent": case.intent,
                "execution_plan": " -> ".join(case.execution_plan),
                "reason": case.reason,
                "severity": case.severity,
                "reply_preview": case.reply_preview,
                "failed_nodes": ", ".join(case.failed_nodes),
                "trace_summary": case.trace_summary,
                "review_status": case.review_status,
                "reviewer_notes": "",
                "root_cause": "",
                "fix_priority": "",
            }
            writer.writerow(row)


def load_session_fixtures(path: Path) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, list) else data.get("sessions", [])
