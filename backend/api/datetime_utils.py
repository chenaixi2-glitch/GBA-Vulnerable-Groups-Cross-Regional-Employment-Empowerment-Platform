"""UTC datetime serialization helpers for API responses."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def serialize_utc_datetime(value: Any) -> str | None:
    """Serialize a UTC-naive DB DATETIME (or datetime) to ISO-8601 with Z.

    MySQL DATETIME columns are stored as UTC without timezone info. Returning
    them as plain strings causes browsers to treat them as local time and show
    the wrong clock for users outside UTC.
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    text = str(value).strip()
    if not text:
        return text
    if text.endswith(("Z", "z")):
        return text[:-1] + "Z" if text.endswith("z") else text

    # Already has an explicit offset, e.g. +08:00 / -05:00
    if len(text) > 10 and ("+" in text[10:] or text[10:].count("-") >= 1):
        return text.replace(" ", "T", 1) if "T" not in text else text

    # Naive "YYYY-MM-DD HH:MM:SS[.fff]" — treat as UTC
    normalized = text.replace(" ", "T", 1)
    return normalized + "Z"
