"""Node jobs client unit tests."""

from __future__ import annotations

from tools.node_jobs_client import format_jobs_for_prompt, is_job_search_query


def test_is_job_search_query_positive():
    assert is_job_search_query("有没有适合我的岗位推荐？")
    assert is_job_search_query("Recommend jobs for me")
    assert is_job_search_query("推荐一些工作给我")


def test_is_job_search_query_negative():
    assert not is_job_search_query("我有哪些技能缺口？")
    assert not is_job_search_query("突出项目经历")
    assert not is_job_search_query("目标岗位有哪些核心要求？")


def test_format_jobs_for_prompt():
    text = format_jobs_for_prompt([
        {"title": "合规分析师", "company": "某银行", "match_score": 85},
    ])
    assert "合规分析师" in text
    assert "某银行" in text
