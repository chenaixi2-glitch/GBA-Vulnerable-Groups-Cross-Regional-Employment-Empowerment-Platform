"""Tests for incremental resume polish after gap clarifications."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from agents.content_agent import (
    _incremental_polish_from_existing_async,
    _resume_content_to_generation_output,
)
from agents.json_contracts import ResumeClarificationPatchOutput, ResumeSectionItemOutput
from tools.resume_clarification_targets import (
    collect_affected_from_answers,
    prune_resume_to_profile_facts,
    resolve_affected_targets,
)
from workflow.state import (
    CandidateProfile,
    CopilotState,
    Fact,
    ProfileBasic,
    ResumeContent,
    ResumeContentMeta,
    ResumeProfile,
    SectionItem,
)


def _resume_with_items() -> ResumeContent:
    return ResumeContent(
        profile=ResumeProfile(name="Alex"),
        summary="Backend engineer",
        skills=[SectionItem(id="skill_1", title="Python", content="FastAPI")],
        internships=[
            SectionItem(id="fact_internship_1", title="Intern", content="Old text", source_refs=["fact_internship_1"]),
            SectionItem(id="fact_internship_2", title="Other", content="Keep me", source_refs=["fact_internship_2"]),
        ],
        projects=[
            SectionItem(id="fact_project_1", title="RAG", content="Old project", source_refs=["fact_project_1"]),
        ],
        meta=ResumeContentMeta(language="en", version=3),
    )


def _profile() -> CandidateProfile:
    return CandidateProfile(
        profile_basic=ProfileBasic(name="Alex"),
        facts=[
            Fact(
                id="fact_internship_1",
                type="internship",
                content='{"title":"Intern","metrics":"30% faster"}',
                source_refs=["user_clarification"],
            ),
            Fact(id="fact_internship_2", type="internship", content='{"title":"Other"}'),
            Fact(
                id="fact_project_1",
                type="project",
                content='{"title":"RAG","tech":["Python"]}',
                source_refs=["user_clarification"],
            ),
            Fact(
                id="fact_skill_1",
                type="skill",
                content='{"title":"Docker"}',
                source_refs=["user_clarification"],
            ),
        ],
    )


def test_collect_affected_from_answers():
    fact_ids, sections = collect_affected_from_answers(
        [
            {
                "question": "Quantify?",
                "answer": "30% faster",
                "target_field": "internships",
                "related_fact_ids": ["fact_internship_1"],
            }
        ],
        [{"fact_id": "fact_project_old", "agreed": True, "section_type": "project"}],
    )
    assert fact_ids == {"fact_internship_1", "fact_project_old"}
    assert "internships" in sections
    assert "projects" in sections


def test_prune_resume_drops_removed_facts():
    profile = _profile()
    profile.facts = [f for f in profile.facts if f.id != "fact_project_1"]
    state = CopilotState(session_id="s", candidate_profile=profile)
    pruned = prune_resume_to_profile_facts(_resume_with_items(), state)
    assert [i.id for i in pruned.projects] == []
    assert len(pruned.internships) == 2


def test_resolve_affected_defaults_to_clarified_facts():
    state = CopilotState(
        session_id="s",
        candidate_profile=_profile(),
        resume_content_json=_resume_with_items(),
    )
    fact_ids, sections = resolve_affected_targets(state)
    assert "fact_internship_1" in fact_ids
    assert "fact_project_1" in fact_ids
    assert "internships" in sections
    assert "projects" in sections
    assert "skills" in sections


def test_incremental_polish_only_touches_affected_modules():
    state = CopilotState(
        session_id="s",
        candidate_profile=_profile(),
        resume_content_json=_resume_with_items(),
    )
    polished_internship = ResumeSectionItemOutput(
        id="fact_internship_1",
        title="Intern",
        content="Improved throughput by 30%",
        source_refs=["fact_internship_1"],
    )
    mock_llm = MagicMock()

    async def fake_polish(*_args, **kwargs):
        facts = kwargs.get("facts") or []
        assert all(f.id == "fact_internship_1" for f in facts)
        return [polished_internship]

    soft_patch = ResumeClarificationPatchOutput(update_summary=False, update_skills=False)

    with patch("agents.content_agent._polish_module_section_async", new_callable=AsyncMock) as mock_section:
        mock_section.side_effect = fake_polish
        with patch("agents.content_agent.ainvoke_json_with_language_guard", new_callable=AsyncMock) as mock_guard:
            mock_guard.return_value = soft_patch
            parsed = asyncio.run(
                _incremental_polish_from_existing_async(
                    state,
                    mock_llm,
                    guard_lang="en",
                    edit_instruction="QUANTIFICATION_MODE=none",
                    affected_fact_ids={"fact_internship_1"},
                    affected_sections={"internships"},
                    clarifications="Q: metrics?\nA: 30% faster",
                )
            )

    internship = next(i for i in parsed.internships if i.id == "fact_internship_1")
    kept = next(i for i in parsed.internships if i.id == "fact_internship_2")
    assert "30%" in internship.content
    assert kept.content == "Keep me"
    project = next(i for i in parsed.projects if i.id == "fact_project_1")
    assert project.content == "Old project"
    # Soft patch should not be required when skills not in target sections
    mock_guard.assert_not_awaited()


def test_resume_content_roundtrip_preserves_items():
    resume = _resume_with_items()
    parsed = _resume_content_to_generation_output(resume)
    assert parsed.summary == "Backend engineer"
    assert len(parsed.internships) == 2
    assert parsed.internships[0].id == "fact_internship_1"
