"""Tests for education edit/delete → resume PDF preview sync."""

from __future__ import annotations

from api.draft_utils import apply_draft_sections_to_resume_state
from workflow.state import (
    CandidateProfile,
    CopilotState,
    Education,
    Fact,
    ProfileBasic,
    ResumeContent,
    ResumeContentMeta,
    ResumeHtml,
    ResumeProfile,
    SectionItem,
)


def _state_with_two_schools(*, html: str = "<html>old</html>") -> CopilotState:
    return CopilotState(
        session_id="sess_edu",
        candidate_profile=CandidateProfile(
            profile_basic=ProfileBasic(name="张三", school="学校A"),
            facts=[
                Fact(
                    id="edu_a",
                    type="education",
                    content='{"school":"学校A","major":"CS","degree":"Bachelor","start_date":"2018","end_date":"2022"}',
                ),
                Fact(
                    id="edu_b",
                    type="education",
                    content='{"school":"学校B","major":"EE","degree":"Master","start_date":"2022","end_date":"2024"}',
                ),
            ],
        ),
        resume_content_json=ResumeContent(
            meta=ResumeContentMeta(language="zh", target_role="工程师"),
            profile=ResumeProfile(
                name="张三",
                education=[
                    Education(
                        id="edu_a",
                        school="学校A",
                        major="CS",
                        degree="Bachelor",
                        start_date="2018",
                        end_date="2022",
                    ),
                    Education(
                        id="edu_b",
                        school="学校B",
                        major="EE",
                        degree="Master",
                        start_date="2022",
                        end_date="2024",
                    ),
                ],
            ),
            internships=[
                SectionItem(id="fact_1", title="ACME", content="Built APIs", source_refs=["fact_1"]),
            ],
        ),
        resume_html=ResumeHtml(html=html),
    )


def test_deleting_education_updates_content_and_clears_html():
    state = _state_with_two_schools()
    # Candidate already reflects the deleted edu_b (as after draft_to_profile).
    state.candidate_profile.facts = [
        Fact(
            id="edu_a",
            type="education",
            content='{"school":"学校A","major":"CS","degree":"Bachelor","start_date":"2018","end_date":"2022"}',
        ),
    ]
    draft = {
        "profile_basic": {"name": "张三", "email": "", "phone": "", "city": "", "extras": {}},
        "education": [{
            "id": "edu_a",
            "school": "学校A",
            "major": "CS",
            "degree": "Bachelor",
            "start_date": "2018",
            "end_date": "2022",
            "fields": {
                "school": "学校A",
                "major": "CS",
                "degree": "Bachelor",
                "start_date": "2018",
                "end_date": "2022",
            },
        }],
        "modules": [],
    }

    updated, changed = apply_draft_sections_to_resume_state(state, draft)

    assert changed is True
    assert len(updated.resume_content_json.profile.education) == 1
    assert updated.resume_content_json.profile.education[0].school == "学校A"
    assert updated.resume_html.html == ""


def test_unchanged_education_keeps_cached_html():
    state = _state_with_two_schools(html="<html>keep</html>")
    draft = {
        "profile_basic": {"name": "张三", "email": "", "phone": "", "city": "", "extras": {}},
        "education": [
            {
                "id": "edu_a",
                "school": "学校A",
                "major": "CS",
                "degree": "Bachelor",
                "start_date": "2018",
                "end_date": "2022",
            },
            {
                "id": "edu_b",
                "school": "学校B",
                "major": "EE",
                "degree": "Master",
                "start_date": "2022",
                "end_date": "2024",
            },
        ],
        "modules": [],
    }

    updated, changed = apply_draft_sections_to_resume_state(state, draft)

    assert changed is False
    assert updated.resume_html.html == "<html>keep</html>"
    assert len(updated.resume_content_json.profile.education) == 2
