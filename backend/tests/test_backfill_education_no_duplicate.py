"""Regression: backfill must not duplicate education from school + facts."""

from __future__ import annotations

from agents.content_agent import _backfill_profile_from_candidate
from agents.json_contracts import ResumeGenerationOutput, ResumeProfileOutput
from workflow.state import CandidateProfile, CopilotState, Fact, ProfileBasic


def _empty_skeleton() -> ResumeGenerationOutput:
    return ResumeGenerationOutput(
        language="en",
        profile=ResumeProfileOutput(name="Chen", education=[]),
        summary="x",
    )


def test_backfill_prefers_education_facts_over_school():
    state = CopilotState(
        session_id="s",
        candidate_profile=CandidateProfile(
            profile_basic=ProfileBasic(
                name="Chen",
                school=(
                    "The University of Hong Kong, Master of Electronic Commerce "
                    "and Internet Computing (Expected Nov. 2026)"
                ),
            ),
            facts=[
                Fact(
                    id="fact_education_1",
                    type="education",
                    content=(
                        '{"school":"The University of Hong Kong","major":"ECIC",'
                        '"degree":"Master","start_date":"Sept. 2025",'
                        '"end_date":"Expected Nov. 2026"}'
                    ),
                ),
                Fact(
                    id="fact_education_2",
                    type="education",
                    content=(
                        '{"school":"Sun Yat-sen University","major":"Economics",'
                        '"degree":"Bachelor","start_date":"Sept. 2021",'
                        '"end_date":"Jun. 2025"}'
                    ),
                ),
            ],
        ),
    )

    out = _backfill_profile_from_candidate(_empty_skeleton(), state)
    edu = out.profile.education

    assert len(edu) == 2
    assert [e.id for e in edu] == ["fact_education_1", "fact_education_2"]
    assert edu[0].school == "The University of Hong Kong"
    assert edu[1].school == "Sun Yat-sen University"


def test_backfill_falls_back_to_school_when_no_education_facts():
    state = CopilotState(
        session_id="s",
        candidate_profile=CandidateProfile(
            profile_basic=ProfileBasic(name="Chen", school="HKU"),
            facts=[],
        ),
    )

    out = _backfill_profile_from_candidate(_empty_skeleton(), state)
    edu = out.profile.education

    assert len(edu) == 1
    assert edu[0].id == "edu_1"
    assert edu[0].school == "HKU"
