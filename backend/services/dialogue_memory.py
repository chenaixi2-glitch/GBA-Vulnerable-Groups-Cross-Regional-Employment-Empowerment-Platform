"""多轮对话记忆 — 短期轮次缓冲、超阈值压缩与跨会话摘要。"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field

from config_loader import get_dialogue_memory_config, is_embedding_enabled
from log import get_logger
from models.embedding import aembed_documents
from models.llm import ainvoke_json_with_schema, get_llm
from storage.vector_client import get_user_memory_collection, is_vector_store_enabled
from workflow.state import CopilotState, DialogueTurn

logger = get_logger("dialogue_memory")


class DialogueCompressOutput(BaseModel):
    summary: str = ""
    facts: list[str] = Field(default_factory=list)
    open_questions: list[str] = Field(default_factory=list)


def _cfg() -> dict[str, Any]:
    cfg = get_dialogue_memory_config()
    return {
        "raw_turn_limit": int(cfg.get("raw_turn_limit", 6)),
        "compress_threshold": int(cfg.get("compress_threshold", 10)),
        "max_turn_chars": int(cfg.get("max_turn_chars", 800)),
        "summary_max_chars": int(cfg.get("summary_max_chars", 2000)),
        "cross_session_enabled": bool(cfg.get("cross_session_enabled", True)),
    }


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _truncate(text: str, max_len: int) -> str:
    text = (text or "").strip()
    if len(text) <= max_len:
        return text
    return text[: max_len - 3] + "..."


def build_memory_context(state: CopilotState) -> str:
    """拼装对话记忆上下文（仅 meta 字段，不含 runtime memory_context）。"""
    parts: list[str] = []
    meta = state.meta

    if meta.dialogue_summary:
        parts.append("【历史对话摘要】\n" + meta.dialogue_summary.strip())

    if meta.extracted_facts:
        facts = "\n".join(f"- {f}" for f in meta.extracted_facts[:12])
        parts.append("【已确认事实/偏好】\n" + facts)

    if meta.dialogue_turns:
        recent_lines: list[str] = []
        for turn in meta.dialogue_turns[-6:]:
            role = "用户" if turn.role == "user" else "助手"
            recent_lines.append(f"{role}：{turn.content}")
        parts.append("【最近对话】\n" + "\n".join(recent_lines))

    return "\n\n".join(parts).strip()


def append_turn(
    state: CopilotState,
    user_message: str,
    assistant_reply: str,
    intent: str = "",
) -> CopilotState:
    """追加一轮对话到 meta.dialogue_turns。"""
    cfg = _cfg()
    max_chars = cfg["max_turn_chars"]
    limit = cfg["raw_turn_limit"]

    if (user_message or "").strip():
        state.meta.dialogue_turns.append(DialogueTurn(
            role="user",
            content=_truncate(user_message, max_chars),
            intent=intent,
            created_at=_utc_now(),
        ))

    if (assistant_reply or "").strip():
        state.meta.dialogue_turns.append(DialogueTurn(
            role="assistant",
            content=_truncate(assistant_reply, max_chars),
            intent=intent,
            created_at=_utc_now(),
        ))

    if len(state.meta.dialogue_turns) > limit * 2:
        state.meta.dialogue_turns = state.meta.dialogue_turns[-(limit * 2):]

    return state


async def maybe_compress(state: CopilotState) -> CopilotState:
    """轮次超阈值时压缩较早对话为摘要。"""
    cfg = _cfg()
    threshold = cfg["compress_threshold"]
    keep = cfg["raw_turn_limit"]
    summary_max = cfg["summary_max_chars"]

    turns = state.meta.dialogue_turns
    if len(turns) <= threshold:
        return state

    to_compress = turns[: max(0, len(turns) - keep)]
    if not to_compress:
        return state

    lines = []
    for t in to_compress:
        role = "用户" if t.role == "user" else "助手"
        lines.append(f"{role}：{t.content}")

    prompt = (
        "你是职业助手对话压缩器。将以下较早对话合并进已有摘要，输出 JSON。\n\n"
        f"已有摘要：\n{state.meta.dialogue_summary or '（无）'}\n\n"
        "待压缩对话：\n"
        + "\n".join(lines)
        + "\n\n"
        "要求：summary 保留用户目标岗位、语言偏好、已做决策；facts 为短句列表；"
        "open_questions 为尚未回答的问题。全部使用中文。"
    )

    try:
        llm = get_llm()
        result = await ainvoke_json_with_schema(
            llm, prompt, DialogueCompressOutput, logger, "Dialogue Memory"
        )
        merged_summary = result.summary.strip()
        if state.meta.dialogue_summary and merged_summary:
            merged_summary = _truncate(
                state.meta.dialogue_summary + "\n" + merged_summary,
                summary_max,
            )
        elif merged_summary:
            merged_summary = _truncate(merged_summary, summary_max)

        state.meta.dialogue_summary = merged_summary
        if result.facts:
            existing = list(state.meta.extracted_facts)
            for fact in result.facts:
                fact = fact.strip()
                if fact and fact not in existing:
                    existing.append(fact)
            state.meta.extracted_facts = existing[:20]

        state.meta.dialogue_turns = turns[-keep:]
        logger.info(
            "Compressed %d dialogue turns for session %s",
            len(to_compress),
            state.session_id,
        )
    except Exception as exc:
        logger.warning("Dialogue compress failed for %s: %s", state.session_id, exc)

    return state


async def load_user_summary(user_id: str | int) -> str:
    """加载登录用户跨会话对话摘要（Chroma user_memory）。"""
    cfg = _cfg()
    if not cfg["cross_session_enabled"] or not is_vector_store_enabled():
        return ""

    uid = str(user_id)
    try:
        collection = get_user_memory_collection()
        results = collection.get(where={"user_id": uid}, limit=1)
        docs = results.get("documents") or []
        if docs and docs[0]:
            return _truncate(docs[0], 500)
    except Exception as exc:
        logger.warning("load_user_summary failed for user %s: %s", uid, exc)
    return ""


async def persist_user_summary(user_id: str | int, summary: str) -> None:
    """将对话摘要写入 Chroma user_memory（跨会话）。"""
    cfg = _cfg()
    if not cfg["cross_session_enabled"] or not is_vector_store_enabled() or not is_embedding_enabled():
        return

    summary = (summary or "").strip()
    if not summary:
        return

    uid = str(user_id)
    try:
        collection = get_user_memory_collection()
        doc_id = f"user:{uid}:dialogue_summary"
        embedding = (await aembed_documents([summary]))[0]
        collection.upsert(
            ids=[doc_id],
            documents=[_truncate(summary, cfg["summary_max_chars"])],
            metadatas=[{"user_id": uid, "type": "dialogue_summary"}],
            embeddings=[embedding],
        )
        logger.info("Persisted user dialogue summary for user %s", uid)
    except Exception as exc:
        logger.warning("persist_user_summary failed for user %s: %s", uid, exc)


async def maybe_compress_safe(state: CopilotState) -> CopilotState:
    try:
        return await maybe_compress(state)
    except Exception as exc:
        logger.warning("maybe_compress_safe: %s", exc)
        return state


async def persist_user_summary_safe(user_id: str | int | None, state: CopilotState) -> None:
    if not user_id:
        return
    try:
        summary = state.meta.dialogue_summary
        if summary:
            await persist_user_summary(user_id, summary)
    except Exception as exc:
        logger.warning("persist_user_summary_safe: %s", exc)
