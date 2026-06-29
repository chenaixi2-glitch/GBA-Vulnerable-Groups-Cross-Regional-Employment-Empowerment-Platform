"""Resume layout helpers — language defaults and A4 compact settings."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from workflow.state import RenderConfig

SECTION_LABELS: dict[str, dict[str, str]] = {
    "zh": {
        "profile": "基本信息",
        "summary": "个人总结",
        "skills": "专业技能",
        "internships": "实习经历",
        "projects": "项目经历",
        "awards": "获奖经历",
        "papers": "论文",
    },
    "en": {
        "profile": "Contact",
        "summary": "Professional Summary",
        "skills": "Skills",
        "internships": "Work Experience",
        "projects": "Projects",
        "awards": "Honors & Awards",
        "papers": "Publications",
    },
}

SECTION_ORDER_BY_LANGUAGE: dict[str, list[str]] = {
    "zh": ["profile", "summary", "skills", "projects", "internships", "awards"],
    "en": ["profile", "summary", "internships", "projects", "skills", "awards"],
}

FONT_BY_LANGUAGE: dict[str, str] = {
    "zh": "Source Han Sans",
    "en": "Inter",
}

EMPLOYER_TYPE_LABELS: dict[str, str] = {
    "soe": "国央企",
    "public": "体制内",
    "foreign": "外企",
    "private": "民企",
    "npo": "非营利社会组织",
    "hmt": "港澳台资企业",
    "other": "其他",
}

VALID_EMPLOYER_TYPES: frozenset[str] = frozenset(EMPLOYER_TYPE_LABELS.keys())


def normalize_employer_type(value: str | None) -> str:
    if not value:
        return ""
    raw = value.strip().lower()
    aliases = {
        "soe": "soe", "state-owned": "soe", "state_owned": "soe", "国央企": "soe", "国企": "soe", "央企": "soe",
        "public": "public", "government": "public", "体制内": "public", "事业单位": "public", "公务员": "public",
        "foreign": "foreign", "mnc": "foreign", "外企": "foreign", "外资": "foreign",
        "private": "private", "民企": "private", "民营企业": "private", "私营": "private",
        "npo": "npo", "ngo": "npo", "non-profit": "npo", "nonprofit": "npo", "非营利": "npo", "社会组织": "npo", "公益": "npo",
        "hmt": "hmt", "港澳台": "hmt", "港澳台资": "hmt", "港资": "hmt", "澳资": "hmt", "台资": "hmt",
        "other": "other", "其他": "other",
    }
    return aliases.get(raw, raw if raw in EMPLOYER_TYPE_LABELS else "")


def employer_type_label(value: str | None) -> str:
    key = normalize_employer_type(value)
    return EMPLOYER_TYPE_LABELS.get(key, value or "")


def normalize_language(language: str | None) -> str:
    if not language:
        return "zh"
    lang = language.strip().lower()
    if lang in ("en", "english", "英文", "英语"):
        return "en"
    return "zh"


def opposite_language(language: str) -> str:
    return "en" if normalize_language(language) == "zh" else "zh"


def language_label(language: str) -> str:
    return "英文" if normalize_language(language) == "en" else "中文"


def apply_a4_compact_render_config(config: "RenderConfig", language: str) -> "RenderConfig":
    """Apply single-page A4 compact defaults for a target language."""
    lang = normalize_language(language)
    margin = 18 if lang == "en" else 20
    return config.model_copy(update={
        "language": lang,
        "font_family": FONT_BY_LANGUAGE.get(lang, config.font_family),
        "font_size": 12 if lang == "en" else 13,
        "line_height": 1.35,
        "dense_mode": True,
        "spacing_scale": "compact",
        "layout_mode": "single-column",
        "section_order": list(SECTION_ORDER_BY_LANGUAGE.get(lang, config.section_order)),
        "page_margin": config.page_margin.model_copy(update={
            "top": margin,
            "right": margin,
            "bottom": margin,
            "left": margin,
        }),
        "version": config.version + 1,
        "last_render_reason": f"A4 单页紧凑排版（{language_label(lang)}）",
    })
