"""交互式面试 Prompt 记忆：类别加权窗口与异类优先压缩。"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

from pydantic import BaseModel

from services.interview_memory import (
    InterviewHistoryCompressOutput,
    QaBlock,
    build_prompt_history,
    category_relatedness,
    extract_qa_block_records,
    extract_qa_blocks,
    maybe_compress_interview_history,
    normalize_category,
    score_block,
)
from workflow.state import InteractiveInterviewSession, InteractiveInterviewTurn

_CFG_BASE = {
    "recent_qa_limit": 4,
    "compress_threshold": 6,
    "debrief_recent_qa_limit": 12,
    "max_block_chars": 1000,
    "summary_max_chars": 2500,
    "same_category_weight": 1.0,
    "near_category_weight": 0.55,
    "far_category_weight": 0.2,
    "same_stage_bonus": 0.15,
    "recency_weight": 0.35,
    "debrief_category_scale": 0.25,
}


def _session_with_qa(n: int, categories: list[str] | None = None) -> InteractiveInterviewSession:
    session = InteractiveInterviewSession(status="active")
    for i in range(1, n + 1):
        qid = f"q{i}"
        cat = (categories[i - 1] if categories and i - 1 < len(categories) else "General")
        session.turns.append(InteractiveInterviewTurn(
            id=f"iq{i}",
            role="interviewer",
            content=f"Question {i} about topic-{i}",
            turn_type="question",
            category=cat,
            question_id=qid,
            stage_index=0 if i <= n // 2 else 1,
            round=i,
        ))
        session.turns.append(InteractiveInterviewTurn(
            id=f"ia{i}",
            role="candidate",
            content=f"Answer {i} with detail about experience-{i}",
            turn_type="answer",
            category=cat,
            question_id=qid,
            stage_index=0 if i <= n // 2 else 1,
            round=i,
        ))
        session.turns.append(InteractiveInterviewTurn(
            id=f"if{i}",
            role="interviewer",
            content=f"Feedback {i}",
            turn_type="brief_feedback",
            category=cat,
            question_id=qid,
            round=i,
        ))
    return session


def test_normalize_category_aliases():
    assert normalize_category("简历深挖与个人经历") == "Resume deep dive & experience"
    assert category_relatedness(
        "Resume deep dive & experience",
        "Hands-on projects & problem solving",
    ) > category_relatedness(
        "Resume deep dive & experience",
        "Candidate questions for interviewer",
    )


def test_extract_qa_blocks_pairs_feedback():
    session = _session_with_qa(2)
    blocks = extract_qa_blocks(session)
    assert len(blocks) == 2
    assert "Question 1" in blocks[0]
    assert "Answer 1" in blocks[0]
    assert "[Feedback] Feedback 1" in blocks[0]
    assert "Question 2" in blocks[1]


def test_build_prompt_history_prefers_same_category_over_recent_far():
    """同类旧题应优先于异类新题进入窗口。"""
    cats = [
        "Career planning & stability",
        "Career planning & stability",
        "Candidate questions for interviewer",
        "Candidate questions for interviewer",
        "Candidate questions for interviewer",
        "Resume deep dive & experience",
    ]
    session = _session_with_qa(6, cats)
    with patch("services.interview_memory._cfg", return_value=_CFG_BASE):
        text = build_prompt_history(
            session,
            recent_limit=2,
            anchor_category="Career planning & stability",
        )
    assert "Question 1 about topic-1" in text
    assert "Question 2 about topic-2" in text
    assert "Question 6 about topic-6" not in text
    assert "Question 5 about topic-5" not in text


def test_build_prompt_history_uses_summary_and_compressed_ids():
    session = _session_with_qa(5)
    session.history_summary = "候选人自称有三年客服经验。"
    session.history_compressed_question_ids = ["q1", "q2"]
    text = build_prompt_history(session, recent_limit=2)
    assert "较早问答摘要" in text
    assert "三年客服" in text
    assert "Question 5 about topic-5" in text
    assert "Question 1 about topic-1" not in text


def test_maybe_compress_prefers_far_category():
    cats = [
        "Candidate questions for interviewer",
        "Soft skills & teamwork",
        "Career planning & stability",
        "Resume deep dive & experience",
        "Resume deep dive & experience",
        "Resume deep dive & experience",
        "Resume deep dive & experience",
        "Resume deep dive & experience",
        "Resume deep dive & experience",
        "Resume deep dive & experience",
    ]
    session = _session_with_qa(10, cats)

    async def _fake_ainvoke(llm, prompt, schema, logger, label):
        assert issubclass(schema, BaseModel)
        return InterviewHistoryCompressOutput(
            summary="早期异类问答已折叠。",
            covered_topics=["反向提问", "软实力"],
            candidate_signals=["表达清晰"],
            open_doubts=[],
        )

    with patch("services.interview_memory.get_llm", return_value=object()):
        with patch(
            "services.interview_memory.ainvoke_json_with_schema",
            new=AsyncMock(side_effect=_fake_ainvoke),
        ):
            with patch("services.interview_memory._cfg", return_value=_CFG_BASE):
                changed = asyncio.run(
                    maybe_compress_interview_history(
                        session,
                        anchor_category="Resume deep dive & experience",
                    )
                )

    assert changed is True
    assert "早期异类" in session.history_summary
    compressed = set(session.history_compressed_question_ids)
    assert "q1" in compressed
    assert "q2" in compressed
    assert "q10" not in compressed
    assert "q9" not in compressed
    assert len(session.turns) == 30

    prompt = build_prompt_history(
        session,
        recent_limit=4,
        anchor_category="Resume deep dive & experience",
    )
    assert "较早问答摘要" in prompt
    assert "Question 10 about topic-10" in prompt
    assert "Question 1 about topic-1" not in prompt


def test_maybe_compress_noop_below_threshold():
    session = _session_with_qa(3)
    with patch(
        "services.interview_memory._cfg",
        return_value={**_CFG_BASE, "compress_threshold": 8, "recent_qa_limit": 6},
    ):
        changed = asyncio.run(maybe_compress_interview_history(session))
    assert changed is False
    assert session.history_compressed_question_ids == []


def test_score_block_same_category_beats_far_even_if_older():
    older_same = QaBlock(0, "q1", "Resume deep dive & experience", 0, "t1")
    newer_far = QaBlock(5, "q6", "Candidate questions for interviewer", 1, "t6")
    s_same = score_block(older_same, anchor_category="Resume deep dive & experience", total_blocks=6)
    s_far = score_block(newer_far, anchor_category="Resume deep dive & experience", total_blocks=6)
    assert s_same > s_far


def test_extract_records_include_category():
    session = _session_with_qa(1, ["Role understanding & motivation"])
    records = extract_qa_block_records(session)
    assert records[0].category == "Role understanding & motivation"
    assert "[Role understanding & motivation]" in records[0].text
