"""Tests for dedicated A4 optimize pipeline (no content_agent)."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

from agents.a4_optimize_pipeline import run_a4_optimize_pipeline
from workflow.state import (
    CopilotState,
    RenderConfig,
    ResumeContent,
    ResumeContentMeta,
    SectionItem,
)


def _content() -> ResumeContent:
    return ResumeContent(
        skills=[SectionItem(id="s1", title="Languages", content="Python\nTypeScript\nGo")],
        awards=[SectionItem(id="a1", title="Dean List", content="2024\nGPA award")],
        internships=[
            SectionItem(
                id="i1",
                title="Intern",
                content="- Built APIs\n- Wrote tests\n- Deployed services",
            )
        ],
        meta=ResumeContentMeta(language="en", version=1),
    )


def test_a4_pipeline_order_skills_then_page_check_then_typography_then_compress():
    state = CopilotState(
        session_id="s-a4",
        resume_content_json=_content(),
        render_config=RenderConfig(page_limit=1, language="en"),
    )
    call_order: list[str] = []
    pages_seq = {"n": 0}

    def _fake_compact(resume):
        call_order.append("compact")
        return resume, True

    def _fake_count(_html: str):
        # After skills: still over; after typography still over; after compress: fit
        pages_seq["n"] += 1
        return 2 if pages_seq["n"] < 4 else 1

    def _fake_fit(*, render_config, page_limit, count_pages, render_html):
        call_order.append("typography")
        html = render_html(render_config)
        pages = count_pages(html)
        return render_config, html, pages, 2

    async def _fake_compress(state, resume_content, *, current_pages, page_limit):
        call_order.append("experience_compress")
        return resume_content

    with patch("agents.a4_optimize_pipeline.compact_skills_and_awards", side_effect=_fake_compact), \
         patch("agents.a4_optimize_pipeline.count_pdf_pages_from_html", side_effect=_fake_count), \
         patch("agents.a4_optimize_pipeline.render_resume_html", return_value="<html></html>"), \
         patch("agents.a4_optimize_pipeline.fit_typography_to_page_limit", side_effect=_fake_fit), \
         patch(
             "agents.a4_optimize_pipeline.compress_resume_for_page_limit_async",
             side_effect=_fake_compress,
         ):
        result = asyncio.run(run_a4_optimize_pipeline(state))

    assert "skills_awards_compact" in result["workflow_trace"][-1].artifacts["pipeline_steps"]
    assert "page_check_after_skills" in result["workflow_trace"][-1].artifacts["pipeline_steps"]
    # First compact (skills), then measure uses count (page check), then typography, then compress
    assert call_order[0] == "compact"
    assert "typography" in call_order
    assert "experience_compress" in call_order
    assert call_order.index("typography") < call_order.index("experience_compress")
    assert result["triggered_agents"] == ["a4_optimize"]
    assert result["resume_html"].html
    assert result["resume_content_json"] is not None


def test_a4_pipeline_skips_experience_compress_when_fits_after_skills():
    state = CopilotState(
        session_id="s-fit",
        resume_content_json=_content(),
        render_config=RenderConfig(page_limit=1, language="en"),
    )

    with patch("agents.a4_optimize_pipeline.compact_skills_and_awards", return_value=(_content(), True)), \
         patch("agents.a4_optimize_pipeline.count_pdf_pages_from_html", return_value=1), \
         patch("agents.a4_optimize_pipeline.render_resume_html", return_value="<html>ok</html>"), \
         patch(
             "agents.a4_optimize_pipeline.fit_typography_to_page_limit",
             side_effect=lambda **kw: (kw["render_config"], "<html>ok</html>", 1, 1),
         ), \
         patch(
             "agents.a4_optimize_pipeline.compress_resume_for_page_limit_async",
             new_callable=AsyncMock,
         ) as compress_mock:
        result = asyncio.run(run_a4_optimize_pipeline(state))

    compress_mock.assert_not_called()
    artifacts = result["workflow_trace"][-1].artifacts
    assert artifacts["pages_after_skills"] == 1
    assert artifacts["page_compress_attempts"] == 0
    assert artifacts["fitted"] is True


def test_typography_settles_on_tightest_when_still_over():
    from tools.typography_ladder import TYPOGRAPHY_LADDER, fit_typography_to_page_limit
    from workflow.state import PageMargin, RenderConfig

    cfg = RenderConfig(
        font_size=13,
        line_height=1.35,
        page_limit=1,
        typography_fit_mode="auto",
        page_margin=PageMargin(top=20, right=20, bottom=20, left=20),
    )
    seen: list[int] = []

    def render_html(c):
        # Track font size as proxy for step tightness
        seen.append(c.font_size)
        return f"<html>{c.font_size}</html>"

    def count_pages(_html: str) -> int:
        return 2  # always over

    best, _html, pages, steps = fit_typography_to_page_limit(
        render_config=cfg,
        page_limit=1,
        count_pages=count_pages,
        render_html=render_html,
    )
    assert pages == 2
    assert steps >= len(TYPOGRAPHY_LADDER) - 2  # baseline + tighter steps
    # Tightest step should win when never fitting
    from tools.typography_ladder import apply_typography_step, BASELINE_STEP_INDEX
    tightest = apply_typography_step(cfg, len(TYPOGRAPHY_LADDER) - 1)
    assert best.font_size == tightest.font_size
