"""Tests for QUANTIFICATION_MODE → polish prompt clause mapping."""

from prompts.resume_constraints import resolution_quantification_instruction


def test_industry_standard_clause():
    text = resolution_quantification_instruction(
        "QUANTIFICATION_MODE=industry_standard: Prefer any real metrics..."
    )
    assert "industry_standard" in text
    assert "保守" in text or "常见" in text


def test_none_clause_forbids_fabricated_metrics():
    text = resolution_quantification_instruction("QUANTIFICATION_MODE=none: Prefer any...")
    assert "QUANTIFICATION_MODE=none" in text
    assert "禁止" in text


def test_default_clause_requires_profile_numbers():
    text = resolution_quantification_instruction("")
    assert "默认" in text or "画像" in text
