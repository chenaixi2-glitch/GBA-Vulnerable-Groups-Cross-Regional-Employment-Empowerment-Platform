"""Preview/export render must fit via spacing, not rewrite skills text."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

from agents.render_agent import _fit_resume_to_page_limit_async, render_node_async
from workflow.state import CopilotState, RenderConfig, ResumeContent, ResumeContentMeta, SectionItem


def _content() -> ResumeContent:
    return ResumeContent(
        skills=[SectionItem(id="s1", title="Languages", content="Python\nTypeScript\nGo")],
        meta=ResumeContentMeta(language="en", version=1),
    )


def test_preview_fit_skips_skills_compact_when_over_page():
    state = CopilotState(session_id="s-preview", resume_content_json=_content())
    content = _content()
    cfg = RenderConfig(page_limit=1, language="en")

    def _fake_fit(*, render_config, page_limit, count_pages, render_html):
        html = render_html(render_config)
        return render_config, html, 2, 1  # still over limit after typography

    with patch("agents.render_agent.fit_typography_to_page_limit", side_effect=_fake_fit), \
         patch("agents.render_agent.compact_skills_and_awards") as compact_mock, \
         patch("agents.render_agent.compress_resume_for_page_limit_async", new_callable=AsyncMock) as compress_mock, \
         patch("agents.render_agent.render_resume_html", return_value="<html></html>"):
        out_content, _html, _cfg, pages, compress_n, _typo, compact_applied = asyncio.run(
            _fit_resume_to_page_limit_async(
                state,
                content,
                cfg,
                allow_content_fit=False,
            )
        )

    compact_mock.assert_not_called()
    compress_mock.assert_not_called()
    assert pages == 2
    assert compress_n == 0
    assert compact_applied is False
    assert out_content.skills[0].content == "Python\nTypeScript\nGo"


def test_a4_fit_compacts_skills_before_typography():
    """Skills/awards compact must run before typography when content fit is allowed."""
    state = CopilotState(session_id="s-a4", resume_content_json=_content())
    content = _content()
    cfg = RenderConfig(page_limit=1, language="en")
    call_order: list[str] = []

    def _fake_compact(resume):
        call_order.append("compact")
        return resume, True

    def _fake_fit(*, render_config, page_limit, count_pages, render_html):
        call_order.append("typography")
        html = render_html(render_config)
        return render_config, html, 1, 1

    with patch("agents.render_agent.compact_skills_and_awards", side_effect=_fake_compact), \
         patch("agents.render_agent.fit_typography_to_page_limit", side_effect=_fake_fit), \
         patch("agents.render_agent.compress_resume_for_page_limit_async", new_callable=AsyncMock) as compress_mock, \
         patch("agents.render_agent.render_resume_html", return_value="<html></html>"):
        _out, _html, _cfg, pages, compress_n, _typo, compact_applied = asyncio.run(
            _fit_resume_to_page_limit_async(
                state,
                content,
                cfg,
                allow_content_fit=True,
            )
        )

    assert call_order == ["compact", "typography"]
    compress_mock.assert_not_called()
    assert pages == 1
    assert compress_n == 0
    assert compact_applied is True


def test_graph_default_disables_content_fit_unless_a4_optimize():
    state = CopilotState(
        session_id="s-gen",
        current_intent="upload_jd",
        user_message="Generate a customized resume for the target role.",
        resume_content_json=_content(),
    )

    with patch("agents.render_agent._fit_resume_to_page_limit_async", new_callable=AsyncMock) as fit_mock:
        fit_mock.return_value = (
            state.resume_content_json,
            "<html>ok</html>",
            state.render_config,
            1,
            0,
            0,
            False,
        )
        asyncio.run(render_node_async(state))
        assert fit_mock.await_args.kwargs["allow_content_fit"] is False

    opt_state = CopilotState(
        session_id="s-opt",
        current_intent="content_edit",
        user_message="Optimize my resume for the target job so it fits on one A4 page.",
        resume_content_json=_content(),
    )
    with patch("agents.render_agent._fit_resume_to_page_limit_async", new_callable=AsyncMock) as fit_mock:
        fit_mock.return_value = (
            opt_state.resume_content_json,
            "<html>ok</html>",
            opt_state.render_config,
            1,
            0,
            0,
            False,
        )
        asyncio.run(render_node_async(opt_state))
        assert fit_mock.await_args.kwargs["allow_content_fit"] is True
