"""API 响应中的请求耗时结构。"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from log.timing import trace_stage_durations


class RequestTiming(BaseModel):
    """单次 API 请求的耗时摘要（毫秒）。"""

    total_ms: float = 0.0
    load_ms: float = 0.0
    memory_ms: float = 0.0
    graph_ms: float = 0.0
    save_ms: float = 0.0
    stages: dict[str, float] = Field(default_factory=dict)


def build_request_timing(
    *,
    total_ms: float,
    load_ms: float = 0.0,
    memory_ms: float = 0.0,
    graph_ms: float = 0.0,
    save_ms: float = 0.0,
    workflow_trace: list[Any] | None = None,
) -> RequestTiming:
    """Build timing payload for API JSON responses."""
    return RequestTiming(
        total_ms=total_ms,
        load_ms=load_ms,
        memory_ms=memory_ms,
        graph_ms=graph_ms,
        save_ms=save_ms,
        stages=trace_stage_durations(workflow_trace),
    )
