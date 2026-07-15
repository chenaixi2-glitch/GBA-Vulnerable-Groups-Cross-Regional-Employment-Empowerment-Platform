"""Normalize broken ResumeGenerationOutput payloads from small instruct models."""

from agents.json_contracts import ResumeGenerationOutput, normalize_resume_generation_payload


def test_normalize_nested_summary_and_string_skills():
    raw = {
        "profile": {"name": "Alex", "summary": "fallback from profile"},
        "summary": {
            "skills": ["基金运营", "Excel"],
            "internships": [],
            "projects": [],
        },
        "awards": [],
        "papers": [],
        "language": "zh",
        "reg_order": "profile",
    }
    fixed = normalize_resume_generation_payload(raw)
    assert fixed["summary"] == "fallback from profile"
    assert fixed["skills"][0]["title"] == "基金运营"
    assert fixed["internships"] == []
    parsed = ResumeGenerationOutput.model_validate(raw)
    assert len(parsed.skills) == 2
    assert parsed.skills[0].title == "基金运营"
    assert parsed.internships == []
    assert parsed.summary == "fallback from profile"


def test_normalize_profile_string_and_skills():
    raw = {
        "profile": "具备跨团队经验，能按时回复资料需求",
        "summary": "",
        "skills": ["沟通"],
        "internships": [],
        "projects": [],
        "awards": [],
        "papers": [],
        "language": "zh",
    }
    parsed = ResumeGenerationOutput.model_validate(raw)
    assert parsed.profile.name == ""
    assert "跨团队" in parsed.summary
    assert parsed.skills[0].title == "沟通"


def test_normalize_misplaced_section_names():
    raw = {
        "summary": "ok",
        "skills": ["沟通"],
        "internships": "projects",
        "awards": "papers",
        "projects": [],
        "papers": [],
        "language": "zh",
    }
    parsed = ResumeGenerationOutput.model_validate(raw)
    assert parsed.internships == []
    assert parsed.awards == []
    assert parsed.skills[0].title == "沟通"
