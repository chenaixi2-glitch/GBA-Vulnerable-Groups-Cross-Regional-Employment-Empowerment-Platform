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
    "work": [
        "company", "role", "title", "start_date", "end_date",
        "tech_stack", "responsibilities", "achievements",
    ],
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

# Employment entries share company/role field layout (work + internship).
_EMPLOYMENT_TYPES = frozenset({"work", "internship"})


def is_employment_type(module_type: str) -> bool:
    return module_type in _EMPLOYMENT_TYPES


_DATE_SUFFIX_RE = re.compile(r"\s*[（(]([^）)]+)[）)]\s*$")
_DATE_LIKE_RE = re.compile(
    r"(?:20\d{2}|19\d{2}|Present|至今|今|"
    r"Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?|"
    r"\d{1,2}\s*月)",
    re.IGNORECASE,
)


def is_composite_display_title(title: str) -> bool:
    """True for polished display titles like ``ACME — Intern (Jul 2024 – Sep 2024)``."""
    text = (title or "").strip()
    if not text:
        return False
    if "—" in text or "–" in text:
        return True
    suffix = _DATE_SUFFIX_RE.search(text)
    return bool(suffix and _DATE_LIKE_RE.search(suffix.group(1)))


def _parse_date_range_suffix(text: str) -> tuple[str, str, str] | None:
    """If ``text`` ends with a date-like parenthetical, return (head, start, end)."""
    raw = (text or "").strip()
    match = _DATE_SUFFIX_RE.search(raw)
    if not match:
        return None
    range_text = match.group(1).strip()
    if not _DATE_LIKE_RE.search(range_text):
        return None
    parts = [p.strip() for p in re.split(r"\s*[–—]\s*|\s+-\s+", range_text) if p.strip()]
    start = parts[0] if parts else ""
    end = " – ".join(parts[1:]) if len(parts) >= 2 else ""
    head = raw[: match.start()].strip()
    return head, start, end


def split_composite_display_title(title: str) -> dict[str, str] | None:
    """Split a resume display title into company/role/start_date/end_date."""
    raw = (title or "").strip()
    if not raw or not is_composite_display_title(raw):
        return None

    result = {"company": "", "role": "", "start_date": "", "end_date": ""}
    head = raw
    peeled = _parse_date_range_suffix(raw)
    if peeled:
        head, start, end = peeled
        result["start_date"] = start
        result["end_date"] = end

    dash_parts = [p.strip() for p in re.split(r"\s*[—–]\s*", head) if p.strip()]
    if len(dash_parts) >= 2:
        result["company"] = dash_parts[0]
        result["role"] = " — ".join(dash_parts[1:])
    else:
        result["company"] = head
    return result


def _empty_fields(module_type: str) -> dict[str, Any]:
    order = MODULE_FIELD_ORDER.get(module_type, MODULE_FIELD_ORDER["custom"])
    empty: dict[str, Any] = {}
    for key in order:
        empty[key] = [] if key == "tech_stack" else ""
    return empty


def _peel_dates_from_role(fields: dict[str, Any]) -> dict[str, Any]:
    """If role still carries a trailing date range, move it into start/end fields."""
    out = dict(fields or {})
    role = str(out.get("role") or "").strip()
    peeled = _parse_date_range_suffix(role)
    if not peeled:
        return out
    head, start, end = peeled
    if head:
        out["role"] = head
    if start and not str(out.get("start_date") or "").strip():
        out["start_date"] = start
    if end and not str(out.get("end_date") or "").strip():
        out["end_date"] = end
    return out


def normalize_experience_fields(module_type: str, fields: dict[str, Any]) -> dict[str, Any]:
    """Normalize work/internship/project fields after LLM extraction.

    Profile extraction often puts the job title in ``title`` and leaves ``role``
    empty. The editor and resume export only display ``role``, so copy ``title``
    into ``role`` when company is already set and role is missing.
    """
    out = dict(fields or {})
    if module_type not in ("work", "internship", "project"):
        return out

    # Unsquash if company/title accidentally holds a composite display string.
    if is_employment_type(module_type) and is_composite_display_title(str(out.get("company") or "")):
        split = split_composite_display_title(str(out.get("company") or ""))
        if split:
            out["company"] = split["company"] or out.get("company")
            if split["role"] and not str(out.get("role") or "").strip():
                out["role"] = split["role"]
            if split["start_date"] and not str(out.get("start_date") or "").strip():
                out["start_date"] = split["start_date"]
            if split["end_date"] and not str(out.get("end_date") or "").strip():
                out["end_date"] = split["end_date"]
    if module_type == "project" and is_composite_display_title(str(out.get("title") or "")):
        split = split_composite_display_title(str(out.get("title") or ""))
        if split:
            out["title"] = split["company"] or out.get("title")
            if split["role"] and not str(out.get("role") or "").strip():
                out["role"] = split["role"]
            if split["start_date"] and not str(out.get("start_date") or "").strip():
                out["start_date"] = split["start_date"]
            if split["end_date"] and not str(out.get("end_date") or "").strip():
                out["end_date"] = split["end_date"]

    # Role may still hold dates when only company was split from the display title.
    out = _peel_dates_from_role(out)

    company = str(out.get("company") or "").strip()
    role = str(out.get("role") or "").strip()
    title = str(out.get("title") or out.get("name") or "").strip()

    if is_employment_type(module_type):
        if not role and title and company and title != company and not is_composite_display_title(title):
            out["role"] = title
        elif not company and title and not role and not is_composite_display_title(title):
            # Legacy: company-only extraction stored the employer in title.
            out["company"] = title
        elif not company and title and role and title != role and not is_composite_display_title(title):
            out["company"] = title
    elif module_type == "project":
        if not title and company:
            out["title"] = company
        # role stays as-is for projects (person's role on the project)

    return out


def _apply_display_title_to_fields(
    module_type: str,
    fields: dict[str, Any],
    display_title: str,
    *,
    overwrite: bool = False,
) -> dict[str, Any]:
    """Map a resume display title into structured fields without stuffing composites."""
    merged = dict(fields or {})
    title = (display_title or "").strip()
    if not title:
        return merged

    target_key = "company" if is_employment_type(module_type) else ("title" if module_type == "project" else "")
    if not target_key:
        if not merged.get("title"):
            merged["title"] = title
        return merged

    split = split_composite_display_title(title)
    if not split:
        if overwrite or not str(merged.get(target_key) or "").strip():
            merged[target_key] = title
        return merged

    current = str(merged.get(target_key) or "").strip()
    if split["company"] and (overwrite or not current or is_composite_display_title(current)):
        merged[target_key] = split["company"]
    if split["role"] and (
        not str(merged.get("role") or "").strip()
        or _parse_date_range_suffix(str(merged.get("role") or ""))
    ):
        merged["role"] = split["role"]
    if split["start_date"] and not str(merged.get("start_date") or "").strip():
        merged["start_date"] = split["start_date"]
    if split["end_date"] and not str(merged.get("end_date") or "").strip():
        merged["end_date"] = split["end_date"]
    return merged


def _coerce_field_value(key: str, value: Any) -> Any:
    if key == "tech_stack":
        if isinstance(value, list):
            return [str(v).strip() for v in value if str(v).strip()]
        if isinstance(value, str) and value.strip():
            return [part.strip() for part in value.split(",") if part.strip()]
        return []
    if value is None:
        return ""
    # Bullet lists from polish/LLM must stay multi-line in editor textareas.
    if isinstance(value, list):
        return "\n".join(str(v).strip() for v in value if str(v).strip())
    if isinstance(value, dict):
        return value
    return str(value).strip()


def _assign_plain_experience_body(fields: dict[str, Any], text: str) -> dict[str, Any]:
    """Map plain resume body into responsibilities / achievements.

    Matches ``derive_title_and_content``, which joins those two with blank lines.
    """
    body = (text or "").strip()
    if not body:
        fields["responsibilities"] = ""
        return fields
    paras = [p.strip() for p in re.split(r"\n\s*\n+", body) if p.strip()]
    if len(paras) >= 2:
        fields["responsibilities"] = paras[0]
        fields["achievements"] = "\n\n".join(paras[1:])
    else:
        fields["responsibilities"] = body
    return fields


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
                if module_type in ("work", "internship", "project") and fields.get("content") and not fields.get("responsibilities"):
                    fields["responsibilities"] = fields.pop("content")
            elif isinstance(parsed, list) and parsed and isinstance(parsed[0], dict):
                fields.update({k: _coerce_field_value(k, v) for k, v in parsed[0].items()})
        except (json.JSONDecodeError, TypeError):
            if module_type == "skill":
                fields["skill"] = text
            elif is_employment_type(module_type) or module_type == "project":
                # When a display title is already known (resume sync), keep the full
                # body — do not treat the first content line as a title and drop it.
                # Legacy plain facts without a title still use line 1 as the title.
                if parsed_title:
                    fields = _apply_display_title_to_fields(
                        module_type, fields, parsed_title, overwrite=True
                    )
                    fields = _assign_plain_experience_body(fields, text)
                else:
                    fields = _apply_display_title_to_fields(
                        module_type, fields, text.split("\n", 1)[0], overwrite=True
                    )
                    fields["responsibilities"] = (
                        text.split("\n", 1)[1].strip() if "\n" in text else text
                    )
            else:
                fields["content"] = text
    elif parsed_title:
        if module_type == "skill":
            fields["skill"] = parsed_title
        elif is_employment_type(module_type) or module_type == "project":
            fields = _apply_display_title_to_fields(
                module_type, fields, parsed_title, overwrite=True
            )
        else:
            fields["title"] = parsed_title

    # Polished resume items pass a composite display title alongside plain-text content;
    # fill any missing company/role/dates without overwriting structured JSON fields.
    if parsed_title and (is_employment_type(module_type) or module_type == "project"):
        fields = _apply_display_title_to_fields(
            module_type, fields, parsed_title, overwrite=False
        )

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

    Work/internship/project titles follow: Company — Role (start – end).
    Dates come from editor/profile fields so PDF preview shows employment time.
    """
    fields = normalize_experience_fields(module_type, fields)
    if is_employment_type(module_type):
        company = str(fields.get("company") or "").strip()
        role = str(fields.get("role") or "").strip()
        # Fallback: job title may still only exist in title after older facts.
        title_field = str(fields.get("title") or "").strip()
        if not role and title_field and title_field != company and not is_composite_display_title(title_field):
            role = title_field
        if not company and title_field and title_field != role and not is_composite_display_title(title_field):
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
    merged = _apply_display_title_to_fields(
        module_type,
        fields,
        title,
        overwrite=not is_composite_display_title(title),
    )
    polished_content = (content or "").strip()
    if polished_content:
        if is_employment_type(module_type) or module_type == "project":
            merged["responsibilities"] = polished_content
        else:
            merged["content"] = polished_content
    return normalize_experience_fields(module_type, merged)