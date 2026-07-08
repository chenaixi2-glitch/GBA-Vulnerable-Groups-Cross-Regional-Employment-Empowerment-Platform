"""Node 岗位匹配 API 轻量桥接（非完整 MCP 协议）。"""

from __future__ import annotations

import asyncio
import json
import os
import re
import urllib.error
import urllib.request
from typing import Any

from log import get_logger

logger = get_logger("tools")

_JOB_QUERY_PATTERN = re.compile(
    r"(适合我的岗位|推荐.*岗位|推荐.*工作|有没有.*工作|有没有.*岗位|"
    r"recommend\s*jobs?|matched\s*jobs?|job\s*recommend|jobs?\s*for\s*me)",
    re.IGNORECASE,
)

DEFAULT_NODE_BASE = os.environ.get("NODE_API_BASE", "http://127.0.0.1:3000")


def is_job_search_query(message: str) -> bool:
    return bool(_JOB_QUERY_PATTERN.search(message or ""))


async def fetch_matched_jobs(
    token: str,
    *,
    base_url: str | None = None,
    limit: int = 5,
) -> list[dict[str, Any]]:
    """调用 Node GET /jobs/matched，返回岗位列表。"""
    if not token:
        return []

    url = f"{(base_url or DEFAULT_NODE_BASE).rstrip('/')}/jobs/matched?limit={limit}"
    headers = {"Authorization": f"Bearer {token}"}

    def _fetch() -> Any:
        req = urllib.request.Request(url, headers=headers, method="GET")
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))

    try:
        data = await asyncio.to_thread(_fetch)
        if isinstance(data, list):
            return data[:limit]
        if isinstance(data, dict):
            jobs = data.get("jobs") or data.get("data") or []
            if isinstance(jobs, list):
                return jobs[:limit]
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError) as exc:
        logger.warning("fetch_matched_jobs failed: %s", exc)

    return []


def format_jobs_for_prompt(jobs: list[dict[str, Any]]) -> str:
    if not jobs:
        return "（未找到匹配岗位）"
    lines = []
    for i, job in enumerate(jobs, 1):
        title = job.get("title") or job.get("job_title") or "未知岗位"
        company = job.get("company") or job.get("company_name") or ""
        score = job.get("match_score") or job.get("score") or ""
        line = f"[{i}] {title}"
        if company:
            line += f" @ {company}"
        if score != "":
            line += f"（匹配分：{score}）"
        lines.append(line)
    return "\n".join(lines)
