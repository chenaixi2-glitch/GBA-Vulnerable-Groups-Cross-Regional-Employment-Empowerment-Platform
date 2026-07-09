"""Tests for profile fact splitting and material language detection."""

from __future__ import annotations

import json

from agents.json_contracts import ProfileFactOutput
from tools.profile_fact_split import (
    detect_material_language,
    expand_profile_facts,
    material_language_instruction,
    reroute_profile_extras,
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


def test_reroute_visa_status_award_fact_to_extras():
    facts = [
        ProfileFactOutput(
            id="fact_award_1",
            type="award",
            content=json.dumps(
                {"title": "Visa Status", "description": "Student Visa"},
                ensure_ascii=False,
            ),
        ),
        ProfileFactOutput(
            id="fact_internship_1",
            type="internship",
            content='{"title":"ACME Corp","company":"ACME","role":"Intern"}',
        ),
    ]
    kept, extras = reroute_profile_extras(facts)
    assert len(kept) == 1
    assert kept[0].type == "internship"
    assert extras["visa_type"] == "Student Visa"


def test_reroute_plain_visa_status_line_to_extras():
    facts = [
        ProfileFactOutput(
            id="fact_award_2",
            type="award",
            content="Visa Status: Student Visa",
        ),
    ]
    kept, extras = reroute_profile_extras(facts)
    assert kept == []
    assert extras["visa_type"] == "Student Visa"


def test_reroute_resident_type_to_extras():
    facts = [
        ProfileFactOutput(
            id="fact_award_3",
            type="award",
            content=json.dumps(
                {"title": "Resident Type", "description": "HK Permanent Resident"},
                ensure_ascii=False,
            ),
        ),
    ]
    kept, extras = reroute_profile_extras(facts)
    assert kept == []
    assert extras["resident_type"] == "HK Permanent Resident"


def test_reroute_does_not_overwrite_existing_extras():
    facts = [
        ProfileFactOutput(
            id="fact_award_4",
            type="award",
            content="Visa Status: Student Visa",
        ),
    ]
    kept, extras = reroute_profile_extras(facts, {"visa_type": "Employment visa"})
    assert kept == []
    assert extras["visa_type"] == "Employment visa"
