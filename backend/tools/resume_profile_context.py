"""Candidate profile context for resume generation prompts."""

from __future__ import annotations

import json
from typing import Any

from workflow.state import CopilotState, Fact

# Kept for backward-compatible imports/tests; modular is always preferred for 7B-class models.
PROFILE_JSON_MODULAR_THRESHOLD = 0
# Keep module batches tiny — one fact per polish call keeps outputs compact and reliable.
MODULE_FACT_CHARS_THRESHOLD = 1_200
MODULE_FACT_BATCH_SIZE = 1
_SKELETON_FACT_CONTENT_MAX = 160


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


def _compact_fact_for_skeleton(fact: Fact) -> dict[str, Any]:
    content = (fact.content or "").strip()
    if len(content) > _SKELETON_FACT_CONTENT_MAX:
        content = content[:_SKELETON_FACT_CONTENT_MAX] + "…"
    return {
        "id": fact.id,
        "type": fact.type,
        "content": content,
    }


def _experience_title_hint(fact: Fact) -> str:
    raw = (fact.content or "").strip()
    if raw.startswith("{"):
        try:
            data = json.loads(raw)
            for key in ("title", "company", "name", "project"):
                value = data.get(key) if isinstance(data, dict) else None
                if isinstance(value, str) and value.strip():
                    return value.strip()[:80]
        except (json.JSONDecodeError, TypeError):
            pass
    return raw[:40]


def build_skeleton_profile_dict(state: CopilotState) -> dict[str, Any]:
    """Compact profile for skeleton LLM call — experience bodies are polished later."""
    profile = state.candidate_profile
    if profile is None:
        return {}

    soft_types = {"skill", "award", "paper", "education"}
    soft_facts = [_compact_fact_for_skeleton(f) for f in profile.facts if f.type in soft_types]
    experience_index = [
        {"id": f.id, "type": f.type, "title_hint": _experience_title_hint(f)}
        for f in profile.facts
        if f.type in {"internship", "project"}
    ]
    return {
        "profile_basic": profile.profile_basic.model_dump(),
        "facts": soft_facts,
        "experience_ids_for_later_polish": experience_index,
    }


def build_skeleton_profile_json(state: CopilotState, *, indent: int = 2) -> str:
    return json.dumps(build_skeleton_profile_dict(state), ensure_ascii=False, indent=indent)


def should_use_modular_generation(profile_json: str) -> bool:
    """Prefer skeleton + parallel module polish over one-shot full resume JSON.

    Single-shot ResumeGenerationOutput reliably degenerates on smaller instruct
    models after gap clarifications grow the prompt — empty prose, ``" "`` loops,
    or repeated filler. Modular generation keeps each LLM call small enough to
    stay coherent.
    """
    del profile_json  # signature kept for callers; threshold no longer gated
    return True


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
