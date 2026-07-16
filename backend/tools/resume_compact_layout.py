"""Deterministic compaction for content *within* skills and awards sections.

Does NOT merge the Skills section with the Awards section.
Within each section: put each item on one line when possible, and lightly trim wording.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from tools.resume_layout import is_cjk_resume_language, normalize_language

if TYPE_CHECKING:
    from workflow.state import ResumeContent, SectionItem

_GENERIC_SKILL_TITLES = frozenset({
    "skills", "skill", "相关技能", "專業技能", "专业技能", "技能",
    "competências", "competencias", "hard skills", "soft skills",
})

_GENERIC_AWARD_TITLES = frozenset({
    "awards", "award", "honors", "honors & awards", "获奖经历", "獲獎經歷",
    "奖项", "獎項", "prémios", "premios", "prémios e distinções",
})

_FILLER_PATTERNS = (
    re.compile(r"\b(proficient in|familiar with|experience with|knowledge of)\s+", re.I),
    re.compile(r"(熟练掌握|熟练运用|具备|了解|熟悉)\s*"),
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _split_tokens(text: str) -> list[str]:
    raw = (text or "").strip()
    if not raw:
        return []
    parts = re.split(r"[\r\n]+|[,，、|/；;]+|\s*[\-•●▪]\s*", raw)
    tokens: list[str] = []
    for part in parts:
        cleaned = re.sub(r"\s{2,}", " ", part.strip(" -•●▪"))
        if cleaned:
            tokens.append(cleaned)
    return tokens


def _dedupe_preserve(tokens: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for token in tokens:
        key = token.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(token)
    return out


def _strip_fillers(text: str) -> str:
    out = text
    for pattern in _FILLER_PATTERNS:
        out = pattern.sub("", out)
    return re.sub(r"\s{2,}", " ", out).strip(" ：:，,;；")


def _is_generic_title(title: str, generics: frozenset[str]) -> bool:
    return (title or "").strip().lower() in generics


def _join_tokens(tokens: list[str], language: str) -> str:
    lang = normalize_language(language)
    sep = "、" if is_cjk_resume_language(lang) else ", "
    return sep.join(tokens)


def item_to_inline_line(item: "SectionItem", *, generics: frozenset[str], language: str = "en") -> str:
    """Collapse one skills/awards item into a single display line and lightly trim it."""
    title = (item.title or "").strip()
    body_tokens = _dedupe_preserve(_split_tokens(item.content or ""))
    if body_tokens:
        body = _strip_fillers(_join_tokens(body_tokens, language))
    else:
        body = _strip_fillers(re.sub(r"\s+", " ", (item.content or "").strip()))

    if title and body:
        if _is_generic_title(title, generics):
            return body
        return f"{title}: {body}"
    return body or title


def _compact_section_items(
    items: list["SectionItem"],
    *,
    generics: frozenset[str],
    language: str,
) -> tuple[list["SectionItem"], bool]:
    """One-line + trim each item. Keep items separate (do not fold the whole section)."""
    if not items:
        return items, False

    changed = False
    compacted: list["SectionItem"] = []
    for item in items:
        line = item_to_inline_line(item, generics=generics, language=language)
        if not line:
            changed = True
            continue
        before_title = (item.title or "").strip()
        before_content = (item.content or "").strip()
        if before_title == "" and before_content == line:
            compacted.append(item)
            continue
        compacted.append(item.model_copy(update={
            "title": "",
            "content": line,
            "updated_at": _now_iso(),
        }))
        changed = True
    return compacted, changed


def compact_skills_and_awards(resume_content: "ResumeContent") -> tuple["ResumeContent", bool]:
    """Within Skills and within Awards: one-line items + light wording trim.

    Skills and Awards remain two separate sections.
    """
    lang = normalize_language(getattr(resume_content.meta, "language", None) or "en")
    skills, skills_changed = _compact_section_items(
        list(resume_content.skills or []),
        generics=_GENERIC_SKILL_TITLES,
        language=lang,
    )
    awards, awards_changed = _compact_section_items(
        list(resume_content.awards or []),
        generics=_GENERIC_AWARD_TITLES,
        language=lang,
    )
    changed = skills_changed or awards_changed
    if not changed:
        return resume_content, False
    return resume_content.model_copy(update={
        "skills": skills,
        "awards": awards,
        "meta": resume_content.meta.model_copy(update={
            "version": resume_content.meta.version + 1,
            "last_updated_at": _now_iso(),
        }),
    }), True
