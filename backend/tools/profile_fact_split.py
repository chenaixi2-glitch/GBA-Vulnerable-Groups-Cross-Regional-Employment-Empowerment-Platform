"""Post-process profile extraction facts — split merged entries & detect material language."""

from __future__ import annotations

import json
import re
import uuid
from typing import Any

from agents.json_contracts import ProfileFactOutput

_CJK_RE = re.compile(r"[\u4e00-\u9fff\u3400-\u4dbf]")
_LATIN_WORD_RE = re.compile(r"[a-zA-Z]{3,}")
_EXPERIENCE_TYPES = frozenset({"internship", "project", "award", "paper"})
_NESTED_ENTRY_KEYS = ("experiences", "items", "entries", "jobs", "projects", "internships")
_EXPERIENCE_BLOCK_RE = re.compile(
    r"(?m)^(?=[^\n].*(?:\d{4}[\./\-年]\d{1,2}|Present|至今|—|-\s*[A-Z]))"
)


def detect_material_language(material_text: str) -> str:
    """Heuristic: 'en' | 'zh' | 'mixed' from resume body (ignores upload wrapper text)."""
    body = material_text or ""
    marker = "以下为附件解析文本:"
    if marker in body:
        body = body.split(marker, 1)[-1]
    body = body.strip()
    if not body:
        return "mixed"

    cjk_chars = len(_CJK_RE.findall(body))
    latin_words = len(_LATIN_WORD_RE.findall(body))
    if cjk_chars == 0 and latin_words >= 3:
        return "en"
    if latin_words == 0 and cjk_chars >= 3:
        return "zh"
    if cjk_chars >= latin_words * 2:
        return "zh"
    if latin_words >= cjk_chars * 2:
        return "en"
    return "mixed"


def material_language_instruction(material_text: str) -> str:
    lang = detect_material_language(material_text)
    if lang == "en":
        return (
            "源材料主要为英文。"
            "profile_basic 与 facts.content 中的描述性文字必须保持英文，禁止翻译成中文；"
            "不要因本提示为中文而改变输出语言。"
        )
    if lang == "zh":
        return (
            "源材料主要为中文。"
            "profile_basic 与 facts.content 中的描述性文字必须保持中文，禁止擅自翻译成英文。"
        )
    return (
        "源材料为中英混合。"
        "每条 fact 的 content 须与对应原文段落保持同一语言，禁止在同一字段内中英混用或擅自翻译。"
    )


def _serialize_entry(entry: dict[str, Any]) -> str:
    return json.dumps(entry, ensure_ascii=False)


def _json_entry_parts(parsed: Any) -> list[str] | None:
    if isinstance(parsed, list) and parsed and all(isinstance(item, dict) for item in parsed):
        return [_serialize_entry(item) for item in parsed]

    if isinstance(parsed, dict):
        for key in _NESTED_ENTRY_KEYS:
            nested = parsed.get(key)
            if isinstance(nested, list) and len(nested) > 1 and all(isinstance(item, dict) for item in nested):
                return [_serialize_entry(item) for item in nested]
    return None


def _split_plain_experience_blocks(content: str) -> list[str] | None:
    """Split plain-text merged work/project blocks on blank-line + date/company heuristics."""
    text = content.strip()
    if not text or text.startswith("{"):
        return None
    blocks = [block.strip() for block in re.split(r"\n\s*\n", text) if block.strip()]
    if len(blocks) <= 1:
        return None
    dated_blocks = [block for block in blocks if _EXPERIENCE_BLOCK_RE.search(block)]
    if len(dated_blocks) >= 2:
        return dated_blocks
    return None


def _split_fact_content(fact: ProfileFactOutput) -> list[str]:
    content = (fact.content or "").strip()
    if not content or fact.type not in _EXPERIENCE_TYPES:
        return [content]

    try:
        parsed = json.loads(content)
    except (json.JSONDecodeError, TypeError):
        plain_parts = _split_plain_experience_blocks(content)
        return plain_parts if plain_parts else [content]

    parts = _json_entry_parts(parsed)
    return parts if parts else [content]


def expand_profile_facts(facts: list[ProfileFactOutput]) -> list[ProfileFactOutput]:
    """Expand facts when the LLM merged multiple entries into one."""
    expanded: list[ProfileFactOutput] = []

    for fact in facts:
        parts = _split_fact_content(fact)
        if len(parts) <= 1:
            expanded.append(fact)
            continue

        base_id = (fact.id or new_fact_id(fact.type)).strip()
        for index, part in enumerate(parts):
            new_id = base_id if index == 0 else f"{base_id}_{index + 1}"
            expanded.append(fact.model_copy(update={
                "id": new_id,
                "content": part,
            }))

    return expanded


def new_fact_id(fact_type: str) -> str:
    return f"fact_{fact_type}_{uuid.uuid4().hex[:8]}"
