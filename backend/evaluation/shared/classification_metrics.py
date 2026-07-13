"""Precision / recall / F1 and confusion matrix for intent or agent routing evaluation."""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class ClassificationReport:
    """Multi-class classification summary."""

    labels: list[str]
    total: int
    correct: int
    accuracy: float
    macro_precision: float
    macro_recall: float
    macro_f1: float
    weighted_f1: float
    per_label: dict[str, dict[str, float]]
    confusion_matrix: dict[str, dict[str, int]]
    misclassified: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _safe_div(num: float, den: float) -> float:
    return num / den if den else 0.0


def compute_classification_report(
    y_true: list[str],
    y_pred: list[str],
    *,
    misclassified_details: list[dict[str, Any]] | None = None,
) -> ClassificationReport:
    """Compute accuracy, per-label P/R/F1, and confusion matrix."""
    if len(y_true) != len(y_pred):
        raise ValueError("y_true and y_pred must have the same length")

    labels = sorted(set(y_true) | set(y_pred))
    matrix: dict[str, dict[str, int]] = {label: {other: 0 for other in labels} for label in labels}
    correct = 0
    for truth, pred in zip(y_true, y_pred):
        matrix[truth][pred] = matrix[truth].get(pred, 0) + 1
        if truth == pred:
            correct += 1

    support = Counter(y_true)
    per_label: dict[str, dict[str, float]] = {}
    macro_p = macro_r = macro_f1 = 0.0
    weighted_f1_sum = 0.0

    for label in labels:
        tp = matrix[label].get(label, 0)
        fp = sum(matrix[other].get(label, 0) for other in labels if other != label)
        fn = sum(matrix[label].get(other, 0) for other in labels if other != label)
        precision = _safe_div(tp, tp + fp)
        recall = _safe_div(tp, tp + fn)
        f1 = _safe_div(2 * precision * recall, precision + recall)
        per_label[label] = {
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
            "support": support.get(label, 0),
        }
        macro_p += precision
        macro_r += recall
        macro_f1 += f1
        weighted_f1_sum += f1 * support.get(label, 0)

    n_labels = len(labels) or 1
    total = len(y_true) or 1
    return ClassificationReport(
        labels=labels,
        total=len(y_true),
        correct=correct,
        accuracy=round(correct / total, 4),
        macro_precision=round(macro_p / n_labels, 4),
        macro_recall=round(macro_r / n_labels, 4),
        macro_f1=round(macro_f1 / n_labels, 4),
        weighted_f1=round(weighted_f1_sum / total, 4),
        per_label=per_label,
        confusion_matrix=matrix,
        misclassified=misclassified_details or [],
    )


def format_confusion_matrix_markdown(report: ClassificationReport) -> str:
    """Render confusion matrix as a markdown table (rows=actual, cols=predicted)."""
    labels = report.labels
    if not labels:
        return "_Empty confusion matrix._"

    header = "| Actual \\ Predicted | " + " | ".join(labels) + " |"
    sep = "|" + "---|" * (len(labels) + 1)
    rows = [header, sep]
    for actual in labels:
        cells = [str(report.confusion_matrix.get(actual, {}).get(pred, 0)) for pred in labels]
        rows.append(f"| **{actual}** | " + " | ".join(cells) + " |")
    return "\n".join(rows)
