"""GET /api/queue/status — LLM queue position for frontend polling."""

from __future__ import annotations

from fastapi import APIRouter, Request

from auth.jwt import get_optional_user
from auth.session_access import ensure_session_access
from services.llm_queue import get_queue_status

router = APIRouter(prefix="/api/queue", tags=["queue"])


@router.get("/status")
async def queue_status(session_id: str, request: Request) -> dict:
    """Return queue position for a session while a long-running AI request is in flight."""
    user = get_optional_user(request)
    if session_id:
        await ensure_session_access(session_id, user)
    return await get_queue_status(session_id or "")
