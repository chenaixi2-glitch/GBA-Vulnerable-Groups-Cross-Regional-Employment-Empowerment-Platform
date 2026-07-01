"""JD 缓存工具单元测试（无需数据库）。"""

from tools.jd_cache import (
    extract_title_from_jd,
    is_title_only,
    jd_text_hash,
    normalize_job_title,
    params_cache_key,
)


def test_normalize_job_title():
    assert normalize_job_title("  软件工程师  ") == normalize_job_title("软件工程师")
    assert normalize_job_title("Java 开发工程师") == normalize_job_title("java开发工程师")


def test_is_title_only():
    assert is_title_only("软件工程师") is True
    assert is_title_only("Senior Developer") is True
    assert is_title_only("软件工程师\n") is True
    assert is_title_only("岗位职责：\n1. 开发") is False
    assert is_title_only("Job Title: Engineer\nResponsibilities:\n- Build APIs") is False


def test_extract_title_from_jd():
    assert extract_title_from_jd("产品经理") == "产品经理"
    assert extract_title_from_jd("岗位名称：数据分析师\n职责：...").startswith("数据分析师")


def test_jd_text_hash_stable():
    a = jd_text_hash("Hello  World\n")
    b = jd_text_hash("Hello World")
    assert a == b


def test_params_cache_key():
    k1 = params_cache_key("Technology", "private", "Mid Level")
    k2 = params_cache_key("technology", "private", "mid level")
    assert k1 == k2
