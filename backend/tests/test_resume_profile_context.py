"""Tests for compact job context and profile prompt helpers."""

import json

from workflow.state import CopilotState, CandidateProfile, Fact, Job, Material, Meta, ProfileBasic
from tools.target_job_context import build_compact_job_dict
from tools.resume_profile_context import (
    MODULE_FACT_BATCH_SIZE,
    batch_facts_by_size,
    build_profile_dict,
    build_skeleton_profile_dict,
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


def test_should_use_modular_generation_always():
    # Small instruct models cannot reliably emit full ResumeGenerationOutput;
    # modular generation must always be preferred.
    assert should_use_modular_generation("")
    assert should_use_modular_generation("x" * 500)
    assert should_use_modular_generation("x" * 16000)


def test_polish_batches_are_single_fact():
    # Parallel polish previously batched 2 facts and hit 4K completion caps.
    assert MODULE_FACT_BATCH_SIZE == 1
    facts = [
        Fact(id="a", type="internship", content='{"company":"A","responsibilities":"did stuff"}'),
        Fact(id="b", type="internship", content='{"company":"B","responsibilities":"more stuff"}'),
    ]
    batches = batch_facts_by_size(facts)
    assert len(batches) == 2
    assert [f.id for f in batches[0]] == ["a"]
    assert [f.id for f in batches[1]] == ["b"]


def test_skeleton_profile_omits_experience_bodies():
    state = CopilotState(
        session_id="sess_test",
        candidate_profile=CandidateProfile(
            profile_basic=ProfileBasic(name="Alex"),
            facts=[
                Fact(id="f1", type="skill", content='{"skill":"Python"}'),
                Fact(
                    id="f2",
                    type="internship",
                    content='{"title":"Intern","description":"' + ("long " * 80) + '"}',
                ),
            ],
        ),
    )
    skeleton = build_skeleton_profile_dict(state)
    assert skeleton["profile_basic"]["name"] == "Alex"
    assert len(skeleton["facts"]) == 1
    assert skeleton["facts"][0]["id"] == "f1"
    assert skeleton["experience_ids_for_later_polish"][0]["id"] == "f2"
    assert "long long" not in json.dumps(skeleton)
