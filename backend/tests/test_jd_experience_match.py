"""Tests for JD–experience semantic matching."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

from services.jd_experience_match import (
    build_jd_match_text,
    compute_jd_experience_matches,
    extract_fact_title,
    _relevance_label,
)
from workflow.state import CopilotState, CandidateProfile, Fact, Job, Meta, ProfileBasic


def test_extract_fact_title_from_json_content():
    fact = Fact(
        id="f1",
        type="project",
        content='{"title":"RAG chatbot","company":"TechCo"}',
    )
    assert extract_fact_title(fact) == "RAG chatbot"


def test_build_jd_match_text_includes_skills_and_jd_body():
    state = CopilotState(
        session_id="sess_test",
        job=Job(title="Backend Engineer", hard_skills=["Python"], keywords=["FastAPI"]),
        meta=Meta(target_jd_text="Build scalable APIs"),
    )
    text = build_jd_match_text(state)
    assert "Backend Engineer" in text
    assert "Python" in text
    assert "Build scalable APIs" in text


def test_relevance_label_thresholds():
    assert _relevance_label(0.8) == "high"
    assert _relevance_label(0.6) == "medium"
    assert _relevance_label(0.4) == "low"
    assert _relevance_label(0.2) == "very_low"


@patch("services.jd_experience_match.aembed_documents", new_callable=AsyncMock)
@patch("services.jd_experience_match.aembed_query", new_callable=AsyncMock)
def test_compute_jd_experience_matches(mock_query, mock_docs):
    mock_query.return_value = [1.0, 0.0]
    mock_docs.return_value = [[1.0, 0.0], [0.0, 1.0]]

    state = CopilotState(
        session_id="sess_test",
        job=Job(title="Python Engineer", hard_skills=["Python"]),
        meta=Meta(target_jd_text="Python backend role"),
        candidate_profile=CandidateProfile(
            profile_basic=ProfileBasic(name="Alex"),
            facts=[
                Fact(id="f1", type="project", content='{"title":"Py API","tech_stack":["Python"]}'),
                Fact(id="f2", type="project", content='{"title":"Photo blog","tech_stack":["WordPress"]}'),
            ],
        ),
    )

    matches = __import__("asyncio").run(compute_jd_experience_matches(state))
    assert len(matches) == 2
    assert matches[0]["jd_match_score"] >= matches[1]["jd_match_score"]
    assert matches[0]["fact_id"] == "f1"
