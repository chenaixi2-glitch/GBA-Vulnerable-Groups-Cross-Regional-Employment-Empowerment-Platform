"""Post-validation and field-level translation repair for UI-language agent outputs."""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel

from agents.json_contracts import BatchTranslationOutput
from models.llm import _ainvoke_model, _extract_text_content, ainvoke_json_with_schema, get_translation_llm
from tools.resume_layout import is_cjk_resume_language, language_label, normalize_language
from log import get_logger, elapsed_ms, log_stage_timing

_guard_logger = get_logger("agent")

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
    "github", "linkedin", "start_date", "end_date",
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


def _module_key_from_path(path: str) -> str:
    """Group violating field paths by list-item module (e.g. profile.education[1])."""
    match = re.match(r"^(.+\[\d+\])", path)
    if match:
        return match.group(1)
    if "." in path:
        return path.split(".", 1)[0]
    return "__root__"


def _relative_field_path(module_key: str, path: str) -> str:
    if module_key == "__root__":
        return path
    prefix = f"{module_key}."
    if path.startswith(prefix):
        return path[len(prefix):]
    return path


def _get_value_at_path(data: Any, path: str) -> Any:
    if path == "__root__":
        return data
    cursor = data
    for token in _parse_path_tokens(path):
        cursor = cursor[token]
    return cursor


def _set_subtree_at_path(data: Any, path: str, value: Any) -> None:
    if path == "__root__":
        if isinstance(data, dict) and isinstance(value, dict):
            for key, item in value.items():
                data[key] = item
        return
    tokens = _parse_path_tokens(path)
    cursor = data
    for token in tokens[:-1]:
        cursor = cursor[token]
    cursor[tokens[-1]] = value


def _merge_module_regeneration(
    payload: dict[str, Any],
    module_key: str,
    regenerated: dict[str, Any],
    *,
    language: str,
    logger: Any,
    agent_name: str,
) -> None:
    if module_key == "__root__":
        for key, value in regenerated.items():
            if key in payload and isinstance(value, str):
                if text_violates_language(value, language):
                    logger.warning("%s module regeneration still violates language at %s", agent_name, key)
                    continue
                payload[key] = value
            elif key in payload:
                payload[key] = value
        return

    current = _get_value_at_path(payload, module_key)
    if isinstance(current, dict) and isinstance(regenerated, dict):
        merged = {**current, **regenerated}
        _set_subtree_at_path(payload, module_key, merged)
        return
    _set_subtree_at_path(payload, module_key, regenerated)


def _violations_still_present(
    model: BaseModel,
    violations: list[LanguageViolation],
    *,
    field_languages: dict[str, str] | None = None,
) -> list[LanguageViolation]:
    payload = model.model_dump()
    remaining: list[LanguageViolation] = []
    for item in violations:
        try:
            text = _get_value_at_path(payload, item.path)
        except (KeyError, IndexError, TypeError):
            remaining.append(item)
            continue
        if not isinstance(text, str):
            continue
        lang = _language_for_path(item.path, item.expected_language, field_languages)
        if text_violates_language(text, lang):
            remaining.append(LanguageViolation(path=item.path, text=text, expected_language=lang))
    return remaining


def _apply_field_repairs(model: BaseModel, repairs: dict[str, str]) -> BaseModel:
    if not repairs:
        return model
    payload = model.model_dump()
    for path, text in repairs.items():
        _set_value_at_path(payload, path, text)
    return type(model).model_validate(payload)


def _build_batch_translate_prompt(violations: list[LanguageViolation], language: str) -> str:
    label = language_label(language)
    entries = [{"path": item.path, "text": item.text} for item in violations]
    return (
        f"Translate each text field into {label} ONLY.\n"
        "Rules:\n"
        f"- Return a single JSON object: {{\"translations\": {{\"<path>\": \"<translated text>\", ...}}}}\n"
        f"- Each value must be entirely in {label}.\n"
        "- Keep proper nouns, product names, and common technical terms when appropriate.\n"
        "- If a text is already entirely in the target language, return it unchanged.\n"
        "- Do not output Markdown, code blocks, or explanations.\n\n"
        f"Fields:\n{json.dumps(entries, ensure_ascii=False, indent=2)}"
    )


async def _batch_translate_fields(
    llm: Any,
    violations: list[LanguageViolation],
    language: str,
    logger: Any,
    agent_name: str,
) -> tuple[dict[str, str], list[LanguageViolation]]:
    if not violations:
        return {}, []

    if len(violations) == 1:
        item = violations[0]
        translated = await _translate_text(
            llm, item.text, language, logger, agent_name, item.path,
        )
        if translated != item.text and not text_violates_language(translated, language):
            return {item.path: translated}, []
        return {}, [item]

    prompt = _build_batch_translate_prompt(violations, language)
    try:
        parsed = await ainvoke_json_with_schema(
            llm, prompt, BatchTranslationOutput, logger, f"{agent_name} (batch translate)",
        )
    except RuntimeError as exc:
        logger.warning("%s batch translation failed, falling back to single-field: %s", agent_name, exc)
        repairs: dict[str, str] = {}
        failed: list[LanguageViolation] = []
        for item in violations:
            translated = await _translate_text(
                llm, item.text, language, logger, agent_name, item.path,
            )
            if translated != item.text and not text_violates_language(translated, language):
                repairs[item.path] = translated
            else:
                failed.append(item)
        return repairs, failed

    repairs: dict[str, str] = {}
    failed: list[LanguageViolation] = []
    for item in violations:
        translated = (parsed.translations.get(item.path) or "").strip()
        if not translated:
            logger.warning("%s batch translation missing path %s", agent_name, item.path)
            failed.append(item)
            continue
        if text_violates_language(translated, language):
            logger.warning("%s batch translation still violates language at %s", agent_name, item.path)
            failed.append(item)
            continue
        if translated != item.text:
            repairs[item.path] = translated
    return repairs, failed


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


async def _translate_text(
    llm: Any,
    text: str,
    language: str,
    logger: Any,
    agent_name: str,
    path: str,
    *,
    enhanced: bool = False,
) -> str:
    label = language_label(language)
    if enhanced:
        prompt = (
            f"Translate the following text into {label} ONLY.\n"
            "Rules:\n"
            f"- A previous repair attempt failed — output MUST be entirely in {label}.\n"
            f"- Field path: {path}\n"
            f"- Output ONLY the translated text in {label}, with no quotes or explanation.\n"
            "- Keep proper nouns, product names, and common technical terms when appropriate.\n\n"
            f"Text:\n{text}"
        )
    else:
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


async def _repair_failed_violations(
    llm: Any,
    violations: list[LanguageViolation],
    logger: Any,
    agent_name: str,
) -> dict[str, str]:
    """Second-pass field repair — only for violations that failed the first batch."""
    repairs: dict[str, str] = {}
    for item in violations:
        translated = await _translate_text(
            llm,
            item.text,
            item.expected_language,
            logger,
            agent_name,
            item.path,
            enhanced=True,
        )
        if translated != item.text:
            repairs[item.path] = translated
    return repairs


async def repair_language_violations(
    model: BaseModel,
    violations: list[LanguageViolation],
    llm: Any,
    logger: Any,
    agent_name: str,
    *,
    field_languages: dict[str, str] | None = None,
) -> tuple[BaseModel, list[LanguageViolation]]:
    """Translate violating fields; retry repair only on fields that failed the first pass."""
    if not violations:
        return model, []

    translation_llm = get_translation_llm()
    by_lang: dict[str, list[LanguageViolation]] = {}
    for item in violations:
        by_lang.setdefault(item.expected_language, []).append(item)

    repairs: dict[str, str] = {}
    failed: list[LanguageViolation] = []
    for lang, group in by_lang.items():
        batch_repairs, batch_failed = await _batch_translate_fields(
            translation_llm, group, lang, logger, agent_name,
        )
        repairs.update(batch_repairs)
        failed.extend(batch_failed)

    repaired = _apply_field_repairs(model, repairs) if repairs else model

    if failed:
        logger.warning(
            "%s retrying repair for %d failed field(s): %s",
            agent_name,
            len(failed),
            [item.path for item in failed[:8]],
        )
        retry_repairs = await _repair_failed_violations(translation_llm, failed, logger, agent_name)
        if retry_repairs:
            repaired = _apply_field_repairs(repaired, retry_repairs)

    unresolved = _violations_still_present(repaired, violations, field_languages=field_languages)
    return repaired, unresolved


async def _regenerate_failed_modules(
    llm: Any,
    model: BaseModel,
    violations: list[LanguageViolation],
    language: str,
    logger: Any,
    agent_name: str,
) -> BaseModel:
    """Regenerate JSON for each module that still has language violations."""
    from models.llm import parse_json_response

    if not violations:
        return model

    by_module: dict[str, list[LanguageViolation]] = {}
    for item in violations:
        by_module.setdefault(_module_key_from_path(item.path), []).append(item)

    payload = model.model_dump()
    label = language_label(language)

    for module_key, module_violations in by_module.items():
        try:
            module_data = _get_value_at_path(payload, module_key)
        except (KeyError, IndexError, TypeError):
            logger.warning("%s cannot read module at %s for regeneration", agent_name, module_key)
            continue

        rel_fields = [_relative_field_path(module_key, item.path) for item in module_violations]
        prompt = (
            f"以下简历模块仍有字段未使用{label}，请仅重新生成该模块的 JSON（不要输出其他模块）。\n"
            f"需修正字段：{', '.join(rel_fields)}\n"
            f"当前模块：\n{json.dumps(module_data, ensure_ascii=False, indent=2)}\n\n"
            f"要求：输出单个 JSON 对象，包含该模块的全部字段，且所有自然语言字段必须为{label}，禁止中英混用。\n"
            "仅输出 JSON，不要 Markdown 或解释。"
        )
        try:
            response = await _ainvoke_model(llm, prompt)
            raw = _extract_text_content(response)
            regenerated = parse_json_response(raw)
            if not isinstance(regenerated, dict):
                logger.warning("%s module regeneration returned non-object for %s", agent_name, module_key)
                continue
            _merge_module_regeneration(
                payload,
                module_key,
                regenerated,
                language=language,
                logger=logger,
                agent_name=agent_name,
            )
            logger.info("%s regenerated module %s", agent_name, module_key)
        except Exception as exc:
            logger.warning("%s module regeneration failed for %s: %s", agent_name, module_key, exc)

    return type(model).model_validate(payload)


async def ainvoke_json_with_language_guard(
    llm: Any,
    prompt: str,
    schema: type[BaseModel],
    logger: Any,
    agent_name: str,
    expected_language: str,
    *,
    field_languages: dict[str, str] | None = None,
    retry_unresolved_modules: bool = False,
    max_module_retries: int = 1,
) -> BaseModel:
    """Parse JSON output, post-validate language, then translate violating fields."""
    lang = normalize_language(expected_language)

    parse_t0 = time.perf_counter()
    parsed = await ainvoke_json_with_schema(llm, prompt, schema, logger, agent_name)
    log_stage_timing(
        _guard_logger,
        f"{agent_name}.llm_parse",
        elapsed_ms(parse_t0),
        language=lang,
    )

    violations = find_language_violations(parsed, lang, field_languages=field_languages)
    if not violations:
        return parsed

    logger.warning(
        "%s language violations (%d): %s — translating fields",
        agent_name,
        len(violations),
        [item.path for item in violations[:8]],
    )

    repair_t0 = time.perf_counter()
    parsed, unresolved = await repair_language_violations(
        parsed,
        violations,
        llm,
        logger,
        agent_name,
        field_languages=field_languages,
    )
    log_stage_timing(
        _guard_logger,
        f"{agent_name}.language_repair",
        elapsed_ms(repair_t0),
        language=lang,
        violations=len(violations),
        unresolved=len(unresolved),
    )

    if not unresolved:
        logger.info("%s language field repair succeeded", agent_name)
        return parsed

    module_attempt = 0
    while unresolved and retry_unresolved_modules and module_attempt < max_module_retries:
        module_attempt += 1
        module_keys = sorted({_module_key_from_path(item.path) for item in unresolved})
        logger.warning(
            "%s unresolved violations (%d) in %d module(s) %s — regenerating failed modules only",
            agent_name,
            len(unresolved),
            len(module_keys),
            module_keys[:6],
        )
        regen_t0 = time.perf_counter()
        parsed = await _regenerate_failed_modules(
            llm, parsed, unresolved, lang, logger, agent_name,
        )
        log_stage_timing(
            _guard_logger,
            f"{agent_name}.module_regenerate",
            elapsed_ms(regen_t0),
            language=lang,
            modules=len(module_keys),
            attempt=module_attempt,
        )
        unresolved = find_language_violations(parsed, lang, field_languages=field_languages)
        if not unresolved:
            logger.info("%s module regeneration resolved all language violations", agent_name)
            return parsed

        repair_t0 = time.perf_counter()
        parsed, unresolved = await repair_language_violations(
            parsed,
            unresolved,
            llm,
            logger,
            agent_name,
            field_languages=field_languages,
        )
        log_stage_timing(
            _guard_logger,
            f"{agent_name}.language_repair_after_regen",
            elapsed_ms(repair_t0),
            language=lang,
            unresolved=len(unresolved),
        )

    if unresolved:
        logger.warning(
            "%s unresolved language violations (%d): %s",
            agent_name,
            len(unresolved),
            [item.path for item in unresolved[:8]],
        )
    else:
        logger.info("%s language repair succeeded after module regeneration", agent_name)
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
    translated = await _translate_text(get_translation_llm(), stripped, lang, logger, agent_name, "text")
    return translated or text
