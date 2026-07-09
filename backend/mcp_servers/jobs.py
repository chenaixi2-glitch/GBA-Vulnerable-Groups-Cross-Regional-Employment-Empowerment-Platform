"""岗位匹配 MCP Server — 桥接 Node GET /jobs/matched。"""

from __future__ import annotations

from mcp.server.fastmcp import FastMCP

from tools.node_jobs_client import fetch_matched_jobs, format_jobs_for_prompt


def create_jobs_mcp() -> FastMCP:
    mcp = FastMCP(
        "gba-jobs",
        instructions=(
            "GBA 平台岗位匹配 MCP。使用 get_matched_jobs 查询当前登录用户的匹配岗位；"
            "token 需为 Node 认证签发的 Bearer JWT。"
        ),
    )

    @mcp.tool()
    async def get_matched_jobs(token: str, limit: int = 5) -> str:
        """按用户 JWT 查询平台推荐岗位列表。

        Args:
            token: Bearer JWT（可带或不带 "Bearer " 前缀）
            limit: 返回岗位数量上限，默认 5
        """
        bare = token.removeprefix("Bearer ").strip()
        if not bare:
            return "（未提供有效 token，无法查询匹配岗位）"
        jobs = await fetch_matched_jobs(bare, limit=max(1, min(limit, 20)))
        return format_jobs_for_prompt(jobs)

    return mcp
