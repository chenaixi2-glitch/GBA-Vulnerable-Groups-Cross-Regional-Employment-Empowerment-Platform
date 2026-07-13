"""Optional LangSmith run export for bad-case mining (requires LANGCHAIN_API_KEY)."""

from __future__ import annotations

import argparse
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from evaluation.monitoring.bad_case_sampler import BadCase, analyze_session, export_review_csv
from workflow.state import CopilotState

_REPO_ROOT = Path(__file__).resolve().parents[3]
RESULTS_ROOT = _REPO_ROOT / "evaluation-results" / "monitoring"


def _fetch_langsmith_runs(*, project: str, limit: int, hours: int) -> list[dict]:
    """Fetch recent LangSmith runs and map to session-like entries."""
    try:
        from langsmith import Client
    except ImportError as exc:
        raise RuntimeError("langsmith package required: pip install langsmith") from exc

    api_key = os.environ.get("LANGCHAIN_API_KEY")
    if not api_key:
        raise RuntimeError("LANGCHAIN_API_KEY not set")

    client = Client(api_key=api_key)
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    runs = list(client.list_runs(
        project_name=project,
        start_time=since,
        execution_order=1,
        limit=limit,
        error=True,
    ))

    sessions: list[dict] = []
    for run in runs:
        outputs = run.outputs or {}
        state_data = outputs if isinstance(outputs, dict) and "session_id" in outputs else {}
        if not state_data:
            continue
        state_data.setdefault("workflow_trace", [])
        if run.error:
            state_data.setdefault("reply_message", "")
            trace = state_data.get("workflow_trace") or []
            trace.append({
                "node": run.name or "unknown",
                "status": "failed",
                "output_summary": str(run.error)[:200],
            })
            state_data["workflow_trace"] = trace
        sessions.append({"state": state_data, "langsmith_run_id": str(run.id)})
    return sessions


def run_export(*, project: str, limit: int, hours: int) -> Path:
    from evaluation.monitoring.bad_case_sampler import BadCaseReport, analyze_sessions

    sessions = _fetch_langsmith_runs(project=project, limit=limit, hours=hours)
    report = analyze_sessions(sessions)
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_dir = RESULTS_ROOT / "runs" / run_id
    out_dir.mkdir(parents=True, exist_ok=True)

    csv_path = out_dir / "bad_cases_review.csv"
    export_review_csv(report, csv_path)

    latest = RESULTS_ROOT / "latest"
    latest.mkdir(parents=True, exist_ok=True)
    (latest / "bad_cases_review.csv").write_text(csv_path.read_text(encoding="utf-8"), encoding="utf-8")

    import json
    (out_dir / "report.json").write_text(json.dumps(report.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
    return out_dir


def main() -> int:
    parser = argparse.ArgumentParser(description="Export LangSmith error runs for human review")
    parser.add_argument("--project", default="ai-career-copilot", help="LangSmith project name")
    parser.add_argument("--limit", type=int, default=50, help="Max runs to fetch")
    parser.add_argument("--hours", type=int, default=168, help="Look back N hours")
    args = parser.parse_args()

    try:
        out_dir = run_export(project=args.project, limit=args.limit, hours=args.hours)
    except RuntimeError as exc:
        print(f"Skipped: {exc}")
        return 0

    print(f"LangSmith bad-case export → {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
