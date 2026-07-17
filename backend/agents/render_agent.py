"""Resume Render Agent — 渲染配置更新 + HTML 生成 + PDF 页数检测与压缩。"""

from __future__ import annotations

import asyncio
import hashlib
import time
from datetime import datetime, timezone
from typing import Any

from agents.content_agent import (
    _merge_profile_extras_from_candidate,
    _wants_a4_skills_awards_compact,
    compress_resume_for_page_limit_async,
)
from agents.json_contracts import RenderInstructionOutput
from models.llm import get_llm, ainvoke_json_with_schema
from prompts.render_instruction import RENDER_INSTRUCTION_PROMPT
from tools.resume_compact_layout import compact_skills_and_awards
from tools.resume_export import count_pdf_pages_from_html
from tools.template_renderer import render_resume_html
from tools.resume_page_policy import (
    apply_render_config_for_experience,
    page_limit_label,
    resolve_experience_level,
    resolve_page_limit,
)
from tools.resume_layout import normalize_language
from tools.typography_ladder import fit_typography_to_page_limit
from workflow.state import CopilotState, RenderConfig, ResumeHtml, PageMargin
from workflow.trace import append_trace, summarize_user_message
from log import get_logger, elapsed_ms, log_stage_timing

logger = get_logger("agent")

_MAX_PAGE_FIT_ATTEMPTS = 2


async def _update_render_config_from_llm_async(state: CopilotState) -> RenderConfig:
    """异步解析渲染指令并更新配置。"""
    t0 = time.perf_counter()
    prompt = RENDER_INSTRUCTION_PROMPT.format(
        current_render_config=state.render_config.model_dump_json(indent=2),
        render_instruction=state.user_message,
    )
    llm = get_llm()
    parsed = await ainvoke_json_with_schema(llm, prompt, RenderInstructionOutput, logger, "Resume Render Agent")

    margin_data = parsed.page_margin
    page_limit = state.render_config.page_limit or resolve_page_limit(state)
    new_config = RenderConfig(
        template_id=parsed.template_id or state.render_config.template_id,
        theme=parsed.theme or state.render_config.theme,
        language=normalize_language(parsed.language or state.render_config.language),
        font_family=parsed.font_family or state.render_config.font_family,
        font_size=parsed.font_size,
        line_height=parsed.line_height,
        page_margin=PageMargin(
            top=margin_data.top,
            right=margin_data.right,
            bottom=margin_data.bottom,
            left=margin_data.left,
        ),
        section_order=parsed.section_order or state.render_config.section_order,
        dense_mode=parsed.dense_mode,
        accent_style=parsed.accent_style or state.render_config.accent_style,
        visibility_map=parsed.visibility_map or state.render_config.visibility_map,
        layout_mode=parsed.layout_mode or state.render_config.layout_mode,
        spacing_scale=parsed.spacing_scale or state.render_config.spacing_scale,
        page_limit=page_limit,
        version=state.render_config.version + 1,
        last_render_reason=parsed.last_render_reason or state.user_message,
    )
    log_stage_timing(
        logger,
        "render_agent.config_llm",
        elapsed_ms(t0),
        session_id=state.session_id,
    )
    return new_config


async def _fit_resume_to_page_limit_async(
    state: CopilotState,
    resume_content,
    render_config: RenderConfig,
    *,
    allow_content_fit: bool = True,
) -> tuple[Any, str, RenderConfig, int | None, int, int, bool]:
    """Render HTML and fit to page limit.

    When ``allow_content_fit`` is True (Optimize A4):
      1) compact skills/awards text
      2) tighten typography/spacing
      3) LLM-compress (e.g. experience) if still over
    Preview/export pass ``allow_content_fit=False`` → typography only, editor text unchanged.
    """
    fit_t0 = time.perf_counter()
    page_limit = render_config.page_limit or resolve_page_limit(state)
    compress_attempts = 0
    typography_steps = 0
    layout_compact_applied = False

    # Skills/Awards compact must run before typography so spacing is measured on compacted text.
    if allow_content_fit:
        compact_content, changed = compact_skills_and_awards(resume_content)
        if changed:
            logger.info(
                "A4 fit: compacting items within skills/awards before typography (page_limit=%d)",
                page_limit,
            )
            resume_content = compact_content
            layout_compact_applied = True

    while True:
        render_config, html_str, page_count, steps_used = fit_typography_to_page_limit(
            render_config=render_config,
            page_limit=page_limit,
            count_pages=count_pdf_pages_from_html,
            render_html=lambda cfg: render_resume_html(resume_content, cfg),
        )
        typography_steps += steps_used

        if page_count is None or page_count <= page_limit:
            break

        # Preview/export: spacing & font only — never rewrite body text.
        if not allow_content_fit:
            logger.info(
                "Resume PDF is %d pages (limit %d) — content fit disabled, keeping editor text",
                page_count,
                page_limit,
            )
            break

        if compress_attempts >= _MAX_PAGE_FIT_ATTEMPTS:
            break

        compress_attempts += 1
        logger.info(
            "Resume PDF is %d pages (limit %d), typography exhausted — compress attempt %d",
            page_count,
            page_limit,
            compress_attempts,
        )
        try:
            resume_content = await compress_resume_for_page_limit_async(
                state,
                resume_content,
                current_pages=page_count,
                page_limit=page_limit,
            )
        except RuntimeError as exc:
            logger.warning("Page-limit compression failed: %s", exc)
            break

    if typography_steps > 0:
        logger.info(
            "Typography ladder applied (%d evaluations, mode=%s, font=%d, margin=%d)",
            typography_steps,
            render_config.typography_fit_mode,
            render_config.font_size,
            render_config.page_margin.top,
        )

    log_stage_timing(
        logger,
        "render_agent.page_fit",
        elapsed_ms(fit_t0),
        session_id=state.session_id,
        pdf_pages=page_count,
        compress_attempts=compress_attempts,
        typography_steps=typography_steps,
        layout_compact=layout_compact_applied,
        allow_content_fit=allow_content_fit,
    )

    return (
        resume_content,
        html_str,
        render_config,
        page_count,
        compress_attempts,
        typography_steps,
        layout_compact_applied,
    )


async def render_node_async(
    state: CopilotState,
    *,
    allow_content_fit: bool | None = None,
) -> dict[str, Any]:
    """Resume Render Agent 异步节点函数。

    Content rewriting (skills/awards compact + LLM compress) only runs when
    ``allow_content_fit`` is True. Preview/export pass False. Graph default is
    True only for explicit A4/one-page optimize content_edit requests.
    """
    if allow_content_fit is None:
        allow_content_fit = (
            state.current_intent == "content_edit"
            and _wants_a4_skills_awards_compact(state.user_message or "")
        )

    logger.info(
        "Resume Render Agent started for session %s (allow_content_fit=%s)",
        state.session_id,
        allow_content_fit,
    )

    intent = state.current_intent
    render_config = state.render_config

    if intent == "render_edit":
        try:
            render_config = await _update_render_config_from_llm_async(state)
        except RuntimeError as exc:
            logger.error("Resume Render Agent failed: %s", exc)
            return {
                "workflow_trace": append_trace(
                    state,
                    node="render_agent",
                    status="failed",
                    input_summary=f"解析渲染指令：{summarize_user_message(state.user_message)}",
                    output_summary="渲染配置解析失败：模型输出格式异常，请重试。",
                    error=str(exc),
                ),
            }
        logger.info("Render config updated to v%d", render_config.version)
    else:
        lang = normalize_language(
            (state.resume_content_json.meta.language if state.resume_content_json else None)
            or state.render_config.language
        )
        render_config = apply_render_config_for_experience(
            state.render_config,
            lang,
            resolve_experience_level(state),
        )
        if intent in ("language_convert", "content_edit") or state.current_intent == "upload_jd":
            layout_label = page_limit_label(render_config.page_limit, lang)
            render_config = render_config.model_copy(update={
                "last_render_reason": f"内容更新触发渲染（{layout_label}）",
            })

    resume_content = state.resume_content_json
    if resume_content is not None:
        resume_content = _merge_profile_extras_from_candidate(
            resume_content.model_copy(deep=True),
            state,
        )
    if resume_content is None:
        return {
            "render_config": render_config,
            "workflow_trace": append_trace(
                state,
                node="render_agent",
                status="skipped",
                input_summary=f"准备渲染简历：{summarize_user_message(state.user_message)}",
                output_summary="暂无简历内容，无法渲染。",
                artifacts={"render_config_version": render_config.version},
            ),
        }

    (
        resume_content,
        html_str,
        render_config,
        page_count,
        compress_attempts,
        typography_steps,
        layout_compact_applied,
    ) = await _fit_resume_to_page_limit_async(
        state,
        resume_content,
        render_config,
        allow_content_fit=allow_content_fit,
    )
    checksum = hashlib.sha256(html_str.encode()).hexdigest()[:16]

    resume_html = ResumeHtml(
        html=html_str,
        version=state.resume_html.version + 1,
        derived_from_content_version=resume_content.meta.version,
        derived_from_render_version=render_config.version,
        updated_at=datetime.now(timezone.utc).isoformat(),
        checksum=checksum,
    )

    logger.info(
        "HTML rendered v%d (checksum=%s, pdf_pages=%s, compress_attempts=%d, typography_steps=%d, layout_compact=%s, allow_content_fit=%s)",
        resume_html.version,
        checksum,
        page_count,
        compress_attempts,
        typography_steps,
        layout_compact_applied,
        allow_content_fit,
    )

    content_changed = compress_attempts > 0 or layout_compact_applied
    meta = state.meta.model_copy(update={
        "active_render_version": render_config.version,
        "active_html_version": resume_html.version,
        "dirty_flags": state.meta.dirty_flags.model_copy(update={
            "render_dirty": False,
            "export_dirty": True,
            "content_dirty": content_changed,
        }),
    })

    page_limit = render_config.page_limit or resolve_page_limit(state)
    layout_label = page_limit_label(page_limit, render_config.language)
    msg = "简历已渲染。"
    if compress_attempts > 0 or layout_compact_applied:
        if page_count is not None and page_count <= page_limit:
            detail = "已精简技能/奖项条目并压缩" if layout_compact_applied else "已自动压缩"
            msg = f"简历已渲染并{detail}至 {page_count} 页（上限 {page_limit} 页，{layout_label}）。"
        else:
            msg = f"简历已渲染；PDF 仍为 {page_count or '?'} 页，超出 {page_limit} 页上限，建议手动优化。"
    elif not allow_content_fit and page_count is not None and page_count > page_limit:
        msg = (
            f"简历已渲染（PDF {page_count} 页，超出 {page_limit} 页上限，{layout_label}）；"
            f"已优先调整字号与边距，正文未改写。如需压至一页请点击「优化（A4）」。"
        )
    elif typography_steps > 0 and page_count is not None:
        msg = f"简历已渲染（PDF {page_count} 页，{layout_label}，已自动调整字号与边距）。"
    elif page_count is not None:
        msg = f"简历已渲染（PDF {page_count} 页，{layout_label}）。"
    if intent == "render_edit":
        msg = f"渲染配置已更新，{msg}"

    result: dict[str, Any] = {
        "render_config": render_config,
        "resume_html": resume_html,
        "meta": meta,
        "workflow_trace": append_trace(
            state,
            node="render_agent",
            input_summary=f"生成简历 HTML：{summarize_user_message(state.user_message)}",
            output_summary=msg,
            artifacts={
                "render_config_version": render_config.version,
                "resume_html_version": resume_html.version,
                "derived_from_content_version": resume_html.derived_from_content_version,
                "layout_mode": render_config.layout_mode,
                "template_id": render_config.template_id,
                "page_limit": page_limit,
                "pdf_page_count": page_count,
                "page_compress_attempts": compress_attempts,
                "layout_compact_applied": layout_compact_applied,
                "typography_fit_steps": typography_steps,
                "typography_fit_mode": render_config.typography_fit_mode,
                "checksum": resume_html.checksum,
            },
        ),
    }
    if content_changed:
        result["resume_content_json"] = resume_content
    return result


def render_node(state: CopilotState) -> dict[str, Any]:
    """Resume Render Agent 同步兼容入口。"""
    return asyncio.run(render_node_async(state))
