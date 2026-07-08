"""Question Agent — 基于当前 graph state 自由回答用户问题。"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from models.llm import get_llm, _ainvoke_model, _extract_text_content
from services import dialogue_memory, rag_service
from tools.node_jobs_client import fetch_matched_jobs, format_jobs_for_prompt, is_job_search_query
from tools.output_language_guard import guard_text_output
from tools.output_language import output_language_instruction, resolve_output_language
from workflow.state import CopilotState
from workflow.trace import append_trace, summarize_user_message
from log import get_logger

logger = get_logger("agent")


_QUESTION_SYSTEM_PROMPT = """你是一个职业助手问答专家。你可以读取工作流 graph 的当前状态变量，并用自然语言回答用户问题。

回答要求：
- 优先依据检索片段、对话记忆与状态摘要中的事实回答，不要编造没有依据的信息
- 如果信息不足，明确说明缺少哪些状态数据，并给出用户下一步可以补充什么
- 用户询问岗位、候选人、简历、缺口、追问问题、渲染配置、HTML 版本或面试问答时，都可以从上下文中综合回答
- 若提供了「平台匹配岗位列表」，请基于该列表回答岗位推荐问题；未登录则提示用户登录或前往岗位数据库页面
- 回答要直接、自然，使用中文
"""


async def _build_jobs_context(state: CopilotState) -> str:
    """岗位相关问句时调用 Node API 获取匹配岗位。"""
    if not is_job_search_query(state.user_message):
        return ""

    token = (state.auth_token or "").strip()
    if not token:
        return (
            "【平台岗位匹配】用户尚未登录或未携带有效令牌，无法查询匹配岗位。"
            "请友好提示用户登录后重试，或前往「岗位数据库」页面浏览岗位。"
        )

    jobs = await fetch_matched_jobs(token)
    if not jobs:
        return "【平台匹配岗位】当前未返回匹配岗位（可能暂无数据或技能信息不足）。请如实告知用户。"
    return "【平台匹配岗位列表】\n" + format_jobs_for_prompt(jobs)


def _compact_state_context(state: CopilotState) -> dict[str, Any]:
    """构造给问答模型看的状态快照（RAG 不可用时的 fallback）。"""
    state_context = state.model_dump(
        exclude={
            "user_attachments",
            "execution_plan",
            "triggered_agents",
            "reply_message",
            "conversation_events",
            "workflow_trace",
            "memory_context",
            "auth_token",
        }
    )
    resume_html = state_context.get("resume_html") or {}
    html = resume_html.get("html") or ""
    if html:
        resume_html["html"] = html[:3000]
        resume_html["html_truncated"] = len(html) > 3000
        state_context["resume_html"] = resume_html
    return state_context


async def _build_question_prompt(state: CopilotState) -> str:
    """构建问答 prompt：RAG 片段 + 对话记忆 + 精简摘要（fallback 全量 state）。"""
    lang_instruction = output_language_instruction(resolve_output_language(state))
    system_prompt = (
        f"{_QUESTION_SYSTEM_PROMPT.rstrip()}\n"
        f"- 回答语言：{lang_instruction}"
    )

    memory_block = (state.memory_context or "").strip() or dialogue_memory.build_memory_context(state)
    jobs_block = await _build_jobs_context(state)
    rag_block = ""
    chunks = await rag_service.retrieve(state.session_id, state.user_message)
    if chunks:
        rag_block = rag_service.format_chunks_for_prompt(chunks)
        summary = rag_service.compact_state_summary(state)
    else:
        summary = json.dumps(_compact_state_context(state), ensure_ascii=False, indent=2)

    parts = [
        system_prompt,
        f"用户问题：\n{state.user_message}",
    ]
    if memory_block:
        parts.append(f"对话记忆：\n{memory_block}")
    if jobs_block:
        parts.append(jobs_block)
    if rag_block:
        parts.append(f"检索到的相关片段：\n{rag_block}")
        parts.append(f"状态摘要：\n{summary}")
    else:
        parts.append(f"当前 graph state JSON：\n{summary}")

    return "\n\n".join(parts)


async def question_node_async(state: CopilotState) -> dict[str, Any]:
    """Question Agent 异步节点函数。"""
    logger.info("Question Agent started for session %s", state.session_id)

    prompt = await _build_question_prompt(state)
    llm = get_llm()
    response = await _ainvoke_model(llm, prompt)
    answer = _extract_text_content(response)

    if not answer:
        answer = "我暂时没有从当前状态中找到可回答的信息。可以补充岗位、个人材料或先生成简历后再问我。"
    else:
        output_lang = resolve_output_language(state)
        answer = await guard_text_output(llm, answer, output_lang, logger, "Question Agent")

    return {
        "workflow_trace": append_trace(
            state,
            node="question_agent",
            input_summary=f"根据当前 graph state 回答问题：{summarize_user_message(state.user_message)}",
            output_summary=answer,
            artifacts={"answer_length": len(answer)},
        )
    }


def question_node(state: CopilotState) -> dict[str, Any]:
    """Question Agent 同步兼容入口。"""
    return asyncio.run(question_node_async(state))
