"""JD 缓存持久化与查询服务。"""

from __future__ import annotations

import json
from typing import Any

from log import get_logger
from storage.mysql_client import MySQLStore, get_mysql_pool
from tools.jd_cache import (
    analysis_output_to_parsed_job,
    extract_title_from_jd,
    jd_text_hash,
    new_cache_id,
    normalize_job_title,
    params_cache_key,
)

logger = get_logger("storage")


async def _get_store() -> MySQLStore:
    pool = await get_mysql_pool()
    return MySQLStore(pool)


def _decode_parsed_job(raw: Any) -> dict[str, Any] | None:
    if raw is None:
        return None
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return None
    return None


async def lookup_jd_cache_by_hash(text_hash: str) -> dict[str, Any] | None:
    if not text_hash:
        return None
    try:
        store = await _get_store()
        return await store.get_jd_cache_by_hash(text_hash)
    except Exception as exc:
        logger.warning("JD cache lookup by hash failed: %s", exc)
        return None


async def lookup_jd_cache_by_title(job_title: str) -> dict[str, Any] | None:
    normalized = normalize_job_title(job_title)
    if not normalized:
        return None
    try:
        store = await _get_store()
        row = await store.get_jd_cache_by_title(normalized)
        if row:
            await store.increment_jd_cache_hit(row["id"])
        return row
    except Exception as exc:
        logger.warning("JD cache lookup by title failed: %s", exc)
        return None


async def lookup_jd_cache_by_params(
    industry: str,
    employer_type: str,
    experience_level: str,
) -> dict[str, Any] | None:
    key = params_cache_key(industry, employer_type, experience_level)
    try:
        store = await _get_store()
        row = await store.get_jd_cache_by_params(key)
        if row:
            await store.increment_jd_cache_hit(row["id"])
        return row
    except Exception as exc:
        logger.warning("JD cache lookup by params failed: %s", exc)
        return None


async def save_jd_cache(
    *,
    jd_text: str,
    title: str = "",
    job_title: str = "",
    source: str = "generated",
    industry: str = "",
    employer_type: str = "",
    experience_level: str = "",
    parsed_job: dict[str, Any] | None = None,
    params_key_value: str | None = None,
) -> None:
    """写入或更新 JD 缓存（按 JD 哈希 / 岗位名 / 生成参数 upsert）。"""
    text = (jd_text or "").strip()
    if not text:
        return

    resolved_title = (title or job_title or extract_title_from_jd(text)).strip()
    resolved_job_title = (job_title or resolved_title).strip()
    normalized = normalize_job_title(resolved_job_title) or None
    text_hash = jd_text_hash(text)

    payload = {
        "id": new_cache_id(),
        "job_title": resolved_job_title,
        "job_title_normalized": normalized,
        "jd_text": text,
        "jd_text_hash": text_hash,
        "title": resolved_title,
        "source": source if source in ("generated", "uploaded") else "generated",
        "industry": industry or "",
        "employer_type": employer_type or "",
        "experience_level": experience_level or "",
        "params_key": params_key_value or None,
        "parsed_job": parsed_job,
    }

    try:
        store = await _get_store()
        await store.upsert_jd_cache(payload)
        logger.info(
            "JD cache saved title=%s source=%s hash=%s",
            resolved_job_title,
            payload["source"],
            text_hash[:12],
        )
    except Exception as exc:
        logger.warning("JD cache save failed: %s", exc)


async def save_parsed_jd_cache(
    *,
    jd_text: str,
    parsed: Any,
    source: str = "uploaded",
) -> None:
    """保存用户上传/解析后的 JD 及结构化结果。"""
    parsed_job = analysis_output_to_parsed_job(parsed)
    job_title = parsed_job.get("title") or extract_title_from_jd(jd_text)
    await save_jd_cache(
        jd_text=jd_text,
        title=parsed_job.get("title") or job_title,
        job_title=job_title,
        source=source,
        industry=parsed_job.get("industry") or "",
        parsed_job=parsed_job,
    )
