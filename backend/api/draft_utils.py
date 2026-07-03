"""Resume draft helpers — convert between CandidateProfile and editable draft."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from workflow.state import CandidateProfile, CopilotState, Fact, ProfileBasic


MODULE_TYPE_LABELS = {
    "education": "Education",
    "skill": "Skills",
    "project": "Projects",
    "internship": "Work / Internship",
    "award": "Awards",
    "paper": "Publications",
    "custom": "Custom Section",
}


def _parse_content_title(content: str, fallback: str = "") -> str:
    text = (content or "").strip()
    if not text:
        return fallback
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            for key in ("title", "name", "skill", "company", "school"):
                value = parsed.get(key)
                if value:
                    return str(value)
    except (json.JSONDecodeError, TypeError):
        pass
    first_line = text.split("\n", 1)[0].strip()
    return first_line[:80] if first_line else fallback


def _parse_education_content(content: str) -> dict[str, str]:
    text = (content or "").strip()
    empty = {"school": "", "major": "", "degree": "", "start_date": "", "end_date": ""}
    if not text:
        return empty
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return {
                "school": str(parsed.get("school") or parsed.get("name") or ""),
                "major": str(parsed.get("major") or ""),
                "degree": str(parsed.get("degree") or ""),
                "start_date": str(parsed.get("start_date") or parsed.get("start") or ""),
                "end_date": str(parsed.get("end_date") or parsed.get("end") or ""),
            }
    except (json.JSONDecodeError, TypeError):
        pass
    return {**empty, "school": text.split("\n", 1)[0].strip()}


def _education_entry_to_content(entry: dict[str, Any]) -> str:
    return json.dumps({
        "school": entry.get("school") or "",
        "major": entry.get("major") or "",
        "degree": entry.get("degree") or "",
        "start_date": entry.get("start_date") or "",
        "end_date": entry.get("end_date") or "",
    }, ensure_ascii=False)


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
            education.append({
                "id": fact.id or f"edu_{uuid.uuid4().hex[:8]}",
                **_parse_education_content(fact.content),
                "is_custom": False,
            })
        else:
            mod_type = fact.type if fact.type in MODULE_TYPE_LABELS else "custom"
            modules.append({
                "id": fact.id or f"mod_{uuid.uuid4().hex[:8]}",
                "type": mod_type,
                "title": _parse_content_title(fact.content, fact.type.title()),
                "content": fact.content,
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
        content = str(module.get("content") or "")
        if not content and module.get("title"):
            content = str(module.get("title"))
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


async def sync_draft_to_session(store, session_id: str, draft: dict[str, Any]) -> None:
    """Merge draft into Redis session state candidate_profile."""
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
    await _asave_state(store, _persist_payload(state_dict))
