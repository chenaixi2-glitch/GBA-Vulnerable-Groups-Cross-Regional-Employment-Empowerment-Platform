"""GBA 平台 MCP Server（挂载在现有 FastAPI 后端）。"""

from mcp_servers.mount import MCP_SERVERS_META, mount_mcp_servers

__all__ = ["MCP_SERVERS_META", "mount_mcp_servers"]
