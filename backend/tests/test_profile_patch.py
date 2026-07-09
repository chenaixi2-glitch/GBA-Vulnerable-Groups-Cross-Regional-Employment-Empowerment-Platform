"""Tests for incremental profile patch after gap-analysis clarifications."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from agents.json_contracts import ProfileFactOutput, ProfilePatchOutput
from agents.profile_agent import profile_node_async
from workflow.state import CandidateProfile, CopilotState, Fact, ProfileBasic


def _sample_profile() -> CandidateProfile:
    return CandidateProfile(
        profile_basic=ProfileBasic(name="Alex"),
        facts=[
            Fact(id="fact_internship_1", type="internship", content='{"title":"Intern"}'),
            Fact(id="fact_project_1", type="project", content='{"title":"RAG app"}'),
        ],
    )


def test_profile_patch_removes_facts_without_llm():
    state = CopilotState(
        session_id="sess_patch",
        forced_intent="profile_patch",
        candidate_profile=_sample_profile(),
        user_message=(
            "CONFIRMED_REMOVALS (remove these from profile facts — do not include in resume):\n"
            "- id=rem_1|fact_id=fact_project_1|title=RAG app|reason=low relevance"
        ),
    )

    result = asyncio.run(profile_node_async(state))
    profile = result["candidate_profile"]
    fact_ids = {fact.id for fact in profile.facts}
    assert fact_ids == {"fact_internship_1"}


def test_profile_patch_merges_clarifications():
    state = CopilotState(
        session_id="sess_patch",
        forced_intent="profile_patch",
        candidate_profile=_sample_profile(),
        user_message=(
            "CLARIFICATIONS (add or update profile facts from my answers):\n"
            "Q: What stack did you use?\nA: Python and FastAPI"
        ),
    )

    patch_output = ProfilePatchOutput(
        facts=[
            ProfileFactOutput(
                id="fact_project_1",
                type="project",
                content='{"title":"RAG app","tech_stack":["Python","FastAPI"]}',
                source_refs=["user_clarification"],
            )
        ]
    )

    with patch("agents.profile_agent.get_llm") as mock_get_llm:
        mock_llm = MagicMock()
        mock_get_llm.return_value = mock_llm
        with patch("agents.profile_agent.ainvoke_json_with_schema", new_callable=AsyncMock) as mock_invoke:
            mock_invoke.return_value = patch_output
            result = asyncio.run(profile_node_async(state))

    project = next(f for f in result["candidate_profile"].facts if f.id == "fact_project_1")
    assert "FastAPI" in project.content
    mock_invoke.assert_awaited_once()
