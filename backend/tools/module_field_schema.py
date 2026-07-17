"""Structured resume module fields — parse/serialize and translate field selection."""

from __future__ import annotations

import json
import re
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


def normalize_experience_fields(module_type: str, fields: dict[str, Any]) -> dict[str, Any]:
    """Normalize internship/project fields after LLM extraction.

    Profile extraction often puts the job title in ``title`` and leaves ``role``
    empty. The editor and resume export only display ``role``, so copy ``title``
    into ``role`` when company is already set and role is missing.
    """
    out = dict(fields or {})
    if module_type not in ("internship", "project"):
        return out

    company = str(out.get("company") or "").strip()
    role = str(out.get("role") or "").strip()
    title = str(out.get("title") or out.get("name") or "").strip()

    if module_type == "internship":
        if not role and title and company and title != company:
            out["role"] = title
        elif not company and title and not role:
            # Legacy: company-only extraction stored the employer in title.
            out["company"] = title
        elif not company and title and role and title != role:
            out["company"] = title
    elif module_type == "project":
        if not title and company:
            out["title"] = company
        # role stays as-is for projects (person's role on the project)

    return out


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

    return normalize_experience_fields(module_type, fields)


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


def format_date_range(start: Any = None, end: Any = None) -> str:
    """Normalize start/end into a display date range for resume titles."""
    start_s = str(start or "").strip()
    end_s = str(end or "").strip()
    if start_s and end_s:
        return f"{start_s} – {end_s}"
    return start_s or end_s


def title_already_has_dates(title: str, fields: dict[str, Any] | None) -> bool:
    """True when title already includes the structured start/end dates."""
    text = str(title or "")
    fields = fields or {}
    start = str(fields.get("start_date") or fields.get("date") or "").strip()
    end = str(fields.get("end_date") or "").strip()
    if start and start in text:
        return True
    if end and end in text:
        return True
    return False


def enrich_title_with_dates(title: str, fields: dict[str, Any] | None) -> str:
    """Append (start – end) when structured dates exist and title lacks them."""
    fields = fields or {}
    date_range = format_date_range(fields.get("start_date") or fields.get("date"), fields.get("end_date"))
    head = str(title or "").strip()
    if not date_range:
        return head
    if title_already_has_dates(head, fields):
        return head
    return f"{head} ({date_range})" if head else date_range


def derive_title_and_content(module_type: str, fields: dict[str, Any]) -> tuple[str, str]:
    """Map structured fields to resume SectionItem title/content.

    Internship/project titles follow: Company — Role (start – end).
    Dates come from editor/profile fields so PDF preview shows internship time.
    """
    fields = normalize_experience_fields(module_type, fields)
    if module_type == "internship":
        company = str(fields.get("company") or "").strip()
        role = str(fields.get("role") or "").strip()
        # Fallback: job title may still only exist in title after older facts.
        title_field = str(fields.get("title") or "").strip()
        if not role and title_field and title_field != company:
            role = title_field
        if not company and title_field and title_field != role:
            company = title_field
        if company and role:
            head = f"{company} — {role}"
        else:
            head = company or role
        title = enrich_title_with_dates(head, fields)
        parts = [
            str(fields.get("responsibilities") or "").strip(),
            str(fields.get("achievements") or "").strip(),
        ]
        # Keep role in body only when it was not folded into the title head.
        if role and not company:
            parts.insert(0, role)
        content = "\n\n".join(p for p in parts if p)
        return title, content
    if module_type == "project":
        name = str(fields.get("title") or fields.get("name") or "").strip()
        role = str(fields.get("role") or "").strip()
        if name and role:
            head = f"{name} — {role}"
        else:
            head = name or role
        title = enrich_title_with_dates(head, fields)
        parts = [
            str(fields.get("responsibilities") or "").strip(),
            str(fields.get("achievements") or "").strip(),
        ]
        if role and not name:
            parts.insert(0, role)
        content = "\n\n".join(p for p in parts if p)
        return title, content
    if module_type == "skill":
        skill = str(fields.get("skill") or fields.get("title") or "").strip()
        level = str(fields.get("level") or "").strip()
        context = str(fields.get("context") or fields.get("content") or "").strip()
        return skill, level or context
    title = str(fields.get("title") or fields.get("company") or fields.get("skill") or "").strip()
    title = enrich_title_with_dates(title, fields)
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
    """Map polished title/content back into structured fields.

    Display titles may include role/dates (e.g. "ACME — Intern (2023-01 – 2023-06)");
    do not overwrite structured company/title with that composite string.
    """
    merged = dict(fields or {})
    polished_title = (title or "").strip()
    polished_content = (content or "").strip()
    composite = bool(
        polished_title
        and ("—" in polished_title or "–" in polished_title or "(" in polished_title)
    )
    if module_type == "internship":
        if polished_title and not composite:
            merged["company"] = polished_title
        elif polished_title and not merged.get("company"):
            # Fallback: take text before em-dash / parenthesis as company.
            head = re.split(r"\s*[—–(]", polished_title, maxsplit=1)[0].strip()
            if head:
                merged["company"] = head
        if polished_content:
            merged["responsibilities"] = polished_content
    elif module_type == "project":
        if polished_title and not composite:
            merged["title"] = polished_title
        elif polished_title and not merged.get("title"):
            head = re.split(r"\s*[—–(]", polished_title, maxsplit=1)[0].strip()
            if head:
                merged["title"] = head
        if polished_content:
            merged["responsibilities"] = polished_content
    else:
        if polished_title:
            merged["title"] = polished_title
        if polished_content:
            merged["content"] = polished_content
    return merged
