"""Resume Content Agent — 生成/更新 resume_content_json。"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from typing import Any

from agents.json_contracts import (
    ResumeEducationTranslateOutput,
    ResumeGenerationOutput,
    ResumeModulePolishOutput,
    ResumeModuleTranslateOutput,
    ResumeSectionItemOutput,
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
)
from prompts.resume_language_convert import RESUME_LANGUAGE_CONVERT_PROMPT
from prompts.resume_module_translate import (
    RESUME_EDUCATION_TRANSLATE_PROMPT,
    RESUME_MODULE_TRANSLATE_PROMPT,
)
from prompts.resume_constraints import RESUME_PAGE_COMPRESS_PROMPT, RESUME_EXPERIENCE_POLISH_GUIDELINES
from tools.resume_page_policy import (
    apply_render_config_for_experience,
    page_limit_label,
    resolve_experience_level,
    resume_constraints_for_state,
)
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
    facts_of_type,
    should_use_modular_generation,
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


def _placeholder_item_from_fact(fact: Fact, *, placeholder: str) -> ResumeSectionItemOutput:
    return ResumeSectionItemOutput(
        id=fact.id,
        title=extract_fact_title(fact),
        content=placeholder,
        source_refs=[fact.id],
    )


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


def _build_resume_from_parsed(
    parsed: ResumeGenerationOutput,
    state: CopilotState,
    *,
    language: str | None = None,
) -> ResumeContent:
    """从 LLM 返回的 JSON 构建 ResumeContent 对象。"""
    now = datetime.now(timezone.utc).isoformat()
    lang = normalize_language(language or parsed.language or _resolve_target_language(state))

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
) -> list[Any]:
    if not facts:
        return []
    t0 = time.perf_counter()
    facts_json = json.dumps([fact.model_dump() for fact in facts], ensure_ascii=False, indent=2)
    prompt = RESUME_MODULE_SECTION_PROMPT.format(
        section_label=section_label,
        target_language=guard_lang,
        target_language_label=language_label(guard_lang),
        resume_output_language_instruction=resume_output_language_instruction(guard_lang),
        RESUME_A4_ONE_PAGE_CONSTRAINTS=resume_constraints_for_state(state),
        RESUME_EXPERIENCE_POLISH_GUIDELINES=RESUME_EXPERIENCE_POLISH_GUIDELINES,
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
    log_stage_timing(
        logger,
        f"content_agent.polish.{section_key}",
        elapsed_ms(t0),
        session_id=state.session_id,
        facts=len(facts),
    )
    return list(parsed.items)


def _fact_for_module(
    state: CopilotState,
    *,
    module_id: str,
    module_type: str,
    title: str,
    content: str,
    fields: dict[str, Any] | None = None,
) -> Fact:
    if state.candidate_profile:
        for fact in state.candidate_profile.facts:
            if fact.id == module_id:
                return fact
    if fields:
        payload = fields_to_fact_content(module_type, fields)
    else:
        payload = json.dumps({"title": title, "content": content}, ensure_ascii=False)
    return Fact(
        id=module_id,
        type=module_type,
        content=payload or json.dumps({"title": title, "content": content}, ensure_ascii=False),
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

    logger.info("Modular resume generation: profile_json len=%d", len(profile_json))
    skeleton_instruction = (
        f"{edit_instruction}\n\n"
        "【分步生成-第1步】仅生成 profile、summary、skills、awards、papers、section_order；"
        "internships 与 projects 必须返回空数组 []。"
    ).strip()
    prompt = RESUME_GENERATION_PROMPT.format(
        target_language=guard_lang,
        target_language_label=language_label(guard_lang),
        resume_output_language_instruction=resume_output_language_instruction(guard_lang),
        RESUME_A4_ONE_PAGE_CONSTRAINTS=resume_constraints_for_state(state),
        RESUME_EXPERIENCE_POLISH_GUIDELINES=RESUME_EXPERIENCE_POLISH_GUIDELINES,
        job_json=job_json,
        profile_json=profile_json,
        edit_instruction=skeleton_instruction,
    )
    parsed = await _invoke_resume_generation_prompt(
        llm,
        prompt,
        guard_lang,
        stage="content_agent.generate.skeleton",
        session_id=state.session_id,
    )

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
                ),
            ))

    if polish_specs and on_progress is not None:
        placeholder = polish_placeholder_for_language(guard_lang)
        pending_fact_ids = {fact.id for _, batch, _ in polish_specs for fact in batch}
        placeholders_by_section: dict[str, list[ResumeSectionItemOutput]] = {
            key: [] for key, _, _ in _MODULE_SECTIONS
        }
        for section_key, batch, _ in polish_specs:
            placeholders_by_section[section_key].extend(
                _placeholder_item_from_fact(fact, placeholder=placeholder) for fact in batch
            )
        for section_key, items in placeholders_by_section.items():
            if items:
                setattr(parsed, section_key, items)
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
        for task in asyncio.as_completed(task_map.keys()):
            section_key, batch = task_map[task]
            items = await task
            completed_batches += 1
            batch_fact_ids = {fact.id for fact in batch}
            pending_fact_ids -= batch_fact_ids
            current_items = list(getattr(parsed, section_key, []) or [])
            merged_items = _merge_polished_items(
                current_items,
                items,
                pending_fact_ids=batch_fact_ids,
            )
            setattr(parsed, section_key, merged_items)
            await on_progress(parsed, {
                "phase": "module_polished",
                "section_key": section_key,
                "completed_fact_ids": sorted(batch_fact_ids),
                "pending_fact_ids": sorted(pending_fact_ids),
                "completed_batches": completed_batches,
                "total_batches": len(polish_specs),
            })
        log_stage_timing(
            logger,
            "content_agent.generate.polish_parallel",
            elapsed_ms(polish_t0),
            session_id=state.session_id,
            batches=len(polish_specs),
        )
    elif polish_specs:
        polish_t0 = time.perf_counter()
        polish_results = await asyncio.gather(*[coro for _, _, coro in polish_specs])
        log_stage_timing(
            logger,
            "content_agent.generate.polish_parallel",
            elapsed_ms(polish_t0),
            session_id=state.session_id,
            batches=len(polish_specs),
        )
        merged_by_section: dict[str, list[Any]] = {key: [] for key, _, _ in _MODULE_SECTIONS}
        for (section_key, _, _), items in zip(polish_specs, polish_results):
            merged_by_section[section_key].extend(items)
        for section_key, _, _ in _MODULE_SECTIONS:
            items = merged_by_section.get(section_key, [])
            if items:
                setattr(parsed, section_key, items)
    elif on_progress is not None:
        await on_progress(parsed, {"phase": "skeleton_complete", "pending_fact_ids": []})

    return parsed


async def generate_resume_content_with_progress(
    state: CopilotState,
    *,
    edit_instruction: str = "",
    on_progress: PolishProgressCallback | None = None,
) -> tuple[ResumeContent, RenderConfig, dict[str, Any]]:
    """Generate resume content; optionally emit partial results after each polish batch."""
    guard_lang = _resolve_target_language(state)
    llm = get_resume_generation_llm()
    if edit_instruction:
        instruction = edit_instruction
    elif state.user_message:
        instruction = f"用户修改指令：{state.user_message}"
    else:
        instruction = ""
    parsed = await _generate_resume_from_profile_async(
        state,
        llm,
        guard_lang=guard_lang,
        edit_instruction=instruction,
        on_progress=on_progress,
    )
    target_lang = normalize_language(guard_lang)
    resume_content = _build_resume_from_parsed(parsed, state, language=target_lang)
    resume_content = _merge_profile_extras_from_candidate(resume_content, state)
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
