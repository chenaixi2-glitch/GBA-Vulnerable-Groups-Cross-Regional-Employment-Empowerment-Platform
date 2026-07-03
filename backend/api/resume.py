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


@router.get("/draft")
async def get_resume_draft(request: Request, session_id: str = ""):
    """获取简历编辑草稿；已登录用户可无 session_id 恢复 12h 内草稿或 MySQL 持久化资料。"""
    from api.chat import _aload_state
    from api.draft_utils import profile_to_draft
    from storage.mysql_client import get_mysql_pool, MySQLStore
    from workflow.state import CandidateProfile

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

        try:
            pool = await get_mysql_pool()
            db = MySQLStore(pool)
            mysql_row = await db.get_latest_candidate_profile_for_user(user_id)
            if mysql_row and mysql_row.get("data"):
                mysql_session_id = mysql_row.get("session_id") or resolved_session_id or session_id
                if mysql_session_id:
                    await bind_session_owner(mysql_session_id, user)
                draft = profile_to_draft(CandidateProfile.model_validate(mysql_row["data"]))
                if mysql_session_id:
                    draft_store = RedisDraftStore(client, mysql_session_id, user_id)
                    await draft_store.save_draft(draft, logged_in=True)
                return {
                    "session_id": mysql_session_id,
                    "draft": draft,
                    "source": "mysql",
                    "restored": True,
                }
        except Exception as exc:
            logger.warning("MySQL profile restore failed for user %s: %s", user_id, exc)

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


@router.post("/profile/save")
async def save_profile_to_account(req: SaveProfileRequest, request: Request):
    """用户确认后将简历编辑资料持久化到 MySQL（同时写入 Redis 草稿）。"""
    from api.chat import _aload_state, _persist_to_mysql_safe
    from api.draft_utils import sync_draft_to_session
    from datetime import datetime, timezone

    user = get_optional_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="请先登录后再保存到网站")

    await bind_session_owner(req.session_id, user)
    await ensure_session_access(req.session_id, user)

    client = await get_redis_client()
    store = RedisSessionStore(req.session_id, client)
    saved = await store.load_state()
    if not saved:
        raise HTTPException(status_code=404, detail="会话不存在")

    user_id = user.get("sub")
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

    await _persist_to_mysql_safe(state, user_id)

    updated_at = (req.draft.updated_at if req.draft else None) or datetime.now(timezone.utc).isoformat()
    return {
        "ok": True,
        "message": "Profile saved securely to your account.",
        "session_id": req.session_id,
        "updated_at": updated_at,
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
    from models.llm import get_llm, ainvoke_json_with_schema
    from services.llm_queue import SessionBusyError, llm_queue_slot
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
    output_lang = normalize_language(req.language or state.render_config.language or state.resume_language_target or "zh")
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
        async with llm_queue_slot(req.session_id):
            parsed = await ainvoke_json_with_schema(llm, prompt, JDGenerationOutput, logger, "JD Generation")
    except SessionBusyError:
        raise HTTPException(status_code=409, detail="该会话已有 AI 任务正在处理，请稍候完成后再试")
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
    from services.llm_queue import SessionBusyError, llm_queue_slot
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
    output_lang = normalize_language(
        req.language or state.render_config.language or state.resume_language_target or "zh"
    )
    try:
        async with llm_queue_slot(req.session_id):
            parsed = await generate_jd_from_title_for_profile(
                state,
                job_title,
                industry=req.industry.strip(),
                employer_type=employer_type,
                experience_level=req.experience_level.strip(),
                language=output_lang,
            )
    except SessionBusyError:
        raise HTTPException(status_code=409, detail="该会话已有 AI 任务正在处理，请稍候完成后再试")
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

    state.meta = state.meta.model_copy(update={
        "target_jd_text": req.jd_text.strip(),
        "target_industry": req.industry.strip(),
        "target_experience_level": req.experience_level.strip(),
        "employer_type": employer_type or state.meta.employer_type,
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
        },
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
    from tools.resume_layout import normalize_language, VALID_RESUME_LANGUAGES

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
    target_language: str = Field(description="Target language: zh, zh-TW, en, or pt")


@router.post("/translate")
async def translate_resume(req: TranslateResumeRequest, request: Request, background_tasks: BackgroundTasks):
    """中英文简历互转 — 触发 language_convert 意图。"""
    from api.chat import _ainvoke_graph, _aload_state, _asave_state, _get_graph, _persist_to_mysql_safe
    from services.llm_queue import SessionBusyError, llm_queue_slot
    from tools.resume_layout import language_label, normalize_language
    from tools.resume_language_checklist import check_resume_language_requirements

    user = get_optional_user(request)
    await ensure_session_access(req.session_id, user)
    if user:
        await bind_session_owner(req.session_id, user)

    target = normalize_language(req.target_language)
    if target not in VALID_RESUME_LANGUAGES:
        raise HTTPException(status_code=422, detail="target_language 必须为 zh、zh-TW、en 或 pt")

    client = await get_redis_client()
    store = RedisSessionStore(req.session_id, client)
    saved = await _aload_state(store)
    if not saved:
        raise HTTPException(status_code=404, detail="会话不存在")

    state = CopilotState.model_validate(saved)
    if state.resume_content_json is None:
        raise HTTPException(status_code=400, detail="简历尚未生成，请先上传并生成简历")

    from tools.resume_page_policy import page_limit_label, resolve_page_limit

    page_limit = resolve_page_limit(state)
    layout_label = page_limit_label(page_limit, target)
    state.user_message = (
        f"将简历转换为{language_label(target)}版本，遵循{language_label(target)}简历格式，控制在{layout_label}内"
    )
    state.resume_language_target = target
    state.current_intent = "language_convert"
    state.execution_plan = ["content_agent", "render_agent"]

    graph = _get_graph()
    try:
        async with llm_queue_slot(req.session_id):
            result = await _ainvoke_graph(graph, state.model_dump())
    except SessionBusyError:
        raise HTTPException(status_code=409, detail="该会话已有 AI 任务正在处理，请稍候完成后再试")
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
    from services.llm_queue import SessionBusyError, llm_queue_slot

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
        async with llm_queue_slot(req.session_id):
            result = await _ainvoke_graph(graph, state.model_dump())
    except SessionBusyError:
        raise HTTPException(status_code=409, detail="该会话已有 AI 任务正在处理，请稍候完成后再试")
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
