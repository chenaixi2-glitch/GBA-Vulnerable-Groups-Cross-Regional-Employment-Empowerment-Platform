"""Candidate profile context for resume generation prompts."""

from __future__ import annotations

import json
from typing import Any

from workflow.state import CopilotState, Fact

PROFILE_JSON_MODULAR_THRESHOLD = 15_000
MODULE_FACT_CHARS_THRESHOLD = 3_500
MODULE_FACT_BATCH_SIZE = 4


def build_profile_dict(state: CopilotState) -> dict[str, Any]:
    """Build LLM-facing profile context — facts from editor/session only, no raw materials."""
    profile = state.candidate_profile
    if profile is None:
        return {}

    return {
        "profile_basic": profile.profile_basic.model_dump(),
        "facts": [fact.model_dump() for fact in profile.facts],
    }


def build_profile_json(state: CopilotState, *, indent: int = 2) -> str:
    return json.dumps(build_profile_dict(state), ensure_ascii=False, indent=indent)


def should_use_modular_generation(profile_json: str) -> bool:
    return len(profile_json or "") > PROFILE_JSON_MODULAR_THRESHOLD


def batch_facts_by_size(
    facts: list[Fact],
    *,
    max_chars: int = MODULE_FACT_CHARS_THRESHOLD,
    max_items: int = MODULE_FACT_BATCH_SIZE,
) -> list[list[Fact]]:
    batches: list[list[Fact]] = []
    current: list[Fact] = []
    current_len = 0
    for fact in facts:
        flen = len(fact.content or "")
        if current and (current_len + flen > max_chars or len(current) >= max_items):
            batches.append(current)
            current = []
            current_len = 0
        current.append(fact)
        current_len += flen
    if current:
        batches.append(current)
    return batches


def facts_of_type(state: CopilotState, fact_type: str) -> list[Fact]:
    if state.candidate_profile is None:
        return []
    return [fact for fact in state.candidate_profile.facts if fact.type == fact_type]
