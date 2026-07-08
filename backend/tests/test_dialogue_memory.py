"""Dialogue memory unit tests."""

from __future__ import annotations

from services.dialogue_memory import append_turn, build_memory_context
from workflow.state import CopilotState, DialogueTurn, Meta


def test_append_turn_adds_user_and_assistant():
    state = CopilotState(session_id="s1")
    state = append_turn(state, "你好", "您好，有什么可以帮您？", intent="ask_question")
    assert len(state.meta.dialogue_turns) == 2
    assert state.meta.dialogue_turns[0].role == "user"
    assert state.meta.dialogue_turns[1].role == "assistant"


def test_build_memory_context_includes_summary_and_turns():
    state = CopilotState(
        session_id="s1",
        meta=Meta(
            dialogue_summary="用户目标岗位：金融合规",
            extracted_facts=["偏好中文输出"],
            dialogue_turns=[
                DialogueTurn(role="user", content="我的缺口有哪些？"),
                DialogueTurn(role="assistant", content="您缺少 CFA 证书。"),
            ],
        ),
    )
    ctx = build_memory_context(state)
    assert "金融合规" in ctx
    assert "偏好中文输出" in ctx
    assert "我的缺口有哪些" in ctx


def test_build_memory_context_empty():
    state = CopilotState(session_id="s1")
    assert build_memory_context(state) == ""
