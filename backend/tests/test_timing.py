"""Tests for stage timing helpers."""

from api.request_timing import build_request_timing
from log.timing import format_trace_breakdown, inject_trace_duration, trace_stage_durations
from workflow.state import WorkflowTraceItem


def test_trace_stage_durations():
    trace = [
        WorkflowTraceItem(node="planner", duration_ms=120.5),
        WorkflowTraceItem(node="content_agent", duration_ms=93000.0),
        WorkflowTraceItem(node="render_agent", duration_ms=0),
    ]
    assert trace_stage_durations(trace) == {
        "planner": 120.5,
        "content_agent": 93000.0,
    }


def test_format_trace_breakdown():
    trace = [
        WorkflowTraceItem(node="planner", duration_ms=120.5),
        WorkflowTraceItem(node="content_agent", duration_ms=93000.0),
    ]
    assert format_trace_breakdown(trace) == "planner:120.5ms,content_agent:93000.0ms"


def test_build_request_timing():
    timing = build_request_timing(
        total_ms=245000.0,
        load_ms=12.3,
        graph_ms=240000.0,
        workflow_trace=[WorkflowTraceItem(node="content_agent", duration_ms=92000.0)],
    )
    payload = timing.model_dump()
    assert payload["total_ms"] == 245000.0
    assert payload["stages"] == {"content_agent": 92000.0}


def test_inject_trace_duration():
    item = WorkflowTraceItem(node="content_agent", output_summary="done")
    result = {"workflow_trace": [item]}
    inject_trace_duration(result, 4567.8, node="content_agent")
    assert result["workflow_trace"][-1].duration_ms == 4567.8
