"""Unit tests for shared gap analysis core."""

from __future__ import annotations

import pytest

from agents.gap_analysis_core import build_gaps, build_questions, has_gap_analysis_context
from agents.json_contracts import GapOutput, QuestionOutput
from workflow.state import CopilotState, CandidateProfile, Job, Meta, ProfileBasic


def test_build_gaps_and_questions():
    gaps = build_gaps([
        GapOutput(id="gap_1", description="Missing AWS", severity="high"),
    ], resolution_source="gap_analysis")
    assert len(gaps) == 1
    assert gaps[0].resolution_source == "gap_analysis"
    assert gaps[0].estimated_hours == 0

    questions = build_questions([
        QuestionOutput(id="q_1", question="Do you use Kubernetes?", priority="high"),
    ])
    assert len(questions) == 1
    assert questions[0].question.startswith("Do you")


def test_build_gaps_preserves_estimated_hours():
    class _GapWithHours:
        id = "gap_x"
        type = "missing_skill"
        severity = "medium"
        description = "Need system design"
        estimated_hours = 40
        related_section_ids = []
        resolved = False
        resolution_source = "learning_path"

    gaps = build_gaps([_GapWithHours()], resolution_source="learning_path")
    assert gaps[0].estimated_hours == 40
    assert gaps[0].resolution_source == "learning_path"


def test_has_gap_analysis_context():
    empty = CopilotState(session_id="s1")
    assert has_gap_analysis_context(empty) is False

    with_job = CopilotState(
        session_id="s2",
        job=Job(id="j1", title="Engineer"),
        candidate_profile=CandidateProfile(profile_basic=ProfileBasic(name="A")),
    )
    assert has_gap_analysis_context(with_job) is True

    with_jd_text = CopilotState(
        session_id="s3",
        meta=Meta(target_jd_text="Senior dev role"),
        candidate_profile=CandidateProfile(profile_basic=ProfileBasic(name="B")),
    )
    assert has_gap_analysis_context(with_jd_text) is True
