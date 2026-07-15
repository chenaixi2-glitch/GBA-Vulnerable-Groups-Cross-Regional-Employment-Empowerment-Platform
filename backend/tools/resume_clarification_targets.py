"""Resolve which resume modules/facts are affected by gap clarifications."""

from __future__ import annotations

from typing import Any, Iterable

from workflow.state import CopilotState, Fact, ResumeContent, SectionItem

# Maps free-form target_field values from gap questions → resume section keys / fact types
_FIELD_ALIASES: dict[str, str] = {
    "internship": "internships",
    "internships": "internships",
    "work": "internships",
    "work_experience": "internships",
    "experience": "internships",
    "project": "projects",
    "projects": "projects",
    "skill": "skills",
    "skills": "skills",
    "summary": "summary",
    "award": "awards",
    "awards": "awards",
    "paper": "papers",
    "papers": "papers",
    "education": "education",
}

_SECTION_TO_FACT_TYPE: dict[str, str] = {
    "internships": "internship",
    "projects": "project",
    "skills": "skill",
    "awards": "award",
    "papers": "paper",
}

EXPERIENCE_SECTIONS = frozenset({"internships", "projects"})
SOFT_SECTIONS = frozenset({"skills", "summary"})


def normalize_target_field(value: str) -> str:
    key = (value or "").strip().lower().replace("-", "_").replace(" ", "_")
    return _FIELD_ALIASES.get(key, key)


def _as_str_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        text = value.strip()
        return [text] if text else []
    if isinstance(value, (list, tuple, set)):
        out: list[str] = []
        for item in value:
            text = str(item or "").strip()
            if text:
                out.append(text)
        return out
    text = str(value).strip()
    return [text] if text else []


def collect_affected_from_answers(
    answers: Iterable[dict[str, Any]] | None,
    removals: Iterable[dict[str, Any]] | None = None,
) -> tuple[set[str], set[str]]:
    """Return (affected_fact_ids, affected_sections) from structured answer/removal payloads."""
    fact_ids: set[str] = set()
    sections: set[str] = set()

    for answer in answers or []:
        if not isinstance(answer, dict):
            continue
        if not str(answer.get("answer") or "").strip():
            continue
        fact_ids.update(_as_str_list(answer.get("related_fact_ids") or answer.get("related_section_ids")))
        field = normalize_target_field(str(answer.get("target_field") or ""))
        if field:
            sections.add(field)
            # target_field may itself be a fact id (gap sometimes puts related id there)
            if field.startswith("fact_"):
                fact_ids.add(field)

    for removal in removals or []:
        if not isinstance(removal, dict):
            continue
        if removal.get("agreed") is False:
            continue
        rid = str(removal.get("fact_id") or "").strip()
        if rid:
            fact_ids.add(rid)
        section = normalize_target_field(str(removal.get("section_type") or ""))
        if section:
            sections.add(section)

    return fact_ids, sections


def clarify_source_fact_ids(state: CopilotState) -> set[str]:
    """Facts patched via profile clarification (source_refs contain user_clarification)."""
    profile = state.candidate_profile
    if profile is None:
        return set()
    return {
        fact.id
        for fact in profile.facts
        if "user_clarification" in (fact.source_refs or [])
    }


def resolve_affected_targets(
    state: CopilotState,
    *,
    explicit_fact_ids: Iterable[str] | None = None,
    explicit_sections: Iterable[str] | None = None,
) -> tuple[set[str], set[str]]:
    """Merge explicit targets with clarified facts and sections implied by fact types."""
    fact_ids = {str(x).strip() for x in (explicit_fact_ids or []) if str(x).strip()}
    sections = {
        normalize_target_field(str(x))
        for x in (explicit_sections or [])
        if normalize_target_field(str(x))
    }

    if not fact_ids:
        fact_ids = clarify_source_fact_ids(state)

    profile = state.candidate_profile
    if profile is not None:
        by_id = {fact.id: fact for fact in profile.facts}
        for fid in list(fact_ids):
            fact = by_id.get(fid)
            if fact is None:
                continue
            for section_key, fact_type in _SECTION_TO_FACT_TYPE.items():
                if fact.type == fact_type:
                    sections.add(section_key)
                    break

    # Any new experience facts not yet on the resume should be polished
    resume = state.resume_content_json
    if profile is not None and resume is not None:
        existing_ids = _resume_item_keys(resume)
        for fact in profile.facts:
            if fact.type not in ("internship", "project"):
                continue
            if fact.id in existing_ids:
                continue
            if fact.id in fact_ids or "user_clarification" in (fact.source_refs or []):
                fact_ids.add(fact.id)
                sections.add("internships" if fact.type == "internship" else "projects")

    return fact_ids, sections


def _item_keys(item: SectionItem) -> set[str]:
    keys = {item.id} if item.id else set()
    keys.update(str(ref) for ref in (item.source_refs or []) if ref)
    return {k for k in keys if k}


def _resume_item_keys(resume: ResumeContent) -> set[str]:
    keys: set[str] = set()
    for section in ("skills", "internships", "projects", "awards", "papers"):
        for item in getattr(resume, section) or []:
            keys |= _item_keys(item)
    return keys


def prune_resume_to_profile_facts(resume: ResumeContent, state: CopilotState) -> ResumeContent:
    """Drop resume items whose fact ids were removed from the candidate profile."""
    profile = state.candidate_profile
    if profile is None:
        return resume
    keep_ids = {fact.id for fact in profile.facts}

    def _keep(item: SectionItem) -> bool:
        keys = _item_keys(item)
        if not keys:
            return True
        # Keep custom/orphan items that never mapped to a fact id
        if not any(k.startswith("fact_") for k in keys):
            return True
        return bool(keys & keep_ids)

    updates = {
        "skills": [i for i in resume.skills if _keep(i)],
        "internships": [i for i in resume.internships if _keep(i)],
        "projects": [i for i in resume.projects if _keep(i)],
        "awards": [i for i in resume.awards if _keep(i)],
        "papers": [i for i in resume.papers if _keep(i)],
    }
    return resume.model_copy(update=updates)


def facts_for_ids(state: CopilotState, fact_ids: set[str]) -> list[Fact]:
    if not fact_ids or state.candidate_profile is None:
        return []
    wanted = set(fact_ids)
    return [fact for fact in state.candidate_profile.facts if fact.id in wanted]


def needs_soft_section_patch(sections: set[str]) -> bool:
    return bool(sections & SOFT_SECTIONS)


def needs_experience_polish(fact_ids: set[str], sections: set[str], state: CopilotState) -> bool:
    if sections & EXPERIENCE_SECTIONS:
        return True
    for fact in facts_for_ids(state, fact_ids):
        if fact.type in ("internship", "project"):
            return True
    return False
