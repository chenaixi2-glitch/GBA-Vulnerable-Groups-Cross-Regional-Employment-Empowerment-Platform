"""各环节耗时日志工具。"""

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator


def elapsed_ms(start: float) -> float:
    """Return milliseconds elapsed since *start* (from ``time.perf_counter()``)."""
    return round((time.perf_counter() - start) * 1000, 1)


def log_stage_timing(
    logger: logging.Logger,
    stage: str,
    duration_ms: float,
    *,
    session_id: str = "",
    status: str = "success",
    **extra: Any,
) -> None:
    """Write a grep-friendly stage timing line."""
    parts = [f"stage={stage}", f"duration_ms={duration_ms}", f"status={status}"]
    if session_id:
        parts.append(f"session={session_id}")
    for key, value in extra.items():
        if value is None or value == "":
            continue
        parts.append(f"{key}={value}")
    logger.info("Stage timing | %s", " | ".join(parts))


def format_trace_breakdown(trace: list[Any]) -> str:
    """Compact ``node:ms`` breakdown from workflow trace items."""
    parts = [f"{node}:{ms}ms" for node, ms in trace_stage_durations(trace).items()]
    return ",".join(parts)


def trace_stage_durations(trace: list[Any] | None) -> dict[str, float]:
    """Map workflow node name → duration_ms."""
    stages: dict[str, float] = {}
    for item in trace or []:
        ms = getattr(item, "duration_ms", 0) or 0
        if ms > 0:
            stages[getattr(item, "node", "unknown")] = ms
    return stages


def inject_trace_duration(result: dict[str, Any], duration_ms: float, *, node: str = "") -> None:
    """Attach elapsed time to the last workflow trace item in *result*."""
    trace = result.get("workflow_trace")
    if not trace:
        return
    last = trace[-1]
    if node and getattr(last, "node", "") != node:
        return
    if hasattr(last, "model_copy"):
        result["workflow_trace"] = [*trace[:-1], last.model_copy(update={"duration_ms": duration_ms})]


@asynccontextmanager
async def stage_timer(
    logger: logging.Logger,
    stage: str,
    *,
    session_id: str = "",
    **extra: Any,
) -> AsyncIterator[None]:
    """Async context manager that logs stage duration on exit."""
    t0 = time.perf_counter()
    status = "success"
    try:
        yield
    except Exception:
        status = "failed"
        raise
    finally:
        log_stage_timing(
            logger,
            stage,
            elapsed_ms(t0),
            session_id=session_id,
            status=status,
            **extra,
        )
