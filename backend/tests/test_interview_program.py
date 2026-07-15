"""Tests for structured interview program configuration."""

from tools.interview_program import (
    build_interview_program,
    detect_job_track,
    format_program_overview,
    format_stages_generation_spec,
)


def test_detect_job_track_tech():
    assert detect_job_track("Java开发工程师", "") == "tech"
    assert detect_job_track("", "负责前端React开发") == "tech"


def test_detect_job_track_business():
    assert detect_job_track("产品经理", "") == "business"
    assert detect_job_track("市场运营专员", "") == "business"


def test_detect_job_track_functional():
    assert detect_job_track("人事专员", "") == "functional"


def test_quick_program_two_stages():
    program = build_interview_program(version="quick", job_title="后端开发")
    assert program.version == "quick"
    assert program.job_track == "tech"
    assert len(program.stages) == 2
    assert program.stages[0].stage_id == "screening_final"
    assert program.stages[1].stage_id == "professional"
    assert program.max_rounds == 13


def test_full_program_three_stages():
    program = build_interview_program(version="full", job_title="产品经理")
    assert program.version == "full"
    assert len(program.stages) == 3
    assert [s.stage_id for s in program.stages] == ["screening", "professional", "final"]
    assert program.max_rounds == 17


def test_specialized_technical():
    program = build_interview_program(
        version="specialized",
        specialized_focus="technical",
        job_title="数据分析师",
    )
    assert program.version == "specialized"
    assert program.specialized_focus == "technical"
    assert len(program.stages) == 1
    assert program.stages[0].max_turns == 10


def test_specialized_final_negotiation():
    program = build_interview_program(
        version="specialized",
        specialized_focus="final_negotiation",
    )
    assert program.specialized_focus == "final_negotiation"
    assert "薪资谈判" in program.stages[0].focus_modules[3]


def test_specialized_resume_deep_dive():
    program = build_interview_program(
        version="specialized",
        specialized_focus="resume_deep_dive",
    )
    assert program.specialized_focus == "resume_deep_dive"
    assert "Tell me about yourself" in program.stages[0].focus_modules[0]


def test_format_program_overview():
    program = build_interview_program(version="full")
    overview = format_program_overview(program)
    assert "完整版" in overview
    assert "阶段1" in overview
    assert "阶段3" in overview


def test_format_stages_generation_spec():
    program = build_interview_program(version="quick", job_title="后端工程师")
    spec = format_stages_generation_spec(program)
    assert "stage_index=0" in spec
    assert "stage_index=1" in spec
    assert "恰好 5 条" in spec
    assert "恰好 8 条" in spec
