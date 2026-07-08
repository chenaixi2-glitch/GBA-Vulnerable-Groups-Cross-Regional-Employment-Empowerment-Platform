"""ChromaDB 向量库客户端 — session_chunks / user_memory 集合。"""

from __future__ import annotations

from typing import Any

from config_loader import get_vector_store_config
from log import get_logger

logger = get_logger("storage")

_client: Any = None
_collections: dict[str, Any] = {}
_enabled: bool | None = None


def is_vector_store_enabled() -> bool:
    """向量库是否启用（配置 + chromadb 可导入）。"""
    global _enabled
    if _enabled is not None:
        return _enabled

    cfg = get_vector_store_config()
    if not cfg.get("enabled", True):
        _enabled = False
        return False

    try:
        import chromadb  # noqa: F401
    except ImportError:
        logger.warning("chromadb not installed; vector store disabled")
        _enabled = False
        return False

    _enabled = True
    return True


def get_chroma_client() -> Any:
    """返回 ChromaDB PersistentClient 单例。"""
    if not is_vector_store_enabled():
        raise RuntimeError("Vector store is disabled")

    global _client
    if _client is not None:
        return _client

    import chromadb

    cfg = get_vector_store_config()
    persist_dir = cfg.get("persist_directory", "./data/chroma")
    _client = chromadb.PersistentClient(path=persist_dir)
    logger.info("ChromaDB client initialized at %s", persist_dir)
    return _client


def get_collection(name: str) -> Any:
    """获取或创建指定 collection（无内置 embedding，由调用方提供向量）。"""
    if name in _collections:
        return _collections[name]

    client = get_chroma_client()
    collection = client.get_or_create_collection(
        name=name,
        metadata={"hnsw:space": "cosine"},
    )
    _collections[name] = collection
    return collection


def get_session_chunks_collection() -> Any:
    return get_collection("session_chunks")


def get_user_memory_collection() -> Any:
    return get_collection("user_memory")
