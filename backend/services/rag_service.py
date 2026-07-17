"""RAG 检索服务 — 会话 session_chunks 索引与检索。"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

from config_loader import get_rag_config, is_embedding_enabled, is_rerank_enabled
from log import get_logger, elapsed_ms, log_stage_timing
from models.embedding import aembed_documents, aembed_query
from models.rerank import arerank_texts, RerankDisabledError
from storage.vector_client import get_session_chunks_collection, is_vector_store_enabled
from workflow.state import CopilotState

logger = get_logger("rag")


@dataclass
class RetrievedChunk:
    chunk_id: str
    text: str
    chunk_type: str
    score: float = 0.0


def _rag_cfg() -> dict[str, Any]:
    cfg = get_rag_config()
    return {
        "enabled": cfg.get("enabled", True),
        "search_top_k": int(cfg.get("search_top_k", 10)),
        "rerank_top_n": int(cfg.get("rerank_top_n", 5)),
        "min_score": float(cfg.get("min_score", 0.0)),
    }


def _truncate(text: str, max_len: int = 1200) -> str:
    text = (text or "").strip()
    if len(text) <= max_len:
        return text
    return text[: max_len - 3] + "..."


def build_chunks_from_state(state: CopilotState) -> list[tuple[str, str, dict[str, str]]]:
    """从 CopilotState 抽取 (chunk_id, text, metadata) 列表。"""
    session_id = state.session_id or "unknown"
    chunks: list[tuple[str, str, dict[str, str]]] = []

    if state.job:
        job = state.job
        if job.title:
            chunks.append((
                "job:title",
                _truncate(f"目标岗位：{job.title}"),
                {"session_id": session_id, "chunk_type": "job"},
            ))
        if job.responsibilities:
            chunks.append((
                "job:responsibilities",
                _truncate("岗位职责：\n" + "\n".join(f"- {r}" for r in job.responsibilities)),
                {"session_id": session_id, "chunk_type": "job"},
            ))
        skills = list(dict.fromkeys(job.hard_skills + job.soft_skills + job.tech_stack + job.keywords))
        if skills:
            chunks.append((
                "job:skills",
                _truncate("岗位技能/关键词：" + "、".join(skills)),
                {"session_id": session_id, "chunk_type": "job"},
            ))

    if state.candidate_profile and state.candidate_profile.facts:
        for fact in state.candidate_profile.facts:
            fid = fact.id or fact.type
            chunks.append((
                f"profile:{fid}",
                _truncate(f"[{fact.type}] {fact.content}"),
                {"session_id": session_id, "chunk_type": "profile"},
            ))

    if state.resume_content_json:
        rc = state.resume_content_json
        if rc.summary:
            chunks.append((
                "resume:summary",
                _truncate(f"简历摘要：{rc.summary}"),
                {"session_id": session_id, "chunk_type": "resume"},
            ))
        for section_name, items in (
            ("skills", rc.skills),
            ("works", rc.works),
            ("internships", rc.internships),
            ("projects", rc.projects),
            ("awards", rc.awards),
        ):
            for item in items:
                chunks.append((
                    f"resume:{section_name}:{item.id}",
                    _truncate(f"[{section_name}] {item.title}\n{item.content}"),
                    {"session_id": session_id, "chunk_type": "resume"},
                ))

    if state.gaps:
        gap_lines = [f"- [{g.severity}] {g.description}" for g in state.gaps[:20]]
        chunks.append((
            "gaps:summary",
            _truncate("技能缺口：\n" + "\n".join(gap_lines)),
            {"session_id": session_id, "chunk_type": "gaps"},
        ))

    return chunks


def compact_state_summary(state: CopilotState) -> str:
    """精简状态摘要，供 fallback 或补充 RAG 上下文。"""
    parts: list[str] = []
    if state.job and state.job.title:
        parts.append(f"目标岗位：{state.job.title}")
    if state.candidate_profile:
        n_facts = len(state.candidate_profile.facts)
        parts.append(f"候选人事实条目：{n_facts}")
    if state.resume_content_json:
        parts.append(f"简历版本：v{state.resume_content_json.meta.version}")
    if state.gaps:
        parts.append(f"缺口数量：{len(state.gaps)}")
    if state.meta.target_industry:
        parts.append(f"目标行业：{state.meta.target_industry}")
    return "\n".join(parts) if parts else "（暂无结构化状态摘要）"


def format_chunks_for_prompt(chunks: list[RetrievedChunk]) -> str:
    if not chunks:
        return "（未检索到相关片段）"
    lines = []
    for i, c in enumerate(chunks, 1):
        lines.append(f"[{i}] ({c.chunk_type}) {c.text}")
    return "\n\n".join(lines)


async def index_session(state: CopilotState) -> None:
    """将当前会话 artifact 索引到 ChromaDB session_chunks（全量替换该 session）。"""
    cfg = _rag_cfg()
    if not cfg["enabled"] or not is_vector_store_enabled() or not is_embedding_enabled():
        return

    chunks = build_chunks_from_state(state)
    if not chunks:
        return

    session_id = state.session_id
    if not session_id:
        return

    try:
        index_t0 = time.perf_counter()
        collection = get_session_chunks_collection()
        existing = collection.get(where={"session_id": session_id})
        if existing and existing.get("ids"):
            collection.delete(ids=existing["ids"])

        ids = [f"{session_id}:{cid}" for cid, _, _ in chunks]
        documents = [text for _, text, _ in chunks]
        metadatas = [meta for _, _, meta in chunks]
        embed_t0 = time.perf_counter()
        embeddings = await aembed_documents(documents)
        log_stage_timing(
            logger,
            "rag.index.embed",
            elapsed_ms(embed_t0),
            session=session_id,
            chunks=len(ids),
        )

        collection.upsert(
            ids=ids,
            documents=documents,
            metadatas=metadatas,
            embeddings=embeddings,
        )
        log_stage_timing(
            logger,
            "rag.index.total",
            elapsed_ms(index_t0),
            session=session_id,
            chunks=len(ids),
        )
        logger.info("Indexed %d chunks for session %s", len(ids), session_id)
    except Exception as exc:
        logger.warning("RAG index_session failed for %s: %s", session_id, exc)


async def retrieve(session_id: str, query: str, top_k: int | None = None) -> list[RetrievedChunk]:
    """向量检索 + rerank，按 session_id 过滤。"""
    cfg = _rag_cfg()
    if not cfg["enabled"] or not is_vector_store_enabled() or not is_embedding_enabled():
        return []
    if not session_id or not (query or "").strip():
        return []

    top_k = top_k or cfg["search_top_k"]
    rerank_n = cfg["rerank_top_n"]

    try:
        retrieve_t0 = time.perf_counter()
        collection = get_session_chunks_collection()
        embed_t0 = time.perf_counter()
        query_embedding = await aembed_query(query)
        log_stage_timing(
            logger,
            "rag.retrieve.embed_query",
            elapsed_ms(embed_t0),
            session=session_id,
        )
        query_t0 = time.perf_counter()
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=min(top_k, 20),
            where={"session_id": session_id},
        )
        log_stage_timing(
            logger,
            "rag.retrieve.vector_search",
            elapsed_ms(query_t0),
            session=session_id,
            top_k=top_k,
        )

        ids = (results.get("ids") or [[]])[0]
        documents = (results.get("documents") or [[]])[0]
        metadatas = (results.get("metadatas") or [[]])[0]
        distances = (results.get("distances") or [[]])[0]

        if not documents:
            return []

        candidates: list[RetrievedChunk] = []
        for i, doc in enumerate(documents):
            meta = metadatas[i] if i < len(metadatas) else {}
            dist = distances[i] if i < len(distances) else 1.0
            score = max(0.0, 1.0 - float(dist)) if dist is not None else 0.0
            chunk_id = ids[i] if i < len(ids) else str(i)
            candidates.append(RetrievedChunk(
                chunk_id=str(chunk_id),
                text=doc or "",
                chunk_type=str(meta.get("chunk_type", "unknown")),
                score=score,
            ))

        if len(candidates) <= 1:
            log_stage_timing(
                logger,
                "rag.retrieve.total",
                elapsed_ms(retrieve_t0),
                session=session_id,
                hits=len(candidates),
            )
            return candidates[:rerank_n]

        if not is_rerank_enabled():
            log_stage_timing(
                logger,
                "rag.retrieve.total",
                elapsed_ms(retrieve_t0),
                session=session_id,
                hits=len(candidates[:rerank_n]),
            )
            return candidates[:rerank_n]

        try:
            rerank_t0 = time.perf_counter()
            reranked = await arerank_texts(
                [c.text for c in candidates],
                query,
                top_n=rerank_n,
            )
            ordered: list[RetrievedChunk] = []
            for item in reranked:
                idx = item.get("index", 0)
                if 0 <= idx < len(candidates):
                    chunk = candidates[idx]
                    chunk.score = float(item.get("relevance_score", chunk.score))
                    ordered.append(chunk)
            log_stage_timing(
                logger,
                "rag.retrieve.rerank",
                elapsed_ms(rerank_t0),
                session=session_id,
                candidates=len(candidates),
            )
            log_stage_timing(
                logger,
                "rag.retrieve.total",
                elapsed_ms(retrieve_t0),
                session=session_id,
                hits=len(ordered or candidates[:rerank_n]),
            )
            return ordered or candidates[:rerank_n]
        except RerankDisabledError:
            return candidates[:rerank_n]
        except Exception as rerank_exc:
            logger.warning("RAG rerank failed, using vector order: %s", rerank_exc)
            return candidates[:rerank_n]

    except Exception as exc:
        logger.warning("RAG retrieve failed for session %s: %s", session_id, exc)
        return []


async def index_session_safe(state: CopilotState) -> None:
    """后台任务安全包装。"""
    try:
        await index_session(state)
    except Exception as exc:
        logger.warning("index_session_safe: %s", exc)
