"""Deterministic compaction for content *within* skills and awards sections.

Does NOT merge the Skills section with the Awards section.
Within each section: put each item on one line when possible, and lightly trim wording.
For Skills only: fold many singleton skill rows into categorized comma-separated
groups (Languages / Programming / Data & AI / Tools), capped at 4 groups.
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

# Intentional skill *group* lines keep a category prefix, e.g. "Languages: Python, SQL"
_SKILL_GROUP_LINE_RE = re.compile(r"^[^:：\n]{1,48}[:：]\s*\S")

_PROFICIENCY_SUFFIX_RE = re.compile(
    r"\s*\((?:Fluent|Native|Proficient|Familiar|Intermediate|Basic|Advanced|"
    r"流利|母語|母语|熟练|熟練|了解|精通|一般|熟悉)\)\s*$",
    re.I,
)

# Category id → localized labels (A4 constraint: ≤4 groups after fold)
_SKILL_CATEGORY_LABELS: dict[str, dict[str, str]] = {
    "en": {
        "languages": "Languages",
        "programming": "Programming",
        "data_ai": "Data & AI",
        "tools": "Tools",
        "other": "Other",
    },
    "zh": {
        "languages": "语言",
        "programming": "编程",
        "data_ai": "数据与AI",
        "tools": "工具",
        "other": "其他",
    },
    "zh-TW": {
        "languages": "語言",
        "programming": "程式",
        "data_ai": "數據與AI",
        "tools": "工具",
        "other": "其他",
    },
    "pt": {
        "languages": "Idiomas",
        "programming": "Programação",
        "data_ai": "Dados e IA",
        "tools": "Ferramentas",
        "other": "Outros",
    },
}

_SKILL_CATEGORY_ORDER = ("languages", "programming", "data_ai", "tools", "other")
_MAX_SKILL_GROUPS = 4

# Normalized known category labels → category id (all locales)
_LABEL_TO_CATEGORY: dict[str, str] = {}
for _labels in _SKILL_CATEGORY_LABELS.values():
    for _cid, _label in _labels.items():
        _LABEL_TO_CATEGORY[_label.casefold()] = _cid
_LABEL_TO_CATEGORY.update({
    "data and ai": "data_ai",
    "data/ai": "data_ai",
    "ai & data": "data_ai",
    "soft skills": "other",
    "soft skill": "other",
    "技术": "programming",
    "技術": "programming",
    "tech": "programming",
    "technical": "programming",
    "design": "tools",
    "office": "tools",
})

_SPOKEN_LANGUAGE_NAMES = frozenset({
    "english", "mandarin", "cantonese", "chinese", "portuguese", "spanish",
    "french", "german", "japanese", "korean", "italian", "russian", "arabic",
    "hindi", "thai", "vietnamese", "indonesian", "malay", "dutch", "polish",
    "putonghua", "普通话", "普通話", "粤语", "粵語", "英语", "英語", "中文",
    "汉语", "漢語", "葡语", "葡語", "葡萄牙语", "葡萄牙語", "法语", "法語",
    "德语", "德語", "日语", "日語", "韩语", "韓語", "西班牙语", "西班牙語",
    "inglês", "ingles", "mandarim", "cantonês", "cantones", "chinês", "chines",
    "português", "portugues", "espanhol", "francês", "frances", "alemão", "alemao",
    "japonês", "japones", "coreano",
})

_DATA_AI_PATTERNS = tuple(re.compile(p, re.I) for p in (
    r"\bllms?\b", r"\bopenai\b", r"\bchatgpt\b", r"\bgpt-?\d*\b",
    r"machine\s*learning", r"\bdeep\s*learning\b", r"\bnlp\b",
    r"data\s*(analysis|analytics|preprocessing|processing|mining|visualization)",
    r"\bpandas\b", r"\bnumpy\b", r"\bpytorch\b", r"\btensorflow\b", r"\bsklearn\b",
    r"数据分析", r"數據分析", r"数据预处理", r"數據預處理", r"机器学习", r"機器學習",
    r"深度学习", r"深度學習", r"人工智能", r"\bai\b", r"análise\s*de\s*dados",
))

_PROGRAMMING_PATTERNS = tuple(re.compile(p, re.I) for p in (
    r"\bpython\b", r"\bjava\b", r"\bjavascript\b", r"\btypescript\b", r"\bsql\b",
    r"\bhtml\b", r"\bcss\b", r"\breact\b", r"\bvue\b", r"\bangular\b", r"\bnode\.?js\b",
    r"\bgolang\b", r"\brust\b", r"\bc\+\+\b", r"\bc#\b", r"\bphp\b", r"\bruby\b",
    r"\bswift\b", r"\bkotlin\b", r"\bscala\b", r"\bmatlab\b", r"\bfastapi\b",
    r"\bdjango\b", r"\bflask\b", r"\bspring\b", r"\b\.net\b", r"\bgo\b",
    r"编程", r"程式", r"前端", r"后端", r"後端",
))

_TOOLS_PATTERNS = tuple(re.compile(p, re.I) for p in (
    r"\bword\b", r"\bexcel\b", r"\bpowerpoint\b", r"\boffice\b", r"\bphotoshop\b",
    r"\billustrator\b", r"\bpremiere\b", r"\badobe\b", r"\bfigma\b", r"\bcanva\b",
    r"\bdocker\b", r"\bkubernetes\b", r"\bk8s\b", r"\bgit\b", r"\blinux\b",
    r"\baws\b", r"\bazure\b", r"\bgcp\b", r"\bjira\b", r"\bnotion\b", r"\btablo\b",
    r"\bpower\s*bi\b", r"\bsketch\b", r"\bxd\b", r"办公", r"辦公",
))


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _split_tokens(text: str) -> list[str]:
    raw = (text or "").strip()
    if not raw:
        return []
    # Do not split on "/" (HTML/CSS/…) or mid-word hyphens (Cross-functional).
    parts = re.split(r"[\r\n]+|[,，、|；;]+|\s*[•●▪]\s+", raw)
    tokens: list[str] = []
    for part in parts:
        cleaned = re.sub(r"\s{2,}", " ", part.strip())
        cleaned = cleaned.lstrip("•●▪- ").strip()
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


def _item_display_line(item: "SectionItem") -> str:
    return (item.content or "").strip() or (item.title or "").strip()


def _is_skill_group_line(line: str) -> bool:
    """True for categorical group lines like 'Languages: Python, SQL'."""
    return bool(_SKILL_GROUP_LINE_RE.match((line or "").strip()))


def _skill_base_name(skill: str) -> str:
    return _PROFICIENCY_SUFFIX_RE.sub("", (skill or "").strip()).strip().casefold()


def _classify_skill(skill: str) -> str:
    """Map one skill label to a category id (deterministic heuristics)."""
    base = _skill_base_name(skill)
    if not base:
        return "other"
    if base in _SPOKEN_LANGUAGE_NAMES:
        return "languages"
    # Multi-part office stacks like Word/Excel/PowerPoint
    parts = [p.strip() for p in re.split(r"[/／]", base) if p.strip()]
    if parts and all(p in _SPOKEN_LANGUAGE_NAMES for p in parts):
        return "languages"
    for pattern in _DATA_AI_PATTERNS:
        if pattern.search(skill) or pattern.search(base):
            return "data_ai"
    for pattern in _PROGRAMMING_PATTERNS:
        if pattern.search(skill) or pattern.search(base):
            return "programming"
    for pattern in _TOOLS_PATTERNS:
        if pattern.search(skill) or pattern.search(base):
            return "tools"
    if parts:
        for part in parts:
            for pattern in _TOOLS_PATTERNS:
                if pattern.search(part):
                    return "tools"
            for pattern in _PROGRAMMING_PATTERNS:
                if pattern.search(part):
                    return "programming"
    return "other"


def _category_label(category_id: str, language: str) -> str:
    lang = normalize_language(language)
    labels = _SKILL_CATEGORY_LABELS.get(lang) or _SKILL_CATEGORY_LABELS["en"]
    return labels.get(category_id) or _SKILL_CATEGORY_LABELS["en"][category_id]


def _fold_categories_to_max(
    buckets: dict[str, list[str]],
    *,
    max_groups: int = _MAX_SKILL_GROUPS,
) -> dict[str, list[str]]:
    """Keep at most *max_groups* non-empty categories (A4: ≤4)."""
    non_empty = [cid for cid in _SKILL_CATEGORY_ORDER if buckets.get(cid)]
    if len(non_empty) <= max_groups:
        return {cid: buckets[cid] for cid in non_empty}

    folded = {cid: list(buckets[cid]) for cid in non_empty}
    while len(folded) > max_groups:
        # Prefer merging Data&AI into Programming so soft-skill Other can stay
        if "data_ai" in folded and "programming" in folded:
            folded["programming"].extend(folded.pop("data_ai"))
            continue
        if "other" in folded and "tools" in folded:
            folded["tools"].extend(folded.pop("other"))
            continue
        if "other" in folded:
            folded.setdefault("tools", []).extend(folded.pop("other"))
            continue
        ordered = [cid for cid in _SKILL_CATEGORY_ORDER if cid in folded]
        tail = ordered[-1]
        prev = ordered[-2]
        folded[prev].extend(folded.pop(tail))
    return {cid: folded[cid] for cid in _SKILL_CATEGORY_ORDER if folded.get(cid)}


def _split_group_line(line: str) -> tuple[str | None, str]:
    """Return (label, body) for 'Label: body', or (None, line) if not a group line."""
    raw = (line or "").strip()
    match = re.match(r"^([^:：\n]{1,48})[:：]\s*(.*)$", raw)
    if not match:
        return None, raw
    label = match.group(1).strip()
    body = match.group(2).strip()
    if not label:
        return None, raw
    return label, body


def _label_to_category(label: str) -> str | None:
    key = (label or "").strip().casefold()
    return _LABEL_TO_CATEGORY.get(key)


def _skill_tokens_from_body(body: str) -> list[str]:
    """Split a skill body into entries without breaking HTML/CSS/JavaScript."""
    return _dedupe_preserve(_split_tokens(body))


def _collect_skills_into_buckets(
    items: list["SectionItem"],
) -> dict[str, list[str]]:
    """Parse all skill rows (flat or already labeled) into category buckets.

    Same category label always lands in one bucket — fixes duplicate
    ``Programming:`` / ``Data & AI:`` rows.
    """
    buckets: dict[str, list[str]] = {cid: [] for cid in _SKILL_CATEGORY_ORDER}
    for item in items:
        line = _item_display_line(item)
        if not line:
            continue
        label, body = _split_group_line(line)
        if label is not None:
            cat = _label_to_category(label)
            tokens = _skill_tokens_from_body(body) if body else []
            if cat:
                buckets[cat].extend(tokens)
            else:
                # Unknown label (e.g. Backend): classify each skill token
                for token in tokens or [body or label]:
                    if token:
                        buckets[_classify_skill(token)].append(token)
            continue
        # Flat row — may still be a comma-separated list
        for token in _skill_tokens_from_body(line) or [line]:
            buckets[_classify_skill(token)].append(token)

    for cid in buckets:
        buckets[cid] = _dedupe_preserve(buckets[cid])
    return buckets


def _buckets_to_skill_items(
    buckets: dict[str, list[str]],
    *,
    language: str,
    template_item: "SectionItem",
) -> list["SectionItem"]:
    folded = _fold_categories_to_max(buckets)
    now = _now_iso()
    items: list["SectionItem"] = []
    for index, category_id in enumerate(folded):
        label = _category_label(category_id, language)
        body = _join_tokens(folded[category_id], language)
        content = f"{label}: {body}"
        update = {"title": "", "content": content, "updated_at": now}
        if index > 0:
            update["id"] = f"{template_item.id}_{category_id}"
        items.append(template_item.model_copy(update=update))
    return items


def _group_flat_skills(
    skill_lines: list[str],
    *,
    language: str,
    template_item: "SectionItem",
) -> list["SectionItem"]:
    """Classify singleton skills into labeled one-line groups."""
    buckets: dict[str, list[str]] = {cid: [] for cid in _SKILL_CATEGORY_ORDER}
    for line in _dedupe_preserve(skill_lines):
        buckets[_classify_skill(line)].append(line)
    return _buckets_to_skill_items(buckets, language=language, template_item=template_item)


def _compact_section_items(
    items: list["SectionItem"],
    *,
    generics: frozenset[str],
    language: str,
) -> tuple[list["SectionItem"], bool]:
    """One-line + trim each item. Keep items separate at this stage."""
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


def _coalesce_skill_items(
    items: list["SectionItem"],
    *,
    language: str,
) -> tuple[list["SectionItem"], bool]:
    """Re-bucket every skill row so each category appears at most once.

    Handles both ungrouped singletons and already-labeled duplicates like
    ``Programming: Python`` + ``Programming: SQL``.
    """
    if not items:
        return items, False

    buckets = _collect_skills_into_buckets(items)
    coalesced = _buckets_to_skill_items(
        buckets, language=language, template_item=items[0],
    )
    before = [_item_display_line(item) for item in items]
    after = [_item_display_line(item) for item in coalesced]
    if before == after:
        return items, False
    return coalesced, True


def compact_skills_and_awards(resume_content: "ResumeContent") -> tuple["ResumeContent", bool]:
    """Within Skills and within Awards: one-line items + light wording trim.

    Skills additionally classifies/coalesces rows into category groups (≤4).
    Skills and Awards remain two separate sections.
    """
    lang = normalize_language(getattr(resume_content.meta, "language", None) or "en")
    skills, skills_changed = _compact_section_items(
        list(resume_content.skills or []),
        generics=_GENERIC_SKILL_TITLES,
        language=lang,
    )
    skills, skills_merged = _coalesce_skill_items(skills, language=lang)
    awards, awards_changed = _compact_section_items(
        list(resume_content.awards or []),
        generics=_GENERIC_AWARD_TITLES,
        language=lang,
    )
    changed = skills_changed or skills_merged or awards_changed
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
