"""简历相关 API — GET/POST /api/resume/*"""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from storage.redis_client import get_redis_client, RedisSessionStore, RedisDraftStore
from auth.jwt import get_optional_user
from auth.session_access import bind_session_owner, ensure_session_access, extract_user_id
from workflow.state import CopilotState
from api.request_timing import build_request_timing
from log import get_logger, elapsed_ms, log_stage_timing, format_trace_breakdown

logger = get_logger("api")

router = APIRouter(prefix="/api/resume", tags=["resume"])


@router.get("/content")
async def get_resume_content(session_id: str, request: Request):
    """获取当前简历内容 JSON。"""
    from api.chat import _aload_state

    user = get_optional_user(request)
    await ensure_session_access(session_id, user)

    client = await get_redis_client()
    store = RedisSessionStore(session_id, client)
    saved = await _aload_state(store)
    if not saved:
        raise HTTPException(status_code=404, detail="会话不存在")
    state = CopilotState.model_validate(saved)
    if state.resume_content_json is None:
        raise HTTPException(status_code=404, detail="简历内容尚未生成")
    return {"resume_content_json": state.resume_content_json.model_dump()}


@router.get("/html")
async def get_resume_html(session_id: str, request: Request):
    """获取当前简历 HTML。"""
    from api.chat import _aload_state

    user = get_optional_user(request)
    await ensure_session_access(session_id, user)

    client = await get_redis_client()
    store = RedisSessionStore(session_id, client)
    saved = await _aload_state(store)
    if not saved:
        raise HTTPException(status_code=404, detail="会话不存在")
    state = CopilotState.model_validate(saved)
    if not state.resume_html.html:
        raise HTTPException(status_code=404, detail="简历 HTML 尚未生成")
    return {"resume_html": state.resume_html.model_dump()}


class EnsureRenderRequest(BaseModel):
    session_id: str


class OptimizeA4Request(BaseModel):
    session_id: str


@router.post("/optimize-a4")
async def optimize_resume_a4(req: OptimizeA4Request, request: Request, background_tasks: BackgroundTasks):
    """Dedicated A4 one-page optimize: Skills → page check → typography → experience compress.

    Does not run content_agent / chat rewrite.
    """
    from api.chat import _aload_state, _asave_state, _persist_to_mysql_safe
    from agents.a4_optimize_pipeline import run_a4_optimize_pipeline
    from api.draft_utils import (
        apply_draft_sections_to_resume_state,
        apply_profile_extras_to_resume_state,
    )
    from services.llm_queue import SessionBusyError, LlmTask, llm_queue_slot, session_busy_detail

    user = get_optional_user(request)
    await ensure_session_access(req.session_id, user)
    if user:
        await bind_session_owner(req.session_id, user)

    client = await get_redis_client()
    store = RedisSessionStore(req.session_id, client)
    saved = await _aload_state(store)
    if not saved:
        raise HTTPException(status_code=404, detail="会话不存在")

    state = CopilotState.model_validate(saved)
    if state.resume_content_json is None:
        raise HTTPException(status_code=400, detail="简历内容尚未生成，请先生成简历")

    draft_store = RedisDraftStore(client, req.session_id, user.get("sub") if user else None)
    draft = await draft_store.load_draft()
    if draft:
        state, _ = apply_draft_sections_to_resume_state(state, draft)
    state, _ = apply_profile_extras_to_resume_state(state)
    state.skip_render = False

    try:
        async with llm_queue_slot(req.session_id, LlmTask.RESUME_OPTIMIZE_A4):
            updates = await run_a4_optimize_pipeline(state)
    except SessionBusyError as exc:
        raise HTTPException(status_code=409, detail=session_busy_detail(exc))
    except Exception as exc:
        logger.error("A4 optimize failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"A4 优化失败: {exc}") from exc

    data = state.model_dump()
    data.update(updates)
    final = CopilotState.model_validate(data)

    persist_data = final.model_dump(exclude=_PERSIST_EXCLUDE)
    await _asave_state(store, persist_data)

    if user:
        background_tasks.add_task(_persist_to_mysql_safe, final, user.get("sub"))

    if not final.resume_html or not final.resume_html.html:
        raise HTTPException(status_code=500, detail="A4 优化结果为空，请重试")

    return {
        "reply_message": updates.get("reply_message") or "简历已优化为 A4 单页",
        "triggered_agents": updates.get("triggered_agents") or ["a4_optimize"],
        "resume_html": final.resume_html.model_dump(),
        "resume_content_json": final.resume_content_json.model_dump() if final.resume_content_json else None,
        "render_config": final.render_config.model_dump(),
        "language": (
            final.resume_content_json.meta.language
            if final.resume_content_json
            else final.render_config.language
        ),
    }


@router.post("/ensure-render")
async def ensure_resume_render(req: EnsureRenderRequest, request: Request, background_tasks: BackgroundTasks):
    """若已有 resume_content_json 但尚无 HTML，运行 render_agent 生成预览。"""
    from api.chat import _aload_state, _asave_state, _persist_to_mysql_safe
    from agents.render_agent import render_node_async
    from services.llm_queue import SessionBusyError, LlmTask, llm_queue_slot, session_busy_detail

    user = get_optional_user(request)
    await ensure_session_access(req.session_id, user)
    if user:
        await bind_session_owner(req.session_id, user)

    client = await get_redis_client()
    store = RedisSessionStore(req.session_id, client)
    saved = await _aload_state(store)
    if not saved:
        raise HTTPException(status_code=404, detail="会话不存在")

    state = CopilotState.model_validate(saved)
    if state.resume_content_json is None:
        raise HTTPException(status_code=400, detail="简历内容尚未生成，请先生成简历")

    from api.draft_utils import (
        apply_draft_sections_to_resume_state,
        apply_profile_extras_to_resume_state,
    )

    # Explicit preview/export should always render, even if generation deferred HTML.
    state.skip_render = False

    # Re-apply latest editor draft so education deletions/edits invalidate cached HTML.
    draft_store = RedisDraftStore(client, req.session_id, user.get("sub") if user else None)
    draft = await draft_store.load_draft()
    content_changed = False
    if draft:
        state, draft_changed = apply_draft_sections_to_resume_state(state, draft)
        content_changed = content_changed or draft_changed
    state, photo_changed = apply_profile_extras_to_resume_state(state)
    content_changed = content_changed or photo_changed
    if content_changed:
        persist_data = state.model_dump(exclude=_PERSIST_EXCLUDE)
        await _asave_state(store, persist_data)

    if state.resume_html and state.resume_html.html:
        return {
            "rendered": False,
            "resume_html": state.resume_html.model_dump(),
            "render_config": state.render_config.model_dump(),
        }

    try:
        async with llm_queue_slot(req.session_id, LlmTask.RESUME_RENDER):
            # Preview: fit via spacing/font only — do not rewrite skills/awards text.
            # Content shortening is reserved for the explicit Optimize A4 action.
            updates = await render_node_async(state, allow_content_fit=False)
    except SessionBusyError as exc:
        raise HTTPException(status_code=409, detail=session_busy_detail(exc))
    except Exception as exc:
        logger.error("Ensure render failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"预览渲染失败: {exc}") from exc

    data = state.model_dump()
    data.update(updates)
    final = CopilotState.model_validate(data)

    persist_data = final.model_dump(exclude=_PERSIST_EXCLUDE)
    await _asave_state(store, persist_data)

    if user:
        background_tasks.add_task(_persist_to_mysql_safe, final, user.get("sub"))

    if not final.resume_html or not final.resume_html.html:
        raise HTTPException(status_code=500, detail="预览渲染结果为空，请重试")

    return {
        "rendered": True,
        "resume_html": final.resume_html.model_dump(),
        "render_config": final.render_config.model_dump(),
    }


@router.get("/preview")
async def preview_resume_html(session_id: str, request: Request):
    """直接返回 HTML 用于浏览器预览。"""
    from api.chat import _aload_state

    user = get_optional_user(request)
    await ensure_session_access(session_id, user)

    client = await get_redis_client()
    store = RedisSessionStore(session_id, client)
    saved = await _aload_state(store)
    if not saved:
        raise HTTPException(status_code=404, detail="会话不存在")
    state = CopilotState.model_validate(saved)
    if not state.resume_html.html:
        raise HTTPException(status_code=404, detail="简历 HTML 尚未生成")
    return Response(content=state.resume_html.html, media_type="text/html")


@router.get("/preview-markdown")
async def preview_resume_markdown(session_id: str, request: Request):
    """返回 Markdown 文本用于预览（由结构化 JSON 生成，与导出一致）。"""
    from api.chat import _aload_state
    from api.export import _export_resume_markdown

    user = get_optional_user(request)
    await ensure_session_access(session_id, user)

    client = await get_redis_client()
    store = RedisSessionStore(session_id, client)
    saved = await _aload_state(store)
    if not saved:
        raise HTTPException(status_code=404, detail="会话不存在")
    state = CopilotState.model_validate(saved)
    if state.resume_content_json is None:
        raise HTTPException(status_code=404, detail="简历内容尚未生成")
    return {"markdown": _export_resume_markdown(state)}


class GenerateJdRequest(BaseModel):
    session_id: str
    industry: str
    experience_level: str
    employer_type: str = ""
    jd_draft: str = ""
    language: str = ""


class GenerateJdFromTitleRequest(BaseModel):
    session_id: str
    job_title: str
    industry: str = ""
    employer_type: str = ""
    experience_level: str = ""
    language: str = ""


class SetEmployerTypeRequest(BaseModel):
    session_id: str
    employer_type: str = Field(description="soe | public | foreign | private | npo | hmt | other")


class TargetJobContextRequest(BaseModel):
    session_id: str
    jd_text: str = ""
    industry: str = ""
    employer_type: str = ""
    experience_level: str = ""
    typography_fit_mode: str = ""


class ResumeDraftPayload(BaseModel):
    profile_basic: dict = {}
    education: list[dict] = Field(default_factory=list)
    modules: list[dict] = Field(default_factory=list)
    updated_at: str = ""


class SaveDraftRequest(BaseModel):
    session_id: str
    draft: ResumeDraftPayload


class SaveResumeRequest(BaseModel):
    session_id: str


class SaveProfileRequest(BaseModel):
    session_id: str
    draft: ResumeDraftPayload | None = None
    record_name: str = Field(default="", description="User-defined name for this saved record")
    record_id: str = Field(default="", description="If set, overwrite this existing saved record")


@router.get("/session/status")
async def get_session_resume_status(session_id: str, request: Request) -> dict:
    """Report whether the session has working resume data and/or persisted MySQL rows."""
    from api.chat import _aload_state
    from storage.mysql_client import get_mysql_pool, MySQLStore

    user = get_optional_user(request)
    await ensure_session_access(session_id, user)

    client = await get_redis_client()
    store = RedisSessionStore(session_id, client)
    saved = await _aload_state(store)

    has_working_profile = False
    has_generated_resume = False
    if saved:
        state = CopilotState.model_validate(saved)
        has_working_profile = state.candidate_profile is not None
        has_generated_resume = state.resume_content_json is not None

    draft_store = RedisDraftStore(client, session_id, user.get("sub") if user else None)
    if await draft_store.load_draft():
        has_working_profile = True

    has_session_persisted = False
    try:
        pool = await get_mysql_pool()
        db = MySQLStore(pool)
        has_session_persisted = await db.session_has_persisted_resume(session_id)
    except Exception as exc:
        logger.warning("Session persist check skipped for %s: %s", session_id, exc)

    return {
        "session_id": session_id,
        "has_working_profile": has_working_profile,
        "has_generated_resume": has_generated_resume,
        "has_session_persisted": has_session_persisted,
    }


@router.get("/draft")
async def get_resume_draft(request: Request, session_id: str = ""):
    """获取简历编辑草稿；已登录用户可无 session_id 恢复 12h 内 Redis 草稿或当前会话解析结果。"""
    from api.chat import _aload_state
    from api.draft_utils import profile_to_draft

    user = get_optional_user(request)

    client = await get_redis_client()

    resolved_session_id = session_id
    draft_store: RedisDraftStore | None = None

    if user:
        user_id = user.get("sub")
        if not resolved_session_id:
            resolved_session_id = await RedisDraftStore.get_user_session_id(client, user_id) or ""
        if resolved_session_id:
            await bind_session_owner(resolved_session_id, user)
        user_draft = await RedisDraftStore.load_user_draft(client, user_id)
        if user_draft:
            return {
                "session_id": resolved_session_id or session_id,
                "draft": user_draft,
                "source": "redis_user",
                "restored": True,
            }

    if not resolved_session_id:
        raise HTTPException(status_code=404, detail="未找到可恢复的简历草稿")

    await ensure_session_access(resolved_session_id, user)

    draft_store = RedisDraftStore(client, resolved_session_id, user.get("sub") if user else None)
    draft = await draft_store.load_draft()
    if draft:
        return {"session_id": resolved_session_id, "draft": draft, "source": "redis_session", "restored": True}

    store = RedisSessionStore(resolved_session_id, client)
    saved = await _aload_state(store)
    if not saved:
        raise HTTPException(status_code=404, detail="会话不存在")

    state = CopilotState.model_validate(saved)
    if state.candidate_profile is None:
        raise HTTPException(status_code=404, detail="尚未解析简历，请先上传")

    draft = profile_to_draft(state.candidate_profile)
    await draft_store.save_draft(draft, logged_in=user is not None)
    return {"session_id": resolved_session_id, "draft": draft, "source": "profile", "restored": False}


@router.put("/draft")
async def save_resume_draft(req: SaveDraftRequest, request: Request):
    """保存简历编辑草稿到 Redis（已登录用户 12h 内可恢复）。"""
    from api.draft_utils import sync_draft_to_session
    from datetime import datetime, timezone

    user = get_optional_user(request)
    if user:
        await bind_session_owner(req.session_id, user)
    await ensure_session_access(req.session_id, user)

    client = await get_redis_client()
    store = RedisSessionStore(req.session_id, client)

    draft = req.draft.model_dump()
    draft["updated_at"] = datetime.now(timezone.utc).isoformat()

    draft_store = RedisDraftStore(client, req.session_id, user.get("sub") if user else None)
    await draft_store.save_draft(draft, logged_in=user is not None)
    await sync_draft_to_session(store, req.session_id, draft)

    return {"ok": True, "updated_at": draft["updated_at"]}


@router.post("/profile/save")
async def save_profile_to_account(req: SaveProfileRequest, request: Request):
    """用户确认后将简历编辑资料保存为独立记录（可多条，含自定义名称）。"""
    from api.chat import _aload_state
    from api.draft_utils import sync_draft_to_session, draft_to_profile
    from datetime import datetime, timezone
    from storage.mysql_client import (
        get_mysql_pool,
        MySQLStore,
        ensure_candidate_profiles_language_column,
        ensure_saved_profile_records_table,
    )

    user = get_optional_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="请先登录后再保存到网站")

    user_id = extract_user_id(user)
    if user_id is None:
        raise HTTPException(status_code=401, detail="无效的用户身份")

    await bind_session_owner(req.session_id, user)
    await ensure_session_access(req.session_id, user)

    client = await get_redis_client()
    store = RedisSessionStore(req.session_id, client)
    saved = await store.load_state()
    if not saved:
        raise HTTPException(status_code=404, detail="会话不存在")

    draft_store = RedisDraftStore(client, req.session_id, user_id)

    if req.draft is not None:
        draft = req.draft.model_dump()
        draft["updated_at"] = datetime.now(timezone.utc).isoformat()
        await draft_store.save_draft(draft, logged_in=True)
        await sync_draft_to_session(store, req.session_id, draft)
    else:
        draft = await draft_store.load_draft()
        if draft:
            await sync_draft_to_session(store, req.session_id, draft)

    saved = await _aload_state(store)
    if not saved:
        raise HTTPException(status_code=404, detail="会话不存在")

    state = CopilotState.model_validate(saved)
    if state.candidate_profile is None:
        raise HTTPException(status_code=400, detail="没有可保存的简历资料，请先上传并解析简历")

    if req.draft is not None:
        draft = req.draft.model_dump()
        draft["updated_at"] = datetime.now(timezone.utc).isoformat()
    elif draft:
        pass
    else:
        from api.draft_utils import profile_to_draft
        draft = profile_to_draft(state.candidate_profile)

    candidate_name = (draft.get("profile_basic") or {}).get("name") or ""
    record_name = req.record_name.strip() or candidate_name or "Resume profile"
    row_id = req.record_id.strip() or f"spr_{uuid.uuid4().hex[:16]}"

    pool = await get_mysql_pool()
    await ensure_saved_profile_records_table(pool)
    await ensure_candidate_profiles_language_column(pool)
    db = MySQLStore(pool)

    if req.record_id.strip():
        existing = await db.get_profile_record_for_user(row_id, user_id)
        if not existing:
            raise HTTPException(status_code=404, detail="记录不存在或无权覆盖")
        if not req.record_name.strip() or record_name == "Resume profile":
            record_name = existing.get("record_name") or record_name

    from tools.output_language import resolve_resume_target_language

    profile_language = (
        (state.candidate_profile.language or "").strip()
        or resolve_resume_target_language(state)
    )
    if profile_language and not (state.candidate_profile.language or "").strip():
        state.candidate_profile = state.candidate_profile.model_copy(
            update={"language": profile_language}
        )

    try:
        await db.upsert_session(req.session_id, user_id=user_id)
        await db.save_profile_record(
            row_id=row_id,
            session_id=req.session_id,
            user_id=user_id,
            record_name=record_name,
            candidate_name=candidate_name,
            language=profile_language,
            data={
                "draft": draft,
                "candidate_profile": state.candidate_profile.model_dump(),
                "language": profile_language,
                "render_config": state.render_config.model_dump() if state.render_config else None,
            },
            overwrite=bool(req.record_id.strip()),
        )
        # Keep session-level candidate_profiles.language in sync on explicit save.
        await db.save_candidate_profile(
            f"profile_{req.session_id}",
            req.session_id,
            state.candidate_profile.model_dump(),
        )
    except Exception as exc:
        logger.error("Profile record save failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"保存失败: {exc}")

    updated_at = draft.get("updated_at") or datetime.now(timezone.utc).isoformat()
    return {
        "ok": True,
        "message": "Profile saved securely to your account.",
        "session_id": req.session_id,
        "record_id": row_id,
        "record_name": record_name,
        "language": profile_language,
        "saved_at": updated_at,
        "updated_at": updated_at,
    }


@router.get("/profile/history")
async def profile_save_history(request: Request, limit: int = 20) -> dict:
    """列出当前用户已保存的简历资料记录。"""
    from storage.mysql_client import get_mysql_pool, MySQLStore, ensure_saved_profile_records_table

    user = get_optional_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="请先登录")

    user_id = extract_user_id(user)
    if user_id is None:
        raise HTTPException(status_code=401, detail="无效的用户身份")

    pool = await get_mysql_pool()
    await ensure_saved_profile_records_table(pool)
    db = MySQLStore(pool)
    try:
        records = await db.list_profile_records_by_user(user_id, limit=min(limit, 50))
    except Exception as exc:
        logger.error("Profile save history failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="无法读取已保存记录，请稍后重试") from exc

    for row in records:
        if row.get("saved_at") is not None:
            row["saved_at"] = str(row["saved_at"])

    return {"records": records}


@router.get("/profile/saved/{record_id}")
async def get_saved_profile_record(record_id: str, request: Request) -> dict:
    """获取单条已保存的简历资料记录。"""
    from storage.mysql_client import get_mysql_pool, MySQLStore

    user = get_optional_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="请先登录")

    user_id = extract_user_id(user)
    if user_id is None:
        raise HTTPException(status_code=401, detail="无效的用户身份")

    pool = await get_mysql_pool()
    db = MySQLStore(pool)
    record = await db.get_profile_record_for_user(record_id, user_id)
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在或无权访问")

    if record.get("saved_at") is not None:
        record["saved_at"] = str(record["saved_at"])

    return record


class RestoreSavedProfileRequest(BaseModel):
    session_id: str


@router.post("/profile/saved/{record_id}/restore")
async def restore_saved_profile_record(record_id: str, req: RestoreSavedProfileRequest, request: Request):
    """将已保存的简历资料加载到当前 Redis 会话（覆盖工作区，不影响其他已保存记录）。"""
    from api.chat import _aload_state, _asave_state, _reset_profile_working_state
    from api.draft_utils import sync_draft_to_session, draft_to_profile
    from datetime import datetime, timezone
    from storage.mysql_client import get_mysql_pool, MySQLStore

    user = get_optional_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="请先登录")

    user_id = extract_user_id(user)
    if user_id is None:
        raise HTTPException(status_code=401, detail="无效的用户身份")

    await bind_session_owner(req.session_id, user)
    await ensure_session_access(req.session_id, user)

    pool = await get_mysql_pool()
    db = MySQLStore(pool)
    record = await db.get_profile_record_for_user(record_id, user_id)
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在或无权访问")

    data = record.get("data") or {}
    draft = data.get("draft")
    if not draft:
        raise HTTPException(status_code=400, detail="记录数据不完整")

    client = await get_redis_client()
    store = RedisSessionStore(req.session_id, client)
    draft_store = RedisDraftStore(client, req.session_id, user_id)

    draft = dict(draft)
    draft["updated_at"] = datetime.now(timezone.utc).isoformat()
    await draft_store.save_draft(draft, logged_in=True)

    saved = await _aload_state(store)
    if saved:
        state = CopilotState.model_validate(saved)
        state = _reset_profile_working_state(state)
    else:
        state = CopilotState(session_id=req.session_id)

    profile_data = data.get("candidate_profile")
    if profile_data:
        from workflow.state import CandidateProfile
        state.candidate_profile = CandidateProfile.model_validate(profile_data)
    else:
        state.candidate_profile = draft_to_profile(draft)

    from tools.output_language import (
        apply_interview_feedback_language,
        apply_interview_question_language,
        apply_resume_target_language,
    )

    restored_language = (
        str(record.get("language") or "").strip()
        or str(data.get("language") or "").strip()
        or (state.candidate_profile.language if state.candidate_profile else "")
        or ((data.get("render_config") or {}).get("language") if isinstance(data.get("render_config"), dict) else "")
    )
    if restored_language:
        if state.candidate_profile and not (state.candidate_profile.language or "").strip():
            state.candidate_profile = state.candidate_profile.model_copy(
                update={"language": restored_language}
            )
        apply_resume_target_language(state, restored_language)
        apply_interview_question_language(state, restored_language)
        apply_interview_feedback_language(state, restored_language)

    await sync_draft_to_session(store, req.session_id, draft)

    persist_data = state.model_dump(exclude={
        "user_message", "user_attachments", "current_intent",
        "execution_plan", "reply_message", "triggered_agents", "workflow_trace",
        "resume_language_target", "profile_replace_mode",
    })
    await _asave_state(store, persist_data)

    return {
        "ok": True,
        "session_id": req.session_id,
        "record_id": record_id,
        "record_name": record.get("record_name") or "",
        "language": restored_language or "",
        "render_config": state.render_config.model_dump() if state.render_config else None,
        "draft": draft,
    }


@router.post("/save")
async def save_resume_to_account(req: SaveResumeRequest, request: Request, background_tasks: BackgroundTasks):
    """用户确认后将简历草稿及生成结果持久化到数据库。"""
    from api.chat import _aload_state, _persist_to_mysql_safe
    from api.draft_utils import sync_draft_to_session

    user = get_optional_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="请先登录后再保存到网站")

    await bind_session_owner(req.session_id, user)

    client = await get_redis_client()
    store = RedisSessionStore(req.session_id, client)
    draft_store = RedisDraftStore(client, req.session_id, user.get("sub"))

    draft = await draft_store.load_draft()
    if draft:
        await sync_draft_to_session(store, req.session_id, draft)

    saved = await _aload_state(store)
    if not saved:
        raise HTTPException(status_code=404, detail="会话不存在")

    state = CopilotState.model_validate(saved)
    if state.candidate_profile is None and state.resume_content_json is None:
        raise HTTPException(status_code=400, detail="没有可保存的简历内容")

    user_id = user.get("sub")
    background_tasks.add_task(_persist_to_mysql_safe, state, user_id)

    return {
        "ok": True,
        "message": "Resume saved securely to your account.",
        "session_id": req.session_id,
    }


@router.post("/generate-jd")
async def generate_jd(req: GenerateJdRequest, request: Request):
    """根据 JD 文本框草稿、行业、单位性质、经验等级生成岗位描述（不结合简历）。"""
    from api.chat import _aload_state, _asave_state
    from agents.json_contracts import JDGenerationOutput
    from models.llm import get_llm
    from tools.output_language_guard import ainvoke_json_with_language_guard
    from services.llm_queue import SessionBusyError, LlmTask, llm_queue_slot, session_busy_detail
    from prompts.jd_generation import JD_GENERATION_PROMPT
    from services.jd_cache_service import lookup_jd_cache_by_params, save_jd_cache
    from tools.jd_cache import params_cache_key, ensure_title_in_jd_text, extract_title_from_jd

    user = get_optional_user(request)
    await ensure_session_access(req.session_id, user)

    client = await get_redis_client()
    store = RedisSessionStore(req.session_id, client)
    saved = await _aload_state(store)
    if not saved:
        raise HTTPException(status_code=404, detail="会话不存在")

    state = CopilotState.model_validate(saved)

    if not req.industry.strip() or not req.experience_level.strip():
        raise HTTPException(status_code=422, detail="请选择行业与经验等级")

    from tools.resume_layout import employer_type_label, normalize_employer_type, normalize_language, jd_output_language_instruction

    employer_type = normalize_employer_type(req.employer_type)
    employer_type_text = employer_type_label(employer_type) or "未指定"
    jd_draft = req.jd_draft.strip()
    output_lang = normalize_language(req.language)
    p_key = params_cache_key(req.industry.strip(), employer_type, req.experience_level.strip())
    use_cache = not jd_draft

    cached = None
    if use_cache:
        cached = await lookup_jd_cache_by_params(
            req.industry.strip(),
            employer_type,
            req.experience_level.strip(),
        )
    if cached and cached.get("jd_text"):
        logger.info("JD generate-jd cache hit params=%s title=%s", p_key[:12], cached.get("title"))
        cached_jd = ensure_title_in_jd_text(
            cached.get("title") or "",
            cached.get("jd_text") or "",
            output_lang,
        )
        state.meta = state.meta.model_copy(update={
            "target_jd_text": cached_jd,
            "target_industry": req.industry.strip(),
            "target_experience_level": req.experience_level.strip(),
            "employer_type": employer_type or state.meta.employer_type,
        })
        persist_data = state.model_dump(exclude={"user_message", "user_attachments", "current_intent",
                                                   "execution_plan", "reply_message", "triggered_agents",
                                                   "workflow_trace", "resume_language_target"})
        await _asave_state(store, persist_data)
        return {
            "title": cached.get("title") or "",
            "jd_text": cached_jd,
            "employer_type": employer_type,
            "from_cache": True,
        }

    prompt = JD_GENERATION_PROMPT.format(
        industry=req.industry.strip(),
        employer_type=employer_type_text,
        experience_level=req.experience_level.strip(),
        jd_draft=jd_draft or "（用户尚未填写，请根据行业、单位性质、经验等级生成通用岗位描述）",
        output_language_instruction=jd_output_language_instruction(output_lang),
    )

    llm = get_llm()
    try:
        async with llm_queue_slot(req.session_id, LlmTask.JD_GENERATE):
            parsed = await ainvoke_json_with_language_guard(
                llm,
                prompt,
                JDGenerationOutput,
                logger,
                "JD Generation",
                output_lang,
            )
    except SessionBusyError as exc:
        raise HTTPException(status_code=409, detail=session_busy_detail(exc))
    except Exception as e:
        logger.error("JD generation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"岗位描述生成失败: {e}")

    jd_text = ensure_title_in_jd_text(
        (parsed.title or "").strip(),
        (parsed.jd_text or "").strip(),
        output_lang,
    )
    if not jd_text:
        raise HTTPException(status_code=500, detail="岗位描述生成结果为空")

    title = (parsed.title or "").strip() or extract_title_from_jd(jd_text)
    await save_jd_cache(
        jd_text=jd_text,
        title=title,
        job_title=title,
        source="generated",
        industry=req.industry.strip(),
        employer_type=employer_type,
        experience_level=req.experience_level.strip(),
        params_key_value=p_key,
    )

    state.meta = state.meta.model_copy(update={
        "target_jd_text": jd_text,
        "target_industry": req.industry.strip(),
        "target_experience_level": req.experience_level.strip(),
        "employer_type": employer_type or state.meta.employer_type,
    })
    persist_data = state.model_dump(exclude={"user_message", "user_attachments", "current_intent",
                                              "execution_plan", "reply_message", "triggered_agents",
                                              "workflow_trace", "resume_language_target"})
    await _asave_state(store, persist_data)

    return {
        "title": title,
        "jd_text": jd_text,
        "employer_type": employer_type,
        "from_cache": False,
    }


@router.post("/generate-jd-from-title")
async def generate_jd_from_title(req: GenerateJdFromTitleRequest, request: Request):
    """仅岗位名称时，结合候选人简历生成定向 JD，供用户确认后再进入优化流程。"""
    from api.chat import _aload_state, _asave_state
    from services.jd_title_service import generate_jd_from_title_for_profile
    from services.llm_queue import SessionBusyError, LlmTask, llm_queue_slot, session_busy_detail
    from tools.resume_layout import normalize_employer_type, normalize_language

    user = get_optional_user(request)
    await ensure_session_access(req.session_id, user)

    job_title = req.job_title.strip()
    if not job_title:
        raise HTTPException(status_code=422, detail="请提供岗位名称")

    client = await get_redis_client()
    store = RedisSessionStore(req.session_id, client)
    saved = await _aload_state(store)
    if not saved:
        raise HTTPException(status_code=404, detail="会话不存在")

    state = CopilotState.model_validate(saved)
    if state.candidate_profile is None:
        raise HTTPException(status_code=400, detail="请先上传简历以提取候选人画像")

    employer_type = normalize_employer_type(req.employer_type or state.meta.employer_type)
    output_lang = normalize_language(req.language)
    try:
        async with llm_queue_slot(req.session_id, LlmTask.JD_GENERATE):
            parsed = await generate_jd_from_title_for_profile(
                state,
                job_title,
                industry=req.industry.strip(),
                employer_type=employer_type,
                experience_level=req.experience_level.strip(),
                language=output_lang,
            )
    except SessionBusyError as exc:
        raise HTTPException(status_code=409, detail=session_busy_detail(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        logger.error("JD from title failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"岗位描述生成失败: {exc}")

    jd_text = (parsed.jd_text or "").strip()
    if not jd_text:
        raise HTTPException(status_code=500, detail="岗位描述生成结果为空")
    resolved_title = (parsed.title or job_title).strip()
    state.meta = state.meta.model_copy(update={
        "target_jd_text": jd_text,
        "target_industry": req.industry.strip() or state.meta.target_industry,
        "target_experience_level": req.experience_level.strip() or state.meta.target_experience_level,
        "employer_type": employer_type or state.meta.employer_type,
    })
    persist_data = state.model_dump(exclude={"user_message", "user_attachments", "current_intent",
                                              "execution_plan", "reply_message", "triggered_agents",
                                              "workflow_trace", "resume_language_target"})
    await _asave_state(store, persist_data)

    return {
        "title": resolved_title,
        "jd_text": jd_text,
        "primary_tech_stack": list(parsed.primary_tech_stack or []),
        "alignment_note": parsed.alignment_note or "",
        "needs_clarification": bool(parsed.needs_clarification),
        "clarification_hint": parsed.clarification_hint or "",
        "requires_user_confirmation": True,
    }


@router.put("/target-context")
async def set_target_job_context(req: TargetJobContextRequest, request: Request):
    """同步目标岗位 JD 文本与行业 / 单位性质 / 经验等级到会话，供简历、面试、学习路径等 Agent 使用。"""
    from api.chat import _aload_state, _asave_state
    from tools.resume_layout import normalize_employer_type

    user = get_optional_user(request)
    await ensure_session_access(req.session_id, user)

    client = await get_redis_client()
    store = RedisSessionStore(req.session_id, client)
    saved = await _aload_state(store)
    if not saved:
        raise HTTPException(status_code=404, detail="会话不存在")

    state = CopilotState.model_validate(saved)
    employer_type = normalize_employer_type(req.employer_type) if req.employer_type.strip() else state.meta.employer_type

    from tools.typography_ladder import normalize_typography_fit_mode

    typography_fit_mode = (
        normalize_typography_fit_mode(req.typography_fit_mode)
        if req.typography_fit_mode.strip()
        else state.render_config.typography_fit_mode
    )

    state.meta = state.meta.model_copy(update={
        "target_jd_text": req.jd_text.strip(),
        "target_industry": req.industry.strip(),
        "target_experience_level": req.experience_level.strip(),
        "employer_type": employer_type or state.meta.employer_type,
    })
    state.render_config = state.render_config.model_copy(update={
        "typography_fit_mode": typography_fit_mode,
    })

    persist_data = state.model_dump(exclude={"user_message", "user_attachments", "current_intent",
                                              "execution_plan", "reply_message", "triggered_agents",
                                              "workflow_trace", "resume_language_target"})
    await _asave_state(store, persist_data)

    return {
        "ok": True,
        "target_context": {
            "jd_text": state.meta.target_jd_text,
            "industry": state.meta.target_industry,
            "employer_type": state.meta.employer_type,
            "experience_level": state.meta.target_experience_level,
            "typography_fit_mode": state.render_config.typography_fit_mode,
        },
    }


@router.put("/employer-type")
async def set_employer_type(req: SetEmployerTypeRequest, request: Request):
    """设置目标单位性质并返回更新后的格式检查清单。"""
    from api.chat import _aload_state, _asave_state
    from api.draft_utils import state_with_draft
    from tools.resume_language_checklist import check_resume_language_requirements
    from tools.resume_layout import normalize_employer_type
    from storage.redis_client import RedisDraftStore

    user = get_optional_user(request)
    await ensure_session_access(req.session_id, user)

    from tools.resume_layout import normalize_employer_type, VALID_EMPLOYER_TYPES

    employer_type = normalize_employer_type(req.employer_type)
    if employer_type not in VALID_EMPLOYER_TYPES:
        raise HTTPException(status_code=422, detail="employer_type 无效，请选择有效的单位性质")

    client = await get_redis_client()
    store = RedisSessionStore(req.session_id, client)
    saved = await _aload_state(store)
    if not saved:
        raise HTTPException(status_code=404, detail="会话不存在")

    state = CopilotState.model_validate(saved)
    state.meta = state.meta.model_copy(update={"employer_type": employer_type})

    persist_data = state.model_dump(exclude={"user_message", "user_attachments", "current_intent",
                                              "execution_plan", "reply_message", "triggered_agents",
                                              "workflow_trace", "resume_language_target"})
    await _asave_state(store, persist_data)

    lang = state.render_config.language or (state.resume_content_json.meta.language if state.resume_content_json else "en")
    draft_store = RedisDraftStore(client, req.session_id, user.get("sub") if user else None)
    draft = await draft_store.load_draft()
    state = state_with_draft(state, draft)
    checklist = check_resume_language_requirements(state, lang)
    return {"employer_type": employer_type, "language_checklist": checklist}


@router.get("/language-checklist")
async def get_language_checklist(session_id: str, language: str = "en", employer_type: str = "", request: Request = None):
    """根据目标语言检查简历缺失项与格式提醒。"""
    from api.chat import _aload_state
    from api.draft_utils import state_with_draft
    from tools.resume_language_checklist import check_resume_language_requirements
    from tools.resume_layout import normalize_employer_type, normalize_language, VALID_RESUME_LANGUAGES
    from storage.redis_client import RedisDraftStore

    user = get_optional_user(request) if request else None
    await ensure_session_access(session_id, user)

    client = await get_redis_client()
    store = RedisSessionStore(session_id, client)
    saved = await _aload_state(store)
    if not saved:
        raise HTTPException(status_code=404, detail="会话不存在")

    state = CopilotState.model_validate(saved)
    lang = normalize_language(language)
    if employer_type.strip():
        state.meta = state.meta.model_copy(update={"employer_type": normalize_employer_type(employer_type)})

    draft_store = RedisDraftStore(client, session_id, user.get("sub") if user else None)
    draft = await draft_store.load_draft()
    state = state_with_draft(state, draft)

    result = check_resume_language_requirements(state, lang)
    return result


class SetResumeLanguageRequest(BaseModel):
    session_id: str
    target_language: str = Field(description="Target language: zh, zh-TW, en, or pt")


@router.put("/language")
async def set_resume_language(req: SetResumeLanguageRequest, request: Request):
    """设置目标简历语言并返回格式检查清单（生成/互转前调用）。"""
    from api.chat import _aload_state, _asave_state
    from tools.resume_language_checklist import check_resume_language_requirements
    from tools.resume_layout import normalize_language, VALID_RESUME_LANGUAGES

    user = get_optional_user(request)
    await ensure_session_access(req.session_id, user)

    target = normalize_language(req.target_language)
    if target not in VALID_RESUME_LANGUAGES:
        raise HTTPException(status_code=422, detail="target_language 必须为 zh、zh-TW、en 或 pt")

    client = await get_redis_client()
    store = RedisSessionStore(req.session_id, client)
    state = await _load_or_bootstrap_state(store, req.session_id, client, user)
    state.render_config = state.render_config.model_copy(update={"language": target})

    persist_data = state.model_dump(exclude={"user_message", "user_attachments", "current_intent",
                                              "execution_plan", "reply_message", "triggered_agents",
                                              "workflow_trace", "resume_language_target"})
    await _asave_state(store, persist_data)

    checklist = check_resume_language_requirements(state, target)
    return {"language": target, "language_checklist": checklist}


class RenderRequest(BaseModel):
    session_id: str
    render_instruction: str


class GenerateFromProfileRequest(BaseModel):
    session_id: str
    language: str = Field(default="", description="Target language: zh, zh-TW, en, or pt")
    draft: ResumeDraftPayload | None = None


class GenerateStreamRequest(BaseModel):
    session_id: str
    instruction: str = ""
    language: str = Field(default="", description="Target language: zh, zh-TW, en, or pt")
    jd_text: str = ""
    industry: str = ""
    employer_type: str = ""
    experience_level: str = ""
    typography_fit_mode: str = ""
    clear_generated_resume: bool = True
    # Incremental polish: reuse resume_content_json and only re-work affected modules
    incremental: bool = False
    affected_fact_ids: list[str] = Field(default_factory=list)
    affected_sections: list[str] = Field(default_factory=list)
    clarifications: str = ""


class TranslateResumeRequest(BaseModel):
    session_id: str
    target_language: str = Field(description="Target language: zh, zh-TW, en, or pt")
    draft: ResumeDraftPayload | None = None


class ModuleActionRequest(BaseModel):
    session_id: str
    module_id: str
    module_type: str = Field(description="skill | work | internship | project | award | paper | custom | education")
    title: str = ""
    content: str = ""
    school: str = ""
    major: str = ""
    degree: str = ""
    fields: dict[str, Any] = Field(default_factory=dict)
    target_language: str = ""


_PERSIST_EXCLUDE = {
    "user_message", "user_attachments", "current_intent",
    "execution_plan", "reply_message", "triggered_agents", "workflow_trace",
    "resume_language_target", "skip_render",
}


async def _load_or_bootstrap_state(
    store: RedisSessionStore,
    session_id: str,
    client,
    user,
) -> CopilotState:
    """Load CopilotState from Redis; bootstrap from editor draft when session is missing."""
    from api.chat import _aload_state
    from api.draft_utils import bootstrap_session_from_draft, state_with_draft

    draft_store = RedisDraftStore(client, session_id, user.get("sub") if user else None)
    draft = await draft_store.load_draft()

    saved = await _aload_state(store)
    if not saved:
        if draft:
            await bootstrap_session_from_draft(store, session_id, draft)
            saved = await _aload_state(store)
        if not saved:
            raise HTTPException(
                status_code=404,
                detail="会话不存在，请先上传并解析简历，或保存编辑内容后再试",
            )

    state = CopilotState.model_validate(saved)
    return state_with_draft(state, draft)


async def _persist_request_draft_if_present(
    client,
    session_id: str,
    user,
    draft: ResumeDraftPayload | None,
) -> None:
    """Persist profile-editor draft from the request body before AI generate/translate."""
    if draft is None:
        return
    from api.draft_utils import sync_draft_to_session
    from datetime import datetime, timezone

    payload = draft.model_dump()
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    draft_store = RedisDraftStore(client, session_id, user.get("sub") if user else None)
    store = RedisSessionStore(session_id, client)
    await draft_store.save_draft(payload, logged_in=user is not None)
    await sync_draft_to_session(store, session_id, payload)


def _require_generatable_profile(state: CopilotState) -> None:
    from api.draft_utils import profile_has_substance

    if state.candidate_profile is None:
        raise HTTPException(status_code=400, detail="请先上传简历或在右侧编辑器填写资料后再生成")
    if not profile_has_substance(state.candidate_profile):
        raise HTTPException(
            status_code=400,
            detail="资料内容不足：请填写姓名，并至少补充一段教育或工作/项目经历后再生成",
        )


async def _run_profile_resume_pipeline(state: CopilotState, *, defer_render: bool = True) -> CopilotState:
    """Generate resume content from candidate profile — HTML render deferred until export by default."""
    from agents.content_agent import content_node_async
    from agents.render_agent import render_node_async
    from workflow.state import ResumeHtml

    state.current_intent = "generate_profile"
    if defer_render:
        state.skip_render = True
        state.resume_html = ResumeHtml()

    data = state.model_dump()
    agents = [content_node_async]
    if not defer_render:
        agents.append(render_node_async)

    for agent_fn in agents:
        updates = await agent_fn(CopilotState.model_validate(data))
        data.update(updates)
    return CopilotState.model_validate(data)


def _sse_event(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False, default=str)}\n\n"


async def _apply_target_context_to_state(state: CopilotState, req: GenerateStreamRequest) -> CopilotState:
    from tools.resume_layout import normalize_employer_type, normalize_language
    from tools.typography_ladder import normalize_typography_fit_mode

    employer_type = normalize_employer_type(req.employer_type) if req.employer_type.strip() else state.meta.employer_type
    typography_fit_mode = (
        normalize_typography_fit_mode(req.typography_fit_mode)
        if req.typography_fit_mode.strip()
        else state.render_config.typography_fit_mode
    )
    state.meta = state.meta.model_copy(update={
        "target_jd_text": req.jd_text.strip() or state.meta.target_jd_text,
        "target_industry": req.industry.strip() or state.meta.target_industry,
        "target_experience_level": req.experience_level.strip() or state.meta.target_experience_level,
        "employer_type": employer_type or state.meta.employer_type,
    })
    if req.language.strip():
        lang = normalize_language(req.language)
        state.render_config = state.render_config.model_copy(update={
            "language": lang,
            "typography_fit_mode": typography_fit_mode,
        })
    else:
        state.render_config = state.render_config.model_copy(update={
            "typography_fit_mode": typography_fit_mode,
        })
    return state


@router.post("/generate-stream")
async def generate_resume_stream(req: GenerateStreamRequest, request: Request, background_tasks: BackgroundTasks):
    """SSE stream: skeleton first, then overwrite each experience module as polish batches complete."""
    from api.chat import _aload_state, _asave_state, _persist_to_mysql_safe
    from agents.content_agent import generate_resume_content_with_progress
    from services.llm_queue import SessionBusyError, LlmTask, llm_queue_slot, session_busy_detail
    from tools.resume_layout import normalize_language, VALID_RESUME_LANGUAGES
    from tools.resume_language_checklist import check_resume_language_requirements
    from workflow.state import ResumeHtml

    user = get_optional_user(request)
    await ensure_session_access(req.session_id, user)
    if user:
        await bind_session_owner(req.session_id, user)

    client = await get_redis_client()
    store = RedisSessionStore(req.session_id, client)
    state = await _load_or_bootstrap_state(store, req.session_id, client, user)
    if state.candidate_profile is None:
        raise HTTPException(status_code=400, detail="请先上传简历以提取候选人画像")

    state = await _apply_target_context_to_state(state, req)
    target = normalize_language(req.language or state.render_config.language)
    if target not in VALID_RESUME_LANGUAGES:
        raise HTTPException(status_code=422, detail="language 必须为 zh、zh-TW、en 或 pt")
    state.render_config = state.render_config.model_copy(update={"language": target})
    use_incremental = bool(req.incremental) and state.resume_content_json is not None
    if req.clear_generated_resume and not use_incremental:
        state.resume_content_json = None
        state.resume_html = ResumeHtml()
    state.skip_render = True
    state.current_intent = "content_edit"

    queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()
    persist_exclude = {
        *_PERSIST_EXCLUDE,
        "chat_output_language",
        "chat_question_output_language",
        "chat_feedback_output_language",
    }

    async def _run_generation() -> None:
        final_state = state
        try:
            async with llm_queue_slot(req.session_id, LlmTask.RESUME_GENERATE):
                async def on_progress(parsed, meta: dict[str, Any]) -> None:
                    nonlocal final_state
                    from agents.content_agent import _build_resume_from_parsed, _merge_profile_extras_from_candidate

                    partial_content = _build_resume_from_parsed(parsed, final_state, language=target)
                    partial_content = _merge_profile_extras_from_candidate(partial_content, final_state)
                    final_state = final_state.model_copy(update={
                        "resume_content_json": partial_content,
                    })
                    persist_data = final_state.model_dump(exclude=persist_exclude)
                    await _asave_state(store, persist_data)
                    await queue.put({
                        "type": "progress",
                        "phase": meta.get("phase"),
                        "mode": meta.get("mode") or ("incremental" if use_incremental else "full"),
                        "resume_content_json": partial_content.model_dump(),
                        "pending_fact_ids": meta.get("pending_fact_ids", []),
                        "completed_fact_ids": meta.get("completed_fact_ids", []),
                        "section_key": meta.get("section_key"),
                        "completed_batches": meta.get("completed_batches"),
                        "total_batches": meta.get("total_batches"),
                    })

                resume_content, render_config, updates = await generate_resume_content_with_progress(
                    final_state,
                    edit_instruction=req.instruction.strip(),
                    on_progress=on_progress,
                    affected_fact_ids=set(req.affected_fact_ids or []),
                    affected_sections=set(req.affected_sections or []),
                    clarifications=req.clarifications or "",
                    incremental=use_incremental,
                )
                final_state = final_state.model_copy(update={
                    "resume_content_json": resume_content,
                    "render_config": render_config,
                    **updates,
                })
                persist_data = final_state.model_dump(exclude=persist_exclude)
                await _asave_state(store, persist_data)
                checklist = check_resume_language_requirements(final_state, target)
                await queue.put({
                    "type": "complete",
                    "resume_content_json": resume_content.model_dump(),
                    "render_config": render_config.model_dump(),
                    "language": resume_content.meta.language,
                    "language_checklist": checklist,
                    "preview_deferred": True,
                })
                if user:
                    background_tasks.add_task(_persist_to_mysql_safe, final_state, user.get("sub"))
        except SessionBusyError as exc:
            await queue.put({"type": "error", "detail": session_busy_detail(exc)})
        except Exception as exc:
            logger.error("Resume stream generation failed: %s", exc, exc_info=True)
            await queue.put({"type": "error", "detail": f"简历生成失败: {exc}"})
        finally:
            await queue.put(None)

    async def event_stream():
        yield _sse_event({"type": "start", "session_id": req.session_id})
        task = asyncio.create_task(_run_generation())
        try:
            while True:
                event = await queue.get()
                if event is None:
                    break
                yield _sse_event(event)
        finally:
            await task

    return StreamingResponse(event_stream(), media_type="text/event-stream")


class RestoreResumeSnapshotRequest(BaseModel):
    session_id: str
    resume_content_json: dict | None = None
    render_config: dict | None = None
    resume_html: dict | None = None


@router.post("/restore-snapshot")
async def restore_resume_snapshot(req: RestoreResumeSnapshotRequest, request: Request):
    """将 Redis 会话中的简历状态恢复到指定快照（用于撤销/重做）。"""
    from api.chat import _aload_state, _asave_state
    from workflow.state import ResumeContent, RenderConfig, ResumeHtml

    user = get_optional_user(request)
    await ensure_session_access(req.session_id, user)

    if not req.resume_html and not req.resume_content_json:
        raise HTTPException(status_code=422, detail="快照至少需包含 resume_html 或 resume_content_json")

    client = await get_redis_client()
    store = RedisSessionStore(req.session_id, client)
    saved = await _aload_state(store)
    if not saved:
        raise HTTPException(status_code=404, detail="会话不存在")

    state = CopilotState.model_validate(saved)

    if req.resume_content_json is not None:
        state.resume_content_json = ResumeContent.model_validate(req.resume_content_json)
    if req.render_config is not None:
        state.render_config = RenderConfig.model_validate(req.render_config)
    if req.resume_html is not None:
        state.resume_html = ResumeHtml.model_validate(req.resume_html)

    persist_data = state.model_dump(exclude={"user_message", "user_attachments", "current_intent",
                                              "execution_plan", "reply_message", "triggered_agents",
                                              "workflow_trace", "resume_language_target",
                                              "chat_output_language",
                                              "chat_question_output_language",
                                              "chat_feedback_output_language"})
    await _asave_state(store, persist_data)

    language = (
        state.resume_content_json.meta.language
        if state.resume_content_json
        else state.render_config.language
    )
    return {
        "ok": True,
        "language": language,
        "resume_content_json": state.resume_content_json.model_dump() if state.resume_content_json else None,
        "render_config": state.render_config.model_dump(),
        "resume_html": state.resume_html.model_dump(),
    }


@router.post("/generate-from-profile")
async def generate_resume_from_profile(req: GenerateFromProfileRequest, request: Request, background_tasks: BackgroundTasks):
    """从候选人画像生成简历（不结合 JD、不做缺口优化）— 供语言切换与直接导出。"""
    from api.chat import _aload_state, _asave_state, _persist_to_mysql_safe
    from services.llm_queue import SessionBusyError, LlmTask, llm_queue_slot, session_busy_detail
    from tools.resume_layout import normalize_language, VALID_RESUME_LANGUAGES
    from tools.resume_language_checklist import check_resume_language_requirements

    user = get_optional_user(request)
    await ensure_session_access(req.session_id, user)
    if user:
        await bind_session_owner(req.session_id, user)

    target = normalize_language(req.language)
    if target not in VALID_RESUME_LANGUAGES:
        raise HTTPException(status_code=422, detail="language 必须为 zh、zh-TW、en 或 pt")

    client = await get_redis_client()
    store = RedisSessionStore(req.session_id, client)
    await _persist_request_draft_if_present(client, req.session_id, user, req.draft)
    state = await _load_or_bootstrap_state(store, req.session_id, client, user)
    state.render_config = state.render_config.model_copy(update={"language": target})
    _require_generatable_profile(state)

    from workflow.state import ResumeHtml

    state.resume_content_json = None
    state.resume_html = ResumeHtml()

    try:
        async with llm_queue_slot(req.session_id, LlmTask.RESUME_GENERATE):
            final = await _run_profile_resume_pipeline(state, defer_render=True)
    except SessionBusyError as exc:
        raise HTTPException(status_code=409, detail=session_busy_detail(exc))
    except Exception as e:
        logger.error("Profile resume generation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"简历生成失败: {e}")

    if final.resume_content_json is None:
        raise HTTPException(status_code=500, detail="简历生成结果为空，请重试")

    persist_data = final.model_dump(exclude=_PERSIST_EXCLUDE)
    await _asave_state(store, persist_data)

    if user:
        background_tasks.add_task(_persist_to_mysql_safe, final, user.get("sub"))

    checklist = check_resume_language_requirements(final, target)
    return {
        "language": final.resume_content_json.meta.language if final.resume_content_json else target,
        "resume_content_json": final.resume_content_json.model_dump() if final.resume_content_json else None,
        "render_config": final.render_config.model_dump(),
        "resume_html": final.resume_html.model_dump(),
        "reply_message": final.reply_message,
        "language_checklist": checklist,
        "from_profile_only": True,
        "preview_deferred": True,
    }


@router.post("/translate-module")
async def translate_resume_module(req: ModuleActionRequest, request: Request, background_tasks: BackgroundTasks):
    """单条简历模块翻译 — 用于全量翻译后遗漏模块的再次翻译。"""
    from api.chat import _asave_state, _persist_to_mysql_safe
    from agents.content_agent import apply_translated_module_to_resume, translate_resume_module_async
    from services.llm_queue import SessionBusyError, LlmTask, llm_queue_slot, session_busy_detail
    from tools.resume_layout import normalize_language, VALID_RESUME_LANGUAGES

    user = get_optional_user(request)
    await ensure_session_access(req.session_id, user)
    if user:
        await bind_session_owner(req.session_id, user)

    target = normalize_language(req.target_language or "")
    if target not in VALID_RESUME_LANGUAGES:
        raise HTTPException(status_code=422, detail="target_language 必须为 zh、zh-TW、en 或 pt")

    client = await get_redis_client()
    store = RedisSessionStore(req.session_id, client)
    state = await _load_or_bootstrap_state(store, req.session_id, client, user)
    if state.resume_content_json is None:
        raise HTTPException(status_code=400, detail="请先生成或翻译简历后再翻译单条模块")

    try:
        async with llm_queue_slot(req.session_id, LlmTask.RESUME_MODULE_TRANSLATE):
            result = await translate_resume_module_async(
                state,
                module_id=req.module_id,
                module_type=req.module_type,
                title=req.title,
                content=req.content,
                school=req.school,
                major=req.major,
                degree=req.degree,
                fields=req.fields or None,
                target_language=target,
            )
    except SessionBusyError as exc:
        raise HTTPException(status_code=409, detail=session_busy_detail(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Module translate failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"模块翻译失败: {exc}") from exc

    resume_content = apply_translated_module_to_resume(
        state.resume_content_json,
        module_type=req.module_type,
        module_id=req.module_id,
        title=result.get("title", req.title),
        content=result.get("content", req.content),
        school=result.get("school", req.school),
        major=result.get("major", req.major),
        degree=result.get("degree", req.degree),
        fields=result.get("fields") or req.fields or None,
    )
    final = state.model_copy(update={
        "resume_content_json": resume_content,
        "render_config": state.render_config.model_copy(update={"language": target}),
        "skip_render": True,
    })
    persist_data = final.model_dump(exclude=_PERSIST_EXCLUDE)
    await _asave_state(store, persist_data)
    if user:
        background_tasks.add_task(_persist_to_mysql_safe, final, user.get("sub"))

    return {
        "module": result,
        "language": target,
        "resume_content_json": resume_content.model_dump(),
    }


@router.post("/polish-module")
async def polish_resume_module(req: ModuleActionRequest, request: Request, background_tasks: BackgroundTasks):
    """单条经历模块润色 — 用户对润色结果不满意时可再次润色。"""
    from api.chat import _asave_state, _persist_to_mysql_safe
    from agents.content_agent import apply_translated_module_to_resume, polish_resume_module_async
    from services.llm_queue import SessionBusyError, LlmTask, llm_queue_slot, session_busy_detail

    user = get_optional_user(request)
    await ensure_session_access(req.session_id, user)
    if user:
        await bind_session_owner(req.session_id, user)

    if req.module_type not in ("work", "internship", "project"):
        raise HTTPException(status_code=422, detail="仅工作经历、实习经历与项目经历支持单条润色")

    client = await get_redis_client()
    store = RedisSessionStore(req.session_id, client)
    state = await _load_or_bootstrap_state(store, req.session_id, client, user)
    if state.resume_content_json is None:
        raise HTTPException(status_code=400, detail="请先生成简历后再润色单条模块")

    try:
        async with llm_queue_slot(req.session_id, LlmTask.RESUME_MODULE_POLISH):
            result = await polish_resume_module_async(
                state,
                module_id=req.module_id,
                module_type=req.module_type,
                title=req.title,
                content=req.content,
                fields=req.fields or None,
            )
    except SessionBusyError as exc:
        raise HTTPException(status_code=409, detail=session_busy_detail(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Module polish failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"模块润色失败: {exc}") from exc

    resume_content = apply_translated_module_to_resume(
        state.resume_content_json,
        module_type=req.module_type,
        module_id=req.module_id,
        title=result.get("title", req.title),
        content=result.get("content", req.content),
        fields=result.get("fields") or req.fields or None,
    )
    final = state.model_copy(update={
        "resume_content_json": resume_content,
        "skip_render": True,
    })
    persist_data = final.model_dump(exclude=_PERSIST_EXCLUDE)
    await _asave_state(store, persist_data)
    if user:
        background_tasks.add_task(_persist_to_mysql_safe, final, user.get("sub"))

    return {
        "module": result,
        "resume_content_json": resume_content.model_dump(),
    }


@router.post("/translate")
async def translate_resume(req: TranslateResumeRequest, request: Request, background_tasks: BackgroundTasks):
    """简历语言切换 — 仅生成 resume_content_json，HTML 预览延迟到导出/预览时渲染。"""
    from api.chat import _ainvoke_graph, _aload_state, _asave_state, _get_graph, _persist_to_mysql_safe
    from services.llm_queue import SessionBusyError, LlmTask, llm_queue_slot, session_busy_detail
    from tools.resume_layout import language_label, normalize_language, VALID_RESUME_LANGUAGES
    from tools.resume_language_checklist import check_resume_language_requirements
    from workflow.state import ResumeHtml

    request_t0 = time.perf_counter()
    user = get_optional_user(request)
    await ensure_session_access(req.session_id, user)
    if user:
        await bind_session_owner(req.session_id, user)

    target = normalize_language(req.target_language)
    if target not in VALID_RESUME_LANGUAGES:
        raise HTTPException(status_code=422, detail="target_language 必须为 zh、zh-TW、en 或 pt")

    client = await get_redis_client()
    store = RedisSessionStore(req.session_id, client)
    await _persist_request_draft_if_present(client, req.session_id, user, req.draft)
    state = await _load_or_bootstrap_state(store, req.session_id, client, user)

    use_profile_pipeline = state.resume_content_json is None or req.draft is not None
    if use_profile_pipeline:
        _require_generatable_profile(state)
        if req.draft is not None:
            state.resume_content_json = None
            state.resume_html = ResumeHtml()
        state.render_config = state.render_config.model_copy(update={"language": target})
        try:
            async with llm_queue_slot(req.session_id, LlmTask.RESUME_TRANSLATE):
                final = await _run_profile_resume_pipeline(state, defer_render=True)
        except SessionBusyError as exc:
            raise HTTPException(status_code=409, detail=session_busy_detail(exc))
        except Exception as e:
            logger.error("Profile resume generation (via translate) failed: %s", e, exc_info=True)
            raise HTTPException(status_code=500, detail=f"简历生成失败: {e}")
    else:
        from tools.resume_page_policy import page_limit_label, resolve_page_limit

        page_limit = resolve_page_limit(state)
        layout_label = page_limit_label(page_limit, target)
        state.user_message = (
            f"将简历转换为{language_label(target)}版本，遵循{language_label(target)}简历格式，控制在{layout_label}内"
        )
        state.resume_language_target = target
        state.current_intent = "language_convert"
        state.skip_render = True
        state.resume_html = ResumeHtml()
        state.execution_plan = ["content_agent", "render_agent"]

        graph = _get_graph()
        try:
            async with llm_queue_slot(req.session_id, LlmTask.RESUME_TRANSLATE):
                result = await _ainvoke_graph(graph, state.model_dump())
        except SessionBusyError as exc:
            raise HTTPException(status_code=409, detail=session_busy_detail(exc))
        except Exception as e:
            logger.error("Resume translation failed: %s", e, exc_info=True)
            raise HTTPException(status_code=500, detail=f"简历转换失败: {e}")

        final = CopilotState.model_validate(result)

    persist_data = final.model_dump(exclude=_PERSIST_EXCLUDE)
    await _asave_state(store, persist_data)

    if user:
        background_tasks.add_task(_persist_to_mysql_safe, final, user.get("sub"))

    checklist = check_resume_language_requirements(final, target)

    log_stage_timing(
        logger,
        "resume.translate.total",
        elapsed_ms(request_t0),
        session_id=req.session_id,
        target=target,
        breakdown=format_trace_breakdown(final.workflow_trace),
    )

    return {
        "language": final.resume_content_json.meta.language if final.resume_content_json else target,
        "resume_content_json": final.resume_content_json.model_dump() if final.resume_content_json else None,
        "render_config": final.render_config.model_dump(),
        "resume_html": final.resume_html.model_dump(),
        "reply_message": final.reply_message,
        "language_checklist": checklist,
        "preview_deferred": True,
        "timing": build_request_timing(
            total_ms=elapsed_ms(request_t0),
            workflow_trace=final.workflow_trace,
        ).model_dump(),
    }


@router.post("/render")
async def render_resume(req: RenderRequest, request: Request, background_tasks: BackgroundTasks):
    """渲染指令接口。"""
    from api.chat import _ainvoke_graph, _aload_state, _asave_state, _get_graph, _persist_to_mysql_safe
    from services.llm_queue import SessionBusyError, LlmTask, llm_queue_slot, session_busy_detail

    user = get_optional_user(request)
    await ensure_session_access(req.session_id, user)
    if user:
        await bind_session_owner(req.session_id, user)

    client = await get_redis_client()
    store = RedisSessionStore(req.session_id, client)
    saved = await _aload_state(store)
    if not saved:
        raise HTTPException(status_code=404, detail="会话不存在")

    state = CopilotState.model_validate(saved)
    state.user_message = req.render_instruction
    state.current_intent = "render_edit"
    state.execution_plan = ["render_agent"]

    graph = _get_graph()
    try:
        async with llm_queue_slot(req.session_id, LlmTask.RESUME_RENDER):
            result = await _ainvoke_graph(graph, state.model_dump())
    except SessionBusyError as exc:
        raise HTTPException(status_code=409, detail=session_busy_detail(exc))
    except Exception as e:
        logger.error("Render failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"渲染失败: {e}")

    final = CopilotState.model_validate(result)

    persist_data = final.model_dump(exclude={"user_message", "user_attachments", "current_intent",
                                              "execution_plan", "reply_message", "triggered_agents",
                                              "workflow_trace"})
    await _asave_state(store, persist_data)

    logger.debug("Render complete for session %s (MySQL on explicit save)", req.session_id)

    return {
        "render_config": final.render_config.model_dump(),
        "resume_html": final.resume_html.model_dump(),
    }
