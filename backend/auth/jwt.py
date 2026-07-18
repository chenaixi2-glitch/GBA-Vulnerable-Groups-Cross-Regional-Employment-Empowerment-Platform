"""JWT 校验 — 与 Node 认证服务共用同一 secret。"""

from __future__ import annotations

from typing import Any

import jwt
from fastapi import Request

from config_loader import get_jwt_config
from log import get_logger

logger = get_logger("auth")


def verify_token(token: str) -> dict[str, Any] | None:
    """校验 Bearer Token，成功返回 payload，失败返回 None。"""
    try:
        cfg = get_jwt_config()
        # Node auth signs `sub: user.id` (number). PyJWT 2.x requires sub to be a string per RFC 7519.
        return jwt.decode(
            token,
            cfg["secret"],
            algorithms=["HS256"],
            options={"verify_sub": False},
        )
    except jwt.PyJWTError as exc:
        logger.debug("JWT verification failed: %s", exc)
        return None


def extract_bearer_token(request: Request) -> str | None:
    """从 Authorization 头提取 Bearer Token（原始字符串，不做校验）。"""
    header = request.headers.get("authorization") or ""
    parts = header.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    return token or None


def get_optional_user(request: Request) -> dict[str, Any] | None:
    """从请求头解析可选登录用户，未登录或 token 无效时返回 None。"""
    token = extract_bearer_token(request)
    if not token:
        return None
    return verify_token(token)


def get_required_user(request: Request) -> dict[str, Any]:
    """从请求头解析登录用户，未登录或 token 无效时抛出 401。"""
    from fastapi import HTTPException

    user = get_optional_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Login required")
    return user
