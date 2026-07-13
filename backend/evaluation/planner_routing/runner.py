"""Run Planner routing golden-set evaluation and write reports."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from evaluation.planner_routing.metrics import build_planner_routing_report
from evaluation.shared.classification_metrics import ClassificationReport, format_confusion_matrix_markdown

_REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURES_PATH = Path(__file__).resolve().parent / "fixtures" / "golden_cases.json"
RESULTS_ROOT = _REPO_ROOT / "evaluation-results" / "planner-routing"


def _load_cases() -> list[dict]:
    with open(FIXTURES_PATH, encoding="utf-8") as f:
        return json.load(f)


def _render_summary(report_dict: dict) -> str:
    intent = report_dict["intent_report"]
    plan = report_dict["plan_report"]
    lines = [
        "# Planner Intent & Agent Routing — Evaluation Report",
        "",
        f"- Generated at: {report_dict['generated_at']}",
        f"- Mode: {report_dict['mode']}",
        f"- Cases: {report_dict['total_cases']}",
        f"- Intent accuracy: {report_dict['intent_accuracy']:.2%}",
        f"- Agent chain accuracy: {report_dict['plan_accuracy']:.2%}",
        "",
        "## Intent classification metrics",
        "",
        f"| Metric | Value |",
        f"|--------|-------|",
        f"| Accuracy | {intent['accuracy']:.2%} |",
        f"| Macro F1 | {intent['macro_f1']:.4f} |",
        f"| Weighted F1 | {intent['weighted_f1']:.4f} |",
        f"| Macro Precision | {intent['macro_precision']:.4f} |",
        f"| Macro Recall | {intent['macro_recall']:.4f} |",
        "",
        "### Intent confusion matrix",
        "",
    ]
    intent_report = ClassificationReport(
        labels=intent["labels"],
        total=intent["total"],
        correct=intent["correct"],
        accuracy=intent["accuracy"],
        macro_precision=intent["macro_precision"],
        macro_recall=intent["macro_recall"],
        macro_f1=intent["macro_f1"],
        weighted_f1=intent["weighted_f1"],
        per_label=intent["per_label"],
        confusion_matrix=intent["confusion_matrix"],
        misclassified=intent.get("misclassified", []),
    )
    lines.append(format_confusion_matrix_markdown(intent_report))

    lines.extend([
        "",
        "## Agent chain (Tool-equivalent) metrics",
        "",
        f"| Metric | Value |",
        f"|--------|-------|",
        f"| Chain accuracy | {plan['accuracy']:.2%} |",
        f"| Macro F1 | {plan['macro_f1']:.4f} |",
        "",
        "### Per-intent F1",
        "",
        "| Intent | Precision | Recall | F1 | Support |",
        "|--------|-----------|--------|-----|---------|",
    ])
    for label, stats in sorted(intent["per_label"].items()):
        lines.append(
            f"| {label} | {stats['precision']:.2f} | {stats['recall']:.2f} | {stats['f1']:.2f} | {stats['support']} |"
        )

    lines.extend(["", "## Misclassified cases", ""])
    misclassified = [c for c in report_dict["cases"] if not c["intent_correct"] or not c["plan_correct"]]
    if not misclassified:
        lines.append("_All cases passed._")
    else:
        for case in misclassified:
            lines.append(f"### {case['case_id']}")
            lines.append(f"- Message: {case['user_message'][:100]}")
            lines.append(f"- Expected intent/plan: `{case['expected_intent']}` → `{case['expected_plan']}`")
            lines.append(f"- Predicted intent/plan: `{case['predicted_intent']}` → `{case['predicted_plan']}`")
            lines.append("")

    lines.extend([
        "",
        "## Metric definitions",
        "",
        "- **Intent accuracy** — fraction of cases where `resolve_intent()` matches golden label.",
        "- **Agent chain accuracy** — fraction where `execution_plan` matches expected downstream nodes (Tool-equivalent).",
        "- **Macro F1** — unweighted mean of per-intent F1 scores.",
        "- Rule-only mode evaluates deterministic routing layer; LLM misclassification requires separate E2E runs with API key.",
        "",
    ])
    return "\n".join(lines)


def write_report(report_dict: dict, *, run_id: str | None = None) -> Path:
    run_id = run_id or datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir = RESULTS_ROOT / "runs" / run_id
    latest_dir = RESULTS_ROOT / "latest"
    run_dir.mkdir(parents=True, exist_ok=True)
    latest_dir.mkdir(parents=True, exist_ok=True)

    json_path = run_dir / "report.json"
    md_path = run_dir / "summary.md"
    json_path.write_text(json.dumps(report_dict, ensure_ascii=False, indent=2), encoding="utf-8")
    md_path.write_text(_render_summary(report_dict), encoding="utf-8")

    (latest_dir / "report.json").write_text(json_path.read_text(encoding="utf-8"), encoding="utf-8")
    (latest_dir / "summary.md").write_text(md_path.read_text(encoding="utf-8"), encoding="utf-8")
    return run_dir


def run_evaluation(*, mode: str = "rule_only") -> dict:
    cases = _load_cases()
    report = build_planner_routing_report(
        cases,
        generated_at=datetime.now(timezone.utc).isoformat(),
        mode=mode,
    )
    return report.to_dict()


def main() -> int:
    parser = argparse.ArgumentParser(description="Planner intent & agent routing evaluation")
    parser.add_argument("--mode", default="rule_only", choices=["rule_only"], help="Evaluation mode")
    args = parser.parse_args()

    report = run_evaluation(mode=args.mode)
    out_dir = write_report(report)
    print(f"Planner routing evaluation → {out_dir}")
    print(
        f"Intent {report['intent_accuracy']:.2%} | Chain {report['plan_accuracy']:.2%} | "
        f"Macro F1 {report['intent_report']['macro_f1']:.4f}"
    )
    return 0 if report["intent_accuracy"] == 1.0 and report["plan_accuracy"] == 1.0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
