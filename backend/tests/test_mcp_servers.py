"""MCP Server 挂载与工具单元测试。"""

from __future__ import annotations

import asyncio
import base64
from unittest.mock import AsyncMock, patch

from mcp_servers.docs import create_docs_mcp
from mcp_servers.jobs import create_jobs_mcp
from mcp_servers.mount import MCP_SERVERS_META


def _text_blocks(result) -> list[str]:
    blocks = result[0] if isinstance(result, tuple) else result
    return [block.text for block in blocks if hasattr(block, "text")]


def test_get_matched_jobs_tool_formats_result():
    jobs_mcp = create_jobs_mcp()

    async def _run():
        with patch(
            "mcp_servers.jobs.fetch_matched_jobs",
            new=AsyncMock(return_value=[{"title": "合规分析师", "company": "某银行", "match_score": 90}]),
        ):
            return await jobs_mcp.call_tool("get_matched_jobs", {"token": "Bearer test-jwt", "limit": 3})

    text_blocks = _text_blocks(asyncio.run(_run()))
    assert any("合规分析师" in text for text in text_blocks)


def test_get_matched_jobs_tool_requires_token():
    jobs_mcp = create_jobs_mcp()
    result = asyncio.run(jobs_mcp.call_tool("get_matched_jobs", {"token": "  ", "limit": 3}))
    assert any("未提供有效 token" in text for text in _text_blocks(result))


def test_parse_document_base64_tool_txt():
    docs_mcp = create_docs_mcp()
    payload = base64.b64encode("hello resume".encode("utf-8")).decode("ascii")
    result = asyncio.run(
        docs_mcp.call_tool(
            "parse_document_base64",
            {"base64_data": payload, "filename": "resume.txt"},
        )
    )
    assert any("hello resume" in text for text in _text_blocks(result))


def test_list_supported_document_formats_tool():
    docs_mcp = create_docs_mcp()
    result = asyncio.run(docs_mcp.call_tool("list_supported_document_formats", {}))
    joined = " ".join(_text_blocks(result))
    assert ".pdf" in joined
    assert ".docx" in joined


def test_mcp_servers_meta_contains_both_servers():
    names = {item["name"] for item in MCP_SERVERS_META}
    assert names == {"gba-jobs", "gba-docs"}


def test_mcp_servers_expose_expected_tools():
    jobs_mcp = create_jobs_mcp()
    docs_mcp = create_docs_mcp()

    job_tools = asyncio.run(jobs_mcp.list_tools())
    doc_tools = asyncio.run(docs_mcp.list_tools())

    assert {tool.name for tool in job_tools} == {"get_matched_jobs"}
    assert {tool.name for tool in doc_tools} == {
        "parse_document_base64",
        "list_supported_document_formats",
    }
