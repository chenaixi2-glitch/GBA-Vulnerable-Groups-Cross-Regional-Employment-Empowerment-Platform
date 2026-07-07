"""Resume page limits and render policy by target experience level."""

from __future__ import annotations

from typing import TYPE_CHECKING

from prompts.resume_constraints import (
    RESUME_A4_MULTI_PAGE_CONSTRAINTS,
    RESUME_A4_ONE_PAGE_CONSTRAINTS,
)
from tools.resume_layout import (
    FONT_BY_LANGUAGE,
    SECTION_ORDER_BY_LANGUAGE,
    language_label,
    normalize_language,
)

if TYPE_CHECKING:
    from workflow.state import CopilotState, RenderConfig

ExperienceTier = str  # entry | mid | senior | executive

_TIER_PAGE_LIMITS: dict[str, int] = {
    "entry": 1,
    "mid": 2,
    "senior": 2,
    "executive": 2,
}

_TIER_TEMPLATE_IDS: dict[str, str] = {
    "entry": "default",
    "mid": "default_multipage",
    "senior": "default_multipage",
    "executive": "default_multipage",
}


def normalize_experience_tier(experience_level: str | None) -> ExperienceTier:
    """Map UI/API experience labels to a canonical tier."""
    raw = (experience_level or "").strip().lower()
    if not raw:
        return "entry"
    if any(token in raw for token in ("entry", "0-2", "junior", "intern", "应届", "实习", "fresh")):
        return "entry"
    if any(token in raw for token in ("mid", "3-5", "middle", "中级")):
        return "mid"
    if any(token in raw for token in ("executive", "leadership", "总监", "高管", "管理岗")):
        return "executive"
    if any(token in raw for token in ("senior", "5+", "5-10", "advanced", "高级")):
        return "senior"
    return "entry"


def page_limit_for_tier(tier: str) -> int:
    return _TIER_PAGE_LIMITS.get(normalize_experience_tier(tier), 1)


def template_id_for_tier(tier: str) -> str:
    return _TIER_TEMPLATE_IDS.get(normalize_experience_tier(tier), "default")


def template_id_for_language(language: str, tier: str) -> str:
    """仅简体中文单页简历使用校园版式 default_zh；其余语言用 default。"""
    lang = normalize_language(language)
    if lang == "zh" and page_limit_for_tier(tier) <= 1:
        return "default_zh"
    return template_id_for_tier(tier)


def resume_constraints_for_tier(tier: str) -> str:
    if page_limit_for_tier(tier) <= 1:
        return RESUME_A4_ONE_PAGE_CONSTRAINTS.strip()
    return RESUME_A4_MULTI_PAGE_CONSTRAINTS.strip()


def page_limit_label(page_limit: int, language: str = "zh") -> str:
    lang = normalize_language(language)
    if page_limit <= 1:
        return "A4 单页" if lang == "zh" else "A4 single page"
    if lang == "zh":
        return f"A4 {page_limit} 页以内"
    return f"up to {page_limit} A4 pages"


def resolve_experience_level(state: "CopilotState") -> str:
    return (state.meta.target_experience_level or "").strip()


def resolve_experience_tier(state: "CopilotState") -> ExperienceTier:
    return normalize_experience_tier(resolve_experience_level(state))


def resolve_page_limit(state: "CopilotState") -> int:
    return page_limit_for_tier(resolve_experience_tier(state))


def resume_constraints_for_state(state: "CopilotState") -> str:
    return resume_constraints_for_tier(resolve_experience_tier(state))


def apply_render_config_for_experience(
    config: "RenderConfig",
    language: str,
    experience_level: str,
) -> "RenderConfig":
    """Apply language + experience-tier render defaults (template, spacing, page limit)."""
    lang = normalize_language(language)
    tier = normalize_experience_tier(experience_level)
    page_limit = page_limit_for_tier(tier)
    template_id = template_id_for_language(lang, tier)

    if tier == "entry":
        margin = 18 if lang == "en" else 20
        spacing_scale = "compact"
        dense_mode = True
        line_height = 1.35
        font_size = 12 if lang == "en" else 13
    elif tier == "mid":
        margin = 20 if lang == "en" else 22
        spacing_scale = "compact"
        dense_mode = True
        line_height = 1.38
        font_size = 12 if lang == "en" else 13
    else:
        margin = 22 if lang == "en" else 24
        spacing_scale = "standard"
        dense_mode = False
        line_height = 1.4
        font_size = 12 if lang == "en" else 13

    layout_label = page_limit_label(page_limit, lang)
    return config.model_copy(update={
        "template_id": template_id,
        "language": lang,
        "font_family": FONT_BY_LANGUAGE.get(lang, config.font_family),
        "font_size": font_size,
        "line_height": line_height,
        "dense_mode": dense_mode,
        "spacing_scale": spacing_scale,
        "layout_mode": "single-column",
        "page_margin": config.page_margin.model_copy(update={
            "top": margin,
            "right": margin,
            "bottom": margin,
            "left": margin,
        }),
        "page_limit": page_limit,
        "version": config.version + 1,
        "last_render_reason": f"{layout_label}排版（{language_label(lang)}，{tier}）",
    })


def apply_a4_compact_render_config(config: "RenderConfig", language: str) -> "RenderConfig":
    """Backward-compatible alias: entry-level single-page defaults."""
    return apply_render_config_for_experience(config, language, "entry")
