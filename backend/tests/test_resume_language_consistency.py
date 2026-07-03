"""Tests for resume monolingual output instructions and mixing detection."""

from tools.resume_layout import resume_output_language_instruction
from tools.resume_language_checklist import _detect_language_mixing
from workflow.state import ResumeContent, ResumeContentMeta, ResumeProfile, SectionItem


def _sample_resume(**overrides) -> ResumeContent:
    base = ResumeContent(
        profile=ResumeProfile(name="张三", email="a@b.com"),
        summary="具备 Java 后端开发经验。",
        skills=[SectionItem(id="s1", title="编程语言", content="Python, Java")],
        internships=[
            SectionItem(
                id="i1",
                title="某科技 — 后端实习生",
                content="负责 developed 用户模块，提升性能 20%",
            )
        ],
        meta=ResumeContentMeta(language="zh", target_role="工程师"),
    )
    for key, val in overrides.items():
        setattr(base, key, val)
    return base


def test_resume_output_language_instruction_zh():
    text = resume_output_language_instruction("zh")
    assert "简体中文" in text
    assert "混用" in text


def test_resume_output_language_instruction_en():
    text = resume_output_language_instruction("en")
    assert "English" in text
    assert "Do NOT leave Chinese" in text


def test_detect_mixing_in_chinese_resume():
    resume = _sample_resume()
    mixed = _detect_language_mixing(resume, "zh")
    assert len(mixed) >= 1
    assert "developed" in mixed[0].lower()


def test_skills_only_tech_terms_not_flagged():
    resume = _sample_resume(
        internships=[],
        skills=[SectionItem(id="s1", title="技术栈", content="Python, Java, Spring Boot")],
    )
    mixed = _detect_language_mixing(resume, "zh")
    assert mixed == []


def test_chinese_in_english_resume_flagged():
    resume = _sample_resume(
        summary="Experienced backend developer with 3 years experience.",
        internships=[SectionItem(id="i1", title="Acme Corp", content="负责后端 API 开发")],
    )
    mixed = _detect_language_mixing(resume, "en")
    assert len(mixed) >= 1
