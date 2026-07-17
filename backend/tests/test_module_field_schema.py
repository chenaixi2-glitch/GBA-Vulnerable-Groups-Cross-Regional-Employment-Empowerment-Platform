"""Tests for structured module field helpers."""

from __future__ import annotations

import json

from api.draft_utils import draft_to_profile, profile_to_draft
from tools.module_field_schema import (
    build_translation_module_json,
    derive_title_and_content,
    enrich_title_with_dates,
    merge_translated_fields,
    parse_fact_content,
    translatable_fields,
)
from workflow.state import CandidateProfile, Fact, ProfileBasic


def test_parse_internship_fields_from_json():
    content = json.dumps({
        "company": "ACME Corp",
        "role": "Backend Intern",
        "start_date": "2023-06",
        "responsibilities": "Built REST APIs",
    }, ensure_ascii=False)
    fields = parse_fact_content("internship", content)
    assert fields["company"] == "ACME Corp"
    assert fields["role"] == "Backend Intern"
    assert fields["start_date"] == "2023-06"
    assert fields["responsibilities"] == "Built REST APIs"


def test_profile_to_draft_preserves_structured_fields():
    profile = CandidateProfile(
        profile_basic=ProfileBasic(name="Alex"),
        facts=[
            Fact(
                id="fact_1",
                type="internship",
                content=json.dumps({
                    "company": "ACME",
                    "role": "Intern",
                    "responsibilities": "API work",
                }, ensure_ascii=False),
            ),
        ],
    )
    draft = profile_to_draft(profile)
    assert draft["modules"][0]["fields"]["company"] == "ACME"
    assert draft["modules"][0]["fields"]["role"] == "Intern"


def test_draft_roundtrip_structured_internship():
    draft = {
        "profile_basic": {"name": "Alex", "email": "", "phone": "", "city": "", "extras": {}},
        "education": [],
        "modules": [{
            "id": "fact_1",
            "type": "internship",
            "title": "ACME",
            "content": "API work",
            "fields": {
                "company": "ACME",
                "role": "Intern",
                "start_date": "2023-01",
                "end_date": "2023-06",
                "responsibilities": "API work",
            },
        }],
    }
    profile = draft_to_profile(draft)
    parsed = json.loads(profile.facts[0].content)
    assert parsed["company"] == "ACME"
    assert parsed["role"] == "Intern"
    assert parsed["start_date"] == "2023-01"


def test_translatable_fields_skip_dates():
    fields = {
        "company": "ACME",
        "start_date": "2023-01",
        "responsibilities": "Built APIs",
    }
    translatable = translatable_fields(fields)
    assert "company" in translatable
    assert "responsibilities" in translatable
    assert "start_date" not in translatable


def test_merge_translated_fields_preserves_dates():
    original = {"company": "ACME", "start_date": "2023-01", "role": "Intern"}
    translated = {"company": "ACME公司", "start_date": "2020", "role": "实习生"}
    merged = merge_translated_fields(original, translated)
    assert merged["company"] == "ACME公司"
    assert merged["role"] == "实习生"
    assert merged["start_date"] == "2023-01"


def test_build_translation_module_json_includes_unknown_keys():
    fields = {
        "company": "ACME",
        "role": "Intern",
        "location": "Hong Kong",
        "start_date": "2023-01",
    }
    payload = build_translation_module_json("fact_1", "internship", fields)
    assert payload["fields"]["location"] == "Hong Kong"
    assert "location" in payload["translate_keys"]
    assert "start_date" in payload["preserve_keys"]


def test_merge_translated_fields_includes_unknown_keys():
    original = {"company": "ACME", "location": "Hong Kong", "start_date": "2023-01"}
    translated = {"company": "ACME Corp", "location": "香港"}
    merged = merge_translated_fields(original, translated)
    assert merged["company"] == "ACME Corp"
    assert merged["location"] == "香港"
    assert merged["start_date"] == "2023-01"


def test_derive_title_and_content_from_internship_fields():
    title, content = derive_title_and_content("internship", {
        "company": "ACME",
        "role": "Intern",
        "responsibilities": "Built APIs",
    })
    assert title == "ACME — Intern"
    assert "Built APIs" in content
    assert "Intern" not in content  # role is in the title head


def test_parse_fact_promotes_title_to_role_when_role_empty():
    """Profile LLM often stores job title in `title` and leaves `role` blank."""
    fields = parse_fact_content(
        "internship",
        json.dumps({
            "title": "Web3 Product Development",
            "company": "VSystems",
            "role": "",
            "start_date": "2026-03",
            "end_date": "2025-05",
            "responsibilities": "Built coupon module",
        }),
    )
    assert fields["company"] == "VSystems"
    assert fields["role"] == "Web3 Product Development"
    title, _ = derive_title_and_content("internship", fields)
    assert "Web3 Product Development" in title
    assert "VSystems" in title


def test_derive_title_includes_internship_dates():
    title, content = derive_title_and_content("internship", {
        "company": "ACME",
        "role": "Intern",
        "start_date": "2023-01",
        "end_date": "2023-06",
        "responsibilities": "Built APIs",
    })
    assert title == "ACME — Intern (2023-01 – 2023-06)"
    assert "Built APIs" in content


def test_enrich_title_with_dates_skips_when_already_present():
    fields = {"start_date": "2023-01", "end_date": "2023-06"}
    assert enrich_title_with_dates("ACME (2023-01 – 2023-06)", fields) == "ACME (2023-01 – 2023-06)"
    assert enrich_title_with_dates("ACME", fields) == "ACME (2023-01 – 2023-06)"
