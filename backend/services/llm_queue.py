"""Redis-backed LLM job queue — limits concurrent AI workloads across workers."""

from __future__ import annotations

import asyncio
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

import redis.asyncio as aioredis

from config_loader import get_llm_queue_config
from log import get_logger
from storage.redis_client import get_redis_client

logger = get_logger("api")

_WAITING_KEY = "llm:queue:waiting"
_RUNNING_KEY = "llm:queue:running"
_JOB_PREFIX = "llm:queue:job:"
_SESSION_JOB_PREFIX = "llm:queue:session:"
_SESSION_LOCK_PREFIX = "llm:queue:session_lock:"


class SessionBusyError(Exception):
    """Raised when a session already has an in-flight LLM job."""


# Machine-readable API detail — frontend maps via i18n apiMessages
SESSION_BUSY_API_DETAIL = "SESSION_BUSY"


def _job_key(job_id: str) -> str:
    return f"{_JOB_PREFIX}{job_id}"


def _session_job_key(session_id: str) -> str:
    return f"{_SESSION_JOB_PREFIX}{session_id}"


def _session_lock_key(session_id: str) -> str:
    return f"{_SESSION_LOCK_PREFIX}{session_id}"


async def _session_lock_retry_seconds(client: aioredis.Redis, session_id: str) -> int:
    if not session_id:
        return 0
    ttl = int(await client.ttl(_session_lock_key(session_id)))
    return max(ttl, 0)


async def _running_job_retry_seconds(
    client: aioredis.Redis, job_id: str, cfg: dict[str, Any]
) -> int:
    enqueued = await client.hget(_job_key(job_id), "enqueued_at")
    if not enqueued:
        return int(cfg["avg_job_seconds"])
    elapsed = time.time() - float(enqueued)
    return max(0, int(cfg["avg_job_seconds"] - elapsed))


def _queue_status_payload(
    *,
    cfg: dict[str, Any],
    status: str,
    running_count: int,
    waiting_count: int,
    position: int = 0,
    ahead: int = 0,
    estimated_wait_seconds: int = 0,
    retry_after_seconds: int = 0,
    job_id: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "enabled": True,
        "status": status,
        "position": position,
        "ahead": ahead,
        "running_count": running_count,
        "waiting_count": waiting_count,
        "max_concurrent": cfg["max_concurrent"],
        "estimated_wait_seconds": estimated_wait_seconds,
        "retry_after_seconds": max(int(retry_after_seconds), 0),
    }
    if job_id:
        payload["job_id"] = job_id
    return payload


async def get_queue_status(session_id: str) -> dict[str, Any]:
    """Return queue position / running state for a session (for frontend polling)."""
    cfg = get_llm_queue_config()
    client = await get_redis_client()

    running_count = int(await client.get(_RUNNING_KEY) or 0)
    waiting_count = int(await client.zcard(_WAITING_KEY) or 0)
    lock_retry = await _session_lock_retry_seconds(client, session_id)

    if not cfg["enabled"]:
        return {
            "enabled": False,
            "status": "idle" if lock_retry <= 0 else "running",
            "position": 0,
            "ahead": 0,
            "running_count": running_count,
            "waiting_count": waiting_count,
            "max_concurrent": cfg["max_concurrent"],
            "estimated_wait_seconds": 0,
            "retry_after_seconds": lock_retry,
        }

    job_id = await client.get(_session_job_key(session_id))
    if not job_id:
        if lock_retry > 0:
            return _queue_status_payload(
                cfg=cfg,
                status="running",
                running_count=running_count,
                waiting_count=waiting_count,
                retry_after_seconds=lock_retry,
            )
        return _queue_status_payload(
            cfg=cfg,
            status="idle",
            running_count=running_count,
            waiting_count=waiting_count,
        )

    job_status = await client.hget(_job_key(job_id), "status")
    if job_status == "running":
        run_retry = await _running_job_retry_seconds(client, job_id, cfg)
        return _queue_status_payload(
            cfg=cfg,
            status="running",
            running_count=running_count,
            waiting_count=waiting_count,
            retry_after_seconds=max(lock_retry, run_retry),
            job_id=job_id,
        )

    rank = await client.zrank(_WAITING_KEY, job_id)
    if rank is None:
        if lock_retry > 0:
            return _queue_status_payload(
                cfg=cfg,
                status="running",
                running_count=running_count,
                waiting_count=waiting_count,
                retry_after_seconds=lock_retry,
                job_id=job_id,
            )
        return _queue_status_payload(
            cfg=cfg,
            status="idle",
            running_count=running_count,
            waiting_count=waiting_count,
            job_id=job_id,
        )

    ahead = int(rank)
    position = ahead + 1
    slots = max(cfg["max_concurrent"], 1)
    estimated_wait = int((ahead / slots) * cfg["avg_job_seconds"])

    return _queue_status_payload(
        cfg=cfg,
        status="queued",
        position=position,
        ahead=ahead,
        running_count=running_count,
        waiting_count=waiting_count,
        estimated_wait_seconds=estimated_wait,
        retry_after_seconds=max(lock_retry, estimated_wait),
        job_id=job_id,
    )


_GATE_KEY = "llm:queue:gate"


async def _try_acquire(client: aioredis.Redis, job_id: str, max_concurrent: int) -> tuple[bool, int, int]:
    rank = await client.zrank(_WAITING_KEY, job_id)
    if rank is None:
        return False, 0, 0

    running = int(await client.get(_RUNNING_KEY) or 0)
    if rank != 0 or running >= max_concurrent:
        return False, int(rank), running

    gate = await client.set(_GATE_KEY, job_id, nx=True, ex=2)
    if not gate:
        return False, int(rank), running

    try:
        rank = await client.zrank(_WAITING_KEY, job_id)
        running = int(await client.get(_RUNNING_KEY) or 0)
        if rank is None:
            return False, 0, running
        if rank == 0 and running < max_concurrent:
            await client.zrem(_WAITING_KEY, job_id)
            await client.incr(_RUNNING_KEY)
            return True, 0, running + 1
        return False, int(rank), running
    finally:
        await client.delete(_GATE_KEY)


async def _recover_stale_session_lock(client: aioredis.Redis, session_id: str) -> bool:
    """Clear orphaned session lock when the associated job no longer exists."""
    lock_key = _session_lock_key(session_id)
    existing_job_id = await client.get(lock_key)
    if not existing_job_id:
        return False

    session_job_id = await client.get(_session_job_key(session_id))
    if not session_job_id or session_job_id != existing_job_id:
        logger.warning(
            "LLM queue: clearing stale session lock (session job mismatch) session=%s",
            session_id,
        )
        await client.delete(lock_key)
        if session_job_id and session_job_id != existing_job_id:
            await client.delete(_session_job_key(session_id))
        return True

    if await client.zscore(_WAITING_KEY, existing_job_id) is not None:
        return False

    job_key = _job_key(existing_job_id)
    if await client.exists(job_key):
        status = await client.hget(job_key, "status")
        if status in ("queued", "running"):
            return False

    logger.warning(
        "LLM queue: clearing stale session lock (job gone) session=%s job=%s",
        session_id,
        existing_job_id,
    )
    await client.delete(lock_key)
    await client.delete(_session_job_key(session_id))
    await client.delete(job_key)
    return True


async def _release_slot(client: aioredis.Redis, job_id: str, session_id: str) -> None:
    running = int(await client.get(_RUNNING_KEY) or 0)
    if running > 0:
        await client.decr(_RUNNING_KEY)
    await client.delete(_job_key(job_id))
    await client.delete(_session_job_key(session_id))
    await client.delete(_session_lock_key(session_id))


@asynccontextmanager
async def llm_queue_slot(session_id: str) -> AsyncIterator[str]:
    """Enqueue an LLM job, wait for a slot, then release when done."""
    cfg = get_llm_queue_config()
    if not cfg["enabled"]:
        yield ""
        return

    client = await get_redis_client()
    job_id = f"job_{uuid.uuid4().hex[:16]}"
    lock_ttl = cfg["session_lock_ttl_seconds"]
    job_ttl = max(lock_ttl, 600)

    locked = await client.set(_session_lock_key(session_id), job_id, nx=True, ex=lock_ttl)
    if not locked:
        if await _recover_stale_session_lock(client, session_id):
            locked = await client.set(_session_lock_key(session_id), job_id, nx=True, ex=lock_ttl)
        if not locked:
            raise SessionBusyError(session_id)

    enqueued_at = time.time()
    try:
        await client.zadd(_WAITING_KEY, {job_id: enqueued_at})
        await client.hset(
            _job_key(job_id),
            mapping={
                "session_id": session_id,
                "status": "queued",
                "enqueued_at": str(enqueued_at),
            },
        )
        await client.expire(_job_key(job_id), job_ttl)
        await client.set(_session_job_key(session_id), job_id, ex=job_ttl)

        logger.info("LLM queue: enqueued job=%s session=%s", job_id, session_id)

        while True:
            acquired, ahead, running = await _try_acquire(client, job_id, cfg["max_concurrent"])
            if acquired:
                await client.hset(_job_key(job_id), "status", "running")
                logger.info("LLM queue: acquired job=%s session=%s running=%d", job_id, session_id, running)
                break
            logger.debug(
                "LLM queue: waiting job=%s session=%s ahead=%d running=%d",
                job_id, session_id, ahead, running,
            )
            await asyncio.sleep(cfg["poll_interval_seconds"])

        yield job_id
    finally:
        if cfg["enabled"]:
            await _release_slot(client, job_id, session_id)
            logger.info("LLM queue: released job=%s session=%s", job_id, session_id)
