"""POST /api/chat — 主对话接口。"""

from __future__ import annotations

import asyncio
import time
import uuid
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pydantic import BaseModel, Field

from api.chat_input import prepare_chat_input
from auth.jwt import extract_bearer_token, get_optional_user
from auth.session_access import bind_session_owner, ensure_session_access
from workflow.graph import compile_graph
from workflow.state import CopilotState, ResumeHtml
from storage.redis_client import get_redis_client, RedisSessionStore, RedisDraftStore
from storage.mysql_client import get_mysql_pool, MySQLStore
from services.llm_queue import SessionBusyError, llm_queue_slot, SESSION_BUSY_API_DETAIL
from services import dialogue_memory, rag_service
from tools.output_language import (
    apply_chat_output_language,
    apply_interview_feedback_language,
    apply_interview_question_language,
)
from api.request_timing import RequestTiming, build_request_timing
from log import get_logger, elapsed_ms, log_stage_timing, format_trace_breakdown

logger = get_logger("api")

router = APIRouter(prefix="/api", tags=["chat"])

_graph = None


def _get_graph():
    global _graph
    if _graph is None:
        _graph = compile_graph()
    return _graph


async def _aload_state(store: RedisSessionStore) -> dict[str, Any] | None:
    return await store.load_state()


async def _asave_state(store: RedisSessionStore, state: dict[str, Any]) -> None:
    await store.save_state(state)


def _reset_profile_working_state(state: CopilotState) -> CopilotState:
    """Clear profile and downstream resume artifacts so a new upload fully replaces Redis content."""
    from workflow.state import ResumeHtml

    state.candidate_profile = None
    state.resume_content_json = None
    state.resume_html = ResumeHtml()
    state.gaps = []
    state.questions_to_ask = []
    state.experiences_to_remove = []
    state.learning_path_timeline = []
    state.learning_path_resources = []
    state.learning_path_estimated_hours = 0
    state.learning_path_daily_hours = 0.0
    return state


async def _ainvoke_graph(graph: Any, payload: dict[str, Any], *, config: dict[str, Any] | None = None) -> Any:
    if hasattr(graph, "ainvoke"):
        return await graph.ainvoke(payload, config=config)
    return await asyncio.to_thread(graph.invoke, payload, config)


class ChatRequest(BaseModel):
    session_id: str = ""
    message: str
    attachments: list[dict[str, Any]] = Field(default_factory=list)
    language: str = ""  # UI locale → API lang: zh | zh-TW | en | pt
    language_scope: str = "page"  # page | interview_question | interview_feedback
    replace_profile: bool = False  # True when uploading a new resume — overwrite Redis working copy
    forced_intent: str = ""  # Optional: skip LLM intent classification (upload_profile, profile_patch, upload_jd, gap_analysis, …)
    context_scope: str = ""  # Optional: narrow Planner intents (resume_edit, …)
    skip_render: bool = False  # content_edit: generate resume_content_json only, defer HTML render
    clear_generated_resume: bool = False  # clear resume_content_json/html before graph run (JD regen from profile)


class ChatResponse(BaseModel):
    session_id: str
    reply_message: str = ""
    candidate_profile: dict | None = None
    job: dict | None = None
    gaps: list[dict] = Field(default_factory=list)
    questions_to_ask: list[dict] = Field(default_factory=list)
    experiences_to_remove: list[dict] = Field(default_factory=list)
    resume_content_json: dict | None = None
    render_config: dict | None = None
    resume_html: dict | None = None
    interview_qa: list[dict] = Field(default_factory=list)
    triggered_agents: list[str] = Field(default_factory=list)
    # Answer evaluation (answer_evaluation_agent)
    score: int | None = None
    strengths: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
    judge_scores: dict | None = None
    # Learning path (learning_path_agent)
    timeline: list[dict] = Field(default_factory=list)
    resources: list[dict] = Field(default_factory=list)
    estimated_total_hours: int = 0
    daily_hours: float = 0.0
    timing: RequestTiming | None = None


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, request: Request, background_tasks: BackgroundTasks) -> ChatResponse:
    """主对话接口。"""
    request_t0 = time.perf_counter()
    session_id = req.session_id or f"sess_{uuid.uuid4().hex[:16]}"
    user = get_optional_user(request)
    await ensure_session_access(session_id, user)
    if user:
        await bind_session_owner(session_id, user)
    logger.info(
        "Chat request: session=%s, msg_len=%d, language=%s, authenticated=%s",
        session_id,
        len(req.message),
        req.language or "(empty)",
        user is not None,
    )

    # 从 Redis 加载或创建状态
    load_t0 = time.perf_counter()
    redis_client = await get_redis_client()
    store = RedisSessionStore(session_id, redis_client)
    saved_state = await _aload_state(store)
    load_ms = elapsed_ms(load_t0)

    if saved_state:
        state = CopilotState.model_validate(saved_state)
    else:
        state = CopilotState(session_id=session_id)

    scope = (req.language_scope or "page").strip().lower()
    if scope == "interview_question":
        apply_interview_question_language(state, req.language)
    elif scope == "interview_feedback":
        apply_interview_feedback_language(state, req.language)
    else:
        apply_chat_output_language(state, req.language)

    # 注入用户输入
    prepared_input = prepare_chat_input(req.message, req.attachments)
    state.user_message = prepared_input.user_message
    state.user_attachments = prepared_input.user_attachments

    replace_profile = req.replace_profile or bool(prepared_input.user_attachments)
    if replace_profile:
        state = _reset_profile_working_state(state)
        state.profile_replace_mode = True
        draft_store = RedisDraftStore(redis_client, session_id, user.get("sub") if user else None)
        await draft_store.clear_draft()
        logger.info("Profile replace mode: cleared Redis draft for session %s", session_id)
    state.forced_intent = (req.forced_intent or "").strip()
    state.context_scope = (req.context_scope or "").strip().lower()
    state.skip_render = bool(req.skip_render)
    state.auth_token = extract_bearer_token(request) or ""

    if req.clear_generated_resume:
        state.resume_content_json = None
        state.resume_html = ResumeHtml()
        logger.info("Cleared generated resume content for session %s before graph run", session_id)

    # 跨会话摘要 + 会话内对话记忆上下文
    memory_t0 = time.perf_counter()
    cross_summary = ""
    if user and user.get("sub"):
        try:
            cross_summary = await dialogue_memory.load_user_summary(user["sub"])
        except Exception as exc:
            logger.warning("load_user_summary failed: %s", exc)
    state.memory_context = dialogue_memory.build_memory_context(state)
    if cross_summary:
        prefix = f"【跨会话摘要】\n{cross_summary}"
        state.memory_context = f"{prefix}\n\n{state.memory_context}".strip() if state.memory_context else prefix
    memory_ms = elapsed_ms(memory_t0)

    # 执行 workflow graph，加上config指定langsmith的run_name，方便在LangSmith上查看每次API调用的执行详情
    graph = _get_graph()
    graph_t0 = time.perf_counter()
    try:
        async with llm_queue_slot(session_id):
            result = await _ainvoke_graph(
                graph, state.model_dump(), config={"run_name": f"API-Chat-Request: {session_id}"}
            )
    except SessionBusyError:
        raise HTTPException(status_code=409, detail=SESSION_BUSY_API_DETAIL)
    except Exception as e:
        logger.error("Workflow execution failed: %s", e, exc_info=True)
        err_text = str(e).lower()
        if (
            "account balance is insufficient" in err_text
            or "insufficient" in err_text and "balance" in err_text
            or "30001" in err_text
        ):
            raise HTTPException(
                status_code=502,
                detail="AI service account balance is insufficient. Please top up your SiliconFlow/LLM API credits and retry.",
            )
        raise HTTPException(status_code=500, detail=f"处理失败: {e}")
    graph_ms = elapsed_ms(graph_t0)

    # 构建响应状态
    final_state = CopilotState.model_validate(result)

    # 追加本轮对话记忆（写入 meta，随 Redis 持久化）
    user_msg = prepared_input.user_message
    final_state = dialogue_memory.append_turn(
        final_state,
        user_message=user_msg,
        assistant_reply=final_state.reply_message,
        intent=final_state.current_intent or "",
    )

    # 持久化到 Redis
    save_t0 = time.perf_counter()
    persist_data = final_state.model_dump(exclude={"user_message", "user_attachments", "current_intent",
                                                     "execution_plan", "reply_message", "triggered_agents",
                                                     "workflow_trace", "resume_language_target",
                                                     "profile_replace_mode", "forced_intent", "context_scope",
                                                     "chat_output_language",
                                                     "chat_question_output_language",
                                                     "chat_feedback_output_language",
                                                     "memory_context",
                                                     "auth_token",
                                                     "skip_render"})
    await _asave_state(store, persist_data)
    save_ms = elapsed_ms(save_t0)

    # 后台：对话压缩、RAG 索引、跨会话摘要
    background_tasks.add_task(_post_chat_background, final_state, user.get("sub") if user else None)

    # 草稿暂存 Redis；数据库持久化仅在用户确认保存（POST /api/resume/save）时执行
    logger.debug("Session %s persisted to Redis only (MySQL on explicit save)", session_id)
    log_stage_timing(
        logger,
        "chat.total",
        elapsed_ms(request_t0),
        session_id=session_id,
        intent=final_state.current_intent or "",
        load_ms=load_ms,
        memory_ms=memory_ms,
        graph_ms=graph_ms,
        save_ms=save_ms,
        breakdown=format_trace_breakdown(final_state.workflow_trace),
    )

    timing = build_request_timing(
        total_ms=elapsed_ms(request_t0),
        load_ms=load_ms,
        memory_ms=memory_ms,
        graph_ms=graph_ms,
        save_ms=save_ms,
        workflow_trace=final_state.workflow_trace,
    )

    return ChatResponse(
        session_id=session_id,
        reply_message=final_state.reply_message,
        candidate_profile=final_state.candidate_profile.model_dump() if final_state.candidate_profile else None,
        job=final_state.job.model_dump() if final_state.job else None,
        gaps=[g.model_dump() for g in final_state.gaps],
        questions_to_ask=[q.model_dump() for q in final_state.questions_to_ask],
        experiences_to_remove=[r.model_dump() for r in final_state.experiences_to_remove],
        resume_content_json=final_state.resume_content_json.model_dump() if final_state.resume_content_json else None,
        render_config=final_state.render_config.model_dump(),
        resume_html=final_state.resume_html.model_dump(),
        interview_qa=[qa.model_dump() for qa in final_state.interview_qa],
        triggered_agents=final_state.triggered_agents,
        score=final_state.last_answer_evaluation.score if final_state.last_answer_evaluation else None,
        strengths=list(final_state.last_answer_evaluation.strengths) if final_state.last_answer_evaluation else [],
        improvements=list(final_state.last_answer_evaluation.improvements) if final_state.last_answer_evaluation else [],
        suggestions=list(final_state.last_answer_evaluation.suggestions) if final_state.last_answer_evaluation else [],
        judge_scores={
            "relevance": final_state.last_answer_evaluation.judge_relevance,
            "groundedness": final_state.last_answer_evaluation.judge_groundedness,
            "actionability": final_state.last_answer_evaluation.judge_actionability,
            "rationale": final_state.last_answer_evaluation.judge_rationale,
        } if final_state.last_answer_evaluation else None,
        timeline=[p.model_dump() for p in final_state.learning_path_timeline],
        resources=[r.model_dump() for r in final_state.learning_path_resources],
        estimated_total_hours=final_state.learning_path_estimated_hours,
        daily_hours=final_state.learning_path_daily_hours,
        timing=timing,
    )


async def _post_chat_background(state: CopilotState, user_id: str | int | None) -> None:
    """Chat 响应后后台任务：压缩对话、索引 RAG、持久化跨会话摘要。"""
    bg_t0 = time.perf_counter()
    try:
        state = await dialogue_memory.maybe_compress_safe(state)
        if user_id and state.meta.dialogue_summary:
            redis_client = await get_redis_client()
            store = RedisSessionStore(state.session_id, redis_client)
            await _asave_state(store, state.model_dump(exclude={
                "user_message", "user_attachments", "current_intent",
                "execution_plan", "reply_message", "triggered_agents",
                "workflow_trace", "resume_language_target",
                "profile_replace_mode", "forced_intent", "context_scope",
                "chat_output_language", "chat_question_output_language",
                "chat_feedback_output_language", "memory_context", "auth_token",
            }))
            await dialogue_memory.persist_user_summary_safe(user_id, state)
    except Exception as exc:
        logger.warning("post_chat dialogue background failed: %s", exc)

    rag_t0 = time.perf_counter()
    await rag_service.index_session_safe(state)
    log_stage_timing(
        logger,
        "chat.background",
        elapsed_ms(bg_t0),
        session_id=state.session_id,
        rag_ms=elapsed_ms(rag_t0),
    )


async def _persist_to_mysql(state: CopilotState, user_id: int | str | None = None) -> None:
    """将关键状态异步持久化到 MySQL（仅对已登录用户调用）。"""
    pool = await get_mysql_pool()
    db = MySQLStore(pool)
    await db.upsert_session(state.session_id, user_id=user_id)

    if state.job:
        await db.save_job(state.job.id, state.session_id, state.job.model_dump(), state.job.version)

    if state.candidate_profile:
        profile_id = f"profile_{state.session_id}"
        await db.save_candidate_profile(profile_id, state.session_id, state.candidate_profile.model_dump())

    if state.resume_content_json:
        content_id = f"content_{state.session_id}"
        await db.save_resume_content(
            content_id, state.session_id,
            state.resume_content_json.model_dump(),
            state.resume_content_json.meta.version,
            state.resume_content_json.meta.content_hash,
        )

    render_id = f"render_{state.session_id}"
    await db.save_render_config(render_id, state.session_id,
                                state.render_config.model_dump(), state.render_config.version)

    if state.resume_html.html:
        html_id = f"html_{state.session_id}"
        await db.save_resume_html(
            html_id, state.session_id, state.resume_html.html,
            state.resume_html.version,
            state.resume_html.derived_from_content_version,
            state.resume_html.derived_from_render_version,
            state.resume_html.checksum,
        )

    if state.interview_qa:
        interview_id = f"interview_{state.session_id}"
        await db.save_interview_qa(
            interview_id, state.session_id,
            {"interview_qa": [qa.model_dump() for qa in state.interview_qa]},
            len(state.interview_qa),
        )


async def _persist_to_mysql_safe(state: CopilotState, user_id: int | str | None = None) -> None:
    try:
        await _persist_to_mysql(state, user_id)
    except Exception as e:
        logger.error("MySQL persistence failed: %s", e, exc_info=True)
