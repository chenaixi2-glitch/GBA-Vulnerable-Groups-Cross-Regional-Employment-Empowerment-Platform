"""Aggregate human evaluation CSVs and correlate with RAG automatic metrics."""

from __future__ import annotations

import argparse
import csv
import json
import math
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[3]
_HUMAN_ROOT = _REPO_ROOT / "evaluation-results" / "resume-rag" / "human"
_DEFAULT_RAG_REPORT = _REPO_ROOT / "evaluation-results" / "resume-rag" / "latest" / "report.json"

LIKERT_DIMS = ("job_fit", "credibility", "professionalism", "highlights", "overall_recommend")

PREFERENCE_MAP = {
    "a": -2,
    "a_much": -2,
    "a much better": -2,
    "a明显更好": -2,
    "a 明显更好": -2,
    "a_slight": -1,
    "a slightly better": -1,
    "a略好": -1,
    "a 略好": -1,
    "tie": 0,
    "差不多": 0,
    "same": 0,
    "b_slight": 1,
    "b slightly better": 1,
    "b略好": 1,
    "b 略好": 1,
    "b_much": 2,
    "b much better": 2,
    "b明显更好": 2,
    "b 明显更好": 2,
    "b": 1,
}


def _normalize_key(value: str) -> str:
    return (value or "").strip().lower().replace("  ", " ")


def _read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def _parse_preferred(value: str) -> str:
    v = _normalize_key(value)
    if v in {"a", "resume a", "简历a", "简历 a"}:
        return "A"
    if v in {"b", "resume b", "简历b", "简历 b"}:
        return "B"
    if v in {"tie", "same", "差不多", "无明显差别", "无明显差异"}:
        return "tie"
    if "a" in v and "better" in v or "a" in v and "好" in v:
        return "A"
    if "b" in v and "better" in v or "b" in v and "好" in v:
        return "B"
    if v.startswith("a"):
        return "A"
    if v.startswith("b"):
        return "B"
    return "tie"


def _preference_score(preferred: str, strength: str | None = None) -> int:
    if strength:
        try:
            s = int(float(strength))
            if preferred == "A":
                return -max(1, min(2, s))
            if preferred == "B":
                return max(1, min(2, s))
            return 0
        except ValueError:
            pass
    key = _normalize_key(preferred)
    for pattern, score in PREFERENCE_MAP.items():
        if pattern in key or key == pattern:
            if preferred == "A" or key.startswith("a"):
                return -abs(score) if score != 0 else -1
            if preferred == "B" or key.startswith("b"):
                return abs(score) if score != 0 else 1
    if preferred == "A":
        return -1
    if preferred == "B":
        return 1
    return 0


def load_blinding_map(path: Path) -> dict[str, dict[str, str]]:
    rows = _read_csv(path)
    mapping: dict[str, dict[str, str]] = {}
    for row in rows:
        case_id = row.get("case_id", "").strip()
        if not case_id:
            continue
        mapping[case_id] = {
            "A": row.get("resume_a_variant", "").strip().lower(),
            "B": row.get("resume_b_variant", "").strip().lower(),
            "job_title_short": row.get("job_title_short", "").strip(),
        }
    return mapping


def variant_from_label(case_id: str, label: str, blinding: dict[str, dict[str, str]]) -> str:
    label = label.strip().upper()
    case = blinding.get(case_id, {})
    return case.get(label, "")


def optimized_wins_pairwise(
    case_id: str,
    preferred: str,
    blinding: dict[str, dict[str, str]],
) -> str:
    """Return win|loss|tie from optimized version perspective."""
    pref = _parse_preferred(preferred)
    if pref == "tie":
        return "tie"
    chosen_variant = variant_from_label(case_id, pref, blinding)
    if chosen_variant == "after":
        return "win"
    if chosen_variant == "before":
        return "loss"
    return "unknown"


def _mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _spearman(x: list[float], y: list[float]) -> float | None:
    if len(x) < 2 or len(y) < 2 or len(x) != len(y):
        return None
    n = len(x)

    def _rank(vals: list[float]) -> list[float]:
        sorted_idx = sorted(range(n), key=lambda i: vals[i])
        ranks = [0.0] * n
        i = 0
        while i < n:
            j = i
            while j + 1 < n and vals[sorted_idx[j + 1]] == vals[sorted_idx[i]]:
                j += 1
            avg_rank = (i + j) / 2 + 1
            for k in range(i, j + 1):
                ranks[sorted_idx[k]] = avg_rank
            i = j + 1
        return ranks

    rx, ry = _rank(x), _rank(y)
    d2 = sum((a - b) ** 2 for a, b in zip(rx, ry))
    denom = n * (n * n - 1)
    if denom == 0:
        return None
    return 1 - (6 * d2) / denom


def _binom_p_value(wins: int, n: int, p0: float = 0.5) -> float | None:
    """Two-sided binomial test p-value (exact, small n)."""
    if n <= 0:
        return None
    from math import comb

    def pmf(k: int) -> float:
        return comb(n, k) * (p0 ** k) * ((1 - p0) ** (n - k))

    obs = pmf(wins)
    tail = sum(pmf(k) for k in range(n + 1) if pmf(k) <= obs + 1e-15)
    return min(1.0, tail)


def aggregate_pairwise(
    rows: list[dict[str, str]],
    blinding: dict[str, dict[str, str]],
) -> dict[str, Any]:
    by_case: dict[str, list[str]] = defaultdict(list)
    details: list[dict[str, Any]] = []

    for row in rows:
        case_id = row.get("case_id", "").strip()
        preferred = row.get("preferred", "")
        if not case_id:
            continue
        outcome = optimized_wins_pairwise(case_id, preferred, blinding)
        by_case[case_id].append(outcome)
        details.append({
            "rater_id": row.get("rater_id", ""),
            "case_id": case_id,
            "preferred": _parse_preferred(preferred),
            "optimized_outcome": outcome,
            "reason": row.get("reason", ""),
        })

    wins = sum(1 for d in details if d["optimized_outcome"] == "win")
    losses = sum(1 for d in details if d["optimized_outcome"] == "loss")
    ties = sum(1 for d in details if d["optimized_outcome"] == "tie")
    decided = wins + losses
    win_rate = wins / decided if decided else 0.0

    case_summary = []
    for case_id, outcomes in sorted(by_case.items()):
        cw = outcomes.count("win")
        cl = outcomes.count("loss")
        ct = outcomes.count("tie")
        cd = cw + cl
        case_summary.append({
            "case_id": case_id,
            "wins": cw,
            "losses": cl,
            "ties": ct,
            "win_rate": round(cw / cd, 4) if cd else None,
        })

    return {
        "total_judgments": len(details),
        "wins": wins,
        "losses": losses,
        "ties": ties,
        "optimized_win_rate": round(win_rate, 4),
        "binom_p_value_two_sided": round(_binom_p_value(wins, decided) or 0.0, 4) if decided else None,
        "by_case": case_summary,
        "details": details,
    }


def aggregate_likert(
    rows: list[dict[str, str]],
    blinding: dict[str, dict[str, str]],
) -> dict[str, Any]:
    # case_id -> variant -> dim -> [scores]
    buckets: dict[str, dict[str, dict[str, list[float]]]] = defaultdict(
        lambda: defaultdict(lambda: defaultdict(list))
    )

    for row in rows:
        case_id = row.get("case_id", "").strip()
        label = (row.get("resume_label") or "").strip().upper()
        if not case_id or label not in {"A", "B"}:
            continue
        variant = variant_from_label(case_id, label, blinding)
        if variant not in {"before", "after"}:
            continue
        for dim in LIKERT_DIMS:
            raw = row.get(dim, "")
            if raw is None or str(raw).strip() == "":
                continue
            try:
                buckets[case_id][variant][dim].append(float(raw))
            except ValueError:
                continue

    per_case: list[dict[str, Any]] = []
    dim_deltas: dict[str, list[float]] = {d: [] for d in LIKERT_DIMS}

    for case_id in sorted(buckets.keys()):
        entry: dict[str, Any] = {"case_id": case_id, "before": {}, "after": {}, "delta": {}}
        for variant in ("before", "after"):
            for dim in LIKERT_DIMS:
                vals = buckets[case_id][variant][dim]
                if vals:
                    entry[variant][dim] = round(_mean(vals), 3)
        for dim in LIKERT_DIMS:
            b = entry["before"].get(dim)
            a = entry["after"].get(dim)
            if b is not None and a is not None:
                delta = round(a - b, 3)
                entry["delta"][dim] = delta
                dim_deltas[dim].append(delta)
        per_case.append(entry)

    avg_delta = {dim: round(_mean(vals), 3) for dim, vals in dim_deltas.items() if vals}

    return {
        "cases": per_case,
        "avg_delta_by_dimension": avg_delta,
        "avg_delta_overall_recommend": avg_delta.get("overall_recommend"),
    }


def correlate_with_rag(
    likert_summary: dict[str, Any],
    rag_report: dict[str, Any],
) -> dict[str, Any]:
    rag_by_case = {c["case_id"]: c for c in rag_report.get("cases", [])}
    human_deltas: list[float] = []
    match_deltas: list[float] = []
    jd_deltas: list[float] = []

    for case in likert_summary.get("cases", []):
        case_id = case["case_id"]
        hd = case.get("delta", {}).get("overall_recommend")
        rag = rag_by_case.get(case_id)
        if hd is None or not rag:
            continue
        human_deltas.append(hd)
        match_deltas.append(float(rag["deltas"]["match_score"]))
        jd_deltas.append(float(rag["deltas"]["jd_keyword_coverage"]))

    return {
        "overall_recommend_vs_match_score": _spearman(human_deltas, match_deltas),
        "overall_recommend_vs_jd_coverage": _spearman(human_deltas, jd_deltas),
        "paired_cases": len(human_deltas),
    }


def _render_markdown(report: dict[str, Any]) -> str:
    pw = report["pairwise"]
    lk = report.get("likert") or {}
    corr = report.get("rag_correlation") or {}
    lines = [
        "# Human Evaluation Summary",
        "",
        f"- Generated at: {report['generated_at']}",
        f"- Pairwise judgments: {pw['total_judgments']}",
        f"- Optimized win rate: **{pw['optimized_win_rate']:.1%}** "
        f"({pw['wins']}W / {pw['losses']}L / {pw['ties']}T)",
    ]
    if pw.get("binom_p_value_two_sided") is not None:
        lines.append(f"- Binomial p-value (vs 50%): {pw['binom_p_value_two_sided']:.4f}")
    lines.extend(["", "## Pairwise by case", "", "| case_id | wins | losses | ties | win_rate |", "|---------|------|--------|------|----------|"])
    for c in pw.get("by_case", []):
        wr = f"{c['win_rate']:.0%}" if c["win_rate"] is not None else "—"
        lines.append(f"| {c['case_id']} | {c['wins']} | {c['losses']} | {c['ties']} | {wr} |")

    if lk.get("avg_delta_by_dimension"):
        lines.extend(["", "## Likert Δ (after − before, 1–5 scale)", ""])
        for dim, val in lk["avg_delta_by_dimension"].items():
            lines.append(f"- **{dim}**: {val:+.2f}")
        lines.extend(["", "### Per case", ""])
        for case in lk.get("cases", []):
            lines.append(f"#### {case['case_id']}")
            if case.get("delta"):
                for dim, val in case["delta"].items():
                    lines.append(f"- {dim}: {val:+.2f}")
            lines.append("")

    if corr.get("paired_cases"):
        lines.extend([
            "## Correlation with RAG metrics",
            "",
            f"- overall_recommend Δ vs match_score Δ: ρ = {corr.get('overall_recommend_vs_match_score')}",
            f"- overall_recommend Δ vs jd_keyword_coverage Δ: ρ = {corr.get('overall_recommend_vs_jd_coverage')}",
            f"- Paired cases: {corr.get('paired_cases')}",
        ])

    return "\n".join(lines) + "\n"


def run_human_eval(
    *,
    pairwise_path: Path,
    likert_path: Path | None,
    blinding_path: Path,
    rag_report_path: Path,
) -> dict[str, Any]:
    blinding = load_blinding_map(blinding_path)
    pairwise_rows = _read_csv(pairwise_path)
    likert_rows = _read_csv(likert_path) if likert_path and likert_path.exists() else []

    pairwise_summary = aggregate_pairwise(pairwise_rows, blinding)
    likert_summary = aggregate_likert(likert_rows, blinding) if likert_rows else None

    rag_report: dict[str, Any] = {}
    if rag_report_path.exists():
        rag_report = json.loads(rag_report_path.read_text(encoding="utf-8"))

    correlation = {}
    if likert_summary and rag_report:
        correlation = correlate_with_rag(likert_summary, rag_report)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "inputs": {
            "pairwise_csv": str(pairwise_path.relative_to(_REPO_ROOT)).replace("\\", "/"),
            "likert_csv": str(likert_path.relative_to(_REPO_ROOT)).replace("\\", "/") if likert_path else None,
            "blinding_csv": str(blinding_path.relative_to(_REPO_ROOT)).replace("\\", "/"),
            "rag_report": str(rag_report_path.relative_to(_REPO_ROOT)).replace("\\", "/"),
        },
        "pairwise": pairwise_summary,
        "likert": likert_summary,
        "rag_correlation": correlation,
    }


def write_human_report(report: dict[str, Any], out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "summary.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (out_dir / "summary.md").write_text(_render_markdown(report), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Aggregate human resume evaluation CSVs")
    parser.add_argument(
        "--pairwise",
        type=Path,
        default=_HUMAN_ROOT / "pairwise_responses.csv",
        help="Pairwise responses CSV",
    )
    parser.add_argument(
        "--likert",
        type=Path,
        default=_HUMAN_ROOT / "likert_responses.csv",
        help="Likert dimension scores CSV",
    )
    parser.add_argument(
        "--blinding",
        type=Path,
        default=_HUMAN_ROOT / "blinding_map.csv",
        help="A/B blinding map CSV",
    )
    parser.add_argument(
        "--rag-report",
        type=Path,
        default=_DEFAULT_RAG_REPORT,
        help="RAG metrics report.json for correlation",
    )
    parser.add_argument(
        "--use-template",
        action="store_true",
        help="Use *_template.csv example data if main CSVs are missing",
    )
    args = parser.parse_args()

    pairwise = args.pairwise
    likert = args.likert
    if args.use_template or not pairwise.exists():
        template = _HUMAN_ROOT / "pairwise_responses_template.csv"
        if template.exists():
            pairwise = template
    if args.use_template or not likert.exists():
        template = _HUMAN_ROOT / "likert_responses_template.csv"
        if template.exists():
            likert = template

    if not pairwise.exists():
        print(f"Missing pairwise CSV: {pairwise}")
        return 1
    if not args.blinding.exists():
        print(f"Missing blinding map: {args.blinding}")
        return 1

    report = run_human_eval(
        pairwise_path=pairwise,
        likert_path=likert,
        blinding_path=args.blinding,
        rag_report_path=args.rag_report,
    )
    out_dir = _HUMAN_ROOT / "latest"
    write_human_report(report, out_dir)

    pw = report["pairwise"]
    print(f"Human eval summary → {out_dir}")
    print(
        f"Optimized win rate: {pw['optimized_win_rate']:.1%} "
        f"({pw['wins']}W/{pw['losses']}L/{pw['ties']}T)"
    )
    if report.get("likert", {}).get("avg_delta_overall_recommend") is not None:
        print(
            f"Avg overall_recommend Δ: "
            f"{report['likert']['avg_delta_overall_recommend']:+.2f}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
