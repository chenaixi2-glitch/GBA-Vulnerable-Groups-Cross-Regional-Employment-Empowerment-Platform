"""Learning path API — timeline edit, save, history."""

from __future__ import annotations

import re
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from api.chat import _aload_state, _asave_state
from auth.jwt import get_optional_user
from auth.session_access import bind_session_owner, ensure_session_access, extract_user_id
from storage.redis_client import get_redis_client, RedisSessionStore
from storage.mysql_client import get_mysql_pool, MySQLStore
from workflow.state import CopilotState, LearningPathPhase
from log import get_logger

logger = get_logger("api")

router = APIRouter(prefix="/api/learning-path", tags=["learning-path"])


async def _load_state(session_id: str) -> CopilotState:
    client = await get_redis_client()
    store = RedisSessionStore(session_id, client)
    saved = await _aload_state(store)
    if saved:
        return CopilotState.model_validate(saved)
    return CopilotState(session_id=session_id)


async def _save_state(session_id: str, state: CopilotState) -> None:
    client = await get_redis_client()
    store = RedisSessionStore(session_id, client)
    persist_data = state.model_dump(exclude={
        "user_message", "user_attachments", "current_intent",
        "execution_plan", "reply_message", "triggered_agents",
        "workflow_trace", "resume_language_target",
    })
    await _asave_state(store, persist_data)


def _estimate_weeks_from_timeline(timeline: list[LearningPathPhase]) -> int:
    if not timeline:
        return 0
    last = timeline[-1].weeks
    match = re.search(r"(\d+)\s*$", last or "")
    if match:
        return int(match.group(1))
    return len(timeline) * 4


def _build_plan_payload(state: CopilotState) -> dict[str, Any]:
    target_job = state.job.title if state.job else ""
    industry = state.job.industry if state.job else ""
    return {
        "gaps": [g.model_dump() for g in state.gaps],
        "resources": [r.model_dump() for r in state.learning_path_resources],
        "timeline": [p.model_dump() for p in state.learning_path_timeline],
        "questions_to_ask": [q.model_dump() for q in state.questions_to_ask],
        "target_job": target_job,
        "industry": industry,
        "estimated_total_hours": state.learning_path_estimated_hours,
        "daily_hours": state.learning_path_daily_hours,
        "estimated_weeks": _estimate_weeks_from_timeline(state.learning_path_timeline),
    }


class TimelinePhaseInput(BaseModel):
    phase: int = 1
    title: str = ""
    weeks: str = ""
    skills: list[str] = Field(default_factory=list)
    description: str = ""


class UpdateTimelineRequest(BaseModel):
    session_id: str
    timeline: list[TimelinePhaseInput]


class SaveLearningPathRequest(BaseModel):
    session_id: str
    record_id: str = ""


@router.put("/timeline")
async def update_timeline(req: UpdateTimelineRequest, request: Request) -> dict[str, Any]:
    """Update edited timeline in session (Redis)."""
    user = get_optional_user(request)
    await ensure_session_access(req.session_id, user)

    if not req.timeline:
        raise HTTPException(status_code=400, detail="Timeline cannot be empty")

    state = await _load_state(req.session_id)
    phases = [
        LearningPathPhase(
            phase=item.phase or index + 1,
            title=item.title.strip(),
            weeks=item.weeks.strip(),
            skills=[s.strip() for s in item.skills if s.strip()],
            description=item.description.strip(),
        )
        for index, item in enumerate(req.timeline)
    ]

    state.learning_path_timeline = phases
    await _save_state(req.session_id, state)

    estimated_weeks = _estimate_weeks_from_timeline(phases)
    return {
        "ok": True,
        "message": "Timeline updated.",
        "session_id": req.session_id,
        "timeline": [p.model_dump() for p in phases],
        "estimated_weeks": estimated_weeks,
    }


@router.post("/save")
async def save_learning_path(req: SaveLearningPathRequest, request: Request) -> dict[str, Any]:
    """Save learning path plan to MySQL for logged-in user."""
    user = get_optional_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="请先登录后再保存学习路径")

    user_id = extract_user_id(user)
    if user_id is None:
        raise HTTPException(status_code=401, detail="无效的用户身份")

    await bind_session_owner(req.session_id, user)

    state = await _load_state(req.session_id)
    if not state.learning_path_timeline:
        raise HTTPException(status_code=400, detail="请先生成并确认学习 timeline 后再保存")
    if not state.gaps and not state.learning_path_resources:
        raise HTTPException(status_code=400, detail="缺少能力缺口或学习资源，无法保存")

    plan = _build_plan_payload(state)
    target_job = plan["target_job"] or "Learning Path"
    industry = plan["industry"] or ""
    estimated_weeks = plan["estimated_weeks"] or _estimate_weeks_from_timeline(state.learning_path_timeline)
    row_id = req.record_id.strip() or f"lpp_{uuid.uuid4().hex[:16]}"

    pool = await get_mysql_pool()
    db = MySQLStore(pool)
    try:
        await db.upsert_session(req.session_id, user_id=user_id)
        await db.save_learning_path_plan(
            row_id=row_id,
            session_id=req.session_id,
            user_id=user_id,
            target_job=target_job,
            industry=industry,
            estimated_total_hours=state.learning_path_estimated_hours,
            daily_hours=float(state.learning_path_daily_hours or 0),
            estimated_weeks=estimated_weeks,
            phase_count=len(state.learning_path_timeline),
            data=plan,
        )
    except Exception as exc:
        logger.error("Learning path save failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"保存失败: {exc}")

    return {
        "ok": True,
        "message": "学习路径已保存到您的账户。",
        "session_id": req.session_id,
        "record_id": row_id,
    }


@router.get("/history")
async def learning_path_history(request: Request, limit: int = 20) -> dict[str, Any]:
    """List saved learning path plans for logged-in user."""
    user = get_optional_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="请先登录")

    user_id = extract_user_id(user)
    if user_id is None:
        raise HTTPException(status_code=401, detail="无效的用户身份")

    pool = await get_mysql_pool()
    db = MySQLStore(pool)
    records = await db.list_learning_path_plans_by_user(user_id, limit=min(limit, 50))

    for row in records:
        if row.get("saved_at") is not None:
            row["saved_at"] = str(row["saved_at"])
        if row.get("daily_hours") is not None:
            row["daily_hours"] = float(row["daily_hours"])

    return {"records": records}


@router.get("/saved/{record_id}")
async def get_saved_learning_path(record_id: str, request: Request) -> dict[str, Any]:
    """Get a single saved learning path plan."""
    user = get_optional_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="请先登录")

    user_id = extract_user_id(user)
    if user_id is None:
        raise HTTPException(status_code=401, detail="无效的用户身份")

    pool = await get_mysql_pool()
    db = MySQLStore(pool)
    record = await db.get_learning_path_plan_for_user(record_id, user_id)
    if record is None:
        raise HTTPException(status_code=404, detail="记录不存在或无权访问")

    if record.get("saved_at") is not None:
        record["saved_at"] = str(record["saved_at"])

    return record
