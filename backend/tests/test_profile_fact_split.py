"""Tests for profile fact splitting and material language detection."""

from __future__ import annotations

import json

from agents.json_contracts import ProfileFactOutput
from tools.profile_fact_split import (
    detect_material_language,
    expand_profile_facts,
    material_language_instruction,
)


def test_detect_material_language_english_resume():
    text = """
    [Attachment 1] filename: resume.pdf
    John Smith
    Software Engineer at ACME Corp
    Built REST APIs with Python and Django
    """
    assert detect_material_language(text) == "en"


def test_detect_material_language_chinese_resume():
    text = "张三\n北京大学 计算机科学 本科\n负责后端开发"
    assert detect_material_language(text) == "zh"


def test_expand_profile_facts_splits_json_array():
    facts = [
        ProfileFactOutput(
            id="fact_internship_1",
            type="internship",
            content=json.dumps([
                {"title": "ACME Corp", "company": "ACME", "role": "Intern"},
                {"title": "Beta Inc", "company": "Beta", "role": "Engineer"},
            ], ensure_ascii=False),
        ),
    ]
    expanded = expand_profile_facts(facts)
    assert len(expanded) == 2
    assert json.loads(expanded[0].content)["company"] == "ACME"
    assert json.loads(expanded[1].content)["company"] == "Beta"


def test_expand_profile_facts_splits_nested_experiences_key():
    payload = {
        "experiences": [
            {"title": "Job A", "company": "A"},
            {"title": "Job B", "company": "B"},
        ],
    }
    facts = [
        ProfileFactOutput(
            id="fact_internship_1",
            type="internship",
            content=json.dumps(payload, ensure_ascii=False),
        ),
    ]
    expanded = expand_profile_facts(facts)
    assert len(expanded) == 2


def test_expand_profile_facts_keeps_single_entry():
    facts = [
        ProfileFactOutput(
            id="fact_internship_1",
            type="internship",
            content='{"title":"ACME Corp","company":"ACME","role":"Intern"}',
        ),
    ]
    expanded = expand_profile_facts(facts)
    assert len(expanded) == 1
    assert expanded[0].id == "fact_internship_1"


def test_material_language_instruction_english():
    hint = material_language_instruction("John Smith\nSoftware Engineer\nPython developer")
    assert "英文" in hint
    assert "禁止翻译" in hint
