"""Run RAG-style resume optimization evaluation and write reports to evaluation-results/resume-rag/."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from evaluation.resume_rag.metrics import compare_before_after, evaluate_resume_case

_REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURES_PATH = Path(__file__).resolve().parent / "fixtures" / "golden_cases.json"
RESULTS_ROOT = _REPO_ROOT / "evaluation-results" / "resume-rag"


def _load_cases() -> list[dict]:
    with open(FIXTURES_PATH, encoding="utf-8") as f:
        return json.load(f)


def _has_embedding_key() -> bool:
    keys = ("DASHSCOPE_API_KEY", "OPENAI_API_KEY", "AZURE_OPENAI_API_KEY")
    return any(os.environ.get(k) for k in keys)


def _render_summary(report: dict) -> str:
    lines = [
        "# Resume Optimization — RAG Metrics Report",
        "",
        f"- Generated at: {report['generated_at']}",
        f"- Embedding metrics: {'enabled' if report['embedding_enabled'] else 'lexical only'}",
        f"- Cases: {report['summary']['total_cases']}",
        f"- Improved: {report['summary']['improved_cases']} / {report['summary']['total_cases']}",
        "",
        "## Aggregate deltas (after − before)",
        "",
        f"| Metric | Mean Δ |",
        f"|--------|--------|",
        f"| JD keyword coverage | {report['summary']['avg_jd_keyword_coverage_delta']:+.2%} |",
        f"| Profile groundedness | {report['summary']['avg_profile_groundedness_delta']:+.4f} |",
        f"| Match score | {report['summary']['avg_match_score_delta']:+.1f} |",
        f"| Checklist pass rate | {report['summary']['avg_checklist_pass_rate_delta']:+.2%} |",
        "",
        "## Per-case results",
        "",
    ]
    for case in report["cases"]:
        status = "IMPROVED" if case["improved"] else "NOT IMPROVED"
        lines.append(f"### {case['case_id']} — {status}")
        lines.append("")
        b = case["before"]
        a = case["after"]
        d = case["deltas"]
        lines.append("| Metric | Before | After | Δ |")
        lines.append("|--------|--------|-------|---|")
        lines.append(
            f"| JD keyword coverage | {b['jd_keyword_coverage']:.2%} | {a['jd_keyword_coverage']:.2%} | {d['jd_keyword_coverage']:+.2%} |"
        )
        lines.append(
            f"| Profile groundedness | {b['profile_groundedness']:.4f} | {a['profile_groundedness']:.4f} | {d['profile_groundedness']:+.4f} |"
        )
        lines.append(
            f"| Match score | {b['match_score']} | {a['match_score']} | {d['match_score']:+d} |"
        )
        lines.append(
            f"| Checklist pass rate | {b['checklist_pass_rate']:.2%} | {a['checklist_pass_rate']:.2%} | {d['checklist_pass_rate']:+.2%} |"
        )
        if a.get("jd_embedding_similarity") is not None:
            lines.append(
                f"| JD embedding similarity | {b.get('jd_embedding_similarity', '—')} | {a['jd_embedding_similarity']} | — |"
            )
        if case.get("improvement_reasons"):
            lines.append("")
            lines.append("**Improvements:** " + "; ".join(case["improvement_reasons"]))
        if case.get("regression_flags"):
            lines.append("")
            lines.append("**Regressions:** " + "; ".join(case["regression_flags"]))
        lines.append("")

    lines.extend([
        "## Metric definitions",
        "",
        "- **JD keyword coverage** — fraction of target JD keywords found in resume text (RAG relevance proxy).",
        "- **Profile groundedness** — mean lexical/embedding overlap of resume bullets with candidate profile facts (RAG faithfulness).",
        "- **Unsupported bullets** — bullets with low profile overlap (possible hallucination).",
        "- **Match score** — Python port of `server/src/services/match.service.js` (0–100).",
        "- **Checklist pass rate** — pass rate from `resume_language_checklist` rules.",
        "",
    ])
    return "\n".join(lines)


async def run_evaluation(*, use_embeddings: bool | None = None) -> dict:
    embedding_on = _has_embedding_key() if use_embeddings is None else use_embeddings
    cases = _load_cases()
    comparisons = []

    for case in cases:
        before = await evaluate_resume_case(case, variant="before", use_embeddings=embedding_on)
        after = await evaluate_resume_case(case, variant="after", use_embeddings=embedding_on)
        comparisons.append(compare_before_after(before, after))

    improved = sum(1 for c in comparisons if c.improved)
    n = len(comparisons) or 1

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "embedding_enabled": embedding_on,
        "fixtures_path": str(FIXTURES_PATH.relative_to(_REPO_ROOT)).replace("\\", "/"),
        "summary": {
            "total_cases": len(comparisons),
            "improved_cases": improved,
            "improvement_rate": round(improved / n, 4),
            "avg_jd_keyword_coverage_delta": round(
                sum(c.jd_keyword_coverage_delta for c in comparisons) / n, 4
            ),
            "avg_profile_groundedness_delta": round(
                sum(c.profile_groundedness_delta for c in comparisons) / n, 4
            ),
            "avg_match_score_delta": round(sum(c.match_score_delta for c in comparisons) / n, 2),
            "avg_checklist_pass_rate_delta": round(
                sum(c.checklist_pass_rate_delta for c in comparisons) / n, 4
            ),
        },
        "cases": [c.to_dict() for c in comparisons],
    }
    return report


def write_report(report: dict, *, run_id: str | None = None) -> Path:
    run_id = run_id or datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir = RESULTS_ROOT / "runs" / run_id
    latest_dir = RESULTS_ROOT / "latest"
    run_dir.mkdir(parents=True, exist_ok=True)
    latest_dir.mkdir(parents=True, exist_ok=True)

    json_path = run_dir / "report.json"
    md_path = run_dir / "summary.md"
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    md_path.write_text(_render_summary(report), encoding="utf-8")

    (latest_dir / "report.json").write_text(json_path.read_text(encoding="utf-8"), encoding="utf-8")
    (latest_dir / "summary.md").write_text(md_path.read_text(encoding="utf-8"), encoding="utf-8")

    return run_dir


def main() -> int:
    parser = argparse.ArgumentParser(description="Resume optimization RAG metrics evaluation")
    parser.add_argument(
        "--embeddings",
        action="store_true",
        help="Enable embedding-based JD similarity and groundedness (requires API key)",
    )
    parser.add_argument(
        "--no-embeddings",
        action="store_true",
        help="Force lexical-only metrics",
    )
    args = parser.parse_args()

    use_emb: bool | None = None
    if args.embeddings:
        use_emb = True
    elif args.no_embeddings:
        use_emb = False

    report = asyncio.run(run_evaluation(use_embeddings=use_emb))
    out_dir = write_report(report)
    print(f"RAG evaluation complete → {out_dir}")
    print(f"Latest copy       → {RESULTS_ROOT / 'latest'}")
    print(
        f"Improved {report['summary']['improved_cases']}/{report['summary']['total_cases']} cases "
        f"(avg match Δ {report['summary']['avg_match_score_delta']:+.1f})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
