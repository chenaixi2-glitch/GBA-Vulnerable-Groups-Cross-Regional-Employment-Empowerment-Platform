"""Tests for within-section skills/awards one-line compaction."""

from workflow.state import ResumeContent, ResumeContentMeta, SectionItem
from tools.resume_compact_layout import compact_skills_and_awards, item_to_inline_line


def _resume(*, skills=None, awards=None, language="en") -> ResumeContent:
    return ResumeContent(
        skills=skills or [],
        awards=awards or [],
        meta=ResumeContentMeta(language=language, version=1),
    )


class TestCompactSkillsAndAwards:
    def test_keeps_skill_groups_as_separate_one_line_items(self):
        content = _resume(skills=[
            SectionItem(id="s1", title="Languages", content="Python, TypeScript"),
            SectionItem(id="s2", title="Tools", content="Git, Docker"),
        ])
        out, changed = compact_skills_and_awards(content)
        assert changed is True
        assert len(out.skills) == 2
        assert out.skills[0].content == "Languages: Python, TypeScript"
        assert out.skills[1].content == "Tools: Git, Docker"
        assert out.skills[0].title == ""
        assert out.skills[1].title == ""

    def test_does_not_merge_skills_section_with_awards_section(self):
        content = _resume(
            skills=[SectionItem(id="s1", title="Languages", content="Python")],
            awards=[SectionItem(id="a1", title="Dean List", content="2024")],
        )
        out, changed = compact_skills_and_awards(content)
        assert changed is True
        assert len(out.skills) == 1
        assert len(out.awards) == 1
        assert "Dean" not in out.skills[0].content
        assert "Python" not in out.awards[0].content

    def test_flattens_multiline_skill_list_and_dedupes(self):
        content = _resume(skills=[
            SectionItem(id="s1", title="Skills", content="Python\n• FastAPI\nPython\nReact"),
        ])
        out, changed = compact_skills_and_awards(content)
        assert changed is True
        assert "\n" not in out.skills[0].content
        assert out.skills[0].content.count("Python") == 1
        assert "FastAPI" in out.skills[0].content
        assert "React" in out.skills[0].content

    def test_award_title_and_content_become_one_line(self):
        content = _resume(
            language="zh",
            awards=[
                SectionItem(id="a1", title="一等奖学金", content="2023\n校级"),
                SectionItem(id="a2", title="优秀干部", content="2024"),
            ],
        )
        out, changed = compact_skills_and_awards(content)
        assert changed is True
        assert len(out.awards) == 2
        assert out.awards[0].content.startswith("一等奖学金:")
        assert "2023" in out.awards[0].content
        assert "校级" in out.awards[0].content
        assert "\n" not in out.awards[0].content

    def test_strips_filler_phrases(self):
        content = _resume(skills=[
            SectionItem(id="s1", title="", content="Proficient in Python, familiar with Docker"),
        ])
        out, changed = compact_skills_and_awards(content)
        assert changed is True
        lower = out.skills[0].content.lower()
        assert "proficient" not in lower
        assert "familiar" not in lower
        assert "Python" in out.skills[0].content
        assert "Docker" in out.skills[0].content

    def test_merges_many_singleton_skill_rows_into_categorized_groups(self):
        """LLM often emits one skill per SectionItem — Optimize must classify & fold."""
        names = [
            "English (Fluent)",
            "Mandarin (Native)",
            "Python (Proficient)",
            "SQL (Proficient)",
            "HTML/CSS/JavaScript (Familiar)",
            "Java (Familiar)",
            "Word/Excel/PowerPoint",
            "Adobe Photoshop",
            "Adobe Illustrator",
            "Adobe Premiere",
            "LLMs",
            "OpenAI",
            "Data Preprocessing",
            "Data Analysis",
        ]
        content = _resume(skills=[
            SectionItem(id=f"s{i}", title="", content=name)
            for i, name in enumerate(names, start=1)
        ])
        out, changed = compact_skills_and_awards(content)
        assert changed is True
        assert 2 <= len(out.skills) <= 4
        by_prefix = {s.content.split(":", 1)[0].strip(): s.content for s in out.skills}
        assert "Languages" in by_prefix
        assert "English (Fluent)" in by_prefix["Languages"]
        assert "Mandarin (Native)" in by_prefix["Languages"]
        assert "Programming" in by_prefix
        assert "Python (Proficient)" in by_prefix["Programming"]
        assert "HTML/CSS/JavaScript (Familiar)" in by_prefix["Programming"]
        assert "Tools" in by_prefix
        assert "Adobe Photoshop" in by_prefix["Tools"]
        assert "Word/Excel/PowerPoint" in by_prefix["Tools"]
        assert "Data & AI" in by_prefix
        assert "LLMs" in by_prefix["Data & AI"]
        assert "Data Analysis" in by_prefix["Data & AI"]
        for item in out.skills:
            assert "\n" not in item.content

    def test_keeps_category_groups_and_classifies_flat_rows(self):
        content = _resume(skills=[
            SectionItem(id="s1", title="Languages", content="Python, TypeScript"),
            SectionItem(id="s2", title="", content="Docker"),
            SectionItem(id="s3", title="", content="Kubernetes"),
        ])
        out, changed = compact_skills_and_awards(content)
        assert changed is True
        assert len(out.skills) == 2
        assert out.skills[0].content == "Languages: Python, TypeScript"
        assert out.skills[1].content.startswith("Tools:")
        assert "Docker" in out.skills[1].content
        assert "Kubernetes" in out.skills[1].content


class TestItemToInlineLine:
    def test_joins_title_and_content(self):
        item = SectionItem(id="s1", title="Backend", content="Python")
        assert item_to_inline_line(item, generics=frozenset({"skills"})) == "Backend: Python"
