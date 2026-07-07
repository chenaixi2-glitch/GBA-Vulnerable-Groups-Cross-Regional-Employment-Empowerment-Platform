"""Planner intent routing rules — gap_agent vs learning_path_agent."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[2]
_load_path = _REPO_ROOT / "test-data" / "load.py"
_spec = importlib.util.spec_from_file_location("gba_test_data_load", _load_path)
_mod = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(_mod)

LEARNING_PATH_GAP_MESSAGE = _mod.LEARNING_PATH_GAP_MESSAGE
LEARNING_PATH_TIMELINE_MESSAGE = _mod.LEARNING_PATH_TIMELINE_MESSAGE

from agents.planner import _build_execution_plan, resolve_intent
from workflow.state import CopilotState


def test_learning_path_gap_message_overrides_gap_analysis():
    intent = resolve_intent("gap_analysis", LEARNING_PATH_GAP_MESSAGE)
    assert intent == "learning_path"


def test_pure_gap_analysis_unchanged():
    intent = resolve_intent("gap_analysis", "Analyze my skill gaps for resume optimization.")
    assert intent == "gap_analysis"


def test_timeline_message_overrides_gap_analysis():
    intent = resolve_intent("gap_analysis", LEARNING_PATH_TIMELINE_MESSAGE)
    assert intent == "learning_path"


def test_learning_path_plan_triggers_learning_path_agent():
    state = CopilotState(session_id="s1")
    plan = _build_execution_plan("learning_path", state)
    assert plan == ["learning_path_agent"]


def test_gap_analysis_plan_triggers_gap_agent():
    state = CopilotState(session_id="s1")
    plan = _build_execution_plan("gap_analysis", state)
    assert plan == ["gap_agent"]


def test_gap_analysis_overrides_to_upload_profile_when_no_profile_and_long_material():
    state = CopilotState(session_id="s1")
    message = (
        "Here is my candidate profile for gap analysis. "
        "Current role: Customer Service Specialist. "
        "Current skills: Customer Service, English, Cantonese, CRM. "
        "Career goal: Customer Service Manager."
    )
    intent = resolve_intent("gap_analysis", message, state)
    assert intent == "upload_profile"


def test_short_gap_analysis_command_unchanged_without_profile():
    state = CopilotState(session_id="s1")
    intent = resolve_intent("gap_analysis", "Analyze my skill gaps for resume optimization.", state)
    assert intent == "gap_analysis"


def test_resume_edit_scope_clamps_gap_analysis_to_content_edit():
    state = CopilotState(session_id="s1", context_scope="resume_edit")
    intent = resolve_intent("gap_analysis", "Analyze skill gaps in my resume wording.", state)
    assert intent == "content_edit"


def test_resume_edit_scope_routes_section_reorder_to_render_edit():
    state = CopilotState(session_id="s1", context_scope="resume_edit")
    intent = resolve_intent("content_edit", "把项目经历放到实习经历前面", state)
    assert intent == "render_edit"


def test_resume_edit_scope_routes_language_convert():
    state = CopilotState(session_id="s1", context_scope="resume_edit")
    intent = resolve_intent("content_edit", "请把简历转成英文", state)
    assert intent == "language_convert"


def test_resume_edit_scope_routes_question_to_ask_question():
    state = CopilotState(session_id="s1", context_scope="resume_edit")
    intent = resolve_intent("content_edit", "简历里有哪些项目？", state)
    assert intent == "ask_question"


def test_resume_edit_plan_triggers_render_agent_for_render_edit():
    state = CopilotState(session_id="s1", context_scope="resume_edit")
    plan = _build_execution_plan("render_edit", state)
    assert plan == ["render_agent"]
