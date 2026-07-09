"""文档解析 MCP Server — 桥接 tools/file_parser。"""

from __future__ import annotations

import base64
import binascii

from mcp.server.fastmcp import FastMCP

from tools.file_parser import parse_content_bytes, supported_upload_suffixes


def create_docs_mcp() -> FastMCP:
    mcp = FastMCP(
        "gba-docs",
        instructions="GBA 文档解析 MCP。支持 PDF、DOCX、Markdown、TXT 简历/JD 文件解析。",
    )

    @mcp.tool()
    async def parse_document_base64(base64_data: str, filename: str) -> str:
        """将 Base64 编码的文件内容解析为纯文本。

        Args:
            base64_data: 文件内容的 Base64 字符串
            filename: 原始文件名（用于识别 .pdf / .docx / .txt / .md）
        """
        if not (filename or "").strip():
            raise ValueError("filename is required")
        try:
            raw = base64.b64decode(base64_data, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError(f"invalid base64 payload: {exc}") from exc
        return parse_content_bytes(raw, filename=filename)

    @mcp.tool()
    async def list_supported_document_formats() -> str:
        """返回支持的简历/JD 上传文件扩展名。"""
        return ", ".join(sorted(supported_upload_suffixes()))

    return mcp
