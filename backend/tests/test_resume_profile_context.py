"""Tests for compact job context and profile prompt helpers."""

from workflow.state import CopilotState, CandidateProfile, Fact, Job, Material, Meta, ProfileBasic
from tools.target_job_context import build_compact_job_dict
from tools.resume_profile_context import (
    build_profile_dict,
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


def test_build_profile_dict_includes_all_facts():
    state = CopilotState(
        session_id="sess_test",
        job=Job(title="Python Backend Engineer", keywords=["Python", "FastAPI", "MySQL"]),
        candidate_profile=CandidateProfile(
            profile_basic=ProfileBasic(name="Alex"),
            materials=[Material(material_id="mat_1", type="message", content="long raw upload", uploaded_at="")],
            facts=[
                Fact(id="f1", type="skill", content='{"skill":"Python"}'),
                Fact(id="f2", type="project", content='{"title":"RAG chatbot","tech_stack":["Python","FastAPI"]}'),
                Fact(id="f3", type="project", content='{"title":"Photography blog","tech_stack":["WordPress"]}'),
                Fact(id="f4", type="internship", content='{"title":"Backend intern","company":"TechCo","tech_stack":["Python"]}'),
            ],
        ),
    )

    profile = build_profile_dict(state)
    fact_ids = {item["id"] for item in profile["facts"]}
    assert profile["profile_basic"]["name"] == "Alex"
    assert fact_ids == {"f1", "f2", "f3", "f4"}
    assert "materials" not in profile


def test_should_use_modular_generation_threshold():
    assert not should_use_modular_generation("x" * 5000)
    assert not should_use_modular_generation("x" * 12000)
    assert should_use_modular_generation("x" * 16000)
