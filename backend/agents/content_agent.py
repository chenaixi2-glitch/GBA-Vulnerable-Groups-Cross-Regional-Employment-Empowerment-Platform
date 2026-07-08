"""Resume Content Agent — 生成/更新 resume_content_json。"""

from __future__ import annotations

import asyncio
import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from agents.json_contracts import ResumeGenerationOutput, ResumeModulePolishOutput
from models.llm import get_llm
from tools.output_language_guard import ainvoke_json_with_language_guard
from prompts.resume_generation import (
    RESUME_GENERATION_PROMPT,
    RESUME_MODULE_SECTION_PROMPT,
    RESUME_SECTION_UPDATE_PROMPT,
)
from prompts.resume_language_convert import RESUME_LANGUAGE_CONVERT_PROMPT
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
    build_relevant_profile_json,
    facts_of_type,
    should_use_modular_generation,
)
from workflow.state import (
    CopilotState, ResumeContent, ResumeProfile, ResumeContentMeta,
    SectionItem, Education, Fact,
)
from workflow.trace import append_trace, summarize_user_message
from log import get_logger

logger = get_logger("agent")

_MODULE_SECTIONS: tuple[tuple[str, str, str], ...] = (
    ("internships", "internship", "实习/工作经历"),
    ("projects", "project", "项目经历"),
)


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
        photo = merged.get("photo_url") or merged.get("photo_data")
        if photo:
            resume_content.profile.extras["photo_url"] = photo
            resume_content.profile.extras["has_photo"] = "true"
        for key in ("age", "gender", "native_place", "political_status"):
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
) -> ResumeGenerationOutput:
    return await ainvoke_json_with_language_guard(
        llm,
        prompt,
        ResumeGenerationOutput,
        logger,
        "Resume Content Agent",
        guard_lang,
    )


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
    )
    return list(parsed.items)


async def _generate_resume_from_profile_async(
    state: CopilotState,
    llm: Any,
    *,
    guard_lang: str,
    edit_instruction: str,
) -> ResumeGenerationOutput:
    job_json = _job_json_for_prompt(state, compact=True)
    profile_json = build_relevant_profile_json(state) if state.candidate_profile else "{}"

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
        return await _invoke_resume_generation_prompt(llm, prompt, guard_lang)

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
    parsed = await _invoke_resume_generation_prompt(llm, prompt, guard_lang)

    for section_key, fact_type, section_label in _MODULE_SECTIONS:
        facts = facts_of_type(state, fact_type)
        if not facts:
            continue
        merged_items: list[Any] = []
        for batch in batch_facts_by_size(facts):
            merged_items.extend(
                await _polish_module_section_async(
                    llm,
                    state=state,
                    guard_lang=guard_lang,
                    job_json=job_json,
                    section_key=section_key,
                    section_label=section_label,
                    facts=batch,
                )
            )
        setattr(parsed, section_key, merged_items)

    return parsed


async def content_node_async(state: CopilotState) -> dict[str, Any]:
    """Resume Content Agent 异步节点函数。"""
    logger.info("Resume Content Agent started for session %s", state.session_id)

    intent = state.current_intent
    llm = get_llm()
    guard_lang = _resolve_target_language(state)

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
            parsed = await _invoke_resume_generation_prompt(llm, prompt, guard_lang)
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
            parsed = await _invoke_resume_generation_prompt(llm, prompt, guard_lang)
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
                    build_relevant_profile_json(state) if state.candidate_profile else ""
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

    llm = get_llm()
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
