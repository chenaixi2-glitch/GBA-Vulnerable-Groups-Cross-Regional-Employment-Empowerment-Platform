"""Section order is agent-driven; templates only render in given order."""

from __future__ import annotations

from tools.resume_layout import default_section_order_for_language, resolve_section_order
from tools.resume_page_policy import apply_render_config_for_experience
from workflow.state import Education, RenderConfig, ResumeContent, ResumeContentMeta, ResumeProfile, SectionItem


def _sample_content() -> ResumeContent:
    return ResumeContent(
        profile=ResumeProfile(
            name="测试",
            education=[Education(id="e1", school="SYSU", major="Econ", degree="BA", start_date="2021-09", end_date="2025-06")],
        ),
        summary="自我评价内容",
        internships=[SectionItem(id="i1", title="中国电信", content="数据分析")],
        projects=[],
        skills=[SectionItem(id="s1", title="技能", content="Python")],
        meta=ResumeContentMeta(language="zh"),
    )


class TestSectionOrder:
    def test_apply_render_config_does_not_overwrite_section_order(self):
        custom = ["summary", "skills", "internships", "education"]
        config = apply_render_config_for_experience(
            RenderConfig(section_order=custom),
            "zh",
            "entry",
        )
        assert config.section_order == custom

    def test_agent_explicit_order_wins(self):
        content = _sample_content()
        explicit = ["skills", "summary", "internships", "education"]
        assert resolve_section_order(content, "zh", explicit=explicit) == explicit

    def test_explicit_order_inserts_missing_education(self):
        content = _sample_content()
        content = content.model_copy(update={
            "meta": ResumeContentMeta(language="en"),
            "profile": content.profile.model_copy(update={"name": "Alex"}),
        })
        order = resolve_section_order(
            content,
            "en",
            explicit=["profile", "summary", "skills", "awards"],
        )
        assert "education" in order
        assert order.index("summary") < order.index("education")
        assert order.index("education") < order.index("skills")

    def test_en_pins_profile_before_skills_and_awards(self):
        content = _sample_content()
        content = content.model_copy(update={
            "meta": ResumeContentMeta(language="en"),
            "profile": content.profile.model_copy(update={"name": "Alex"}),
            "awards": [SectionItem(id="a1", title="Dean List", content="2024")],
        })
        order = resolve_section_order(
            content,
            "en",
            explicit=["skills", "awards", "summary", "education"],
        )
        assert order[0] == "profile"
        assert order.index("profile") < order.index("skills")
        assert order.index("profile") < order.index("awards")

    def test_infer_from_language_defaults_when_no_explicit(self):
        content = _sample_content()
        order = resolve_section_order(content, "zh", explicit=None)
        assert order.index("summary") < order.index("education")
        assert order.index("internships") < order.index("skills")

    def test_zh_default_differs_from_en(self):
        zh = default_section_order_for_language("zh")
        en = default_section_order_for_language("en")
        assert "education" in zh
        assert "education" in en
        assert "profile" in en
        assert en.index("summary") < en.index("education")
        assert zh != en
