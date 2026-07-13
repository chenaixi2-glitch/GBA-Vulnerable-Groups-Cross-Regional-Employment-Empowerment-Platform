"""Run cross-agent chain consistency evaluation."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from evaluation.chain_consistency.metrics import build_chain_consistency_report

_REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURES_PATH = Path(__file__).resolve().parent / "fixtures" / "golden_chains.json"
RESULTS_ROOT = _REPO_ROOT / "evaluation-results" / "chain-consistency"


def _load_cases() -> list[dict]:
    with open(FIXTURES_PATH, encoding="utf-8") as f:
        return json.load(f)


def _render_summary(report: dict) -> str:
    lines = [
        "# Cross-Agent Chain Consistency — Evaluation Report",
        "",
        f"- Generated at: {report['generated_at']}",
        f"- Cases: {report['total_cases']}",
        f"- Pass rate: {report['pass_rate']:.2%} ({report['passed_cases']}/{report['total_cases']})",
        "",
        "## Per-case results",
        "",
    ]
    for case in report["cases"]:
        status = "PASS" if case["passed"] else "FAIL"
        lines.append(f"### {case['case_id']} — {status} ({case['chain']})")
        for check in case["checks"]:
            mark = "✓" if check["passed"] else "✗"
            lines.append(f"- {mark} **{check['check_id']}**: {check['details']}")
        lines.append("")

    lines.extend([
        "## Check definitions",
        "",
        "- **profile_to_content** — name/email/phone from CandidateProfile match ResumeContent.profile.",
        "- **job_to_content** — Job.title aligns with ResumeContent.meta.target_role.",
        "- **gap_to_content** — high-severity missing_skill gaps appear in resume text.",
        "- **content_to_render** — render_agent success implies non-empty HTML (>100 chars).",
        "- **gaps_preserved** — gap list not silently cleared after gap_agent.",
        "",
    ])
    return "\n".join(lines)


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


def run_evaluation() -> dict:
    cases = _load_cases()
    report = build_chain_consistency_report(
        cases,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )
    return report.to_dict()


def main() -> int:
    parser = argparse.ArgumentParser(description="Cross-agent chain consistency evaluation")
    parser.parse_args()

    report = run_evaluation()
    out_dir = write_report(report)
    print(f"Chain consistency evaluation → {out_dir}")
    print(f"Pass rate {report['pass_rate']:.2%}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
