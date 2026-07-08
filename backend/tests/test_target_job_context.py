"""目标岗位上下文合并单元测试。"""

from workflow.state import CopilotState, Job, Meta
from tools.target_job_context import build_enriched_job_dict


def test_build_enriched_job_dict_merges_meta_and_job():
    state = CopilotState(
        session_id="sess_test",
        job=Job(
            id="job_1",
            title="Software Engineer",
            industry="互联网",
            experience_requirement="3年",
            source="原始 JD",
        ),
        meta=Meta(
            target_jd_text="完整 JD 文本",
            target_industry="Technology",
            target_experience_level="Mid Level (3-5 years)",
            employer_type="foreign",
        ),
    )
    enriched = build_enriched_job_dict(state)
    assert enriched["industry"] == "Technology"
    assert enriched["experience_requirement"] == "Mid Level (3-5 years)"
    assert enriched["source"] == "完整 JD 文本"
    assert enriched["user_target_context"]["employer_type"] == "foreign"
    assert enriched["user_target_context"]["experience_level"] == "Mid Level (3-5 years)"


def test_build_enriched_job_dict_meta_only():
    state = CopilotState(
        session_id="sess_test",
        meta=Meta(
            target_jd_text="产品经理",
            target_industry="Finance",
            target_experience_level="Entry Level",
            employer_type="soe",
        ),
    )
    enriched = build_enriched_job_dict(state)
    assert enriched["user_target_context"]["jd_text"] == "产品经理"
    assert enriched["title"] == "产品经理"


def test_build_compact_job_dict_from_meta():
    from tools.target_job_context import build_compact_job_dict

    state = CopilotState(
        session_id="sess_test",
        meta=Meta(
            target_jd_text="Long JD " * 100,
            target_industry="Finance",
            target_experience_level="Entry Level",
            employer_type="soe",
        ),
    )
    compact = build_compact_job_dict(state)
    assert compact["industry"] == "Finance"
    assert compact["experience_requirement"] == "Entry Level"
    assert "jd_text" not in compact
