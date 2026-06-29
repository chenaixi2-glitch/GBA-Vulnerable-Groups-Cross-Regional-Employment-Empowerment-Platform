"""POST /api/chat — 主对话接口。"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pydantic import BaseModel, Field

from api.chat_input import prepare_chat_input
from auth.jwt import get_optional_user
from auth.session_access import bind_session_owner, ensure_session_access
from workflow.graph import compile_graph
from workflow.state import CopilotState
from storage.redis_client import get_redis_client, RedisSessionStore
from storage.mysql_client import get_mysql_pool, MySQLStore
from log import get_logger

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


async def _ainvoke_graph(graph: Any, payload: dict[str, Any], *, config: dict[str, Any] | None = None) -> Any:
    if hasattr(graph, "ainvoke"):
        return await graph.ainvoke(payload, config=config)
    return await asyncio.to_thread(graph.invoke, payload, config)


class ChatRequest(BaseModel):
    session_id: str = ""
    message: str
    attachments: list[dict[str, Any]] = Field(default_factory=list)


class ChatResponse(BaseModel):
    session_id: str
    reply_message: str = ""
    candidate_profile: dict | None = None
    job: dict | None = None
    gaps: list[dict] = Field(default_factory=list)
    questions_to_ask: list[dict] = Field(default_factory=list)
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


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, request: Request, background_tasks: BackgroundTasks) -> ChatResponse:
    """主对话接口。"""
    session_id = req.session_id or f"sess_{uuid.uuid4().hex[:16]}"
    user = get_optional_user(request)
    await ensure_session_access(session_id, user)
    if user:
        await bind_session_owner(session_id, user)
    logger.info("Chat request: session=%s, msg_len=%d, authenticated=%s",
                session_id, len(req.message), user is not None)

    # 从 Redis 加载或创建状态
    redis_client = await get_redis_client()
    store = RedisSessionStore(session_id, redis_client)
    saved_state = await _aload_state(store)

    if saved_state:
        state = CopilotState.model_validate(saved_state)
    else:
        state = CopilotState(session_id=session_id)

    # 注入用户输入
    prepared_input = prepare_chat_input(req.message, req.attachments)
    state.user_message = prepared_input.user_message
    state.user_attachments = prepared_input.user_attachments

    # 执行 workflow graph，加上config指定langsmith的run_name，方便在LangSmith上查看每次API调用的执行详情
    graph = _get_graph()
    try:
        result = await _ainvoke_graph(graph, state.model_dump(), config={"run_name": f"API-Chat-Request: {session_id}"})
    except Exception as e:
        logger.error("Workflow execution failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"处理失败: {e}")

    # 构建响应状态
    final_state = CopilotState.model_validate(result)

    # 持久化到 Redis
    persist_data = final_state.model_dump(exclude={"user_message", "user_attachments", "current_intent",
                                                     "execution_plan", "reply_message", "triggered_agents",
                                                     "workflow_trace", "resume_language_target"})
    await _asave_state(store, persist_data)

    # 草稿暂存 Redis；数据库持久化仅在用户确认保存（POST /api/resume/save）时执行
    logger.debug("Session %s persisted to Redis only (MySQL on explicit save)", session_id)

    return ChatResponse(
        session_id=session_id,
        reply_message=final_state.reply_message,
        candidate_profile=final_state.candidate_profile.model_dump() if final_state.candidate_profile else None,
        job=final_state.job.model_dump() if final_state.job else None,
        gaps=[g.model_dump() for g in final_state.gaps],
        questions_to_ask=[q.model_dump() for q in final_state.questions_to_ask],
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
