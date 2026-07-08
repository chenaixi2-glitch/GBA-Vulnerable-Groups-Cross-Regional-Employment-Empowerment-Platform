"""Compact candidate profile context for resume generation prompts."""

from __future__ import annotations

import json
import re
from typing import Any

from workflow.state import CopilotState, Fact

PROFILE_JSON_MODULAR_THRESHOLD = 10_000
MODULE_FACT_CHARS_THRESHOLD = 3_500
MODULE_FACT_BATCH_SIZE = 4

_ALWAYS_INCLUDE_TYPES = frozenset({"education", "skill"})
_EXPERIENCE_TYPES = frozenset({"internship", "project"})


def _tokenize(text: str) -> set[str]:
    lowered = (text or "").lower()
    tokens: set[str] = set()
    tokens.update(re.findall(r"[\u4e00-\u9fff]{2,}", lowered))
    tokens.update(re.findall(r"[a-z][a-z0-9+#.-]{1,}", lowered))
    return tokens


def collect_jd_keywords(state: CopilotState) -> set[str]:
    keywords: set[str] = set()
    if state.job:
        for field in (
            state.job.keywords,
            state.job.hard_skills,
            state.job.soft_skills,
            state.job.tech_stack,
        ):
            for item in field or []:
                text = str(item).strip().lower()
                if len(text) >= 2:
                    keywords.add(text)
        keywords.update(_tokenize(state.job.title or ""))
        for resp in (state.job.responsibilities or [])[:8]:
            keywords.update(_tokenize(str(resp)))

    jd_text = (state.meta.target_jd_text or "").strip()
    if not jd_text and state.job:
        jd_text = (state.job.source or "").strip()
    if jd_text:
        keywords.update(_tokenize(jd_text[:2500]))

    return keywords


def score_fact_for_jd(fact: Fact, keywords: set[str]) -> float:
    if fact.type in _ALWAYS_INCLUDE_TYPES:
        return 1.0
    if not keywords:
        return 0.8
    tokens = _tokenize(fact.content or "")
    if not tokens:
        return 0.25
    overlap = len(tokens & keywords)
    if overlap == 0:
        return 0.15
    return min(1.0, 0.35 + overlap / max(4, len(keywords) * 0.12))


def build_relevant_profile_dict(
    state: CopilotState,
    *,
    max_facts: int = 32,
    min_score: float = 0.35,
) -> dict[str, Any]:
    profile = state.candidate_profile
    if profile is None:
        return {}

    keywords = collect_jd_keywords(state)
    scored: list[tuple[float, Fact]] = []
    for fact in profile.facts:
        score = score_fact_for_jd(fact, keywords)
        if fact.type in _ALWAYS_INCLUDE_TYPES or score >= min_score:
            scored.append((score, fact))

    scored.sort(key=lambda item: (-item[0], item[1].type, item[1].id))
    selected = [fact for _, fact in scored[:max_facts]]

    selected_types = {fact.type for fact in selected}
    for exp_type in _EXPERIENCE_TYPES:
        if exp_type in selected_types:
            continue
        for fact in profile.facts:
            if fact.type == exp_type and fact not in selected:
                selected.append(fact)
                break

    return {
        "profile_basic": profile.profile_basic.model_dump(),
        "facts": [fact.model_dump() for fact in selected],
    }


def build_relevant_profile_json(state: CopilotState, *, indent: int = 2) -> str:
    return json.dumps(build_relevant_profile_dict(state), ensure_ascii=False, indent=indent)


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
