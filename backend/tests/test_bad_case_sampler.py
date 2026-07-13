"""Tests for bad-case sampling."""

from __future__ import annotations

import json
from pathlib import Path

from evaluation.monitoring.bad_case_sampler import analyze_sessions, load_session_fixtures

FIXTURES = Path(__file__).resolve().parents[1] / "evaluation" / "monitoring" / "fixtures" / "sample_sessions.json"


def test_flags_failed_and_mismatch_sessions():
    sessions = load_session_fixtures(FIXTURES)
    report = analyze_sessions(sessions)
    assert report.flagged_count >= 3
    reasons = set(report.by_reason.keys())
    assert "failed_agent_node" in reasons
    assert "routing_mismatch" in reasons


def test_happy_session_not_flagged_as_failed():
    sessions = load_session_fixtures(FIXTURES)
    report = analyze_sessions(sessions)
    failed_ids = {c.case_id for c in report.cases if c.reason.startswith("failed_agent")}
    assert "sess_ok_01_failed_node" not in failed_ids
