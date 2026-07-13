"""CLI for offline bad-case sampling from session fixtures."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from evaluation.monitoring.bad_case_sampler import analyze_sessions, export_review_csv, load_session_fixtures

_REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURES_PATH = Path(__file__).resolve().parent / "fixtures" / "sample_sessions.json"
RESULTS_ROOT = _REPO_ROOT / "evaluation-results" / "monitoring"


def main() -> int:
    parser = argparse.ArgumentParser(description="Sample bad cases for human review")
    parser.add_argument("--fixtures", default=str(FIXTURES_PATH), help="Session fixtures JSON")
    args = parser.parse_args()

    sessions = load_session_fixtures(Path(args.fixtures))
    report = analyze_sessions(sessions)
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_dir = RESULTS_ROOT / "runs" / run_id
    out_dir.mkdir(parents=True, exist_ok=True)

    export_review_csv(report, out_dir / "bad_cases_review.csv")
    (out_dir / "report.json").write_text(json.dumps(report.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")

    latest = RESULTS_ROOT / "latest"
    latest.mkdir(parents=True, exist_ok=True)
    (latest / "bad_cases_review.csv").write_text((out_dir / "bad_cases_review.csv").read_text(encoding="utf-8"), encoding="utf-8")
    (latest / "report.json").write_text((out_dir / "report.json").read_text(encoding="utf-8"), encoding="utf-8")

    print(f"Bad-case sampling → {out_dir}")
    print(f"Flagged {report.flagged_count}/{report.total_sessions} sessions")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
