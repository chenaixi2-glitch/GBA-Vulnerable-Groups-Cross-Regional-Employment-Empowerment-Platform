"""Tests for quantification follow-up question generation."""

from __future__ import annotations

import json

from tools.quantification_questions import (
    has_quantification,
    supplement_quantification_gaps_and_questions,
)
from workflow.state import CandidateProfile, Fact, Gap, ProfileBasic, Question


def test_has_quantification_detects_numbers():
    assert has_quantification("服务 1 万用户，响应速度提升 30%") is True
    assert has_quantification("Led team of 5 engineers, improved latency by 40%") is True
    assert has_quantification("负责后端开发与接口设计") is False


def test_supplement_adds_questions_for_unquantified_experiences():
    profile = CandidateProfile(
        profile_basic=ProfileBasic(name="Test"),
        facts=[
            Fact(
                id="fact_project_1",
                type="project",
                content=json.dumps({
                    "title": "电商后台",
                    "company": "某科技",
                    "role": "后端开发",
                    "achievements": "负责订单模块开发与接口优化",
                }, ensure_ascii=False),
                source_refs=[],
                updated_at="",
            ),
        ],
    )
    gaps, questions = supplement_quantification_gaps_and_questions(
        profile, [], [], language="zh", max_questions=2,
    )
    assert len(gaps) == 1
    assert gaps[0].type == "no_quantification"
    assert len(questions) == 1
    assert "电商后台" in questions[0].question
    assert questions[0].priority == "medium"


def test_supplement_skips_when_quantified():
    profile = CandidateProfile(
        profile_basic=ProfileBasic(name="Test"),
        facts=[
            Fact(
                id="fact_intern_1",
                type="internship",
                content=json.dumps({
                    "title": "数据分析实习",
                    "achievements": "分析 10 万条用户数据，报表效率提升 25%",
                }, ensure_ascii=False),
                source_refs=[],
                updated_at="",
            ),
        ],
    )
    gaps, questions = supplement_quantification_gaps_and_questions(
        profile, [], [], language="zh",
    )
    assert gaps == []
    assert questions == []


def test_supplement_does_not_duplicate_existing_question():
    profile = CandidateProfile(
        profile_basic=ProfileBasic(name="Test"),
        facts=[
            Fact(
                id="fact_project_1",
                type="project",
                content='{"title":"CRM 系统","achievements":"完成客户管理模块"}',
                source_refs=[],
                updated_at="",
            ),
        ],
    )
    existing = [
        Question(
            id="q1",
            question="您在「CRM 系统」这段经历中，是否有可量化的成果数据？",
            reason="",
            target_field="projects",
            priority="medium",
            status="pending",
            answer_ref="",
        ),
    ]
    gaps, questions = supplement_quantification_gaps_and_questions(
        profile, [], existing, language="zh",
    )
    assert len(questions) == 1
