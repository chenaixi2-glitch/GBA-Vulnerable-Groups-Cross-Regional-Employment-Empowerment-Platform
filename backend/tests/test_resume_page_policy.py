"""Tests for experience-tier resume page policy."""

from __future__ import annotations

from tools.resume_page_policy import (
    apply_render_config_for_experience,
    normalize_experience_tier,
    page_limit_for_tier,
    page_limit_label,
    resume_constraints_for_tier,
    template_id_for_tier,
)
from workflow.state import RenderConfig


class TestNormalizeExperienceTier:
    def test_entry_aliases(self):
        assert normalize_experience_tier("Entry Level (0-2 years)") == "entry"
        assert normalize_experience_tier("junior") == "entry"
        assert normalize_experience_tier("应届") == "entry"

    def test_mid_aliases(self):
        assert normalize_experience_tier("Mid Level (3-5 years)") == "mid"
        assert normalize_experience_tier("3-5 years") == "mid"

    def test_senior_aliases(self):
        assert normalize_experience_tier("Senior Level (5+ years)") == "senior"
        assert normalize_experience_tier("5-10 years") == "senior"

    def test_executive_aliases(self):
        assert normalize_experience_tier("Executive / Leadership") == "executive"


class TestPageLimits:
    def test_entry_single_page(self):
        assert page_limit_for_tier("entry") == 1
        assert template_id_for_tier("entry") == "default"

    def test_senior_multi_page(self):
        assert page_limit_for_tier("senior") == 2
        assert template_id_for_tier("senior") == "default_multipage"

    def test_constraints_switch(self):
        assert "单页" in resume_constraints_for_tier("entry")
        assert "最多 2 页" in resume_constraints_for_tier("senior")


class TestRenderConfigPolicy:
    def test_entry_uses_single_page_template(self):
        config = apply_render_config_for_experience(RenderConfig(), "zh", "Entry Level (0-2 years)")
        assert config.template_id == "default"
        assert config.page_limit == 1
        assert config.spacing_scale == "compact"
        assert config.dense_mode is True

    def test_senior_uses_multipage_template(self):
        config = apply_render_config_for_experience(RenderConfig(), "en", "Senior Level (5+ years)")
        assert config.template_id == "default_multipage"
        assert config.page_limit == 2
        assert config.spacing_scale == "standard"
        assert config.dense_mode is False

    def test_page_limit_label(self):
        assert page_limit_label(1, "zh") == "A4 单页"
        assert page_limit_label(2, "en") == "up to 2 A4 pages"
