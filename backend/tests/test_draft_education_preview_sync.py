"""Tests for education/module edit → resume PDF preview sync."""

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


def _internship_draft_module() -> dict:
    return {
        "id": "fact_1",
        "type": "internship",
        "title": "ACME",
        "content": "Built APIs",
        "fields": {
            "company": "ACME",
            "role": "Intern",
            "start_date": "2023-01",
            "end_date": "2023-06",
            "responsibilities": "Built APIs",
        },
    }


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
                SectionItem(
                    id="fact_1",
                    title="ACME — Intern (2023-01 – 2023-06)",
                    content="Built APIs",
                    source_refs=["fact_1"],
                ),
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
        "modules": [_internship_draft_module()],
    }

    updated, changed = apply_draft_sections_to_resume_state(state, draft)

    assert changed is True
    assert len(updated.resume_content_json.profile.education) == 1
    assert updated.resume_content_json.profile.education[0].school == "学校A"
    assert updated.resume_html.html == ""
    assert len(updated.resume_content_json.internships) == 1


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
        "modules": [_internship_draft_module()],
    }

    updated, changed = apply_draft_sections_to_resume_state(state, draft)

    assert changed is False
    assert updated.resume_html.html == "<html>keep</html>"
    assert len(updated.resume_content_json.profile.education) == 2


def test_editing_internship_updates_content_dates_and_clears_html():
    state = _state_with_two_schools(html="<html>stale</html>")
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
        "modules": [{
            "id": "fact_1",
            "type": "internship",
            "title": "ACME",
            "content": "Built APIs",
            "fields": {
                "company": "ACME Corp",
                "role": "Backend Intern",
                "start_date": "2024-01",
                "end_date": "2024-08",
                "responsibilities": "Shipped v2 APIs",
            },
        }],
    }

    updated, changed = apply_draft_sections_to_resume_state(state, draft)

    assert changed is True
    assert updated.resume_html.html == ""
    item = updated.resume_content_json.internships[0]
    assert item.title == "ACME Corp — Backend Intern (2024-01 – 2024-08)"
    assert "Shipped v2 APIs" in item.content


def test_sync_optimized_sections_keeps_compacted_skill_groups():
    """A4-compacted category lines must survive draft round-trip (PDF ensure-render)."""
    from api.draft_utils import sync_optimized_sections_into_draft

    draft = {
        "profile_basic": {"name": "Alex"},
        "education": [],
        "modules": [
            {"id": "s1", "type": "skill", "title": "Python", "content": "", "fields": {"skill": "Python"}},
            {"id": "s2", "type": "skill", "title": "SQL", "content": "", "fields": {"skill": "SQL"}},
            {
                "id": "w1",
                "type": "work",
                "title": "ACME",
                "content": "Built APIs",
                "fields": {"company": "ACME", "role": "Dev"},
            },
        ],
    }
    resume = ResumeContent(
        meta=ResumeContentMeta(language="en"),
        profile=ResumeProfile(name="Alex"),
        skills=[
            SectionItem(id="s1", title="", content="Programming: Python, SQL"),
            SectionItem(id="s1_tools", title="", content="Tools: Docker"),
        ],
    )

    updated = sync_optimized_sections_into_draft(draft, resume)
    skills = [m for m in updated["modules"] if m["type"] == "skill"]
    assert len(skills) == 2
    assert skills[0]["fields"]["skill"] == "Programming: Python, SQL"
    assert any(m["type"] == "work" for m in updated["modules"])

    state = CopilotState(
        session_id="sess_opt",
        resume_content_json=resume,
        resume_html=ResumeHtml(html="<html>optimized</html>"),
    )
    final, _changed = apply_draft_sections_to_resume_state(state, updated)
    assert len(final.resume_content_json.skills) == 2
    line = final.resume_content_json.skills[0].title or final.resume_content_json.skills[0].content
    assert "Programming: Python, SQL" == line
    assert len(final.resume_content_json.skills) < 3  # not split back into Python / SQL rows
