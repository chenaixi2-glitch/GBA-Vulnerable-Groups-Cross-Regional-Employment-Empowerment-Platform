"""将 MCP Server 挂载到现有 FastAPI 应用。"""

from __future__ import annotations

from fastapi import FastAPI

from mcp_servers.docs import create_docs_mcp
from mcp_servers.jobs import create_jobs_mcp

MCP_JOBS_MOUNT = "/mcp/jobs"
MCP_DOCS_MOUNT = "/mcp/docs"

MCP_SERVERS_META = [
    {
        "name": "gba-jobs",
        "description": "平台岗位匹配（Node /jobs/matched）",
        "mount": MCP_JOBS_MOUNT,
        "sse": f"{MCP_JOBS_MOUNT}/sse",
        "messages": f"{MCP_JOBS_MOUNT}/messages/",
        "transport": "sse",
        "tools": ["get_matched_jobs"],
    },
    {
        "name": "gba-docs",
        "description": "简历/JD 文档解析（PDF/DOCX/MD/TXT）",
        "mount": MCP_DOCS_MOUNT,
        "sse": f"{MCP_DOCS_MOUNT}/sse",
        "messages": f"{MCP_DOCS_MOUNT}/messages/",
        "transport": "sse",
        "tools": ["parse_document_base64", "list_supported_document_formats"],
    },
]


def mount_mcp_servers(app: FastAPI) -> None:
    """把岗位与文档解析 MCP 挂到同一 FastAPI 进程（SSE 传输）。"""
    jobs_mcp = create_jobs_mcp()
    docs_mcp = create_docs_mcp()

    app.mount(MCP_JOBS_MOUNT, jobs_mcp.sse_app(mount_path=MCP_JOBS_MOUNT))
    app.mount(MCP_DOCS_MOUNT, docs_mcp.sse_app(mount_path=MCP_DOCS_MOUNT))
