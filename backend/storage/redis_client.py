"""Redis 客户端封装：基于 redis.asyncio 的异步会话状态读写。"""

from __future__ import annotations

import asyncio
import json
from typing import Any

import redis.asyncio as aioredis

from config_loader import get_redis_config
from log import get_logger

logger = get_logger("storage")

_redis_client: aioredis.Redis | None = None
_redis_lock: asyncio.Lock | None = None
_using_fakeredis = False

# 默认 TTL 24 小时
_DEFAULT_TTL = 60 * 60 * 24
# 已登录用户简历草稿 TTL 12 小时
_DRAFT_TTL_LOGGED_IN = 60 * 60 * 12


def _get_init_lock() -> asyncio.Lock:
    """Lazy lock so imports work before an event loop exists."""
    global _redis_lock
    if _redis_lock is None:
        _redis_lock = asyncio.Lock()
    return _redis_lock


def is_using_fakeredis() -> bool:
    """True when the process fell back to in-memory FakeRedis (non-durable)."""
    return _using_fakeredis


async def get_redis_client() -> aioredis.Redis:
    """获取 Redis 异步连接（单例）；本地无 Redis 时回退 fakeredis。

    Uses a lock so concurrent first requests cannot create multiple FakeRedis
    instances (which would make sessions appear as 404 across requests).
    """
    global _redis_client, _using_fakeredis
    if _redis_client is not None:
        return _redis_client

    async with _get_init_lock():
        if _redis_client is not None:
            return _redis_client

        cfg = get_redis_config()
        # Fail fast when Redis is down — long reconnect retries widen the race window.
        from redis.backoff import NoBackoff
        from redis.retry import Retry

        real_client = aioredis.Redis(
            host=cfg["host"],
            port=cfg["port"],
            db=cfg["db"],
            password=cfg.get("password") or None,
            decode_responses=True,
            socket_connect_timeout=0.5,
            socket_timeout=0.5,
            retry=Retry(NoBackoff(), 0),
        )
        try:
            if not await real_client.ping():
                raise ConnectionError("Redis PING failed")
            _redis_client = real_client
            _using_fakeredis = False
            logger.info("Redis async client initialized: %s:%s db=%s", cfg["host"], cfg["port"], cfg["db"])
        except Exception as exc:
            try:
                await real_client.aclose()
            except Exception:
                pass
            try:
                import fakeredis.aioredis as fakeredis_aioredis

                fake = fakeredis_aioredis.FakeRedis(decode_responses=True)
                await fake.ping()
                _redis_client = fake
                _using_fakeredis = True
                logger.warning(
                    "Real Redis unavailable (%s); falling back to in-memory fakeredis "
                    "(sessions are lost on process restart / reload — start Redis on %s:%s for durable sessions)",
                    exc,
                    cfg["host"],
                    cfg["port"],
                )
            except Exception as fallback_exc:
                logger.error("Redis and fakeredis both unavailable: %s", fallback_exc)
                raise

    return _redis_client


class RedisSessionStore:
    """会话级 Redis 异步状态管理。"""

    def __init__(self, session_id: str, client: aioredis.Redis, ttl: int = _DEFAULT_TTL):
        self.session_id = session_id
        self.ttl = ttl
        self._client = client

    # ---- key helpers ----
    def _state_key(self) -> str:
        return f"session:{self.session_id}:state"

    def _events_key(self) -> str:
        return f"session:{self.session_id}:events"

    def _lock_key(self) -> str:
        return f"session:{self.session_id}:lock"

    def _owner_key(self) -> str:
        return f"session:{self.session_id}:owner"

    # ---- state CRUD ----
    async def save_state(self, state: dict[str, Any]) -> None:
        key = self._state_key()
        await self._client.set(key, json.dumps(state, ensure_ascii=False, default=str), ex=self.ttl)
        logger.debug("Saved state for session %s", self.session_id)

    async def load_state(self) -> dict[str, Any] | None:
        data = await self._client.get(self._state_key())
        if data is None:
            return None
        return json.loads(data)

    async def delete_state(self) -> None:
        await self._client.delete(self._state_key(), self._events_key(), self._owner_key())
        logger.info("Deleted state for session %s", self.session_id)

    # ---- ownership ----
    async def get_owner(self) -> int | None:
        data = await self._client.get(self._owner_key())
        if data is None:
            return None
        return int(data)

    async def set_owner(self, user_id: int) -> None:
        await self._client.set(self._owner_key(), str(user_id), ex=self.ttl)

    # ---- events ----
    async def append_event(self, event: dict[str, Any]) -> None:
        await self._client.rpush(self._events_key(), json.dumps(event, ensure_ascii=False, default=str))
        await self._client.expire(self._events_key(), self.ttl)

    async def get_events(self) -> list[dict[str, Any]]:
        raw = await self._client.lrange(self._events_key(), 0, -1)
        return [json.loads(item) for item in raw]

    # ---- distributed lock ----
    async def acquire_lock(self, timeout: int = 30) -> bool:
        return bool(await self._client.set(self._lock_key(), "1", nx=True, ex=timeout))

    async def release_lock(self) -> None:
        await self._client.delete(self._lock_key())


class RedisDraftStore:
    """简历编辑草稿 Redis 存储（已登录用户 12h 可恢复）。"""

    def __init__(self, client: aioredis.Redis, session_id: str, user_id: str | int | None = None):
        self._client = client
        self.session_id = session_id
        self.user_id = str(user_id) if user_id is not None else None

    def _session_draft_key(self) -> str:
        return f"session:{self.session_id}:draft"

    def _user_draft_key(self) -> str:
        return f"user:{self.user_id}:resume_draft"

    async def save_draft(self, draft: dict[str, Any], *, logged_in: bool = False) -> None:
        ttl = _DRAFT_TTL_LOGGED_IN if logged_in else _DEFAULT_TTL
        payload = json.dumps(draft, ensure_ascii=False, default=str)
        await self._client.set(self._session_draft_key(), payload, ex=ttl)

        if logged_in and self.user_id:
            link = json.dumps({
                "session_id": self.session_id,
                "updated_at": draft.get("updated_at", ""),
            }, ensure_ascii=False)
            await self._client.set(self._user_draft_key(), link, ex=_DRAFT_TTL_LOGGED_IN)
            await self._client.set(
                f"user:{self.user_id}:resume_draft_data",
                payload,
                ex=_DRAFT_TTL_LOGGED_IN,
            )
        logger.debug("Saved resume draft session=%s user=%s", self.session_id, self.user_id)

    async def load_draft(self) -> dict[str, Any] | None:
        data = await self._client.get(self._session_draft_key())
        if data is None:
            return None
        return json.loads(data)

    async def clear_draft(self) -> None:
        """Remove session and user-linked draft keys (e.g. before a fresh resume upload)."""
        await self._client.delete(self._session_draft_key())
        if self.user_id:
            await self._client.delete(self._user_draft_key())
            await self._client.delete(f"user:{self.user_id}:resume_draft_data")
        logger.debug("Cleared resume draft session=%s user=%s", self.session_id, self.user_id)

    @classmethod
    async def load_user_draft(cls, client: aioredis.Redis, user_id: str | int) -> dict[str, Any] | None:
        data = await client.get(f"user:{user_id}:resume_draft_data")
        if data is None:
            return None
        return json.loads(data)

    @classmethod
    async def get_user_session_id(cls, client: aioredis.Redis, user_id: str | int) -> str | None:
        link_raw = await client.get(f"user:{user_id}:resume_draft")
        if not link_raw:
            return None
        link = json.loads(link_raw)
        return link.get("session_id")
