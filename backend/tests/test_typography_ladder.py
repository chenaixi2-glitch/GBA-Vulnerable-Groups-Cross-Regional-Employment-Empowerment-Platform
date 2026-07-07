"""Tests for typography ladder page fitting."""

from __future__ import annotations

from tools.typography_ladder import (
    BASELINE_STEP_INDEX,
    TYPOGRAPHY_LADDER,
    apply_typography_step,
    fit_typography_to_page_limit,
    initial_step_index,
    normalize_typography_fit_mode,
)
from workflow.state import RenderConfig, PageMargin


def _base_config(**kwargs) -> RenderConfig:
  return RenderConfig(
      font_size=13,
      line_height=1.35,
      dense_mode=True,
      spacing_scale="compact",
      page_margin=PageMargin(top=20, right=20, bottom=20, left=20),
      **kwargs,
  )


class TestNormalizeTypographyFitMode:
    def test_defaults_to_auto(self):
        assert normalize_typography_fit_mode(None) == "auto"
        assert normalize_typography_fit_mode("") == "auto"
        assert normalize_typography_fit_mode("unknown") == "auto"

    def test_accepts_valid_modes(self):
        assert normalize_typography_fit_mode("comfortable") == "comfortable"
        assert normalize_typography_fit_mode("COMPACT") == "compact"


class TestApplyTypographyStep:
    def test_baseline_unchanged(self):
        cfg = _base_config()
        out = apply_typography_step(cfg, BASELINE_STEP_INDEX)
        assert out.font_size == cfg.font_size
        assert out.page_margin.top == cfg.page_margin.top

    def test_looser_step_increases_font_and_margin(self):
        cfg = _base_config()
        out = apply_typography_step(cfg, 0)
        assert out.font_size > cfg.font_size
        assert out.page_margin.top > cfg.page_margin.top
        assert out.dense_mode is False

    def test_tighter_step_decreases_font_and_margin(self):
        cfg = _base_config()
        out = apply_typography_step(cfg, len(TYPOGRAPHY_LADDER) - 1)
        assert out.font_size < cfg.font_size
        assert out.page_margin.top < cfg.page_margin.top
        assert out.dense_mode is True

    def test_clamps_extremes(self):
        cfg = _base_config(font_size=10, page_margin=PageMargin(top=12, right=12, bottom=12, left=12))
        out = apply_typography_step(cfg, len(TYPOGRAPHY_LADDER) - 1)
        assert out.font_size >= 10
        assert out.page_margin.top >= 12


class TestInitialStepIndex:
    def test_compact_starts_tighter(self):
        assert initial_step_index("compact") > BASELINE_STEP_INDEX
        assert initial_step_index("auto") == BASELINE_STEP_INDEX


class TestFitTypographyToPageLimit:
    def test_auto_prefers_looser_when_pages_allow(self):
        cfg = _base_config(typography_fit_mode="auto", page_limit=1)
        calls: list[int] = []

        def count_pages(_html: str) -> int:
            return 1

        def render_html(render_cfg: RenderConfig) -> str:
            calls.append(render_cfg.font_size)
            return f"<html>{render_cfg.font_size}</html>"

        best_cfg, html, pages, steps = fit_typography_to_page_limit(
            render_config=cfg,
            page_limit=1,
            count_pages=count_pages,
            render_html=render_html,
        )
        assert pages == 1
        assert best_cfg.font_size == max(calls)
        assert steps >= 2

    def test_compact_skips_loosening(self):
        cfg = _base_config(typography_fit_mode="compact", page_limit=1)
        font_sizes: list[int] = []

        def render_html(render_cfg: RenderConfig) -> str:
            font_sizes.append(render_cfg.font_size)
            return "<html/>"

        best_cfg, _, pages, _ = fit_typography_to_page_limit(
            render_config=cfg,
            page_limit=1,
            count_pages=lambda _h: 1,
            render_html=render_html,
        )
        assert pages == 1
        assert best_cfg.font_size <= cfg.font_size
        assert min(font_sizes) <= cfg.font_size

    def test_tightens_when_over_page_limit(self):
        cfg = _base_config(typography_fit_mode="auto", page_limit=1)
        tight_enough = apply_typography_step(cfg, len(TYPOGRAPHY_LADDER) - 1).font_size

        def count_pages(html: str) -> int:
            if f">{tight_enough}<" in html:
                return 1
            return 2

        best_cfg, _, pages, _ = fit_typography_to_page_limit(
            render_config=cfg,
            page_limit=1,
            count_pages=count_pages,
            render_html=lambda c: f"<html>{c.font_size}</html>",
        )
        assert pages == 1
        assert best_cfg.font_size == tight_enough
