"""Resume Content Agent — 生成/更新 resume_content_json。"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from collections.abc import Awaitable, Callable, Iterable
from datetime import datetime, timezone
from typing import Any, TypeVar

_T = TypeVar("_T")


async def _iter_completed_tasks(tasks: Iterable[asyncio.Task[_T]]):
    """Yield finished tasks as they complete (compatible with Python 3.13+).

    ``asyncio.as_completed`` became an async iterator in 3.13 and no longer
    yields the original Task objects, which breaks task→metadata maps.
    """
    pending: set[asyncio.Task[_T]] = set(tasks)
    while pending:
        done, pending = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            yield task

from agents.json_contracts import (
    ResumeClarificationPatchOutput,
    ResumeEducationTranslateOutput,
    ResumeGenerationOutput,
    ResumeModulePolishOutput,
    ResumeModuleTranslateOutput,
    ResumeProfileOutput,
    ResumeSectionItemOutput,
    EducationOutput,
)
from models.llm import get_resume_generation_llm, get_translation_llm
from tools.output_language_guard import ainvoke_json_with_language_guard
from tools.module_field_schema import (
    apply_polish_to_fields,
    build_translation_module_json,
    derive_title_and_content,
    fields_to_fact_content,
    merge_translated_fields,
    parse_fact_content,
)
from prompts.resume_generation import (
    RESUME_GENERATION_PROMPT,
    RESUME_MODULE_SECTION_PROMPT,
    RESUME_SECTION_UPDATE_PROMPT,
    RESUME_SKELETON_PROMPT,
)
from prompts.resume_clarification_patch import RESUME_CLARIFICATION_PATCH_PROMPT
from prompts.resume_language_convert import RESUME_LANGUAGE_CONVERT_PROMPT
from prompts.resume_module_translate import (
    RESUME_EDUCATION_TRANSLATE_PROMPT,
    RESUME_MODULE_TRANSLATE_PROMPT,
)
from prompts.resume_constraints import RESUME_PAGE_COMPRESS_PROMPT, RESUME_EXPERIENCE_POLISH_GUIDELINES, resolution_quantification_instruction
from tools.resume_page_policy import (
    apply_render_config_for_experience,
    page_limit_label,
    resolve_experience_level,
    resume_constraints_for_state,
)
from tools.resume_compact_layout import compact_skills_and_awards
from tools.resume_layout import (
    language_label,
    normalize_language,
    opposite_language,
    is_cjk_resume_language,
    resume_output_language_instruction,
    resolve_section_order,
)
from tools.output_language import resolve_resume_target_language
from tools.target_job_context import build_compact_job_json, build_enriched_job_json
from tools.resume_profile_context import (
    batch_facts_by_size,
    build_profile_json,
    build_skeleton_profile_json,
    facts_of_type,
    should_use_modular_generation,
)
from tools.resume_clarification_targets import (
    EXPERIENCE_SECTIONS,
    facts_for_ids,
    needs_experience_polish,
    needs_soft_section_patch,
    prune_resume_to_profile_facts,
    resolve_affected_targets,
)
from services.jd_experience_match import extract_fact_title
from workflow.state import (
    CopilotState, ResumeContent, ResumeProfile, ResumeContentMeta,
    SectionItem, Education, Fact,
)
from workflow.trace import append_trace, summarize_user_message
from log import get_logger, elapsed_ms, log_stage_timing

logger = get_logger("agent")

_MODULE_SECTIONS: tuple[tuple[str, str, str], ...] = (
    ("internships", "internship", "实习/工作经历"),
    ("projects", "project", "项目经历"),
)

_MODULE_TYPE_TO_SECTION: dict[str, str] = {
    "skill": "skills",
    "internship": "internships",
    "project": "projects",
    "award": "awards",
    "paper": "papers",
    "custom": "skills",
}

_SECTION_LABELS: dict[str, str] = {
    "internship": "实习/工作经历",
    "project": "项目经历",
}

_POLISH_PLACEHOLDER: dict[str, str] = {
    "zh": "正在润色…",
    "zh-TW": "正在潤色…",
    "en": "Polishing in progress…",
    "pt": "Polimento em curso…",
}

PolishProgressCallback = Callable[[ResumeGenerationOutput, dict[str, Any]], Awaitable[None]]


def polish_placeholder_for_language(language: str) -> str:
    lang = normalize_language(language)
    return _POLISH_PLACEHOLDER.get(lang, _POLISH_PLACEHOLDER["en"])


def _is_polish_placeholder(content: str) -> bool:
    text = (content or "").strip()
    if not text:
        return False
    if text in _POLISH_PLACEHOLDER.values():
        return True
    return (
        text.startswith("Polishing")
        or "正在润色" in text
        or "正在潤色" in text
        or text.startswith("Polimento")
    )


def _normalize_match_key(text: str) -> str:
    return "".join(ch.lower() for ch in (text or "") if ch.isalnum())


def _pending_item_from_fact(fact: Fact) -> ResumeSectionItemOutput:
    """Seed a module slot with real profile text — polishing status is UI-only via pending_fact_ids."""
    return _fallback_item_from_fact(fact)


def _placeholder_item_from_fact(fact: Fact, *, placeholder: str) -> ResumeSectionItemOutput:
    """Deprecated path kept for tests; prefer _pending_item_from_fact (no placeholder-in-content)."""
    item = _fallback_item_from_fact(fact)
    # Historical callers passed a polish placeholder string — ignore it for content.
    _ = placeholder
    return item


def _ensure_section_items_for_facts(
    current: list[Any],
    facts: list[Fact],
) -> list[Any]:
    """Keep existing items; append profile-derived stubs for missing fact ids (no polish placeholder text)."""
    if not facts:
        return list(current or [])
    items = list(current or [])
    existing_keys: set[str] = set()
    for item in items:
        item_id = getattr(item, "id", "") or ""
        if item_id:
            existing_keys.add(item_id)
        for ref in getattr(item, "source_refs", None) or []:
            existing_keys.add(str(ref))
    for fact in facts:
        if fact.id in existing_keys:
            continue
        items.append(_pending_item_from_fact(fact))
        existing_keys.add(fact.id)
    return items


def _mark_section_pending(
    resume: ResumeContent,
    *,
    section_key: str,
    fact_ids: set[str],
    append_missing: list[Fact],
) -> ResumeContent:
    """Ensure pending modules exist with real profile text — do not overwrite content with polish UI copy."""
    now = datetime.now(timezone.utc).isoformat()
    items = list(getattr(resume, section_key) or [])
    pending = set(fact_ids)
    updated: list[SectionItem] = []
    for item in items:
        keys = {item.id, *(item.source_refs or [])}
        if keys & pending:
            # Keep prior title/content; only refresh timestamp so UI can show outside "Polishing" badge.
            updated.append(item.model_copy(update={"updated_at": now}))
            pending -= {k for k in keys if k}
        else:
            updated.append(item)
    for fact in append_missing:
        if fact.id not in pending:
            continue
        stub = _pending_item_from_fact(fact)
        updated.append(SectionItem(
            id=stub.id,
            title=stub.title,
            content=stub.content,
            source_refs=[fact.id],
            updated_at=now,
        ))
        pending.discard(fact.id)
    return resume.model_copy(update={section_key: updated})


def _fallback_item_from_fact(fact: Fact) -> ResumeSectionItemOutput:
    """Build usable resume text from profile fact when polish fails or IDs mismatch."""
    fields = parse_fact_content(fact.type, fact.content or "")
    title, content = derive_title_and_content(fact.type, fields)
    if not title:
        title = extract_fact_title(fact)
    if not content:
        raw = (fact.content or "").strip()
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                content = "\n\n".join(
                    str(parsed.get(key) or "").strip()
                    for key in ("role", "responsibilities", "achievements", "description", "content")
                    if str(parsed.get(key) or "").strip()
                )
        except (json.JSONDecodeError, TypeError):
            content = raw
    if not content:
        content = title or fact.id
    return ResumeSectionItemOutput(
        id=fact.id,
        title=title or fact.id,
        content=content,
        source_refs=[fact.id],
    )


def _coerce_section_item(
    item: Any,
    *,
    fact: Fact,
) -> ResumeSectionItemOutput:
    title = (getattr(item, "title", "") or "").strip() or extract_fact_title(fact)
    content = (getattr(item, "content", "") or "").strip()
    if not content or _is_polish_placeholder(content):
        return _fallback_item_from_fact(fact)
    # Profile text-box fields (company, role, start/end dates) are authoritative for the
    # display title. Polish LLMs often return company-only titles; rebuild from structured
    # fact JSON so role and dates always appear in the resume/PDF.
    fields = parse_fact_content(fact.type, fact.content or "")
    derived_title, _ = derive_title_and_content(fact.type, fields)
    title = derived_title or title
    return ResumeSectionItemOutput(
        id=fact.id,
        title=title,
        content=content,
        source_refs=[fact.id],
        updated_at=getattr(item, "updated_at", "") or "",
    )


def _align_polished_items_to_facts(
    polished: list[Any] | None,
    facts: list[Fact],
) -> list[ResumeSectionItemOutput]:
    """Force polished items onto batch fact ids (id / title / order fallback)."""
    if not facts:
        return []
    items = list(polished or [])
    aligned: list[ResumeSectionItemOutput | None] = [None] * len(facts)
    used_indices: set[int] = set()
    fact_index = {fact.id: idx for idx, fact in enumerate(facts)}

    for idx, item in enumerate(items):
        keys = [str(getattr(item, "id", "") or "").strip()]
        keys.extend(str(ref) for ref in (getattr(item, "source_refs", None) or []))
        for key in keys:
            fact_idx = fact_index.get(key)
            if fact_idx is None or aligned[fact_idx] is not None:
                continue
            aligned[fact_idx] = _coerce_section_item(item, fact=facts[fact_idx])
            used_indices.add(idx)
            break

    for idx, item in enumerate(items):
        if idx in used_indices:
            continue
        item_title = _normalize_match_key(getattr(item, "title", "") or "")
        if not item_title:
            continue
        for fact_idx, fact in enumerate(facts):
            if aligned[fact_idx] is not None:
                continue
            fact_title = _normalize_match_key(extract_fact_title(fact))
            if not fact_title:
                continue
            if item_title == fact_title or item_title in fact_title or fact_title in item_title:
                aligned[fact_idx] = _coerce_section_item(item, fact=fact)
                used_indices.add(idx)
                break

    unused_items = [item for idx, item in enumerate(items) if idx not in used_indices]
    open_slots = [idx for idx, value in enumerate(aligned) if value is None]
    for slot, item in zip(open_slots, unused_items):
        aligned[slot] = _coerce_section_item(item, fact=facts[slot])

    return [
        aligned[idx] if aligned[idx] is not None else _fallback_item_from_fact(fact)
        for idx, fact in enumerate(facts)
    ]


def _apply_batch_polish(
    current: list[Any],
    polished: list[Any] | None,
    batch: list[Fact],
) -> list[Any]:
    aligned = _align_polished_items_to_facts(polished, batch)
    return _merge_polished_items(
        current,
        aligned,
        pending_fact_ids={fact.id for fact in batch},
    )


def _sweep_polish_placeholders(
    parsed: ResumeGenerationOutput,
    facts: list[Fact],
) -> ResumeGenerationOutput:
    """Replace any leftover polish placeholders with profile-derived text."""
    if not facts:
        return parsed
    fact_by_id = {fact.id: fact for fact in facts}
    for section_key, _, _ in _MODULE_SECTIONS:
        items = list(getattr(parsed, section_key, []) or [])
        if not items:
            continue
        updated: list[Any] = []
        changed = False
        for item in items:
            content = getattr(item, "content", "") or ""
            if not _is_polish_placeholder(content):
                updated.append(item)
                continue
            keys = {
                str(getattr(item, "id", "") or ""),
                *(str(ref) for ref in (getattr(item, "source_refs", None) or [])),
            }
            fact = next((fact_by_id[key] for key in keys if key in fact_by_id), None)
            if fact is None:
                updated.append(item)
                continue
            updated.append(_fallback_item_from_fact(fact))
            changed = True
        if changed:
            setattr(parsed, section_key, updated)
    return parsed


def _merge_polished_items(
    current: list[Any],
    polished: list[Any],
    *,
    pending_fact_ids: set[str],
) -> list[Any]:
    polished_by_id: dict[str, Any] = {}
    for item in polished:
        item_id = getattr(item, "id", "") or ""
        if item_id:
            polished_by_id[item_id] = item
        for ref in getattr(item, "source_refs", []) or []:
            polished_by_id[str(ref)] = item

    merged: list[Any] = []
    replaced: set[str] = set()
    for item in current:
        item_id = getattr(item, "id", "") or ""
        refs = set(getattr(item, "source_refs", []) or [])
        keys = {item_id, *refs}
        replacement = next((polished_by_id[key] for key in keys if key in polished_by_id), None)
        if replacement is not None:
            merged.append(replacement)
            replaced.update(keys)
        else:
            merged.append(item)

    for item in polished:
        item_id = getattr(item, "id", "") or ""
        refs = set(getattr(item, "source_refs", []) or [])
        if item_id in replaced or refs & replaced:
            continue
        if item_id in pending_fact_ids or refs & pending_fact_ids:
            merged.append(item)
    return merged


def _resolve_target_language(state: CopilotState) -> str:
    if state.current_intent == "language_convert" and state.resume_language_target:
        return normalize_language(state.resume_language_target)
    return resolve_resume_target_language(state)


def _job_json_for_prompt(state: CopilotState, *, compact: bool = True) -> str:
    if not state.job and not state.meta.target_jd_text:
        return "{}"
    if compact:
        return build_compact_job_json(state)
    return build_enriched_job_json(state)


def _merge_profile_extras_from_candidate(
    resume_content: ResumeContent,
    state: CopilotState,
) -> ResumeContent:
    """Preserve user-uploaded extras (e.g. photo) from draft / prior resume."""
    cand_extras: dict[str, str] = {}
    if state.candidate_profile and state.candidate_profile.profile_basic:
        cand_extras = dict(state.candidate_profile.profile_basic.extras or {})

    prev_extras: dict[str, str] = {}
    if state.resume_content_json and state.resume_content_json.profile:
        prev_extras = dict(state.resume_content_json.profile.extras or {})

    merged = {**prev_extras, **{k: v for k, v in cand_extras.items() if v}}
    lang = normalize_language(resume_content.meta.language)

    if is_cjk_resume_language(lang):
        cand_photo = (cand_extras.get("photo_url") or cand_extras.get("photo_data") or "").strip()
        if cand_photo:
            resume_content.profile.extras["photo_url"] = cand_photo
            resume_content.profile.extras["has_photo"] = "true"
        elif cand_extras.get("has_photo") == "false":
            resume_content.profile.extras.pop("photo_url", None)
            resume_content.profile.extras.pop("photo_data", None)
            resume_content.profile.extras["has_photo"] = "false"
        else:
            prev_photo = (prev_extras.get("photo_url") or prev_extras.get("photo_data") or "").strip()
            if prev_photo:
                resume_content.profile.extras["photo_url"] = prev_photo
                resume_content.profile.extras["has_photo"] = "true"
        for key in ("age", "gender", "native_place", "political_status", "visa_type", "resident_type"):
            if merged.get(key) and not resume_content.profile.extras.get(key):
                resume_content.profile.extras[key] = merged[key]
    else:
        resume_content.profile.extras.pop("photo_url", None)
        resume_content.profile.extras.pop("photo_data", None)
        resume_content.profile.extras["has_photo"] = "false"

    return resume_content


def _backfill_profile_from_candidate(
    parsed: ResumeGenerationOutput,
    state: CopilotState,
) -> ResumeGenerationOutput:
    """Fill empty skeleton profile fields from the grounded candidate profile."""
    cand = state.candidate_profile
    if cand is None:
        return parsed
    basic = cand.profile_basic
    profile = parsed.profile
    education = list(profile.education or [])
    if not education:
        # Prefer structured education facts. profile_basic.school is only a fallback
        # when no facts exist — using both duplicates the highest degree entry.
        for fact in cand.facts:
            if fact.type != "education":
                continue
            try:
                raw = json.loads(fact.content) if (fact.content or "").strip().startswith("{") else {}
            except json.JSONDecodeError:
                raw = {}
            if isinstance(raw, dict) and (raw.get("school") or raw.get("major")):
                education.append(EducationOutput(
                    id=fact.id or f"edu_{len(education)+1}",
                    school=str(raw.get("school") or ""),
                    major=str(raw.get("major") or ""),
                    degree=str(raw.get("degree") or ""),
                    start_date=str(raw.get("start_date") or ""),
                    end_date=str(raw.get("end_date") or ""),
                ))
        if not education:
            school = (basic.school or "").strip()
            if school:
                education = [EducationOutput(id="edu_1", school=school)]
    filled = ResumeProfileOutput(
        name=profile.name or basic.name or "",
        email=profile.email or basic.email or "",
        phone=profile.phone or basic.phone or "",
        city=profile.city or basic.city or "",
        github=profile.github or "",
        linkedin=getattr(profile, "linkedin", "") or "",
        address=getattr(profile, "address", "") or "",
        education=education,
        extras={**(basic.extras or {}), **(profile.extras or {})},
    )
    return parsed.model_copy(update={"profile": filled})


def _build_resume_from_parsed(
    parsed: ResumeGenerationOutput,
    state: CopilotState,
    *,
    language: str | None = None,
) -> ResumeContent:
    """从 LLM 返回的 JSON 构建 ResumeContent 对象。"""
    now = datetime.now(timezone.utc).isoformat()
    lang = normalize_language(language or parsed.language or _resolve_target_language(state))
    parsed = _backfill_profile_from_candidate(parsed, state)

    profile_data = parsed.profile
    education_list = []
    for ed in profile_data.education:
        education_list.append(Education(
            id=ed.id,
            school=ed.school,
            major=ed.major,
            degree=ed.degree,
            start_date=ed.start_date,
            end_date=ed.end_date,
        ))

    resume_profile = ResumeProfile(
        name=profile_data.name,
        email=profile_data.email,
        phone=profile_data.phone,
        city=profile_data.city,
        github=profile_data.github,
        linkedin=getattr(profile_data, "linkedin", "") or "",
        address=getattr(profile_data, "address", "") or "",
        education=education_list,
        extras=getattr(profile_data, "extras", None) or {},
    )

    def _parse_items(items: list[Any]) -> list[SectionItem]:
        return [SectionItem(
            id=item.id,
            title=item.title,
            content=item.content,
            source_refs=item.source_refs,
            updated_at=now,
        ) for item in items]

    content_json = json.dumps(parsed.model_dump(), ensure_ascii=False, sort_keys=True)
    content_hash = hashlib.sha256(content_json.encode()).hexdigest()[:16]

    version = 1
    if state.resume_content_json:
        version = state.resume_content_json.meta.version + 1

    target_role = ""
    if state.job:
        target_role = state.job.title
    elif state.resume_content_json:
        target_role = state.resume_content_json.meta.target_role

    return ResumeContent(
        profile=resume_profile,
        summary=parsed.summary,
        skills=_parse_items(parsed.skills),
        internships=_parse_items(parsed.internships),
        projects=_parse_items(parsed.projects),
        awards=_parse_items(parsed.awards),
        papers=_parse_items(parsed.papers),
        meta=ResumeContentMeta(
            target_role=target_role,
            language=lang,
            version=version,
            last_updated_at=now,
            content_hash=content_hash,
        ),
    )


async def _invoke_resume_generation_prompt(
    llm: Any,
    prompt: str,
    guard_lang: str,
    *,
    stage: str,
    session_id: str = "",
) -> ResumeGenerationOutput:
    t0 = time.perf_counter()
    result = await ainvoke_json_with_language_guard(
        llm,
        prompt,
        ResumeGenerationOutput,
        logger,
        "Resume Content Agent",
        guard_lang,
    )
    log_stage_timing(
        logger,
        stage,
        elapsed_ms(t0),
        session_id=session_id,
        language=guard_lang,
    )
    return result


async def _polish_module_section_async(
    llm: Any,
    *,
    state: CopilotState,
    guard_lang: str,
    job_json: str,
    section_key: str,
    section_label: str,
    facts: list[Fact],
    edit_instruction: str = "",
) -> list[Any]:
    if not facts:
        return []
    from tools.quantification_questions import has_quantification

    t0 = time.perf_counter()
    facts_json = json.dumps([fact.model_dump() for fact in facts], ensure_ascii=False, indent=2)
    quant_clause = resolution_quantification_instruction(edit_instruction)
    want_industry_metrics = "QUANTIFICATION_MODE=industry_standard" in (edit_instruction or "")

    async def _invoke(extra: str = "") -> list[Any]:
        prompt = RESUME_MODULE_SECTION_PROMPT.format(
            section_label=section_label,
            target_language=guard_lang,
            target_language_label=language_label(guard_lang),
            resume_output_language_instruction=resume_output_language_instruction(guard_lang),
            quantification_instruction=quant_clause + (f"\n{extra}" if extra else ""),
            job_json=job_json,
            facts_json=facts_json,
        )
        parsed = await ainvoke_json_with_language_guard(
            llm,
            prompt,
            ResumeModulePolishOutput,
            logger,
            f"Resume Content Agent ({section_key})",
            guard_lang,
            retry_unresolved_modules=True,
        )
        return list(parsed.items)

    items = await _invoke()
    if want_industry_metrics and items:
        missing = [
            getattr(item, "id", "") or ""
            for item in items
            if not has_quantification(getattr(item, "content", "") or "")
        ]
        if missing:
            logger.info(
                "Industry-standard polish missing metrics for %s; retrying once",
                missing,
            )
            items = await _invoke(
                "CRITICAL RETRY: Previous output lacked digits. "
                "Every item.content MUST include at least one numeric metric "
                "(range OK, e.g. ~3–5 people, ~10–20% faster, ~5–10 docs/week)."
            )

    log_stage_timing(
        logger,
        f"content_agent.polish.{section_key}",
        elapsed_ms(t0),
        session_id=state.session_id,
        facts=len(facts),
    )
    return items


def _fact_for_module(
    state: CopilotState,
    *,
    module_id: str,
    module_type: str,
    title: str,
    content: str,
    fields: dict[str, Any] | None = None,
) -> Fact:
    # Prefer current UI fields/content so re-polish improves what the user sees,
    # instead of silently regenerating from the stale uploaded profile fact.
    if fields:
        payload = fields_to_fact_content(module_type, fields)
        if payload and str(payload).strip():
            return Fact(id=module_id, type=module_type, content=payload)
    if (content or "").strip() or (title or "").strip():
        return Fact(
            id=module_id,
            type=module_type,
            content=json.dumps({"title": title, "content": content}, ensure_ascii=False),
        )
    if state.candidate_profile:
        for fact in state.candidate_profile.facts:
            if fact.id == module_id:
                return fact
    return Fact(
        id=module_id,
        type=module_type,
        content=json.dumps({"title": title, "content": content}, ensure_ascii=False),
    )


def _bump_resume_content_version(resume_content: ResumeContent) -> ResumeContent:
    now = datetime.now(timezone.utc).isoformat()
    content_json = json.dumps(resume_content.model_dump(), ensure_ascii=False, sort_keys=True)
    content_hash = hashlib.sha256(content_json.encode()).hexdigest()[:16]
    meta = resume_content.meta.model_copy(update={
        "version": resume_content.meta.version + 1,
        "last_updated_at": now,
        "content_hash": content_hash,
    })
    return resume_content.model_copy(update={"meta": meta})


def apply_translated_module_to_resume(
    resume_content: ResumeContent,
    *,
    module_type: str,
    module_id: str,
    title: str = "",
    content: str = "",
    school: str = "",
    major: str = "",
    degree: str = "",
    fields: dict[str, Any] | None = None,
) -> ResumeContent:
    now = datetime.now(timezone.utc).isoformat()
    if module_type == "education":
        edu_fields = dict(fields or {})
        if not edu_fields:
            edu_fields = {"school": school, "major": major, "degree": degree}
        education = list(resume_content.profile.education)
        for index, entry in enumerate(education):
            if entry.id != module_id:
                continue
            education[index] = entry.model_copy(update={
                "school": str(edu_fields.get("school") or entry.school),
                "major": str(edu_fields.get("major") or entry.major),
                "degree": str(edu_fields.get("degree") or entry.degree),
                "start_date": str(edu_fields.get("start_date") or entry.start_date),
                "end_date": str(edu_fields.get("end_date") or entry.end_date),
            })
            break
        profile = resume_content.profile.model_copy(update={"education": education})
        updated = resume_content.model_copy(update={"profile": profile})
        return _bump_resume_content_version(updated)

    module_fields = dict(fields or {})
    if module_fields:
        title, content = derive_title_and_content(module_type, module_fields)
    section_key = _MODULE_TYPE_TO_SECTION.get(module_type)
    if not section_key:
        raise ValueError(f"Unsupported module type: {module_type}")

    items = list(getattr(resume_content, section_key))
    replaced = False
    for index, item in enumerate(items):
        if item.id != module_id:
            continue
        items[index] = item.model_copy(update={
            "title": title,
            "content": content,
            "updated_at": now,
        })
        replaced = True
        break
    if not replaced:
        items.append(SectionItem(
            id=module_id,
            title=title,
            content=content,
            source_refs=[module_id],
            updated_at=now,
        ))
    updated = resume_content.model_copy(update={section_key: items})
    return _bump_resume_content_version(updated)


async def translate_resume_module_async(
    state: CopilotState,
    *,
    module_id: str,
    module_type: str,
    title: str = "",
    content: str = "",
    school: str = "",
    major: str = "",
    degree: str = "",
    fields: dict[str, Any] | None = None,
    target_language: str,
) -> dict[str, Any]:
    target_lang = normalize_language(target_language)
    source_lang = normalize_language(
        state.resume_content_json.meta.language
        if state.resume_content_json
        else state.render_config.language
    )
    llm = get_translation_llm()
    t0 = time.perf_counter()

    if module_type == "education":
        edu_fields = dict(fields or {})
        if not edu_fields:
            edu_fields = {
                "school": school,
                "major": major,
                "degree": degree,
            }
        module_json = json.dumps(
            build_translation_module_json(module_id, "education", edu_fields),
            ensure_ascii=False,
        )
        prompt = RESUME_EDUCATION_TRANSLATE_PROMPT.format(
            source_language_label=language_label(source_lang),
            target_language_label=language_label(target_lang),
            resume_output_language_instruction=resume_output_language_instruction(target_lang),
            job_json=_job_json_for_prompt(state, compact=True),
            RESUME_A4_ONE_PAGE_CONSTRAINTS=resume_constraints_for_state(state),
            module_json=module_json,
        )
        parsed = await ainvoke_json_with_language_guard(
            llm,
            prompt,
            ResumeEducationTranslateOutput,
            logger,
            "Resume Module Translate (education)",
            target_lang,
            retry_unresolved_modules=True,
        )
        merged_fields = merge_translated_fields(
            edu_fields,
            parsed.fields or {
                "school": parsed.school,
                "major": parsed.major,
                "degree": parsed.degree,
            },
        )
        log_stage_timing(
            logger,
            "content_agent.translate_module.education",
            elapsed_ms(t0),
            session_id=state.session_id,
            module_id=module_id,
            target=target_lang,
        )
        return {
            "module_id": parsed.id or module_id,
            "module_type": module_type,
            "school": str(merged_fields.get("school") or ""),
            "major": str(merged_fields.get("major") or ""),
            "degree": str(merged_fields.get("degree") or ""),
            "fields": merged_fields,
        }

    module_fields = dict(fields or {})
    if not module_fields:
        module_fields = parse_fact_content(module_type, content, title=title)
    module_json = json.dumps(
        build_translation_module_json(module_id, module_type, module_fields),
        ensure_ascii=False,
    )
    prompt = RESUME_MODULE_TRANSLATE_PROMPT.format(
        source_language_label=language_label(source_lang),
        target_language_label=language_label(target_lang),
        resume_output_language_instruction=resume_output_language_instruction(target_lang),
        job_json=_job_json_for_prompt(state, compact=True),
        RESUME_A4_ONE_PAGE_CONSTRAINTS=resume_constraints_for_state(state),
        module_json=module_json,
    )
    parsed = await ainvoke_json_with_language_guard(
        llm,
        prompt,
        ResumeModuleTranslateOutput,
        logger,
        "Resume Module Translate",
        target_lang,
        retry_unresolved_modules=True,
    )
    merged_fields = merge_translated_fields(module_fields, parsed.fields or {})
    if not parsed.fields and (parsed.title or parsed.content):
        merged_fields = apply_polish_to_fields(
            module_type,
            merged_fields,
            title=parsed.title,
            content=parsed.content,
        )
    out_title, out_content = derive_title_and_content(module_type, merged_fields)
    if parsed.title:
        out_title = parsed.title
    if parsed.content:
        out_content = parsed.content
    log_stage_timing(
        logger,
        "content_agent.translate_module",
        elapsed_ms(t0),
        session_id=state.session_id,
        module_id=module_id,
        target=target_lang,
    )
    return {
        "module_id": parsed.id or module_id,
        "module_type": module_type,
        "title": out_title,
        "content": out_content,
        "fields": merged_fields,
    }


async def polish_resume_module_async(
    state: CopilotState,
    *,
    module_id: str,
    module_type: str,
    title: str = "",
    content: str = "",
    fields: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if module_type not in _SECTION_LABELS:
        raise ValueError(f"Module type '{module_type}' cannot be polished")

    guard_lang = _resolve_target_language(state)
    llm = get_resume_generation_llm()
    module_fields = dict(fields or {})
    if not module_fields:
        module_fields = parse_fact_content(module_type, content, title=title)
    fact = _fact_for_module(
        state,
        module_id=module_id,
        module_type=module_type,
        title=title,
        content=content,
        fields=module_fields,
    )
    section_key = _MODULE_TYPE_TO_SECTION[module_type]
    items = await _polish_module_section_async(
        llm,
        state=state,
        guard_lang=guard_lang,
        job_json=_job_json_for_prompt(state, compact=True),
        section_key=section_key,
        section_label=_SECTION_LABELS[module_type],
        facts=[fact],
        edit_instruction=state.user_message or "",
    )
    if not items:
        return {
            "module_id": module_id,
            "title": title,
            "content": content,
            "fields": module_fields,
        }

    polished = items[0]
    polished_title = getattr(polished, "title", "") or title
    polished_content = getattr(polished, "content", "") or content
    merged_fields = apply_polish_to_fields(
        module_type,
        module_fields,
        title=polished_title,
        content=polished_content,
    )
    # Keep company / role / dates from structured fields in the display title.
    derived_title, _ = derive_title_and_content(module_type, merged_fields)
    if derived_title:
        polished_title = derived_title
    return {
        "module_id": getattr(polished, "id", None) or module_id,
        "title": polished_title,
        "content": polished_content,
        "fields": merged_fields,
    }


async def _generate_resume_from_profile_async(
    state: CopilotState,
    llm: Any,
    *,
    guard_lang: str,
    edit_instruction: str,
    on_progress: PolishProgressCallback | None = None,
) -> ResumeGenerationOutput:
    job_json = _job_json_for_prompt(state, compact=True)
    profile_json = build_profile_json(state) if state.candidate_profile else "{}"

    if not should_use_modular_generation(profile_json):
        prompt = RESUME_GENERATION_PROMPT.format(
            target_language=guard_lang,
            target_language_label=language_label(guard_lang),
            resume_output_language_instruction=resume_output_language_instruction(guard_lang),
            RESUME_A4_ONE_PAGE_CONSTRAINTS=resume_constraints_for_state(state),
            RESUME_EXPERIENCE_POLISH_GUIDELINES=RESUME_EXPERIENCE_POLISH_GUIDELINES,
            job_json=job_json,
            profile_json=profile_json,
            edit_instruction=edit_instruction,
        )
        parsed = await _invoke_resume_generation_prompt(
            llm,
            prompt,
            guard_lang,
            stage="content_agent.generate.single",
            session_id=state.session_id,
        )
        if on_progress is not None:
            await on_progress(parsed, {"phase": "complete_single"})
        return parsed

    skeleton_profile_json = build_skeleton_profile_json(state) if state.candidate_profile else "{}"
    logger.info(
        "Modular resume generation: profile_json len=%d skeleton_len=%d",
        len(profile_json),
        len(skeleton_profile_json),
    )
    skeleton_instruction = (
        f"{edit_instruction}\n\n"
        "【分步生成-第1步】仅生成 profile、summary、skills、awards、papers、section_order；"
        "internships 与 projects 必须返回空数组 []。"
    ).strip()
    # Use compact skeleton prompt — full RESUME_GENERATION_PROMPT often overruns output budgets.
    prompt = RESUME_SKELETON_PROMPT.format(
        target_language=guard_lang,
        target_language_label=language_label(guard_lang),
        resume_output_language_instruction=resume_output_language_instruction(guard_lang),
        job_json=job_json,
        profile_json=skeleton_profile_json,
        edit_instruction=skeleton_instruction,
    )
    parsed = await _invoke_resume_generation_prompt(
        llm,
        prompt,
        guard_lang,
        stage="content_agent.generate.skeleton",
        session_id=state.session_id,
    )
    # Defense: never keep leaked experience bodies from the skeleton step.
    parsed.internships = []
    parsed.projects = []
    parsed = _backfill_profile_from_candidate(parsed, state)

    polish_specs: list[tuple[str, list[Fact], Any]] = []
    for section_key, fact_type, section_label in _MODULE_SECTIONS:
        facts = facts_of_type(state, fact_type)
        if not facts:
            continue
        for batch in batch_facts_by_size(facts):
            polish_specs.append((
                section_key,
                batch,
                _polish_module_section_async(
                    llm,
                    state=state,
                    guard_lang=guard_lang,
                    job_json=job_json,
                    section_key=section_key,
                    section_label=section_label,
                    facts=batch,
                    edit_instruction=edit_instruction,
                ),
            ))

    if polish_specs and on_progress is not None:
        pending_fact_ids = {fact.id for _, batch, _ in polish_specs for fact in batch}
        # Seed experience sections with real profile text; polishing status is pending_fact_ids only.
        pending_by_section: dict[str, list[Fact]] = {key: [] for key, _, _ in _MODULE_SECTIONS}
        for section_key, batch, _ in polish_specs:
            pending_by_section[section_key].extend(batch)
        for section_key, facts in pending_by_section.items():
            if facts:
                current = list(getattr(parsed, section_key, []) or [])
                setattr(parsed, section_key, _ensure_section_items_for_facts(current, facts))
        await on_progress(parsed, {
            "phase": "skeleton_with_placeholders",
            "pending_fact_ids": sorted(pending_fact_ids),
            "pending_batches": len(polish_specs),
        })

        polish_t0 = time.perf_counter()
        task_map = {
            asyncio.create_task(coro): (section_key, batch)
            for section_key, batch, coro in polish_specs
        }
        completed_batches = 0
        async for task in _iter_completed_tasks(task_map.keys()):
            section_key, batch = task_map[task]
            try:
                items = task.result()
                merged_items = _apply_batch_polish(
                    list(getattr(parsed, section_key, []) or []),
                    items,
                    batch,
                )
                batch_error = None
            except Exception as exc:
                logger.error(
                    "Module polish failed for %s facts=%s: %s",
                    section_key,
                    [f.id for f in batch],
                    exc,
                )
                # Replace placeholders with profile-derived text instead of leaving "Polishing…"
                merged_items = _apply_batch_polish(
                    list(getattr(parsed, section_key, []) or []),
                    None,
                    batch,
                )
                batch_error = str(exc)[:240]
            completed_batches += 1
            batch_fact_ids = {fact.id for fact in batch}
            pending_fact_ids -= batch_fact_ids
            setattr(parsed, section_key, merged_items)
            progress_meta = {
                "phase": "module_polished",
                "section_key": section_key,
                "completed_fact_ids": sorted(batch_fact_ids),
                "pending_fact_ids": sorted(pending_fact_ids),
                "completed_batches": completed_batches,
                "total_batches": len(polish_specs),
            }
            if batch_error:
                progress_meta["batch_error"] = batch_error
            await on_progress(parsed, progress_meta)
        all_facts = [fact for _, batch, _ in polish_specs for fact in batch]
        _sweep_polish_placeholders(parsed, all_facts)
        log_stage_timing(
            logger,
            "content_agent.generate.polish_parallel",
            elapsed_ms(polish_t0),
            session_id=state.session_id,
            batches=len(polish_specs),
        )
    elif polish_specs:
        polish_t0 = time.perf_counter()
        polish_results = await asyncio.gather(
            *[coro for _, _, coro in polish_specs],
            return_exceptions=True,
        )
        log_stage_timing(
            logger,
            "content_agent.generate.polish_parallel",
            elapsed_ms(polish_t0),
            session_id=state.session_id,
            batches=len(polish_specs),
        )
        merged_by_section: dict[str, list[Any]] = {key: [] for key, _, _ in _MODULE_SECTIONS}
        for (section_key, batch, _), items in zip(polish_specs, polish_results):
            if isinstance(items, Exception):
                logger.error(
                    "Module polish failed for %s facts=%s: %s",
                    section_key,
                    [f.id for f in batch],
                    items,
                )
                merged_by_section[section_key].extend(_align_polished_items_to_facts(None, batch))
                continue
            merged_by_section[section_key].extend(_align_polished_items_to_facts(items, batch))
        for section_key, _, _ in _MODULE_SECTIONS:
            items = merged_by_section.get(section_key, [])
            if items:
                setattr(parsed, section_key, items)
        all_facts = [fact for _, batch, _ in polish_specs for fact in batch]
        _sweep_polish_placeholders(parsed, all_facts)
    elif on_progress is not None:
        await on_progress(parsed, {"phase": "skeleton_complete", "pending_fact_ids": []})

    return parsed


def _section_items_to_output(items: list[SectionItem]) -> list[ResumeSectionItemOutput]:
    return [
        ResumeSectionItemOutput(
            id=item.id,
            title=item.title,
            content=item.content,
            source_refs=list(item.source_refs or []),
            updated_at=item.updated_at or "",
        )
        for item in items
    ]


def _resume_content_to_generation_output(resume: ResumeContent) -> ResumeGenerationOutput:
    profile = resume.profile
    return ResumeGenerationOutput(
        profile=ResumeProfileOutput(
            name=profile.name,
            email=profile.email,
            phone=profile.phone,
            city=profile.city,
            github=profile.github,
            linkedin=profile.linkedin,
            address=profile.address,
            education=[
                EducationOutput(
                    id=ed.id,
                    school=ed.school,
                    major=ed.major,
                    degree=ed.degree,
                    start_date=ed.start_date,
                    end_date=ed.end_date,
                )
                for ed in profile.education
            ],
            extras=dict(profile.extras or {}),
        ),
        summary=resume.summary,
        skills=_section_items_to_output(resume.skills),
        internships=_section_items_to_output(resume.internships),
        projects=_section_items_to_output(resume.projects),
        awards=_section_items_to_output(resume.awards),
        papers=_section_items_to_output(resume.papers),
        language=resume.meta.language,
    )


def _output_items_to_section(items: list[Any], *, now: str) -> list[SectionItem]:
    return [
        SectionItem(
            id=getattr(item, "id", "") or "",
            title=getattr(item, "title", "") or "",
            content=getattr(item, "content", "") or "",
            source_refs=list(getattr(item, "source_refs", []) or []),
            updated_at=now,
        )
        for item in items
    ]


def _mark_section_placeholders(
    resume: ResumeContent,
    *,
    section_key: str,
    fact_ids: set[str],
    placeholder: str,
    append_missing: list[Fact],
) -> ResumeContent:
    """Compatibility wrapper — never writes polish placeholder text into content."""
    _ = placeholder
    return _mark_section_pending(
        resume,
        section_key=section_key,
        fact_ids=fact_ids,
        append_missing=append_missing,
    )


async def _patch_soft_sections_async(
    llm: Any,
    *,
    state: CopilotState,
    resume: ResumeContent,
    guard_lang: str,
    edit_instruction: str,
    clarifications: str,
    sections: set[str],
) -> ResumeContent:
    if not needs_soft_section_patch(sections):
        return resume
    skill_facts = facts_of_type(state, "skill")
    clarified = [
        fact for fact in skill_facts
        if "user_clarification" in (fact.source_refs or [])
    ] or skill_facts
    prompt = RESUME_CLARIFICATION_PATCH_PROMPT.format(
        target_language_label=language_label(guard_lang),
        resume_output_language_instruction=resume_output_language_instruction(guard_lang),
        current_summary=resume.summary or "",
        current_skills_json=json.dumps(
            [item.model_dump() for item in resume.skills],
            ensure_ascii=False,
            indent=2,
        ),
        skill_facts_json=json.dumps(
            [fact.model_dump() for fact in clarified],
            ensure_ascii=False,
            indent=2,
        ),
        job_json=_job_json_for_prompt(state, compact=True),
        clarifications=clarifications or "（无额外文本；请依据已更新的 skill facts）",
        edit_instruction=edit_instruction or "仅应用澄清，不要虚构内容。",
    )
    t0 = time.perf_counter()
    parsed = await ainvoke_json_with_language_guard(
        llm,
        prompt,
        ResumeClarificationPatchOutput,
        logger,
        "Resume Clarification Patch",
        guard_lang,
    )
    log_stage_timing(
        logger,
        "content_agent.clarification_soft_patch",
        elapsed_ms(t0),
        session_id=state.session_id,
    )
    now = datetime.now(timezone.utc).isoformat()
    updates: dict[str, Any] = {}
    if parsed.update_summary and "summary" in sections:
        updates["summary"] = parsed.summary or resume.summary
    if parsed.update_skills and "skills" in sections and parsed.skills:
        updates["skills"] = _output_items_to_section(parsed.skills, now=now)
    if not updates:
        return resume
    return resume.model_copy(update=updates)


async def _incremental_polish_from_existing_async(
    state: CopilotState,
    llm: Any,
    *,
    guard_lang: str,
    edit_instruction: str,
    affected_fact_ids: set[str] | None,
    affected_sections: set[str] | None,
    clarifications: str = "",
    on_progress: PolishProgressCallback | None = None,
) -> ResumeGenerationOutput:
    """Reuse existing resume_content_json; only polish affected experience modules (+ soft sections)."""
    if state.resume_content_json is None:
        raise ValueError("incremental polish requires existing resume_content_json")

    fact_ids, sections = resolve_affected_targets(
        state,
        explicit_fact_ids=affected_fact_ids,
        explicit_sections=affected_sections,
    )
    resume = prune_resume_to_profile_facts(state.resume_content_json, state)
    job_json = _job_json_for_prompt(state, compact=True)

    experience_facts: list[Fact] = []
    for fact in facts_for_ids(state, fact_ids):
        if fact.type in ("internship", "project"):
            experience_facts.append(fact)
    # Include brand-new clarified experience facts even if id list was section-only
    if needs_experience_polish(fact_ids, sections, state):
        seen = {f.id for f in experience_facts}
        for fact_type, section_key in (("internship", "internships"), ("project", "projects")):
            if section_key not in sections and not any(f.type == fact_type for f in experience_facts):
                continue
            for fact in facts_of_type(state, fact_type):
                if fact.id in seen:
                    continue
                if fact.id in fact_ids or "user_clarification" in (fact.source_refs or []):
                    experience_facts.append(fact)
                    seen.add(fact.id)

    pending_fact_ids = {fact.id for fact in experience_facts}
    for section_key, fact_type, _ in _MODULE_SECTIONS:
        batch = [f for f in experience_facts if f.type == fact_type]
        if not batch:
            continue
        existing_keys = {
            key
            for item in getattr(resume, section_key) or []
            for key in ({item.id, *(item.source_refs or [])})
            if key
        }
        append_missing = [f for f in batch if f.id not in existing_keys]
        resume = _mark_section_pending(
            resume,
            section_key=section_key,
            fact_ids={f.id for f in batch},
            append_missing=append_missing,
        )

    parsed = _resume_content_to_generation_output(resume)
    if on_progress is not None:
        await on_progress(parsed, {
            "phase": "skeleton_with_placeholders",
            "pending_fact_ids": sorted(pending_fact_ids),
            "pending_batches": 0,
            "mode": "incremental",
        })

    polish_specs: list[tuple[str, list[Fact], Any]] = []
    for section_key, fact_type, section_label in _MODULE_SECTIONS:
        section_facts = [f for f in experience_facts if f.type == fact_type]
        if not section_facts:
            continue
        for batch in batch_facts_by_size(section_facts):
            polish_specs.append((
                section_key,
                batch,
                _polish_module_section_async(
                    llm,
                    state=state,
                    guard_lang=guard_lang,
                    job_json=job_json,
                    section_key=section_key,
                    section_label=section_label,
                    facts=batch,
                    edit_instruction=edit_instruction,
                ),
            ))

    if polish_specs:
        polish_t0 = time.perf_counter()
        if on_progress is not None:
            task_map = {
                asyncio.create_task(coro): (section_key, batch)
                for section_key, batch, coro in polish_specs
            }
            completed_batches = 0
            remaining = set(pending_fact_ids)
            async for task in _iter_completed_tasks(task_map.keys()):
                section_key, batch = task_map[task]
                try:
                    items = task.result()
                    merged_items = _apply_batch_polish(
                        list(getattr(parsed, section_key, []) or []),
                        items,
                        batch,
                    )
                    batch_error = None
                except Exception as exc:
                    logger.error(
                        "Incremental module polish failed for %s facts=%s: %s",
                        section_key,
                        [f.id for f in batch],
                        exc,
                    )
                    merged_items = _apply_batch_polish(
                        list(getattr(parsed, section_key, []) or []),
                        None,
                        batch,
                    )
                    batch_error = str(exc)[:240]
                completed_batches += 1
                batch_fact_ids = {fact.id for fact in batch}
                remaining -= batch_fact_ids
                setattr(parsed, section_key, merged_items)
                # Keep working resume in sync for soft-patch base
                now = datetime.now(timezone.utc).isoformat()
                resume = resume.model_copy(update={
                    section_key: _output_items_to_section(merged_items, now=now),
                })
                progress_meta = {
                    "phase": "module_polished",
                    "section_key": section_key,
                    "completed_fact_ids": sorted(batch_fact_ids),
                    "pending_fact_ids": sorted(remaining),
                    "completed_batches": completed_batches,
                    "total_batches": len(polish_specs),
                    "mode": "incremental",
                }
                if batch_error:
                    progress_meta["batch_error"] = batch_error
                await on_progress(parsed, progress_meta)
        else:
            polish_results = await asyncio.gather(
                *[coro for _, _, coro in polish_specs],
                return_exceptions=True,
            )
            for (section_key, batch, _), items in zip(polish_specs, polish_results):
                if isinstance(items, Exception):
                    logger.error(
                        "Incremental module polish failed for %s facts=%s: %s",
                        section_key,
                        [f.id for f in batch],
                        items,
                    )
                    polished = None
                else:
                    polished = items
                current_items = list(getattr(parsed, section_key, []) or [])
                merged_items = _apply_batch_polish(current_items, polished, batch)
                setattr(parsed, section_key, merged_items)
                now = datetime.now(timezone.utc).isoformat()
                resume = resume.model_copy(update={
                    section_key: _output_items_to_section(merged_items, now=now),
                })
        _sweep_polish_placeholders(parsed, experience_facts)
        now = datetime.now(timezone.utc).isoformat()
        for section_key, _, _ in _MODULE_SECTIONS:
            section_items = list(getattr(parsed, section_key, []) or [])
            resume = resume.model_copy(update={
                section_key: _output_items_to_section(section_items, now=now),
            })
        log_stage_timing(
            logger,
            "content_agent.incremental.polish_parallel",
            elapsed_ms(polish_t0),
            session_id=state.session_id,
            batches=len(polish_specs),
        )

    if needs_soft_section_patch(sections):
        resume = await _patch_soft_sections_async(
            llm,
            state=state,
            resume=resume,
            guard_lang=guard_lang,
            edit_instruction=edit_instruction,
            clarifications=clarifications,
            sections=sections,
        )
        parsed = _resume_content_to_generation_output(resume)
        if on_progress is not None:
            await on_progress(parsed, {
                "phase": "module_polished",
                "section_key": "skills",
                "completed_fact_ids": [],
                "pending_fact_ids": [],
                "mode": "incremental",
            })

    if on_progress is not None:
        await on_progress(parsed, {
            "phase": "complete_incremental",
            "pending_fact_ids": [],
            "mode": "incremental",
        })
    logger.info(
        "Incremental resume polish: facts=%d sections=%s batches=%d",
        len(pending_fact_ids),
        sorted(sections),
        len(polish_specs),
    )
    return parsed


async def generate_resume_content_with_progress(
    state: CopilotState,
    *,
    edit_instruction: str = "",
    on_progress: PolishProgressCallback | None = None,
    affected_fact_ids: set[str] | list[str] | None = None,
    affected_sections: set[str] | list[str] | None = None,
    clarifications: str = "",
    incremental: bool = False,
) -> tuple[ResumeContent, RenderConfig, dict[str, Any]]:
    """Generate resume content; optionally emit partial results after each polish batch.

    When ``incremental`` is True and ``resume_content_json`` exists, only re-polish
    affected modules and soft sections instead of regenerating the whole resume.
    """
    guard_lang = _resolve_target_language(state)
    llm = get_resume_generation_llm()
    if edit_instruction:
        instruction = edit_instruction
    elif state.user_message:
        instruction = f"用户修改指令：{state.user_message}"
    else:
        instruction = ""

    use_incremental = (
        incremental
        and state.resume_content_json is not None
    )
    if use_incremental:
        explicit_ids = set(affected_fact_ids or [])
        explicit_sections = set(affected_sections or [])
        # Fall back to full generate if we cannot resolve any target
        fact_ids, sections = resolve_affected_targets(
            state,
            explicit_fact_ids=explicit_ids or None,
            explicit_sections=explicit_sections or None,
        )
        if fact_ids or (sections & (EXPERIENCE_SECTIONS | {"skills", "summary"})):
            parsed = await _incremental_polish_from_existing_async(
                state,
                llm,
                guard_lang=guard_lang,
                edit_instruction=instruction,
                affected_fact_ids=fact_ids,
                affected_sections=sections,
                clarifications=clarifications,
                on_progress=on_progress,
            )
        else:
            use_incremental = False
            parsed = await _generate_resume_from_profile_async(
                state,
                llm,
                guard_lang=guard_lang,
                edit_instruction=instruction,
                on_progress=on_progress,
            )
    else:
        parsed = await _generate_resume_from_profile_async(
            state,
            llm,
            guard_lang=guard_lang,
            edit_instruction=instruction,
            on_progress=on_progress,
        )

    target_lang = normalize_language(guard_lang)
    # Preserve version lineage: _build_resume_from_parsed already bumps from state.resume_content_json
    resume_content = _build_resume_from_parsed(parsed, state, language=target_lang)
    resume_content = _merge_profile_extras_from_candidate(resume_content, state)
    render_config = apply_render_config_for_experience(
        state.render_config,
        resume_content.meta.language,
        resolve_experience_level(state),
    )
    # Prefer prior section_order on incremental updates, but still run resolve
    # so missing sections (e.g. education) are filled and Contact(profile) stays pinned.
    prior_order = None
    if use_incremental and state.render_config and state.render_config.section_order:
        prior_order = list(state.render_config.section_order)
    section_order = resolve_section_order(
        resume_content,
        resume_content.meta.language,
        explicit=prior_order or parsed.section_order or None,
    )
    render_config = render_config.model_copy(update={"section_order": section_order})
    meta = state.meta.model_copy(update={
        "active_resume_content_version": resume_content.meta.version,
        "dirty_flags": state.meta.dirty_flags.model_copy(update={
            "content_dirty": False,
            "render_dirty": True,
            "interview_dirty": True,
            "export_dirty": True,
        })
    })
    return resume_content, render_config, {"meta": meta}


async def content_node_async(state: CopilotState) -> dict[str, Any]:
    """Resume Content Agent 异步节点函数。"""
    logger.info("Resume Content Agent started for session %s", state.session_id)

    intent = state.current_intent
    guard_lang = _resolve_target_language(state)
    llm = get_translation_llm() if intent == "language_convert" else get_resume_generation_llm()

    if intent == "language_convert":
        if state.resume_content_json is None:
            return {
                "workflow_trace": append_trace(
                    state,
                    node="content_agent",
                    status="skipped",
                    input_summary=f"中英文简历互转：{summarize_user_message(state.user_message)}",
                    output_summary="暂无简历内容，无法转换。请先生成或上传简历。",
                ),
            }

        source_lang = normalize_language(state.resume_content_json.meta.language)
        target_lang = normalize_language(state.resume_language_target) if state.resume_language_target else opposite_language(source_lang)
        guard_lang = target_lang

        prompt = RESUME_LANGUAGE_CONVERT_PROMPT.format(
            source_language_label=language_label(source_lang),
            target_language_label=language_label(target_lang),
            target_language=target_lang,
            resume_output_language_instruction=resume_output_language_instruction(target_lang),
            current_resume_json=state.resume_content_json.model_dump_json(indent=2),
            job_json=_job_json_for_prompt(state, compact=False),
            RESUME_PAGE_CONSTRAINTS=resume_constraints_for_state(state),
        )
        try:
            parsed = await _invoke_resume_generation_prompt(
                llm,
                prompt,
                guard_lang,
                stage="content_agent.language_convert",
                session_id=state.session_id,
            )
        except RuntimeError as exc:
            logger.error("Resume Content Agent failed: %s", exc)
            return {
                "workflow_trace": append_trace(
                    state,
                    node="content_agent",
                    status="failed",
                    input_summary=f"中英文简历互转：{summarize_user_message(state.user_message)}",
                    output_summary="简历语言转换失败：模型输出格式异常，请重试。",
                    error=str(exc),
                ),
            }
    elif intent == "content_edit" and state.resume_content_json:
        lang = guard_lang
        prompt = RESUME_SECTION_UPDATE_PROMPT.format(
            RESUME_A4_ONE_PAGE_CONSTRAINTS=resume_constraints_for_state(state),
            RESUME_EXPERIENCE_POLISH_GUIDELINES=RESUME_EXPERIENCE_POLISH_GUIDELINES,
            target_language_label=language_label(lang),
            resume_output_language_instruction=resume_output_language_instruction(lang),
            current_resume_json=state.resume_content_json.model_dump_json(indent=2),
            job_json=_job_json_for_prompt(state, compact=True),
            edit_instruction=state.user_message,
        )
        try:
            parsed = await _invoke_resume_generation_prompt(
                llm,
                prompt,
                guard_lang,
                stage="content_agent.content_edit",
                session_id=state.session_id,
            )
        except RuntimeError as exc:
            logger.error("Resume Content Agent failed: %s", exc)
            return {
                "workflow_trace": append_trace(
                    state,
                    node="content_agent",
                    status="failed",
                    input_summary=f"根据岗位、候选人画像和用户指令生成简历内容：{summarize_user_message(state.user_message)}",
                    output_summary="简历内容生成失败：模型输出格式异常，请重试。",
                    error=str(exc),
                ),
            }
    else:
        edit_instruction = ""
        if intent == "content_edit":
            edit_instruction = f"用户修改指令：{state.user_message}"
        try:
            parsed = await _generate_resume_from_profile_async(
                state,
                llm,
                guard_lang=guard_lang,
                edit_instruction=edit_instruction,
            )
        except RuntimeError as exc:
            logger.error("Resume Content Agent failed: %s", exc)
            return {
                "workflow_trace": append_trace(
                    state,
                    node="content_agent",
                    status="failed",
                    input_summary=f"根据岗位、候选人画像和用户指令生成简历内容：{summarize_user_message(state.user_message)}",
                    output_summary="简历内容生成失败：模型输出格式异常，请重试。",
                    error=str(exc),
                ),
            }

    target_lang = normalize_language(guard_lang)
    logger.info(
        "Resume target language: %s (render_config=%s, chat_output=%s)",
        target_lang,
        state.render_config.language if state.render_config else "-",
        state.chat_output_language or "-",
    )
    resume_content = _build_resume_from_parsed(parsed, state, language=target_lang)
    resume_content = _merge_profile_extras_from_candidate(resume_content, state)

    # A4 optimize: within Skills / within Awards, one-line + trim (sections stay separate)
    if intent == "content_edit" and _wants_a4_skills_awards_compact(state.user_message):
        resume_content, compact_changed = compact_skills_and_awards(resume_content)
        if compact_changed:
            logger.info("A4 optimize: compacted items within skills/awards sections")

    logger.info("Resume content generated v%d, hash=%s, lang=%s",
                resume_content.meta.version, resume_content.meta.content_hash, resume_content.meta.language)

    render_config = apply_render_config_for_experience(
        state.render_config,
        resume_content.meta.language,
        resolve_experience_level(state),
    )
    section_order = resolve_section_order(
        resume_content,
        resume_content.meta.language,
        explicit=parsed.section_order or None,
    )
    render_config = render_config.model_copy(update={"section_order": section_order})

    layout_label = page_limit_label(render_config.page_limit, resume_content.meta.language)
    meta = state.meta.model_copy(update={
        "active_resume_content_version": resume_content.meta.version,
        "dirty_flags": state.meta.dirty_flags.model_copy(update={
            "content_dirty": False,
            "render_dirty": True,
            "interview_dirty": True,
            "export_dirty": True,
        })
    })

    output_summary = f"简历内容已生成（v{resume_content.meta.version}，{language_label(resume_content.meta.language)}，{layout_label}）。"
    if intent == "language_convert":
        output_summary = (
            f"简历已转换为{language_label(resume_content.meta.language)}版本"
            f"（v{resume_content.meta.version}，{layout_label}）。"
        )
    if state.skip_render:
        output_summary += " HTML 预览将在导出时生成。"

    return {
        "resume_content_json": resume_content,
        "render_config": render_config,
        "meta": meta,
        "workflow_trace": append_trace(
            state,
            node="content_agent",
            input_summary=f"根据岗位、候选人画像和用户指令生成简历内容：{summarize_user_message(state.user_message)}",
            output_summary=output_summary,
            artifacts={
                "resume_content_version": resume_content.meta.version,
                "target_role": resume_content.meta.target_role,
                "language": resume_content.meta.language,
                "skill_count": len(resume_content.skills),
                "project_count": len(resume_content.projects),
                "internship_count": len(resume_content.internships),
                "content_hash": resume_content.meta.content_hash,
                "modular_generation": should_use_modular_generation(
                    build_profile_json(state) if state.candidate_profile else ""
                ),
            },
        ),
    }


def content_node(state: CopilotState) -> dict[str, Any]:
    """Resume Content Agent 同步兼容入口。"""
    return asyncio.run(content_node_async(state))


def _wants_a4_skills_awards_compact(message: str) -> bool:
    """True when the user instruction is an A4 / one-page fit optimize request."""
    text = (message or "").lower()
    page_hint = any(token in text for token in (
        "a4", "单页", "一页", "one page", "one-page", "single page", "page limit",
    ))
    if not page_hint:
        return False
    return any(token in text for token in (
        "fit", "optim", "shorten", "compact", "精简", "压缩", "优化", "spacing",
        "skills", "awards",
    ))


async def compress_resume_for_page_limit_async(
    state: CopilotState,
    resume_content: ResumeContent,
    *,
    current_pages: int,
    page_limit: int,
) -> ResumeContent:
    """LLM-compress resume when PDF page count exceeds the allowed limit."""
    from tools.resume_page_policy import resume_constraints_for_state

    llm = get_resume_generation_llm()
    lang = resume_content.meta.language
    prompt = RESUME_PAGE_COMPRESS_PROMPT.format(
        current_pages=current_pages,
        page_limit=page_limit,
        resume_page_constraints=resume_constraints_for_state(state),
        resume_output_language_instruction=resume_output_language_instruction(lang),
        current_resume_json=resume_content.model_dump_json(indent=2),
        job_json=_job_json_for_prompt(state, compact=True),
    )
    parsed = await ainvoke_json_with_language_guard(
        llm,
        prompt,
        ResumeGenerationOutput,
        logger,
        "Resume Page Compress",
        lang,
    )
    compressed = _build_resume_from_parsed(parsed, state, language=resume_content.meta.language)
    return _merge_profile_extras_from_candidate(compressed, state)
