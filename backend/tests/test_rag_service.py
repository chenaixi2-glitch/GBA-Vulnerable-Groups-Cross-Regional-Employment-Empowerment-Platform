"""RAG service unit tests."""

from __future__ import annotations

import pytest

from services.rag_service import build_chunks_from_state, compact_state_summary, format_chunks_for_prompt, RetrievedChunk
from workflow.state import CopilotState, CandidateProfile, Fact, Job, Gap


def test_build_chunks_from_job_and_profile():
    state = CopilotState(
        session_id="sess_test",
        job=Job(
            title="金融合规分析师",
            responsibilities=["负责合规审查", "撰写报告"],
            hard_skills=["AML", "KYC"],
        ),
        candidate_profile=CandidateProfile(
            facts=[Fact(id="f1", type="skill", content="熟悉反洗钱法规", updated_at="")]
        ),
        gaps=[Gap(id="g1", type="missing_skill", severity="high", description="缺少 CFA")],
    )
    chunks = build_chunks_from_state(state)
    assert len(chunks) >= 3
    types = {c[2]["chunk_type"] for c in chunks}
    assert "job" in types
    assert "profile" in types
    assert "gaps" in types


def test_compact_state_summary():
    state = CopilotState(
        session_id="s1",
        job=Job(title="数据分析师"),
        gaps=[Gap(id="g1", type="missing_skill", severity="low", description="SQL")],
    )
    summary = compact_state_summary(state)
    assert "数据分析师" in summary
    assert "缺口数量：1" in summary


def test_format_chunks_for_prompt_empty():
    assert "未检索" in format_chunks_for_prompt([])


def test_format_chunks_for_prompt_nonempty():
    text = format_chunks_for_prompt([
        RetrievedChunk("id1", "hello", "job", 0.9),
    ])
    assert "hello" in text
    assert "job" in text
