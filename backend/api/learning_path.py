"""Learning path API — timeline edit, expand, save, history."""

from __future__ import annotations

import math
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, model_validator

from agents.learning_path_agent import (
    estimate_span_from_timeline,
    expand_timeline_phase,
    recommend_timeline_unit,
)
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


def _estimate_span(timeline: list[LearningPathPhase]) -> int:
    return estimate_span_from_timeline(timeline)


def _duration_payload(state: CopilotState) -> dict[str, Any]:
    hours = int(state.learning_path_estimated_hours or 0)
    daily = float(state.learning_path_daily_hours or 0)
    unit = state.learning_path_timeline_unit or recommend_timeline_unit(hours, daily or 1.0)
    if hours and daily > 0:
        total_days = max(1, math.ceil(hours / daily))
        total_weeks = max(1, math.ceil(total_days / 7))
        total_months = max(1, math.ceil(total_days / 30))
    else:
        total_days = total_weeks = total_months = 0
    span = _estimate_span(state.learning_path_timeline) or {
        "day": total_days,
        "week": total_weeks,
        "month": total_months,
    }.get(unit, total_weeks)
    return {
        "timeline_unit": unit,
        "estimated_days": total_days,
        "estimated_weeks": total_weeks,
        "estimated_months": total_months,
        "estimated_span": span,
    }


def _build_plan_payload(state: CopilotState) -> dict[str, Any]:
    target_job = state.job.title if state.job else ""
    industry = state.job.industry if state.job else ""
    duration = _duration_payload(state)
    return {
        "gaps": [g.model_dump() for g in state.gaps],
        "resources": [r.model_dump() for r in state.learning_path_resources],
        "timeline": [p.model_dump() for p in state.learning_path_timeline],
        "questions_to_ask": [q.model_dump() for q in state.questions_to_ask],
        "target_job": target_job,
        "industry": industry,
        "estimated_total_hours": state.learning_path_estimated_hours,
        "daily_hours": state.learning_path_daily_hours,
        **duration,
    }


class TimelinePhaseInput(BaseModel):
    phase: int = 1
    title: str = ""
    period: str = ""
    unit: str = "week"
    skills: list[str] = Field(default_factory=list)
    description: str = ""
    children: list["TimelinePhaseInput"] = Field(default_factory=list)
    # legacy
    weeks: str = ""
    days: str = ""

    @model_validator(mode="before")
    @classmethod
    def _compat(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        data = dict(data)
        if not str(data.get("period") or "").strip():
            if str(data.get("days") or "").strip():
                data["period"] = data["days"]
                data.setdefault("unit", "day")
            elif str(data.get("weeks") or "").strip():
                data["period"] = data["weeks"]
                data.setdefault("unit", "week")
        return data


class UpdateTimelineRequest(BaseModel):
    session_id: str
    timeline: list[TimelinePhaseInput]


class ExpandTimelineRequest(BaseModel):
    session_id: str
    phase_index: int = Field(ge=0)
    target_unit: str = "day"


class SaveLearningPathRequest(BaseModel):
    session_id: str
    record_id: str = ""


def _phase_from_input(item: TimelinePhaseInput) -> LearningPathPhase:
    unit = (item.unit or "week").strip().lower()
    if unit not in {"month", "week", "day"}:
        unit = "week"
    return LearningPathPhase(
        phase=item.phase or 1,
        title=item.title.strip(),
        period=(item.period or item.days or item.weeks or "").strip(),
        unit=unit,
        skills=[s.strip() for s in item.skills if s.strip()],
        description=item.description.strip(),
        children=[_phase_from_input(child) for child in item.children],
    )


@router.put("/timeline")
async def update_timeline(req: UpdateTimelineRequest, request: Request) -> dict[str, Any]:
    """Update edited timeline in session (Redis)."""
    user = get_optional_user(request)
    await ensure_session_access(req.session_id, user)

    if not req.timeline:
        raise HTTPException(status_code=400, detail="Timeline cannot be empty")

    state = await _load_state(req.session_id)
    phases = [_phase_from_input(item) for index, item in enumerate(req.timeline)]
    for index, phase in enumerate(phases):
        if not phase.phase:
            phase.phase = index + 1

    state.learning_path_timeline = phases
    if phases:
        state.learning_path_timeline_unit = phases[0].unit
    await _save_state(req.session_id, state)

    duration = _duration_payload(state)
    return {
        "ok": True,
        "message": "Timeline updated.",
        "session_id": req.session_id,
        "timeline": [p.model_dump() for p in phases],
        **duration,
    }


@router.post("/timeline/expand")
async def expand_timeline(req: ExpandTimelineRequest, request: Request) -> dict[str, Any]:
    """Expand one phase into a finer plan (month→week, week→day)."""
    user = get_optional_user(request)
    await ensure_session_access(req.session_id, user)

    state = await _load_state(req.session_id)
    if not state.learning_path_timeline:
        raise HTTPException(status_code=400, detail="Generate a timeline first")

    try:
        result = await expand_timeline_phase(state, req.phase_index, req.target_unit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        logger.error("Timeline expand failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Expand failed: {exc}") from exc

    state.learning_path_timeline = result["learning_path_timeline"]
    await _save_state(req.session_id, state)

    duration = _duration_payload(state)
    return {
        "ok": True,
        "message": "Phase expanded.",
        "session_id": req.session_id,
        "timeline": [p.model_dump() for p in state.learning_path_timeline],
        "phase_index": req.phase_index,
        **duration,
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
    estimated_weeks = int(plan.get("estimated_span") or plan.get("estimated_weeks") or 0)
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

    from api.datetime_utils import serialize_utc_datetime

    for row in records:
        if row.get("saved_at") is not None:
            row["saved_at"] = serialize_utc_datetime(row["saved_at"])
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

    from api.datetime_utils import serialize_utc_datetime

    if record.get("saved_at") is not None:
        record["saved_at"] = serialize_utc_datetime(record["saved_at"])

    return record
