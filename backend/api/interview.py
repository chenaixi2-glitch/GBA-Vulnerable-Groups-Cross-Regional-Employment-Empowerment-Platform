"""交互式模拟面试 API。"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from agents.interactive_interview_agent import (
    generate_interactive_debrief,
    process_interactive_turn,
    session_to_response,
    start_interactive_interview,
)
from agents.interview_agent import custom_interview_answers_async, parse_custom_questions
from api.chat import _aload_state, _asave_state
from auth.jwt import get_optional_user
from auth.session_access import bind_session_owner, ensure_session_access, extract_user_id
from storage.redis_client import get_redis_client, RedisSessionStore
from storage.mysql_client import get_mysql_pool, MySQLStore
from services.llm_queue import SessionBusyError, llm_queue_slot
from tools.output_language import apply_interview_output_language
from workflow.state import CopilotState
from log import get_logger

logger = get_logger("api")

router = APIRouter(prefix="/api/interview", tags=["interview"])


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


async def _persist_interactive_interview(
    state: CopilotState,
    user_id: int | str,
    record_id: str | None = None,
) -> str:
    """将交互式模拟面试结果持久化到 MySQL。"""
    session = state.interactive_interview
    row_id = record_id or f"iis_{uuid.uuid4().hex[:16]}"
    overall_score = session.debrief.overall_score if session.debrief else None

    pool = await get_mysql_pool()
    db = MySQLStore(pool)
    await db.upsert_session(state.session_id, user_id=user_id)
    await db.save_interactive_interview_session(
        row_id=row_id,
        session_id=state.session_id,
        user_id=user_id,
        job_title=session.job_title,
        industry=session.industry,
        tone=session.tone,
        overall_score=overall_score,
        round_count=session.round_count,
        data={"interactive_interview": session.model_dump()},
    )
    return row_id


async def _persist_interactive_interview_safe(
    state: CopilotState,
    user_id: int | str,
    record_id: str | None = None,
) -> str:
    try:
        return await _persist_interactive_interview(state, user_id, record_id)
    except Exception as exc:
        logger.error("Interactive interview MySQL persistence failed: %s", exc, exc_info=True)
        raise


class InteractiveStartRequest(BaseModel):
    session_id: str = ""
    tone: str = "professional"
    job_title: str = ""
    industry: str = ""
    max_rounds: int = 0  # 0 = auto from program config
    program_version: str = "quick"  # quick | full | specialized
    specialized_focus: str = ""  # technical | final_negotiation | resume_deep_dive
    language: str = ""


class InteractiveTurnRequest(BaseModel):
    session_id: str
    answer: str
    language: str = ""


class InteractiveEndRequest(BaseModel):
    session_id: str
    generate_debrief: bool = True
    language: str = ""


class InteractiveResponse(BaseModel):
    session_id: str
    interactive_interview: dict[str, Any] = Field(default_factory=dict)
    message: str = ""


class CustomInterviewAnswersRequest(BaseModel):
    session_id: str = ""
    questions: list[str] = Field(default_factory=list)
    questions_text: str = ""
    language: str = ""


class CustomInterviewAnswersResponse(BaseModel):
    session_id: str
    interview_qa: list[dict[str, Any]] = Field(default_factory=list)
    message: str = ""


@router.post("/custom/generate-answers", response_model=CustomInterviewAnswersResponse)
async def generate_custom_interview_answers(
    req: CustomInterviewAnswersRequest,
    request: Request,
) -> CustomInterviewAnswersResponse:
    """为用户上传的自定义面试题生成基于画像与 JD 的参考答案。"""
    session_id = req.session_id or f"sess_{uuid.uuid4().hex[:16]}"
    user = get_optional_user(request)
    await ensure_session_access(session_id, user)
    if user:
        await bind_session_owner(session_id, user)

    questions = parse_custom_questions(req.questions if req.questions else req.questions_text)
    if not questions:
        raise HTTPException(status_code=400, detail="请至少提供一道面试题")

    state = await _load_state(session_id)
    state.session_id = session_id
    apply_interview_output_language(state, req.language)

    try:
        async with llm_queue_slot(session_id):
            result = await custom_interview_answers_async(state, questions)
    except SessionBusyError:
        raise HTTPException(status_code=409, detail="该会话已有 AI 任务正在处理，请稍候完成后再试")
    except Exception as exc:
        logger.error("Custom interview answers failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"生成参考答案失败: {exc}")

    interview_qa = result.get("interview_qa") or []
    if not interview_qa:
        trace = result.get("workflow_trace") or []
        detail = "未能生成参考答案"
        if trace:
            detail = trace[-1].get("output_summary") or detail
        raise HTTPException(status_code=400, detail=detail)

    state.interview_qa = interview_qa
    if result.get("meta"):
        state.meta = result["meta"]
    await _save_state(session_id, state)

    return CustomInterviewAnswersResponse(
        session_id=session_id,
        interview_qa=[qa.model_dump() for qa in interview_qa],
        message=f"已为 {len(interview_qa)} 道自定义题目生成参考答案。",
    )


@router.post("/interactive/start", response_model=InteractiveResponse)
async def interactive_start(req: InteractiveStartRequest, request: Request) -> InteractiveResponse:
    """开启多轮对话式模拟面试。"""
    session_id = req.session_id or f"sess_{uuid.uuid4().hex[:16]}"
    user = get_optional_user(request)
    await ensure_session_access(session_id, user)
    if user:
        await bind_session_owner(session_id, user)

    state = await _load_state(session_id)
    state.session_id = session_id
    apply_interview_output_language(state, req.language)

    if state.interactive_interview.status == "active":
        raise HTTPException(status_code=400, detail="已有进行中的模拟面试，请先结束或完成当前会话")

    try:
        async with llm_queue_slot(session_id):
            max_rounds = req.max_rounds if req.max_rounds > 0 else None
            session = await start_interactive_interview(
                state,
                tone=req.tone,
                job_title=req.job_title,
                industry=req.industry,
                max_rounds=max_rounds,
                program_version=req.program_version,
                specialized_focus=req.specialized_focus,
            )
    except SessionBusyError:
        raise HTTPException(status_code=409, detail="该会话已有 AI 任务正在处理，请稍候完成后再试")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("Interactive interview start failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"开启模拟面试失败: {exc}")

    state.interactive_interview = session
    await _save_state(session_id, state)

    return InteractiveResponse(
        session_id=session_id,
        interactive_interview=session_to_response(session),
        message="模拟面试已开始，请回答面试官的问题。",
    )


@router.post("/interactive/turn", response_model=InteractiveResponse)
async def interactive_turn(req: InteractiveTurnRequest, request: Request) -> InteractiveResponse:
    """提交回答，获取面试官点评与追问。"""
    user = get_optional_user(request)
    await ensure_session_access(req.session_id, user)

    state = await _load_state(req.session_id)
    apply_interview_output_language(state, req.language)
    if state.interactive_interview.status != "active":
        raise HTTPException(status_code=400, detail="没有进行中的模拟面试")

    try:
        async with llm_queue_slot(req.session_id):
            session = await process_interactive_turn(state, req.answer)
    except SessionBusyError:
        raise HTTPException(status_code=409, detail="该会话已有 AI 任务正在处理，请稍候完成后再试")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("Interactive interview turn failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"处理回答失败: {exc}")

    state.interactive_interview = session
    await _save_state(req.session_id, state)

    ended = session.status == "completed"
    message = "面试已结束，可查看复盘报告。" if ended else "请继续回答面试官的问题。"

    return InteractiveResponse(
        session_id=req.session_id,
        interactive_interview=session_to_response(session),
        message=message,
    )


@router.post("/interactive/end", response_model=InteractiveResponse)
async def interactive_end(req: InteractiveEndRequest, request: Request) -> InteractiveResponse:
    """结束模拟面试并生成复盘报告。"""
    user = get_optional_user(request)
    await ensure_session_access(req.session_id, user)

    state = await _load_state(req.session_id)
    apply_interview_output_language(state, req.language)
    session = state.interactive_interview

    if not session.turns:
        raise HTTPException(status_code=400, detail="没有面试对话记录")

    try:
        if req.generate_debrief:
            async with llm_queue_slot(req.session_id):
                session = await generate_interactive_debrief(state)
        else:
            session.status = "completed"
            session.ended_at = session.ended_at or ""
    except SessionBusyError:
        raise HTTPException(status_code=409, detail="该会话已有 AI 任务正在处理，请稍候完成后再试")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("Interactive interview end failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"生成复盘失败: {exc}")

    state.interactive_interview = session
    await _save_state(req.session_id, state)

    return InteractiveResponse(
        session_id=req.session_id,
        interactive_interview=session_to_response(session),
        message="复盘报告已生成。",
    )


@router.get("/interactive/status")
async def interactive_status(session_id: str, request: Request) -> dict[str, Any]:
    """查询当前交互式面试状态。"""
    user = get_optional_user(request)
    await ensure_session_access(session_id, user)

    state = await _load_state(session_id)
    session = state.interactive_interview
    return {
        "session_id": session_id,
        "status": session.status,
        "round_count": session.round_count,
        "max_rounds": session.max_rounds,
        "program_version": session.program_version,
        "program_label": {
            "quick": "极速版 (~30分钟)",
            "full": "完整版 (~60分钟)",
            "specialized": "专项版",
        }.get(session.program_version, session.program_version),
        "current_stage_index": session.current_stage_index,
        "current_stage": session.stages[session.current_stage_index].model_dump()
        if session.stages and 0 <= session.current_stage_index < len(session.stages) else None,
        "stages": [s.model_dump() for s in session.stages],
        "has_debrief": session.debrief is not None,
    }


class InteractiveSaveRequest(BaseModel):
    session_id: str
    record_id: str = ""


@router.post("/interactive/save")
async def interactive_save(req: InteractiveSaveRequest, request: Request) -> dict[str, Any]:
    """登录用户将本场模拟面试结果保存到数据库。"""
    user = get_optional_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="请先登录后再保存模拟面试记录")

    user_id = extract_user_id(user)
    if user_id is None:
        raise HTTPException(status_code=401, detail="无效的用户身份")

    await bind_session_owner(req.session_id, user)

    state = await _load_state(req.session_id)
    session = state.interactive_interview

    if session.status != "completed":
        raise HTTPException(status_code=400, detail="模拟面试尚未结束，无法保存")
    if not session.turns:
        raise HTTPException(status_code=400, detail="没有可保存的面试对话记录")
    if session.debrief is None:
        raise HTTPException(status_code=400, detail="请先生成复盘报告后再保存")

    record_id = req.record_id.strip() or None

    try:
        saved_id = await _persist_interactive_interview_safe(state, user_id, record_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"保存失败: {exc}")

    return {
        "ok": True,
        "message": "模拟面试记录已保存到您的账户。",
        "session_id": req.session_id,
        "record_id": saved_id,
    }


@router.get("/interactive/history")
async def interactive_history(request: Request, limit: int = 20) -> dict[str, Any]:
    """列出当前登录用户已保存的模拟面试记录摘要。"""
    user = get_optional_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="请先登录")

    user_id = extract_user_id(user)
    if user_id is None:
        raise HTTPException(status_code=401, detail="无效的用户身份")

    pool = await get_mysql_pool()
    db = MySQLStore(pool)
    records = await db.list_interactive_interviews_by_user(user_id, limit=min(limit, 50))

    for row in records:
        if row.get("saved_at") is not None:
            row["saved_at"] = str(row["saved_at"])

    return {"records": records}


@router.get("/interactive/saved/{record_id}")
async def get_saved_interactive_interview(record_id: str, request: Request) -> dict[str, Any]:
    """获取单条已保存的模拟面试完整记录。"""
    user = get_optional_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="请先登录")

    user_id = extract_user_id(user)
    if user_id is None:
        raise HTTPException(status_code=401, detail="无效的用户身份")

    pool = await get_mysql_pool()
    db = MySQLStore(pool)
    record = await db.get_interactive_interview_for_user(record_id, user_id)
    if record is None:
        raise HTTPException(status_code=404, detail="记录不存在或无权访问")

    if record.get("saved_at") is not None:
        record["saved_at"] = str(record["saved_at"])

    return record
