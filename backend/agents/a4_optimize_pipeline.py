"""Dedicated A4 one-page optimize pipeline (no content_agent / chat).

Order:
  1) Compact Skills / Awards (deterministic)
  2) Measure PDF pages at current baseline typography
  3) If over limit → tighten typography ladder until fit or tightest
  4) If still over → LLM compress (experience etc.), re-fit typography
"""

from __future__ import annotations

import hashlib
import time
from datetime import datetime, timezone
from typing import Any

from agents.content_agent import (
    _merge_profile_extras_from_candidate,
    compress_resume_for_page_limit_async,
)
from tools.resume_compact_layout import compact_skills_and_awards
from tools.resume_export import count_pdf_pages_from_html
from tools.resume_page_policy import (
    apply_render_config_for_experience,
    page_limit_label,
    resolve_experience_level,
    resolve_page_limit,
)
from tools.resume_layout import normalize_language
from tools.template_renderer import render_resume_html
from tools.typography_ladder import (
    apply_typography_step,
    fit_typography_to_page_limit,
    initial_step_index,
    normalize_typography_fit_mode,
)
from workflow.state import CopilotState, ResumeHtml
from workflow.trace import append_trace
from log import get_logger, elapsed_ms, log_stage_timing

logger = get_logger("agent")

_MAX_PAGE_FIT_ATTEMPTS = 2


def _measure_pages(resume_content, render_config) -> tuple[str, int | None]:
    html = render_resume_html(resume_content, render_config)
    return html, count_pdf_pages_from_html(html)


def _baseline_config(render_config):
    mode = normalize_typography_fit_mode(render_config.typography_fit_mode)
    return apply_typography_step(render_config, initial_step_index(mode))


async def run_a4_optimize_pipeline(state: CopilotState) -> dict[str, Any]:
    """Run Skills → page check → typography → experience compress. No content_agent."""
    t0 = time.perf_counter()
    if state.resume_content_json is None:
        return {
            "workflow_trace": append_trace(
                state,
                node="a4_optimize",
                status="skipped",
                input_summary="A4 optimize",
                output_summary="暂无简历内容，无法优化。",
            ),
        }

    lang = normalize_language(
        state.resume_content_json.meta.language or state.render_config.language
    )
    render_config = apply_render_config_for_experience(
        state.render_config,
        lang,
        resolve_experience_level(state),
    )
    page_limit = render_config.page_limit or resolve_page_limit(state)
    layout_label = page_limit_label(page_limit, lang)

    resume_content = _merge_profile_extras_from_candidate(
        state.resume_content_json.model_copy(deep=True),
        state,
    )

    steps: list[str] = []
    skills_compacted = False
    typography_steps = 0
    compress_attempts = 0
    pages_after_skills: int | None = None

    # 1) Skills / Awards compact first
    resume_content, skills_compacted = compact_skills_and_awards(resume_content)
    if skills_compacted:
        steps.append("skills_awards_compact")
        logger.info("A4 pipeline: compacted skills/awards")

    # 2) Measure at baseline typography (before tightening)
    baseline = _baseline_config(render_config)
    html_str, page_count = _measure_pages(resume_content, baseline)
    render_config = baseline
    pages_after_skills = page_count
    steps.append("page_check_after_skills")
    logger.info(
        "A4 pipeline: after skills compact, PDF pages=%s (limit=%d)",
        page_count,
        page_limit,
    )

    # 3) Typography: prefer looser when already fits; tighten toward tightest when over
    render_config, html_str, page_count, typography_steps = fit_typography_to_page_limit(
        render_config=render_config,
        page_limit=page_limit,
        count_pages=count_pdf_pages_from_html,
        render_html=lambda cfg: render_resume_html(resume_content, cfg),
    )
    if typography_steps > 0:
        steps.append("typography_fit")

    # 4) Still over → LLM compress experience (and re-fit typography each round)
    while (
        page_count is not None
        and page_count > page_limit
        and compress_attempts < _MAX_PAGE_FIT_ATTEMPTS
    ):
        compress_attempts += 1
        logger.info(
            "A4 pipeline: still %d pages (limit %d) — experience compress attempt %d",
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
            steps.append(f"experience_compress_{compress_attempts}")
        except RuntimeError as exc:
            logger.warning("A4 pipeline: page-limit compression failed: %s", exc)
            break

        # Keep skills compact after LLM rewrite
        resume_content, again = compact_skills_and_awards(resume_content)
        if again:
            skills_compacted = True
            steps.append("skills_awards_recompact")

        render_config, html_str, page_count, more_typo = fit_typography_to_page_limit(
            render_config=render_config,
            page_limit=page_limit,
            count_pages=count_pdf_pages_from_html,
            render_html=lambda cfg: render_resume_html(resume_content, cfg),
        )
        typography_steps += more_typo

    checksum = hashlib.sha256(html_str.encode()).hexdigest()[:16]
    content_changed = skills_compacted or compress_attempts > 0
    if content_changed:
        meta_update = {
            "version": resume_content.meta.version + 1,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        resume_content = resume_content.model_copy(
            update={"meta": resume_content.meta.model_copy(update=meta_update)}
        )

    resume_html = ResumeHtml(
        html=html_str,
        version=state.resume_html.version + 1,
        derived_from_content_version=resume_content.meta.version,
        derived_from_render_version=render_config.version,
        updated_at=datetime.now(timezone.utc).isoformat(),
        checksum=checksum,
    )

    fitted = page_count is not None and page_count <= page_limit
    if fitted:
        msg = f"简历已优化至 {page_count} 页（上限 {page_limit} 页，{layout_label}）。"
    else:
        msg = (
            f"简历已尽量优化；PDF 仍为 {page_count or '?'} 页，"
            f"超出 {page_limit} 页上限（{layout_label}）。"
        )

    meta = state.meta.model_copy(update={
        "active_resume_content_version": resume_content.meta.version,
        "active_render_version": render_config.version,
        "active_html_version": resume_html.version,
        "dirty_flags": state.meta.dirty_flags.model_copy(update={
            "content_dirty": content_changed,
            "render_dirty": False,
            "export_dirty": True,
        }),
    })

    log_stage_timing(
        logger,
        "a4_optimize.pipeline",
        elapsed_ms(t0),
        session_id=state.session_id,
        pdf_pages=page_count,
        pages_after_skills=pages_after_skills,
        compress_attempts=compress_attempts,
        typography_steps=typography_steps,
        skills_compacted=skills_compacted,
    )

    result: dict[str, Any] = {
        "resume_content_json": resume_content,
        "render_config": render_config,
        "resume_html": resume_html,
        "meta": meta,
        "reply_message": msg,
        "triggered_agents": ["a4_optimize"],
        "workflow_trace": append_trace(
            state,
            node="a4_optimize",
            input_summary="Optimize resume for one A4 page (dedicated pipeline)",
            output_summary=msg,
            artifacts={
                "page_limit": page_limit,
                "pdf_page_count": page_count,
                "pages_after_skills": pages_after_skills,
                "skills_compacted": skills_compacted,
                "typography_fit_steps": typography_steps,
                "page_compress_attempts": compress_attempts,
                "pipeline_steps": steps,
                "fitted": fitted,
                "checksum": checksum,
            },
        ),
    }
    return result
