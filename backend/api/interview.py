"""交互式模拟面试 API。"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from agents.interactive_interview_agent import (
    collect_poll_updates,
    generate_interactive_debrief,
    process_interactive_turn,
    process_next_pending_feedback,
    session_to_response,
    start_interactive_interview,
)
from agents.interview_agent import custom_interview_answers_async, parse_custom_questions
from api.chat import _aload_state, _asave_state
from api.interview_messages import (
    INTERVIEW_DEBRIEF_READY,
    INTERVIEW_ERR_ALREADY_ACTIVE,
    INTERVIEW_ERR_NO_POLL_SESSION,
    INTERVIEW_ERR_NO_TURNS,
    INTERVIEW_ERR_NOT_ACTIVE,
    INTERVIEW_POLL_ENDED,
    INTERVIEW_POLL_FEEDBACK,
    INTERVIEW_POLL_SYNCED,
    INTERVIEW_POLL_WAITING_FU,
    INTERVIEW_STARTED,
    INTERVIEW_TURN_ENDED,
    INTERVIEW_TURN_NEXT,
    INTERVIEW_TURN_RECORDED,
    INTERVIEW_TURN_WAITING,
)
from auth.jwt import get_optional_user
from auth.session_access import bind_session_owner, ensure_session_access, extract_user_id
from storage.redis_client import get_redis_client, RedisSessionStore
from storage.mysql_client import get_mysql_pool, MySQLStore
from services.llm_queue import SessionBusyError, llm_queue_slot, SESSION_BUSY_API_DETAIL
from tools.output_language import (
    apply_interview_feedback_language,
    apply_interview_languages,
    apply_interview_question_language,
)
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
    question_language: str = ""
    language: str = ""  # backward-compatible alias for question_language


class InteractiveTurnRequest(BaseModel):
    session_id: str
    answer: str
    question_language: str = ""
    feedback_language: str = ""
    language: str = ""  # backward-compatible alias for question_language


class InteractiveEndRequest(BaseModel):
    session_id: str
    generate_debrief: bool = True
    feedback_language: str = ""
    language: str = ""  # backward-compatible alias for feedback_language


class InteractivePollRequest(BaseModel):
    session_id: str
    since_sequence: int = 0
    question_language: str = ""
    feedback_language: str = ""
    language: str = ""  # backward-compatible alias for question_language


class InterviewLanguageRequest(BaseModel):
    session_id: str
    question_language: str = ""
    feedback_language: str = ""
    language: str = ""  # backward-compatible alias for question_language


class InteractiveResponse(BaseModel):
    session_id: str
    interactive_interview: dict[str, Any] = Field(default_factory=dict)
    message: str = ""


class CustomInterviewAnswersRequest(BaseModel):
    session_id: str = ""
    questions: list[str] = Field(default_factory=list)
    questions_text: str = ""
    question_language: str = ""
    language: str = ""  # backward-compatible alias for question_language


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
        raise HTTPException(status_code=400, detail="Please provide at least one interview question")

    state = await _load_state(session_id)
    state.session_id = session_id
    apply_interview_question_language(state, req.question_language or req.language)

    try:
        async with llm_queue_slot(session_id):
            result = await custom_interview_answers_async(state, questions)
    except SessionBusyError:
        raise HTTPException(status_code=409, detail=SESSION_BUSY_API_DETAIL)
    except Exception as exc:
        logger.error("Custom interview answers failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to generate reference answers: {exc}")

    interview_qa = result.get("interview_qa") or []
    if not interview_qa:
        trace = result.get("workflow_trace") or []
        detail = "Could not generate reference answers"
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
        message=f"Generated reference answers for {len(interview_qa)} custom questions.",
    )


@router.put("/language")
async def set_interview_language(req: InterviewLanguageRequest, request: Request) -> dict[str, str]:
    """在面试题生成前持久化面试题/反馈语言到会话。"""
    from tools.resume_layout import VALID_RESUME_LANGUAGES, normalize_language

    user = get_optional_user(request)
    await ensure_session_access(req.session_id, user)

    state = await _load_state(req.session_id)
    state.session_id = req.session_id

    q_lang = normalize_language(req.question_language or req.language or "")
    f_lang = normalize_language(req.feedback_language or "")
    if q_lang and q_lang not in VALID_RESUME_LANGUAGES:
        raise HTTPException(status_code=422, detail="question_language must be zh, zh-TW, en, or pt")
    if f_lang and f_lang not in VALID_RESUME_LANGUAGES:
        raise HTTPException(status_code=422, detail="feedback_language must be zh, zh-TW, en, or pt")

    if q_lang:
        apply_interview_question_language(state, q_lang)
    if f_lang:
        apply_interview_feedback_language(state, f_lang)

    await _save_state(req.session_id, state)
    return {
        "question_language": q_lang or (state.meta.interview_question_language if state.meta else ""),
        "feedback_language": f_lang or (state.meta.interview_feedback_language if state.meta else ""),
    }


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
    apply_interview_question_language(state, req.question_language or req.language)

    if state.interactive_interview.status == "active":
        raise HTTPException(status_code=400, detail=INTERVIEW_ERR_ALREADY_ACTIVE)

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
        raise HTTPException(status_code=409, detail=SESSION_BUSY_API_DETAIL)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("Interactive interview start failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to start mock interview: {exc}")

    state.interactive_interview = session
    await _save_state(session_id, state)

    return InteractiveResponse(
        session_id=session_id,
        interactive_interview=session_to_response(session),
        message=INTERVIEW_STARTED,
    )


@router.post("/interactive/turn", response_model=InteractiveResponse)
async def interactive_turn(req: InteractiveTurnRequest, request: Request) -> InteractiveResponse:
    """提交回答：立即返回下一题，点评与追问在后台异步生成（通过 poll 获取）。"""
    user = get_optional_user(request)
    await ensure_session_access(req.session_id, user)

    state = await _load_state(req.session_id)
    apply_interview_languages(
        state,
        req.question_language or req.language,
        req.feedback_language,
    )
    if state.interactive_interview.status != "active":
        raise HTTPException(status_code=400, detail=INTERVIEW_ERR_NOT_ACTIVE)

    try:
        session = await process_interactive_turn(state, req.answer)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("Interactive interview turn failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to process answer: {exc}")

    state.interactive_interview = session
    await _save_state(req.session_id, state)

    ended = session.status == "completed"
    waiting = session.phase == "follow_up_wait"
    if ended:
        message = INTERVIEW_TURN_ENDED
    elif waiting:
        message = INTERVIEW_TURN_WAITING
    elif session.current_question_id:
        message = INTERVIEW_TURN_NEXT
    else:
        message = INTERVIEW_TURN_RECORDED

    return InteractiveResponse(
        session_id=req.session_id,
        interactive_interview=session_to_response(session),
        message=message,
    )


@router.post("/interactive/poll", response_model=InteractiveResponse)
async def interactive_poll(req: InteractivePollRequest, request: Request) -> InteractiveResponse:
    """轮询异步点评/追问进度，并尝试处理一条待生成点评。"""
    user = get_optional_user(request)
    await ensure_session_access(req.session_id, user)

    state = await _load_state(req.session_id)
    apply_interview_languages(
        state,
        req.question_language or req.language,
        req.feedback_language,
    )
    session = state.interactive_interview
    if session.status not in ("active", "completed") and not session.pending_feedbacks:
        raise HTTPException(status_code=400, detail=INTERVIEW_ERR_NO_POLL_SESSION)

    try:
        await process_next_pending_feedback(state)
    except SessionBusyError:
        pass
    except Exception as exc:
        logger.error("Interactive poll feedback failed: %s", exc, exc_info=True)

    state.interactive_interview = session
    await _save_state(req.session_id, state)

    updates = collect_poll_updates(session, req.since_sequence)
    response_data = session_to_response(session)
    response_data["poll_updates"] = updates

    if session.status == "completed":
        message = INTERVIEW_POLL_ENDED
    elif updates.get("waiting_for_follow_ups"):
        message = INTERVIEW_POLL_WAITING_FU
    elif updates.get("pending_feedback_count", 0) > 0:
        message = INTERVIEW_POLL_FEEDBACK
    else:
        message = INTERVIEW_POLL_SYNCED

    return InteractiveResponse(
        session_id=req.session_id,
        interactive_interview=response_data,
        message=message,
    )


@router.post("/interactive/end", response_model=InteractiveResponse)
async def interactive_end(req: InteractiveEndRequest, request: Request) -> InteractiveResponse:
    """结束模拟面试并生成复盘报告。"""
    user = get_optional_user(request)
    await ensure_session_access(req.session_id, user)

    state = await _load_state(req.session_id)
    apply_interview_feedback_language(state, req.feedback_language or req.language)
    session = state.interactive_interview

    if not session.turns:
        raise HTTPException(status_code=400, detail=INTERVIEW_ERR_NO_TURNS)

    try:
        if req.generate_debrief:
            async with llm_queue_slot(req.session_id):
                session = await generate_interactive_debrief(state)
        else:
            session.status = "completed"
            session.ended_at = session.ended_at or ""
    except SessionBusyError:
        raise HTTPException(status_code=409, detail=SESSION_BUSY_API_DETAIL)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("Interactive interview end failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to generate debrief: {exc}")

    state.interactive_interview = session
    await _save_state(req.session_id, state)

    return InteractiveResponse(
        session_id=req.session_id,
        interactive_interview=session_to_response(session),
        message=INTERVIEW_DEBRIEF_READY,
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
            "quick": "Quick (~30 min)",
            "full": "Full (~60 min)",
            "specialized": "Specialized",
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
        raise HTTPException(status_code=401, detail="Please log in before saving the mock interview")

    user_id = extract_user_id(user)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid user identity")

    await bind_session_owner(req.session_id, user)

    state = await _load_state(req.session_id)
    session = state.interactive_interview

    if session.status != "completed":
        raise HTTPException(status_code=400, detail="Mock interview is not finished yet")
    if not session.turns:
        raise HTTPException(status_code=400, detail="No interview conversation to save")
    if session.debrief is None:
        raise HTTPException(status_code=400, detail="Please generate the debrief report before saving")

    record_id = req.record_id.strip() or None

    try:
        saved_id = await _persist_interactive_interview_safe(state, user_id, record_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Save failed: {exc}")

    return {
        "ok": True,
        "message": "Mock interview saved to your account.",
        "session_id": req.session_id,
        "record_id": saved_id,
    }


@router.get("/interactive/history")
async def interactive_history(request: Request, limit: int = 20) -> dict[str, Any]:
    """列出当前登录用户已保存的模拟面试记录摘要。"""
    user = get_optional_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Please log in")

    user_id = extract_user_id(user)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid user identity")

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
        raise HTTPException(status_code=401, detail="Please log in")

    user_id = extract_user_id(user)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid user identity")

    pool = await get_mysql_pool()
    db = MySQLStore(pool)
    record = await db.get_interactive_interview_for_user(record_id, user_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found or access denied")

    if record.get("saved_at") is not None:
        record["saved_at"] = str(record["saved_at"])

    return record


def _default_question_bank_record_name(saved_at: datetime | None = None) -> str:
    """未提供自定义名称时，使用保存时间作为默认名称。"""
    ts = saved_at or datetime.utcnow()
    return ts.strftime("%Y-%m-%d %H:%M")


class QuestionBankSaveRequest(BaseModel):
    session_id: str
    record_name: str = ""
    mode: str = "question_bank"
    job_title: str = ""
    industry: str = ""
    tone: str = "professional"
    program_version: str = ""
    program_label: str = ""
    user_answers: list[str] = Field(default_factory=list)
    questions: list[dict[str, Any]] = Field(default_factory=list)
    stages: list[dict[str, Any]] = Field(default_factory=list)


@router.post("/question-bank/save")
async def save_question_bank(req: QuestionBankSaveRequest, request: Request) -> dict[str, Any]:
    """登录用户将题库练习记录保存到数据库。"""
    user = get_optional_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Please log in before saving the question bank")

    user_id = extract_user_id(user)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid user identity")

    await bind_session_owner(req.session_id, user)

    state = await _load_state(req.session_id)
    questions = req.questions
    if not questions and state.interview_qa:
        questions = [qa.model_dump() for qa in state.interview_qa]
    if not questions:
        raise HTTPException(status_code=400, detail="No interview questions to save — generate a question bank first")

    row_id = f"qbs_{uuid.uuid4().hex[:16]}"
    job_title = req.job_title.strip() or (state.job.title if state.job else "")
    industry = req.industry.strip() or (state.job.industry if state.job else "")
    mode = (req.mode or "question_bank").strip() or "question_bank"
    program_version = req.program_version.strip() or ""
    program_label = req.program_label.strip() or ""
    saved_at = datetime.utcnow()
    record_name = req.record_name.strip() or _default_question_bank_record_name(saved_at)

    pool = await get_mysql_pool()
    db = MySQLStore(pool)
    try:
        await db.upsert_session(req.session_id, user_id=user_id)
        saved_at_str = await db.save_question_bank_session(
            row_id=row_id,
            session_id=req.session_id,
            user_id=user_id,
            record_name=record_name,
            job_title=job_title,
            industry=industry,
            tone=req.tone or "professional",
            mode=mode,
            program_version=program_version,
            question_count=len(questions),
            data={
                "interview_qa": questions,
                "user_answers": req.user_answers,
                "program_label": program_label,
                "stages": req.stages,
            },
        )
    except Exception as exc:
        logger.error("Question bank save failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Save failed: {exc}")

    return {
        "ok": True,
        "message": "Question bank saved to your account.",
        "session_id": req.session_id,
        "record_id": row_id,
        "record_name": record_name,
        "saved_at": saved_at_str,
    }


@router.get("/question-bank/history")
async def question_bank_history(request: Request, limit: int = 20) -> dict[str, Any]:
    """列出当前登录用户已保存的题库记录摘要。"""
    user = get_optional_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Please log in")

    user_id = extract_user_id(user)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid user identity")

    pool = await get_mysql_pool()
    db = MySQLStore(pool)
    records = await db.list_question_bank_sessions_by_user(user_id, limit=min(limit, 50))

    for row in records:
        if row.get("saved_at") is not None:
            row["saved_at"] = str(row["saved_at"])
        if not (row.get("record_name") or "").strip():
            try:
                ts = datetime.strptime(str(row["saved_at"]), "%Y-%m-%d %H:%M:%S")
                row["record_name"] = _default_question_bank_record_name(ts)
            except ValueError:
                row["record_name"] = str(row.get("saved_at") or "")

    return {"records": records}


@router.get("/question-bank/saved/{record_id}")
async def get_saved_question_bank(record_id: str, request: Request) -> dict[str, Any]:
    """获取单条已保存的题库完整记录。"""
    user = get_optional_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Please log in")

    user_id = extract_user_id(user)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid user identity")

    pool = await get_mysql_pool()
    db = MySQLStore(pool)
    record = await db.get_question_bank_session_for_user(record_id, user_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found or access denied")

    if record.get("saved_at") is not None:
        record["saved_at"] = str(record["saved_at"])
    if not (record.get("record_name") or "").strip():
        try:
            ts = datetime.strptime(str(record["saved_at"]), "%Y-%m-%d %H:%M:%S")
            record["record_name"] = _default_question_bank_record_name(ts)
        except ValueError:
            record["record_name"] = str(record.get("saved_at") or "")

    return record
