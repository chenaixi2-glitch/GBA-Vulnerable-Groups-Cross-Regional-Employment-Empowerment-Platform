"""简历相关 API — GET/POST /api/resume/*"""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, Response
from pydantic import BaseModel, Field

from storage.redis_client import get_redis_client, RedisSessionStore, RedisDraftStore
from auth.jwt import get_optional_user
from auth.session_access import bind_session_owner, ensure_session_access
from workflow.state import CopilotState
from log import get_logger

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


class GenerateJdRequest(BaseModel):
    session_id: str
    industry: str
    experience_level: str
    employer_type: str = ""


class SetEmployerTypeRequest(BaseModel):
    session_id: str
    employer_type: str = Field(description="soe | public | foreign | private | npo | hmt | other")


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


@router.get("/draft")
async def get_resume_draft(request: Request, session_id: str = ""):
    """获取简历编辑草稿；已登录用户可无 session_id 恢复 12h 内草稿。"""
    from api.chat import _aload_state
    from api.draft_utils import profile_to_draft
    from datetime import datetime, timezone

    user = get_optional_user(request)
    if user:
        await bind_session_owner(req.session_id, user)

    client = await get_redis_client()

    resolved_session_id = session_id
    draft_store: RedisDraftStore | None = None

    if user:
        user_id = user.get("sub")
        if not resolved_session_id:
            resolved_session_id = await RedisDraftStore.get_user_session_id(client, user_id) or ""
        user_draft = await RedisDraftStore.load_user_draft(client, user_id)
        if user_draft:
            return {
                "session_id": resolved_session_id,
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
    saved = await store.load_state()
    if not saved:
        raise HTTPException(status_code=404, detail="会话不存在")

    draft = req.draft.model_dump()
    draft["updated_at"] = datetime.now(timezone.utc).isoformat()

    draft_store = RedisDraftStore(client, req.session_id, user.get("sub") if user else None)
    await draft_store.save_draft(draft, logged_in=user is not None)
    await sync_draft_to_session(store, req.session_id, draft)

    return {"ok": True, "updated_at": draft["updated_at"]}


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
    """无具体 JD 时，根据行业、单位性质、经验等级与候选人画像生成通用岗位描述。"""
    from api.chat import _aload_state, _asave_state
    from agents.json_contracts import JDGenerationOutput
    from models.llm import get_llm, ainvoke_json_with_schema
    from prompts.jd_generation import JD_GENERATION_PROMPT

    user = get_optional_user(request)
    await ensure_session_access(req.session_id, user)

    client = await get_redis_client()
    store = RedisSessionStore(req.session_id, client)
    saved = await _aload_state(store)
    if not saved:
        raise HTTPException(status_code=404, detail="会话不存在")

    state = CopilotState.model_validate(saved)
    if state.candidate_profile is None:
        raise HTTPException(status_code=400, detail="请先上传简历以提取候选人画像")

    if not req.industry.strip() or not req.experience_level.strip():
        raise HTTPException(status_code=422, detail="请选择行业与经验等级")

    from tools.resume_layout import employer_type_label, normalize_employer_type

    employer_type = normalize_employer_type(req.employer_type)
    employer_type_text = employer_type_label(employer_type) or "未指定"

    profile_json = state.candidate_profile.model_dump_json(indent=2)
    prompt = JD_GENERATION_PROMPT.format(
        industry=req.industry.strip(),
        employer_type=employer_type_text,
        experience_level=req.experience_level.strip(),
        profile_json=profile_json,
    )

    llm = get_llm()
    try:
        parsed = await ainvoke_json_with_schema(llm, prompt, JDGenerationOutput, logger, "JD Generation")
    except Exception as e:
        logger.error("JD generation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"岗位描述生成失败: {e}")

    jd_text = (parsed.jd_text or "").strip()
    if not jd_text:
        raise HTTPException(status_code=500, detail="岗位描述生成结果为空")

    if employer_type:
        state.meta = state.meta.model_copy(update={"employer_type": employer_type})
        persist_data = state.model_dump(exclude={"user_message", "user_attachments", "current_intent",
                                                   "execution_plan", "reply_message", "triggered_agents",
                                                   "workflow_trace", "resume_language_target"})
        await _asave_state(store, persist_data)

    return {
        "title": parsed.title or "",
        "jd_text": jd_text,
        "employer_type": employer_type,
    }


@router.put("/employer-type")
async def set_employer_type(req: SetEmployerTypeRequest, request: Request):
    """设置目标单位性质并返回更新后的格式检查清单。"""
    from api.chat import _aload_state, _asave_state
    from tools.resume_language_checklist import check_resume_language_requirements
    from tools.resume_layout import normalize_employer_type

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

    lang = state.render_config.language or (state.resume_content_json.meta.language if state.resume_content_json else "zh")
    checklist = check_resume_language_requirements(state, lang)
    return {"employer_type": employer_type, "language_checklist": checklist}


@router.get("/language-checklist")
async def get_language_checklist(session_id: str, language: str = "zh", employer_type: str = "", request: Request = None):
    """根据目标语言检查简历缺失项与格式提醒。"""
    from api.chat import _aload_state
    from tools.resume_language_checklist import check_resume_language_requirements
    from tools.resume_layout import normalize_language

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
    result = check_resume_language_requirements(state, lang)
    return result


class SetResumeLanguageRequest(BaseModel):
    session_id: str
    target_language: str = Field(description="Target language: zh or en")


@router.put("/language")
async def set_resume_language(req: SetResumeLanguageRequest, request: Request):
    """设置目标简历语言并返回格式检查清单（生成/互转前调用）。"""
    from api.chat import _aload_state, _asave_state
    from tools.resume_language_checklist import check_resume_language_requirements
    from tools.resume_layout import normalize_language

    user = get_optional_user(request)
    await ensure_session_access(req.session_id, user)

    target = normalize_language(req.target_language)
    if target not in ("zh", "en"):
        raise HTTPException(status_code=422, detail="target_language 必须为 zh 或 en")

    client = await get_redis_client()
    store = RedisSessionStore(req.session_id, client)
    saved = await _aload_state(store)
    if not saved:
        raise HTTPException(status_code=404, detail="会话不存在")

    state = CopilotState.model_validate(saved)
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


class TranslateResumeRequest(BaseModel):
    session_id: str
    target_language: str = Field(description="Target language: zh or en")


@router.post("/translate")
async def translate_resume(req: TranslateResumeRequest, request: Request, background_tasks: BackgroundTasks):
    """中英文简历互转 — 触发 language_convert 意图。"""
    from api.chat import _ainvoke_graph, _aload_state, _asave_state, _get_graph, _persist_to_mysql_safe
    from tools.resume_layout import language_label, normalize_language
    from tools.resume_language_checklist import check_resume_language_requirements

    user = get_optional_user(request)
    await ensure_session_access(req.session_id, user)
    if user:
        await bind_session_owner(req.session_id, user)

    target = normalize_language(req.target_language)
    if target not in ("zh", "en"):
        raise HTTPException(status_code=422, detail="target_language 必须为 zh 或 en")

    client = await get_redis_client()
    store = RedisSessionStore(req.session_id, client)
    saved = await _aload_state(store)
    if not saved:
        raise HTTPException(status_code=404, detail="会话不存在")

    state = CopilotState.model_validate(saved)
    if state.resume_content_json is None:
        raise HTTPException(status_code=400, detail="简历尚未生成，请先上传并生成简历")

    state.user_message = f"将简历转换为{language_label(target)}版本，遵循{language_label(target)}简历格式，控制在一页 A4 内"
    state.resume_language_target = target
    state.current_intent = "language_convert"
    state.execution_plan = ["content_agent", "render_agent"]

    graph = _get_graph()
    try:
        result = await _ainvoke_graph(graph, state.model_dump())
    except Exception as e:
        logger.error("Resume translation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"简历转换失败: {e}")

    final = CopilotState.model_validate(result)

    persist_data = final.model_dump(exclude={"user_message", "user_attachments", "current_intent",
                                              "execution_plan", "reply_message", "triggered_agents",
                                              "workflow_trace", "resume_language_target"})
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
    }


@router.post("/render")
async def render_resume(req: RenderRequest, request: Request, background_tasks: BackgroundTasks):
    """渲染指令接口。"""
    from api.chat import _ainvoke_graph, _aload_state, _asave_state, _get_graph, _persist_to_mysql_safe

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
        result = await _ainvoke_graph(graph, state.model_dump())
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
