"""JD 缓存工具：按岗位名称 / JD 文本 / 生成参数复用已生成的岗位描述。"""

from __future__ import annotations

import hashlib
import re
import uuid
from typing import Any

from log import get_logger

logger = get_logger("storage")

JD_DETAIL_MARKERS = (
    "职责",
    "任职要求",
    "岗位要求",
    "职位要求",
    "工作内容",
    "岗位描述",
    "加分项",
    "qualification",
    "responsibilit",
    "requirement",
    "job description",
    "key responsibilit",
    "what you'll do",
    "what you will do",
    "benefits",
    "skills required",
    "任职",
)

TITLE_LINE_PATTERN = re.compile(
    r"(?:岗位名称|职位名称|崗位名稱|job title|position|cargo)\s*[:：]",
    re.IGNORECASE,
)

SECTION_START_MARKERS = (
    "岗位职责",
    "崗位職責",
    "任职要求",
    "任職要求",
    "加分项",
    "加分項",
    "key responsibilit",
    "requirements",
    "responsibilities",
    "preferred qualification",
    "requisitos",
    "responsabilidades",
    "preferencial",
)

TITLE_PREFIX_BY_LANG = {
    "zh": "岗位名称：{title}",
    "zh-TW": "崗位名稱：{title}",
    "en": "Job Title: {title}",
    "pt": "Cargo: {title}",
}


def normalize_job_title(title: str) -> str:
    """归一化岗位名称，便于相似岗位匹配。"""
    text = (title or "").strip().lower()
    text = re.sub(r"[\s\-_/（）()【】\[\],，、·]+", "", text)
    text = re.sub(r"(工程师|专员|经理|主管|总监|助理|实习生|岗位|职位)$", r"\1", text)
    return text


def jd_text_hash(jd_text: str) -> str:
    normalized = re.sub(r"\s+", " ", (jd_text or "").strip())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def params_cache_key(industry: str, employer_type: str, experience_level: str) -> str:
    raw = "|".join([
        (industry or "").strip().lower(),
        (employer_type or "").strip().lower(),
        (experience_level or "").strip().lower(),
    ])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def is_title_only(jd_text: str) -> bool:
    """判断用户输入是否仅为岗位名称（无完整 JD 详情）。"""
    text = (jd_text or "").strip()
    if not text:
        return False
    if len(text) > 200:
        return False
    if text.count("\n") > 2:
        return False
    lower = text.lower()
    if any(marker in lower for marker in JD_DETAIL_MARKERS):
        return False
    return True


def jd_has_explicit_title_line(jd_text: str) -> bool:
    """JD 正文是否已含「岗位名称：」等显式标题行。"""
    head = (jd_text or "")[:600]
    return bool(TITLE_LINE_PATTERN.search(head))


def _jd_first_line_starts_with_section(jd_text: str) -> bool:
    lines = [ln.strip() for ln in (jd_text or "").strip().splitlines() if ln.strip()]
    if not lines:
        return False
    first = lines[0].lower()
    return any(marker in first for marker in SECTION_START_MARKERS)


def _normalize_lang_key(language: str) -> str:
    lang = (language or "zh").strip()
    if lang.lower().startswith("zh-tw") or lang in ("zh_TW", "zh-Hant"):
        return "zh-TW"
    if lang.lower().startswith("zh"):
        return "zh"
    if lang.lower().startswith("pt"):
        return "pt"
    if lang.lower().startswith("en"):
        return "en"
    return "zh"


def ensure_title_in_jd_text(title: str, jd_text: str, language: str = "zh") -> str:
    """若 jd_text 缺少岗位名称行，则在正文开头补上 title。"""
    text = (jd_text or "").strip()
    if not text:
        return text

    resolved_title = (title or "").strip() or extract_title_from_jd(text)
    if not resolved_title:
        return text

    if jd_has_explicit_title_line(text):
        return text

    first_line = text.splitlines()[0].strip()
    if not _jd_first_line_starts_with_section(text) and len(first_line) <= 120:
        if (
            first_line == resolved_title
            or resolved_title in first_line
            or first_line in resolved_title
        ):
            return text

    lang_key = _normalize_lang_key(language)
    prefix = TITLE_PREFIX_BY_LANG.get(lang_key, TITLE_PREFIX_BY_LANG["zh"]).format(
        title=resolved_title
    )
    return f"{prefix}\n\n{text}"


def extract_title_from_jd(jd_text: str) -> str:
    """从 JD 文本中提取岗位名称；纯标题输入则原样返回。"""
    text = (jd_text or "").strip()
    if not text:
        return ""
    if is_title_only(text):
        return text.splitlines()[0].strip()

    patterns = (
        r"(?:岗位名称|职位名称|job title|position)\s*[:：]\s*(.+)",
        r"(?:招聘|诚聘|急聘)\s*(.+)",
        r"^(.{2,80}?)(?:\n|$)",
    )
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE | re.MULTILINE)
        if match:
            title = match.group(1).strip()
            if title and len(title) <= 120:
                return title
    first_line = text.splitlines()[0].strip()
    return first_line[:120] if first_line else text[:120]


def parsed_job_to_job_fields(parsed: dict[str, Any]) -> dict[str, Any]:
    """将缓存中的 parsed_job JSON 转为 Job 构造字段。"""
    return {
        "industry": parsed.get("industry") or "",
        "title": parsed.get("title") or "",
        "tech_stack": parsed.get("tech_stack") or [],
        "keywords": parsed.get("keywords") or [],
        "hard_skills": parsed.get("hard_skills") or [],
        "soft_skills": parsed.get("soft_skills") or [],
        "responsibilities": parsed.get("responsibilities") or [],
        "education_requirement": parsed.get("education_requirement") or "",
        "experience_requirement": parsed.get("experience_requirement") or "",
        "implicit_preferences": parsed.get("implicit_preferences") or [],
        "bonus_items": parsed.get("bonus_items") or [],
    }


def analysis_output_to_parsed_job(parsed: Any) -> dict[str, Any]:
    """JDAnalysisOutput → 可持久化的 dict。"""
    return {
        "industry": parsed.industry,
        "title": parsed.title,
        "tech_stack": list(parsed.tech_stack or []),
        "keywords": list(parsed.keywords or []),
        "hard_skills": list(parsed.hard_skills or []),
        "soft_skills": list(parsed.soft_skills or []),
        "responsibilities": list(parsed.responsibilities or []),
        "education_requirement": parsed.education_requirement,
        "experience_requirement": parsed.experience_requirement,
        "implicit_preferences": list(parsed.implicit_preferences or []),
        "bonus_items": list(parsed.bonus_items or []),
    }


def new_cache_id() -> str:
    return f"jdc_{uuid.uuid4().hex[:16]}"
