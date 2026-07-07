"""Post-validation and field-level translation repair for UI-language agent outputs."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel

from models.llm import _ainvoke_model, _extract_text_content, ainvoke_json_with_schema
from tools.resume_layout import is_cjk_resume_language, language_label, normalize_language

_CJK_RE = re.compile(r"[\u4e00-\u9fff\u3400-\u4dbf]")
_LATIN_WORD_RE = re.compile(r"[a-zA-Z]{3,}")
_ENGLISH_VERB_RE = re.compile(
    r"\b(developed|implemented|designed|managed|led|built|created|responsible|achieved|improved|maintained|experience|skills?|ability|please|describe|your|the|and|with|for|this|that|have|has|will|would|should|could|about|what|how|why|when|where|which|missing|required|recommend|suggest|analysis|description|question|answer|feedback|strength|weakness|improvement)\b",
    re.IGNORECASE,
)
_TECH_TERMS = frozenset({
    "python", "java", "react", "mysql", "linux", "github", "spring", "docker", "kubernetes",
    "aws", "azure", "redis", "nginx", "vue", "node", "typescript", "javascript", "golang",
    "postgresql", "mongodb", "flutter", "swift", "kotlin", "pandas", "numpy", "tensorflow",
    "pytorch", "spark", "hadoop", "excel", "office", "html", "css", "api", "sql", "rest",
    "boot", "cloud", "unix", "macos", "windows", "android", "ios", "gitlab", "json", "http",
    "https", "linkedin", "github", "gpt", "llm", "rag", "nlp", "ml", "ai", "devops", "ci",
    "cd", "k8s", "grpc", "oauth", "jwt", "tcp", "udp", "dns", "ssl", "tls", "crm", "erp",
})
_SKIP_FIELD_NAMES = frozenset({
    "id", "type", "severity", "priority", "status", "category", "target_field", "source_refs",
    "updated_at", "url", "platform", "email", "phone", "version", "stage_id", "follow_up_type",
    "template_id", "theme", "font_family", "layout_mode", "spacing_scale", "accent_style",
    "resolution_source", "fact_id", "section_type", "answer_ref", "stage_index", "language",
    "github", "linkedin", "city", "name", "school", "major", "degree", "start_date", "end_date",
    "duration", "rating", "estimated_hours", "duration_hours", "phase", "weeks", "score",
    "overall_score", "relevance", "groundedness", "actionability", "needs_clarification",
    "resolved", "should_end", "dimensions_covered", "resume_cleared", "can_decide",
    "no_more_value", "hard_mismatch", "high_match", "dense_mode", "visibility_map",
})
_ID_LIKE_RE = re.compile(r"^(gap_|q_|rem_|res_|job_|sess_|fb_|turn_|fact_)[a-z0-9_]+$", re.I)
_URL_RE = re.compile(r"^https?://", re.I)
_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


@dataclass(frozen=True)
class LanguageViolation:
    path: str
    text: str
    expected_language: str


def _line_has_cjk(text: str) -> bool:
    return bool(_CJK_RE.search(text))


def _line_has_english_prose(text: str) -> bool:
    stripped = text.strip()
    if not stripped:
        return False
    if _ENGLISH_VERB_RE.search(stripped):
        return True
    if not _line_has_cjk(stripped):
        return bool(_LATIN_WORD_RE.search(stripped))
    for chunk in _LATIN_WORD_RE.findall(stripped):
        if len(chunk) >= 5 and chunk.lower() not in _TECH_TERMS:
            return True
    return False


def _is_skippable_string(text: str) -> bool:
    stripped = (text or "").strip()
    if len(stripped) < 2:
        return True
    if _ID_LIKE_RE.match(stripped):
        return True
    if _URL_RE.match(stripped) or _EMAIL_RE.match(stripped):
        return True
    if re.fullmatch(r"[\d\s\W]+", stripped):
        return True
    if stripped.lower() in _TECH_TERMS:
        return True
    if re.fullmatch(r"[a-z_]+", stripped, re.I) and len(stripped) <= 24:
        return True
    return False


def text_violates_language(text: str, language: str) -> bool:
    """Return True when natural-language text clearly violates the expected output language."""
    stripped = (text or "").strip()
    if _is_skippable_string(stripped):
        return False

    lang = normalize_language(language)
    has_cjk = _line_has_cjk(stripped)

    if is_cjk_resume_language(lang):
        if not has_cjk and _line_has_english_prose(stripped):
            return True
        if has_cjk and _line_has_english_prose(stripped):
            return True
        return False

    return has_cjk


def _language_for_path(path: str, default_language: str, field_languages: dict[str, str] | None) -> str:
    if not field_languages:
        return normalize_language(default_language)
    best_lang = normalize_language(default_language)
    best_len = -1
    for prefix, lang in field_languages.items():
        if path == prefix or path.startswith(f"{prefix}[") or path.startswith(f"{prefix}."):
            if len(prefix) > best_len:
                best_len = len(prefix)
                best_lang = normalize_language(lang)
    return best_lang


def _walk_string_fields(value: Any, prefix: str, *, skip_root_name: bool = False) -> list[tuple[str, str]]:
    found: list[tuple[str, str]] = []

    if isinstance(value, BaseModel):
        model_cls = type(value)
        for name in model_cls.model_fields:
            if skip_root_name and not prefix and name in _SKIP_FIELD_NAMES:
                continue
            child = getattr(value, name)
            child_prefix = f"{prefix}.{name}" if prefix else name
            if name in _SKIP_FIELD_NAMES and not isinstance(child, (list, BaseModel, dict)):
                continue
            found.extend(_walk_string_fields(child, child_prefix))
        return found

    if isinstance(value, list):
        for index, item in enumerate(value):
            found.extend(_walk_string_fields(item, f"{prefix}[{index}]"))
        return found

    if isinstance(value, dict):
        for key, item in value.items():
            if key in _SKIP_FIELD_NAMES and not isinstance(item, (list, BaseModel, dict)):
                continue
            child_prefix = f"{prefix}.{key}" if prefix else str(key)
            found.extend(_walk_string_fields(item, child_prefix))
        return found

    if isinstance(value, str):
        found.append((prefix, value))
    return found


def find_language_violations(
    model: BaseModel,
    expected_language: str,
    *,
    field_languages: dict[str, str] | None = None,
) -> list[LanguageViolation]:
    """Detect natural-language fields that violate the configured output language."""
    default_lang = normalize_language(expected_language)
    violations: list[LanguageViolation] = []
    for path, text in _walk_string_fields(model, ""):
        if not path:
            continue
        field_name = path.split("[", 1)[0].split(".")[-1]
        if field_name in _SKIP_FIELD_NAMES:
            continue
        lang = _language_for_path(path, default_lang, field_languages)
        if text_violates_language(text, lang):
            violations.append(LanguageViolation(path=path, text=text, expected_language=lang))
    return violations


def _parse_path_tokens(path: str) -> list[str | int]:
    tokens: list[str | int] = []
    for part in re.split(r"\.|\[|\]", path):
        if not part:
            continue
        tokens.append(int(part) if part.isdigit() else part)
    return tokens


def _set_value_at_path(data: Any, path: str, value: str) -> None:
    tokens = _parse_path_tokens(path)
    if not tokens:
        return
    cursor = data
    for token in tokens[:-1]:
        cursor = cursor[token]
    cursor[tokens[-1]] = value


def _apply_field_repairs(model: BaseModel, repairs: dict[str, str]) -> BaseModel:
    if not repairs:
        return model
    payload = model.model_dump()
    for path, text in repairs.items():
        _set_value_at_path(payload, path, text)
    return type(model).model_validate(payload)


def _build_translate_prompt(text: str, language: str) -> str:
    label = language_label(language)
    return (
        f"Translate the following text into {label} ONLY.\n"
        "Rules:\n"
        f"- Output ONLY the translated text in {label}, with no quotes or explanation.\n"
        "- Keep proper nouns, product names, and common technical terms when appropriate.\n"
        f"- If the text is already entirely in {label}, return it unchanged.\n\n"
        f"Text:\n{text}"
    )


async def _translate_text(llm: Any, text: str, language: str, logger: Any, agent_name: str, path: str) -> str:
    prompt = _build_translate_prompt(text, language)
    response = await _ainvoke_model(llm, prompt)
    translated = _extract_text_content(response).strip()
    if not translated:
        logger.warning("%s translation repair returned empty for %s", agent_name, path)
        return text
    if text_violates_language(translated, language):
        logger.warning("%s translation repair still violates language at %s", agent_name, path)
        return text
    return translated


async def repair_language_violations(
    model: BaseModel,
    violations: list[LanguageViolation],
    llm: Any,
    logger: Any,
    agent_name: str,
) -> BaseModel:
    """Translate only violating natural-language fields."""
    repairs: dict[str, str] = {}
    for item in violations:
        translated = await _translate_text(
            llm,
            item.text,
            item.expected_language,
            logger,
            agent_name,
            item.path,
        )
        if translated != item.text:
            repairs[item.path] = translated
    return _apply_field_repairs(model, repairs)


async def ainvoke_json_with_language_guard(
    llm: Any,
    prompt: str,
    schema: type[BaseModel],
    logger: Any,
    agent_name: str,
    expected_language: str,
    *,
    field_languages: dict[str, str] | None = None,
) -> BaseModel:
    """Parse JSON output, post-validate language, then translate violating fields."""
    lang = normalize_language(expected_language)
    parsed = await ainvoke_json_with_schema(llm, prompt, schema, logger, agent_name)

    violations = find_language_violations(parsed, lang, field_languages=field_languages)
    if not violations:
        return parsed

    logger.warning(
        "%s language violations (%d): %s — translating fields",
        agent_name,
        len(violations),
        [item.path for item in violations[:8]],
    )

    parsed = await repair_language_violations(parsed, violations, llm, logger, agent_name)
    remaining = find_language_violations(parsed, lang, field_languages=field_languages)
    if remaining:
        logger.warning(
            "%s unresolved language violations (%d): %s",
            agent_name,
            len(remaining),
            [item.path for item in remaining[:8]],
        )
    else:
        logger.info("%s language field repair succeeded", agent_name)
    return parsed


async def guard_text_output(
    llm: Any,
    text: str,
    expected_language: str,
    logger: Any,
    agent_name: str,
) -> str:
    """Post-validate and repair free-text agent output."""
    lang = normalize_language(expected_language)
    stripped = (text or "").strip()
    if not stripped or not text_violates_language(stripped, lang):
        return text

    logger.warning("%s free-text language violation detected", agent_name)
    translated = await _translate_text(llm, stripped, lang, logger, agent_name, "text")
    return translated or text
