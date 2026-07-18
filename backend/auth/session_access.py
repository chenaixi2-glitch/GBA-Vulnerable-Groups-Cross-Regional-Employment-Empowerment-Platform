"""会话级访问控制 — 确保用户只能访问自己的会话数据。"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from storage.mysql_client import MySQLStore, get_mysql_pool
from storage.redis_client import RedisSessionStore, get_redis_client


def extract_user_id(user: dict[str, Any] | None) -> int | None:
    """从 JWT payload 提取用户 ID。"""
    if not user:
        return None
    sub = user.get("sub")
    if sub is None:
        return None
    return int(sub)


async def _get_session_owner(session_id: str) -> int | None:
    """从 Redis 或 MySQL 读取会话归属用户。"""
    client = await get_redis_client()
    store = RedisSessionStore(session_id, client)
    owner = await store.get_owner()
    if owner is not None:
        return owner

    pool = await get_mysql_pool()
    db = MySQLStore(pool)
    mysql_owner = await db.get_session_user_id(session_id)
    if mysql_owner is not None:
        await store.set_owner(mysql_owner)
    return mysql_owner


async def ensure_session_access(session_id: str, user: dict[str, Any] | None) -> None:
    """校验当前请求是否有权访问该会话。"""
    owner = await _get_session_owner(session_id)
    if owner is None:
        return

    current = extract_user_id(user)
    if current is None:
        raise HTTPException(status_code=401, detail="Login required to access this session")
    if current != owner:
        raise HTTPException(status_code=403, detail="Access denied to this session")


async def bind_session_owner(session_id: str, user: dict[str, Any]) -> int:
    """将会话绑定到当前登录用户（首次写入时生效）。"""
    user_id = extract_user_id(user)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid user identity")

    owner = await _get_session_owner(session_id)
    if owner is not None and owner != user_id:
        raise HTTPException(status_code=403, detail="Access denied to this session")

    if owner is None:
        client = await get_redis_client()
        store = RedisSessionStore(session_id, client)
        await store.set_owner(user_id)

    return user_id
