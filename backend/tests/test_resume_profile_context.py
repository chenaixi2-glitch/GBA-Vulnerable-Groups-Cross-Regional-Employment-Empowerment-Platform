"""Tests for compact job context and relevant profile filtering."""

from workflow.state import CopilotState, CandidateProfile, Fact, Job, Meta, ProfileBasic
from tools.target_job_context import build_compact_job_dict
from tools.resume_profile_context import (
    build_relevant_profile_dict,
    collect_jd_keywords,
    score_fact_for_jd,
    should_use_modular_generation,
)


def test_build_compact_job_dict_omits_full_jd_body():
    state = CopilotState(
        session_id="sess_test",
        job=Job(
            title="AI Engineer",
            hard_skills=["Python", "LLM"],
            soft_skills=["Communication"],
            keywords=["RAG", "FastAPI"],
            tech_stack=["PyTorch"],
            source="Very long JD body " * 50,
            responsibilities=["Build AI apps", "Deploy models"],
        ),
        meta=Meta(
            target_jd_text="Full JD text " * 80,
            target_industry="Technology",
            employer_type="private",
        ),
    )
    compact = build_compact_job_dict(state)
    assert compact["title"] == "AI Engineer"
    assert "Python" in compact["hard_skills"]
    assert "RAG" in compact["keywords"]
    assert "source" not in compact
    assert "jd_text" not in compact
    assert "responsibilities" not in compact


def test_build_relevant_profile_dict_prefers_jd_related_facts():
    state = CopilotState(
        session_id="sess_test",
        job=Job(title="Python Backend Engineer", keywords=["Python", "FastAPI", "MySQL"]),
        candidate_profile=CandidateProfile(
            profile_basic=ProfileBasic(name="Alex"),
            facts=[
                Fact(id="f1", type="skill", content='{"skill":"Python"}'),
                Fact(id="f2", type="project", content='{"title":"RAG chatbot","tech_stack":["Python","FastAPI"]}'),
                Fact(id="f3", type="project", content='{"title":"Photography blog","tech_stack":["WordPress"]}'),
                Fact(id="f4", type="internship", content='{"title":"Backend intern","company":"TechCo","tech_stack":["Python"]}'),
            ],
        ),
    )
    keywords = collect_jd_keywords(state)
    assert "python" in keywords
    assert score_fact_for_jd(state.candidate_profile.facts[2], keywords) < score_fact_for_jd(
        state.candidate_profile.facts[1], keywords
    )

    relevant = build_relevant_profile_dict(state, max_facts=10, min_score=0.35)
    fact_ids = {item["id"] for item in relevant["facts"]}
    assert "f1" in fact_ids
    assert "f2" in fact_ids
    assert "f4" in fact_ids


def test_should_use_modular_generation_threshold():
    assert not should_use_modular_generation("x" * 5000)
    assert should_use_modular_generation("x" * 12000)
