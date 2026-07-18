"""Resume draft helpers — convert between CandidateProfile and editable draft."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from workflow.state import (
    CandidateProfile,
    CopilotState,
    Education,
    Fact,
    ProfileBasic,
    ResumeHtml,
    SectionItem,
)


from tools.module_field_schema import (
    derive_title_and_content,
    fields_to_fact_content,
    parse_fact_content,
)

MODULE_TYPE_LABELS = {
    "education": "Education",
    "skill": "Skills",
    "project": "Projects",
    "work": "Work Experience",
    "internship": "Internships",
    "award": "Awards",
    "paper": "Publications",
    "custom": "Custom Section",
}

_MODULE_TYPE_TO_SECTION: dict[str, str] = {
    "skill": "skills",
    "work": "works",
    "internship": "internships",
    "project": "projects",
    "award": "awards",
    "paper": "papers",
    "custom": "skills",
}

_RESUME_MODULE_SECTIONS: tuple[str, ...] = (
    "skills",
    "works",
    "internships",
    "projects",
    "awards",
    "papers",
)


def _education_entry_to_content(entry: dict[str, Any]) -> str:
    return fields_to_fact_content("education", _education_fields_from_draft_entry(entry))


def _module_draft_fields(module: dict[str, Any]) -> dict[str, Any]:
    if isinstance(module.get("fields"), dict) and module["fields"]:
        return dict(module["fields"])
    mod_type = str(module.get("type") or "custom")
    return parse_fact_content(
        mod_type,
        str(module.get("content") or ""),
        title=str(module.get("title") or ""),
    )


def profile_to_draft(profile: CandidateProfile | None) -> dict[str, Any]:
    """Build editable draft — each fact/education entry stored separately."""
    if profile is None:
        return {
            "profile_basic": ProfileBasic().model_dump(),
            "education": [],
            "modules": [],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

    education: list[dict[str, Any]] = []
    modules: list[dict[str, Any]] = []

    for fact in profile.facts:
        if fact.type == "education":
            edu_fields = parse_fact_content("education", fact.content)
            education.append({
                "id": fact.id or f"edu_{uuid.uuid4().hex[:8]}",
                **edu_fields,
                "fields": edu_fields,
                "is_custom": False,
            })
        else:
            mod_type = fact.type if fact.type in MODULE_TYPE_LABELS else "custom"
            mod_fields = parse_fact_content(mod_type, fact.content)
            title, content = derive_title_and_content(mod_type, mod_fields)
            modules.append({
                "id": fact.id or f"mod_{uuid.uuid4().hex[:8]}",
                "type": mod_type,
                "title": title,
                "content": content,
                "fields": mod_fields,
                "is_custom": False,
            })

    basic = profile.profile_basic.model_dump()
    if basic.get("school") and not education:
        education.append({
            "id": f"edu_{uuid.uuid4().hex[:8]}",
            "school": basic.pop("school"),
            "major": "",
            "degree": "",
            "start_date": "",
            "end_date": "",
            "is_custom": False,
        })
    else:
        basic.pop("school", None)

    return {
        "profile_basic": basic,
        "education": education,
        "modules": modules,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def draft_to_profile(draft: dict[str, Any]) -> CandidateProfile:
    """Convert draft back — each education/module entry becomes its own Fact."""
    basic_data = draft.get("profile_basic") or {}
    education_entries = draft.get("education") or []
    first_school = education_entries[0].get("school", "") if education_entries else ""

    basic_extras = {
        str(k): str(v)
        for k, v in (basic_data.get("extras") or {}).items()
        if v is not None and str(v).strip()
    }

    basic = ProfileBasic(
        name=str(basic_data.get("name") or ""),
        email=str(basic_data.get("email") or ""),
        phone=str(basic_data.get("phone") or ""),
        city=str(basic_data.get("city") or ""),
        school=str(first_school),
        extras=basic_extras,
    )

    now = datetime.now(timezone.utc).isoformat()
    facts: list[Fact] = []

    for entry in education_entries:
        if not any(entry.get(k) for k in ("school", "major", "degree")):
            continue
        facts.append(Fact(
            id=str(entry.get("id") or f"edu_{uuid.uuid4().hex[:8]}"),
            type="education",
            content=_education_entry_to_content(entry),
            source_refs=["user_draft"],
            updated_at=now,
        ))

    for module in draft.get("modules") or []:
        mod_type = str(module.get("type") or "custom")
        if mod_type == "custom":
            mod_type = "skill"
        mod_fields = _module_draft_fields(module)
        content = fields_to_fact_content(mod_type, mod_fields)
        if not content:
            continue
        facts.append(Fact(
            id=str(module.get("id") or f"mod_{uuid.uuid4().hex[:8]}"),
            type=mod_type,
            content=content,
            source_refs=["user_draft"],
            updated_at=now,
        ))

    return CandidateProfile(profile_basic=basic, materials=[], facts=facts)


def profile_has_substance(profile: CandidateProfile | None) -> bool:
    """True when the editor profile has enough content for resume generation."""
    if profile is None:
        return False
    basic = profile.profile_basic
    if not str(basic.name or "").strip():
        return False
    if str(basic.school or "").strip():
        return True
    for fact in profile.facts:
        if len(str(fact.content or "").strip()) > 8:
            return True
    extras = basic.extras or {}
    summary = str(extras.get("summary") or "").strip()
    if summary and len(summary) > 10:
        return True
    has_contact = bool(str(basic.email or "").strip() and str(basic.phone or "").strip())
    return has_contact and bool(str(basic.city or "").strip())


def state_with_draft(state: CopilotState, draft: dict[str, Any] | None) -> CopilotState:
    """Overlay the latest profile-editor draft onto session state for validation/display."""
    if not draft:
        return state
    profile = draft_to_profile(draft)
    if state.candidate_profile and state.candidate_profile.materials:
        profile.materials = list(state.candidate_profile.materials)
    data = state.model_dump()
    data["candidate_profile"] = profile.model_dump()
    return CopilotState.model_validate(data)


_PERSIST_EXCLUDE = {
    "user_message", "user_attachments", "current_intent",
    "execution_plan", "reply_message", "triggered_agents", "workflow_trace",
}


def _persist_payload(state_dict: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in state_dict.items() if k not in _PERSIST_EXCLUDE}


async def bootstrap_session_from_draft(store, session_id: str, draft: dict[str, Any]) -> None:
    """Create a new Redis session seeded from the profile editor draft."""
    from api.chat import _asave_state

    state = CopilotState(session_id=session_id)
    profile = draft_to_profile(draft)
    state_dict = state.model_dump()
    state_dict["candidate_profile"] = profile.model_dump()
    await _asave_state(store, _persist_payload(state_dict))


def _photo_url_from_extras(extras: dict[str, Any] | None) -> str:
    extras = extras or {}
    return str(extras.get("photo_url") or extras.get("photo_data") or "").strip()


def _education_fields_from_draft_entry(entry: dict[str, Any]) -> dict[str, str]:
    fields = entry.get("fields") if isinstance(entry.get("fields"), dict) else {}
    return {
        "school": str(entry.get("school") or fields.get("school") or "").strip(),
        "major": str(entry.get("major") or fields.get("major") or "").strip(),
        "degree": str(entry.get("degree") or fields.get("degree") or "").strip(),
        "start_date": str(entry.get("start_date") or fields.get("start_date") or "").strip(),
        "end_date": str(entry.get("end_date") or fields.get("end_date") or "").strip(),
    }


def _education_list_from_draft(draft: dict[str, Any]) -> list[Education]:
    """Build resume Education entries from the profile-editor draft (source of truth)."""
    education: list[Education] = []
    for entry in draft.get("education") or []:
        if not isinstance(entry, dict):
            continue
        fields = _education_fields_from_draft_entry(entry)
        if not any(fields.get(k) for k in ("school", "major", "degree")):
            continue
        education.append(Education(
            id=str(entry.get("id") or f"edu_{uuid.uuid4().hex[:8]}"),
            school=fields["school"],
            major=fields["major"],
            degree=fields["degree"],
            start_date=fields["start_date"],
            end_date=fields["end_date"],
        ))
    return education


def _module_sections_from_draft(
    draft: dict[str, Any],
    *,
    existing: Any | None = None,
) -> dict[str, list[SectionItem]]:
    """Build resume section lists from editor draft modules (source of truth)."""
    sections: dict[str, list[SectionItem]] = {key: [] for key in _RESUME_MODULE_SECTIONS}
    now = datetime.now(timezone.utc).isoformat()
    existing_by_id: dict[str, SectionItem] = {}
    if existing is not None:
        for key in _RESUME_MODULE_SECTIONS:
            for item in getattr(existing, key, None) or []:
                if getattr(item, "id", None):
                    existing_by_id[str(item.id)] = item

    for module in draft.get("modules") or []:
        if not isinstance(module, dict):
            continue
        mod_type = str(module.get("type") or "custom")
        if mod_type == "custom":
            mod_type = "skill"
        section_key = _MODULE_TYPE_TO_SECTION.get(mod_type)
        if not section_key:
            continue

        fields = _module_draft_fields(module)
        title, content = derive_title_and_content(mod_type, fields)
        if not title:
            title = str(module.get("title") or "").strip()
        if not content:
            content = str(module.get("content") or "").strip()
        if not title and not content:
            continue

        module_id = str(module.get("id") or f"mod_{uuid.uuid4().hex[:8]}")
        prev = existing_by_id.get(module_id)
        if prev is not None and prev.title == title and prev.content == content:
            sections[section_key].append(prev)
            continue

        sections[section_key].append(SectionItem(
            id=module_id,
            title=title,
            content=content,
            source_refs=list(prev.source_refs) if prev is not None and prev.source_refs else [module_id],
            updated_at=now,
        ))
    return sections


def _invalidate_resume_html(data: dict[str, Any], state: CopilotState) -> None:
    if not (state.resume_html and state.resume_html.html):
        return
    data["resume_html"] = ResumeHtml(
        html="",
        version=state.resume_html.version,
    ).model_dump()
    meta = state.meta.model_copy(update={
        "dirty_flags": state.meta.dirty_flags.model_copy(update={"render_dirty": True}),
    })
    data["meta"] = meta.model_dump()


def apply_draft_sections_to_resume_state(
    state: CopilotState,
    draft: dict[str, Any] | None,
) -> tuple[CopilotState, bool]:
    """Sync editor draft (education, contact, modules) into resume_content_json.

    Draft is authoritative so deletions/edits — including internship dates and
    body text — invalidate cached HTML and show up in PDF preview.
    Returns (updated_state, content_changed).
    """
    if not state.resume_content_json or not draft:
        return state, False

    before = state.resume_content_json.model_dump()
    resume = state.resume_content_json.model_copy(deep=True)

    basic = draft.get("profile_basic") or {}
    profile_updates: dict[str, Any] = {
        "education": _education_list_from_draft(draft),
    }
    for key in ("name", "email", "phone", "city"):
        value = str(basic.get(key) or "").strip()
        if value:
            profile_updates[key] = value

    section_updates = _module_sections_from_draft(draft, existing=resume)
    resume = resume.model_copy(update={
        "profile": resume.profile.model_copy(update=profile_updates),
        **section_updates,
    })

    changed = before != resume.model_dump()
    if not changed:
        return state, False

    data = state.model_dump()
    data["resume_content_json"] = resume.model_dump()
    _invalidate_resume_html(data, state)
    return CopilotState.model_validate(data), True


def apply_profile_extras_to_resume_state(state: CopilotState) -> tuple[CopilotState, bool]:
    """Merge candidate profile extras (photo, etc.) into resume_content_json.

    Returns (updated_state, content_changed).
    """
    if not state.resume_content_json:
        return state, False

    from agents.content_agent import _merge_profile_extras_from_candidate

    old_photo = _photo_url_from_extras(state.resume_content_json.profile.extras)
    merged = _merge_profile_extras_from_candidate(
        state.resume_content_json.model_copy(deep=True),
        state,
    )
    new_photo = _photo_url_from_extras(merged.profile.extras)
    photo_changed = old_photo != new_photo

    data = state.model_dump()
    data["resume_content_json"] = merged.model_dump()
    if photo_changed:
        _invalidate_resume_html(data, state)

    return CopilotState.model_validate(data), photo_changed


def _section_item_to_draft_module(item: SectionItem, mod_type: str) -> dict[str, Any]:
    """Map a resume SectionItem into an editor draft module (skill/award-safe)."""
    title = (item.title or "").strip()
    content = (item.content or "").strip()
    # A4 compact stores one-liners in content with empty title; editor skill
    # fields expect the display line in ``skill`` / title.
    if mod_type == "skill" and content and not title:
        fields = {"skill": content, "level": "", "context": ""}
        return {
            "id": item.id or f"mod_{uuid.uuid4().hex[:8]}",
            "type": "skill",
            "title": content,
            "content": "",
            "fields": fields,
            "is_custom": False,
        }
    fields = parse_fact_content(mod_type, content, title=title)
    derived_title, derived_content = derive_title_and_content(mod_type, fields)
    return {
        "id": item.id or f"mod_{uuid.uuid4().hex[:8]}",
        "type": mod_type,
        "title": derived_title or title,
        "content": derived_content if derived_content or mod_type == "skill" else content,
        "fields": fields,
        "is_custom": False,
    }


def sync_optimized_sections_into_draft(
    draft: dict[str, Any] | None,
    resume: Any | None,
) -> dict[str, Any] | None:
    """Replace draft skill/award modules with post-A4-optimize resume sections.

    Prevents stale pre-optimize drafts from undoing skills compaction on the
    next ensure-render / PDF export.
    """
    if not draft or resume is None:
        return draft

    keep_types = {"work", "internship", "project", "paper", "custom"}
    kept = [
        mod for mod in (draft.get("modules") or [])
        if isinstance(mod, dict) and str(mod.get("type") or "") in keep_types
    ]
    skill_mods = [
        _section_item_to_draft_module(item, "skill")
        for item in (getattr(resume, "skills", None) or [])
    ]
    award_mods = [
        _section_item_to_draft_module(item, "award")
        for item in (getattr(resume, "awards", None) or [])
    ]
    updated = dict(draft)
    updated["modules"] = [*kept, *skill_mods, *award_mods]
    updated["updated_at"] = datetime.now(timezone.utc).isoformat()
    return updated


async def sync_draft_to_session(store, session_id: str, draft: dict[str, Any]) -> None:
    """Merge draft into Redis session state candidate_profile and resume content."""
    from api.chat import _aload_state, _asave_state

    saved = await _aload_state(store)
    if not saved:
        await bootstrap_session_from_draft(store, session_id, draft)
        return

    state = CopilotState.model_validate(saved)
    profile = draft_to_profile(draft)

    if state.candidate_profile and state.candidate_profile.materials:
        profile.materials = list(state.candidate_profile.materials)

    state_dict = state.model_dump()
    state_dict["candidate_profile"] = profile.model_dump()
    state = CopilotState.model_validate(state_dict)
    state, _ = apply_draft_sections_to_resume_state(state, draft)
    state, _ = apply_profile_extras_to_resume_state(state)
    await _asave_state(store, _persist_payload(state.model_dump()))
