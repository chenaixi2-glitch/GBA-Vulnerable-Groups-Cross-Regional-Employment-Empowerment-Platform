"""Tests for resume draft ↔ profile fact conversion."""

from __future__ import annotations

import json

from api.draft_utils import draft_to_profile, profile_to_draft
from workflow.state import CandidateProfile, Fact, ProfileBasic


def test_draft_to_profile_structures_title_and_content():
    draft = {
        "profile_basic": {"name": "Alex", "email": "", "phone": "", "city": "", "extras": {}},
        "education": [],
        "modules": [{
            "id": "fact_1",
            "type": "internship",
            "title": "ACME Corp",
            "content": "Built REST APIs for internal tools.",
            "fields": {
                "company": "ACME Corp",
                "responsibilities": "Built REST APIs for internal tools.",
            },
        }],
    }
    profile = draft_to_profile(draft)
    assert len(profile.facts) == 1
    parsed = json.loads(profile.facts[0].content)
    assert parsed["company"] == "ACME Corp"
    assert parsed["responsibilities"] == "Built REST APIs for internal tools."


def test_profile_to_draft_splits_structured_module_content():
    profile = CandidateProfile(
        profile_basic=ProfileBasic(name="Alex"),
        facts=[
            Fact(
                id="fact_1",
                type="project",
                content='{"title":"RAG chatbot","content":"Built with LangChain."}',
            ),
        ],
    )
    draft = profile_to_draft(profile)
    assert draft["modules"][0]["fields"]["title"] == "RAG chatbot"
    assert draft["modules"][0]["fields"]["responsibilities"] == "Built with LangChain."


def test_draft_roundtrip_preserves_structured_module():
    draft = {
        "profile_basic": {"name": "Alex", "email": "", "phone": "", "city": "", "extras": {}},
        "education": [],
        "modules": [{
            "id": "fact_2",
            "type": "project",
            "title": "Side project",
            "content": "Implemented caching layer.",
            "fields": {
                "title": "Side project",
                "responsibilities": "Implemented caching layer.",
            },
        }],
    }
    restored = profile_to_draft(draft_to_profile(draft))
    assert restored["modules"][0]["fields"]["title"] == "Side project"
    assert restored["modules"][0]["fields"]["responsibilities"] == "Implemented caching layer."
    parsed = json.loads(draft_to_profile(draft).facts[0].content)
    assert parsed["title"] == "Side project"
