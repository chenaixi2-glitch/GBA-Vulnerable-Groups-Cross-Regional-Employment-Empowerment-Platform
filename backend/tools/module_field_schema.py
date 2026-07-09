"""Structured resume module fields — parse/serialize and translate field selection."""

from __future__ import annotations

import json
from typing import Any

# Fields that should not be sent to LLM translation (dates, ids, tech names).
NON_TRANSLATABLE_FIELDS = frozenset({
    "start_date", "end_date", "start", "end", "date", "id", "tech_stack",
})

# Default field order per module type (matches profile extraction prompt).
MODULE_FIELD_ORDER: dict[str, list[str]] = {
    "education": ["school", "major", "degree", "start_date", "end_date"],
    "internship": [
        "company", "role", "title", "start_date", "end_date",
        "tech_stack", "responsibilities", "achievements",
    ],
    "project": [
        "title", "role", "start_date", "end_date",
        "tech_stack", "responsibilities", "achievements",
    ],
    "skill": ["skill", "level", "context"],
    "award": ["title", "issuer", "date", "description"],
    "paper": ["title", "venue", "date", "description"],
    "custom": ["title", "content"],
}


def _empty_fields(module_type: str) -> dict[str, Any]:
    order = MODULE_FIELD_ORDER.get(module_type, MODULE_FIELD_ORDER["custom"])
    empty: dict[str, Any] = {}
    for key in order:
        empty[key] = [] if key == "tech_stack" else ""
    return empty


def _coerce_field_value(key: str, value: Any) -> Any:
    if key == "tech_stack":
        if isinstance(value, list):
            return [str(v).strip() for v in value if str(v).strip()]
        if isinstance(value, str) and value.strip():
            return [part.strip() for part in value.split(",") if part.strip()]
        return []
    if value is None:
        return ""
    return str(value).strip() if not isinstance(value, (list, dict)) else value


def parse_fact_content(module_type: str, content: str, *, title: str = "") -> dict[str, Any]:
    """Parse fact.content (+ legacy title) into a fields dict for the editor."""
    fields = _empty_fields(module_type)
    text = (content or "").strip()
    parsed_title = (title or "").strip()

    if text:
        try:
            parsed = json.loads(text)
            if isinstance(parsed, dict):
                for key, value in parsed.items():
                    if key in fields or key not in ("source_refs", "updated_at"):
                        fields[key] = _coerce_field_value(key, value)
                if module_type in ("internship", "project") and fields.get("content") and not fields.get("responsibilities"):
                    fields["responsibilities"] = fields.pop("content")
            elif isinstance(parsed, list) and parsed and isinstance(parsed[0], dict):
                fields.update({k: _coerce_field_value(k, v) for k, v in parsed[0].items()})
        except (json.JSONDecodeError, TypeError):
            if module_type == "skill":
                fields["skill"] = text
            elif module_type in ("internship", "project"):
                fields["company" if module_type == "internship" else "title"] = parsed_title or text.split("\n", 1)[0]
                fields["responsibilities"] = text.split("\n", 1)[1].strip() if "\n" in text else text
            else:
                fields["content"] = text
    elif parsed_title:
        if module_type == "skill":
            fields["skill"] = parsed_title
        elif module_type == "internship":
            fields["company"] = parsed_title
        elif module_type == "project":
            fields["title"] = parsed_title
        else:
            fields["title"] = parsed_title

    if module_type == "internship" and not fields.get("company") and fields.get("title"):
        fields["company"] = fields["title"]
    if module_type == "project" and not fields.get("title") and fields.get("company"):
        fields["title"] = fields["company"]

    return fields


def fields_to_fact_content(module_type: str, fields: dict[str, Any]) -> str:
    """Serialize editor fields back to fact.content JSON string."""
    clean: dict[str, Any] = {}
    for key, value in (fields or {}).items():
        if value is None:
            continue
        if key == "tech_stack":
            stack = value if isinstance(value, list) else []
            if stack:
                clean[key] = stack
            continue
        text = str(value).strip() if not isinstance(value, list) else value
        if text:
            clean[key] = text
    if not clean:
        return ""
    return json.dumps(clean, ensure_ascii=False)


def derive_title_and_content(module_type: str, fields: dict[str, Any]) -> tuple[str, str]:
    """Map structured fields to resume SectionItem title/content."""
    if module_type == "internship":
        title = str(fields.get("company") or fields.get("title") or "").strip()
        parts = [
            str(fields.get("role") or "").strip(),
            str(fields.get("responsibilities") or "").strip(),
            str(fields.get("achievements") or "").strip(),
        ]
        content = "\n\n".join(p for p in parts if p)
        return title, content
    if module_type == "project":
        title = str(fields.get("title") or fields.get("name") or "").strip()
        parts = [
            str(fields.get("role") or "").strip(),
            str(fields.get("responsibilities") or "").strip(),
            str(fields.get("achievements") or "").strip(),
        ]
        content = "\n\n".join(p for p in parts if p)
        return title, content
    if module_type == "skill":
        skill = str(fields.get("skill") or fields.get("title") or "").strip()
        level = str(fields.get("level") or "").strip()
        context = str(fields.get("context") or fields.get("content") or "").strip()
        return skill, level or context
    title = str(fields.get("title") or fields.get("company") or fields.get("skill") or "").strip()
    content = str(fields.get("content") or fields.get("description") or fields.get("responsibilities") or "").strip()
    return title, content


def translatable_fields(fields: dict[str, Any]) -> dict[str, Any]:
    """Subset of fields to send for LLM translation."""
    result: dict[str, Any] = {}
    for key, value in (fields or {}).items():
        if key in NON_TRANSLATABLE_FIELDS:
            continue
        if key == "tech_stack":
            continue
        if isinstance(value, str) and value.strip():
            result[key] = value.strip()
    return result


def translation_key_lists(fields: dict[str, Any]) -> tuple[list[str], list[str]]:
    """Return (translate_keys, preserve_keys) for all entries in fields."""
    translate_keys: list[str] = []
    preserve_keys: list[str] = []
    for key, value in (fields or {}).items():
        if key in NON_TRANSLATABLE_FIELDS or key == "tech_stack":
            preserve_keys.append(key)
        elif isinstance(value, str) and value.strip():
            translate_keys.append(key)
        elif value not in (None, "", []):
            preserve_keys.append(key)
    return translate_keys, preserve_keys


def build_translation_module_json(
    module_id: str,
    module_type: str,
    fields: dict[str, Any],
    *,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build module JSON for translation — includes unknown/extra field keys."""
    translate_keys, preserve_keys = translation_key_lists(fields)
    payload: dict[str, Any] = {
        "id": module_id,
        "module_type": module_type,
        "fields": dict(fields or {}),
        "translate_keys": translate_keys,
        "preserve_keys": preserve_keys,
    }
    if extra:
        payload.update(extra)
    return payload


def merge_translated_fields(
    original: dict[str, Any],
    translated: dict[str, Any],
) -> dict[str, Any]:
    """Apply translated text fields; preserve dates and non-text values."""
    merged = dict(original or {})
    for key, value in (translated or {}).items():
        if key in NON_TRANSLATABLE_FIELDS or key == "tech_stack":
            continue
        if isinstance(value, str) and value.strip():
            merged[key] = value.strip()
    return merged


def apply_polish_to_fields(
    module_type: str,
    fields: dict[str, Any],
    *,
    title: str,
    content: str,
) -> dict[str, Any]:
    """Map polished title/content back into structured fields."""
    merged = dict(fields or {})
    polished_title = (title or "").strip()
    polished_content = (content or "").strip()
    if module_type == "internship":
        if polished_title:
            merged["company"] = polished_title
        if polished_content:
            merged["responsibilities"] = polished_content
    elif module_type == "project":
        if polished_title:
            merged["title"] = polished_title
        if polished_content:
            merged["responsibilities"] = polished_content
    else:
        if polished_title:
            merged["title"] = polished_title
        if polished_content:
            merged["content"] = polished_content
    return merged
