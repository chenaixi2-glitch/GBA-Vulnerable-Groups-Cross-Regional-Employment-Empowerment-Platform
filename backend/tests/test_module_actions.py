"""Tests for single-module translate/polish helpers."""

from agents.content_agent import apply_translated_module_to_resume
from workflow.state import (
    CopilotState,
    ResumeContent,
    ResumeContentMeta,
    ResumeProfile,
    SectionItem,
)


def _sample_resume_content() -> ResumeContent:
    return ResumeContent(
        profile=ResumeProfile(name="Test"),
        internships=[
            SectionItem(id="fact_1", title="ACME", content="Built APIs"),
        ],
        meta=ResumeContentMeta(language="zh", version=1),
    )


def test_apply_translated_module_updates_internship():
    resume = _sample_resume_content()
    updated = apply_translated_module_to_resume(
        resume,
        module_type="internship",
        module_id="fact_1",
        title="ACME Corp",
        content="Developed REST APIs",
    )
    assert updated.internships[0].title == "ACME Corp"
    assert updated.internships[0].content == "Developed REST APIs"
    assert updated.meta.version == 2


def test_apply_translated_module_updates_education():
    resume = ResumeContent(
        profile=ResumeProfile(
            name="Test",
            education=[{
                "id": "edu_1",
                "school": "Tsinghua",
                "major": "CS",
                "degree": "Bachelor",
                "start_date": "2019-09",
                "end_date": "2023-06",
            }],
        ),
        meta=ResumeContentMeta(language="en", version=1),
    )
    updated = apply_translated_module_to_resume(
        resume,
        module_type="education",
        module_id="edu_1",
        school="清华大学",
        major="计算机科学",
        degree="学士",
    )
    assert updated.profile.education[0].school == "清华大学"
    assert updated.profile.education[0].major == "计算机科学"
