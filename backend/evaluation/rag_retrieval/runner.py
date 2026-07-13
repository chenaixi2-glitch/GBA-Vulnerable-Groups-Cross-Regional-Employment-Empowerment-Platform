"""Run RAG retrieval evaluation (embedding or lexical fallback)."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from evaluation.rag_retrieval.metrics import (
    RetrievalCaseResult,
    build_retrieval_report,
    evaluate_retrieval_case,
)
from services.rag_service import build_chunks_from_state
from workflow.state import CopilotState

_REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURES_PATH = Path(__file__).resolve().parent / "fixtures" / "golden_queries.json"
RESULTS_ROOT = _REPO_ROOT / "evaluation-results" / "rag-retrieval"
DEFAULT_K = [1, 3, 5, 10]


def _load_cases() -> list[dict]:
    with open(FIXTURES_PATH, encoding="utf-8") as f:
        return json.load(f)


def _has_embedding_key() -> bool:
    keys = ("SILICONFLOW_API_KEY", "DASHSCOPE_API_KEY", "OPENAI_API_KEY", "AZURE_OPENAI_API_KEY")
    return any(os.environ.get(k) for k in keys)


def _tokenize(text: str) -> set[str]:
    return set(re.findall(r"[a-z\u4e00-\u9fff]{2,}", (text or "").lower()))


def _lexical_rank(query: str, chunks: list[tuple[str, str, dict]]) -> list[str]:
    """Offline fallback: rank chunks by token overlap with query."""
    q_tokens = _tokenize(query)
    scored: list[tuple[float, str]] = []
    for chunk_id, text, _meta in chunks:
        c_tokens = _tokenize(text)
        if not q_tokens or not c_tokens:
            score = 0.0
        else:
            score = len(q_tokens & c_tokens) / len(q_tokens | c_tokens)
        scored.append((score, chunk_id))
    scored.sort(key=lambda x: (-x[0], x[1]))
    return [cid for _score, cid in scored]


async def _embedding_rank(query: str, chunks: list[tuple[str, str, dict]], *, top_k: int) -> list[str]:
    from models.embedding import aembed_documents, aembed_query
    from models.rerank import arerank_texts

    texts = [text for _cid, text, _meta in chunks]
    chunk_ids = [cid for cid, _text, _meta in chunks]
    query_vec = await aembed_query(query)
    doc_vecs = await aembed_documents(texts)
    from tests.evaluation_utils import cosine_similarity

    sims = [cosine_similarity(query_vec, vec) for vec in doc_vecs]
    ranked_idx = sorted(range(len(sims)), key=lambda i: sims[i], reverse=True)[:top_k]
    candidates = [texts[i] for i in ranked_idx]
    try:
        reranked = await arerank_texts(candidates, query, top_n=min(5, len(candidates)))
        ordered_ids: list[str] = []
        for item in reranked:
            idx = item.get("index", 0)
            if 0 <= idx < len(ranked_idx):
                ordered_ids.append(chunk_ids[ranked_idx[idx]])
        if ordered_ids:
            return ordered_ids
    except Exception:
        pass
    return [chunk_ids[i] for i in ranked_idx]


async def evaluate_case(case: dict, *, mode: str, k_values: list[int]) -> RetrievalCaseResult:
    state = CopilotState.model_validate(case.get("state") or {})
    chunks = build_chunks_from_state(state)
    query = case["query"]
    top_k = max(k_values)

    if mode == "embedding":
        retrieved = await _embedding_rank(query, chunks, top_k=top_k)
    else:
        retrieved = _lexical_rank(query, chunks)[:top_k]

    return evaluate_retrieval_case(case, retrieved, k_values=k_values)


async def run_evaluation(*, mode: str | None = None, k_values: list[int] | None = None) -> dict:
    k_values = k_values or DEFAULT_K
    if mode is None:
        mode = "embedding" if _has_embedding_key() else "lexical_fallback"

    cases = _load_cases()
    results = [await evaluate_case(case, mode=mode, k_values=k_values) for case in cases]
    report = build_retrieval_report(
        results,
        generated_at=datetime.now(timezone.utc).isoformat(),
        mode=mode,
        k_values=k_values,
    )
    return report.to_dict()


def _render_summary(report: dict) -> str:
    lines = [
        "# RAG Retrieval Quality — Evaluation Report",
        "",
        f"- Generated at: {report['generated_at']}",
        f"- Mode: {report['mode']}",
        f"- Cases: {report['total_cases']}",
        f"- Hit rate (any relevant in top-{max(report['k_values'])}): {report['hit_rate']:.2%}",
        f"- Mean Reciprocal Rank (MRR): {report['avg_mrr']:.4f}",
        "",
        "## Aggregate metrics",
        "",
        "| K | Recall@K | NDCG@K |",
        "|---|----------|--------|",
    ]
    for k in report["k_values"]:
        recall = report["avg_recall_at_k"][k]
        ndcg = report["avg_ndcg_at_k"][k]
        lines.append(f"| {k} | {recall:.2%} | {ndcg:.4f} |")

    lines.extend(["", "## Per-query results", ""])
    for case in report["cases"]:
        lines.append(f"### {case['case_id']} — MRR {case['mrr']:.4f}")
        lines.append(f"- Query: {case['query']}")
        lines.append(f"- Relevant: `{case['relevant_chunk_ids']}`")
        lines.append(f"- Retrieved: `{case['retrieved_chunk_ids'][:5]}`")
        lines.append("")

    lines.extend([
        "## Metric definitions",
        "",
        "- **Recall@K** — fraction of relevant chunks found in top-K results.",
        "- **MRR** — mean reciprocal rank of the first relevant chunk.",
        "- **NDCG@K** — normalized discounted cumulative gain at K.",
        "- **lexical_fallback** mode uses token overlap (CI-friendly, no API key).",
        "- **embedding** mode uses Qwen embedding + optional rerank (production-like).",
        "",
    ])
    return "\n".join(lines)


def write_report(report: dict, *, run_id: str | None = None) -> Path:
    run_id = run_id or datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir = RESULTS_ROOT / "runs" / run_id
    latest_dir = RESULTS_ROOT / "latest"
    run_dir.mkdir(parents=True, exist_ok=True)
    latest_dir.mkdir(parents=True, exist_ok=True)

    json_path = run_dir / "report.json"
    md_path = run_dir / "summary.md"
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    md_path.write_text(_render_summary(report), encoding="utf-8")

    (latest_dir / "report.json").write_text(json_path.read_text(encoding="utf-8"), encoding="utf-8")
    (latest_dir / "summary.md").write_text(md_path.read_text(encoding="utf-8"), encoding="utf-8")
    return run_dir


def main() -> int:
    parser = argparse.ArgumentParser(description="RAG retrieval Recall@K / MRR evaluation")
    parser.add_argument("--embeddings", action="store_true", help="Use embedding + rerank")
    parser.add_argument("--lexical", action="store_true", help="Force lexical fallback")
    args = parser.parse_args()

    mode: str | None = None
    if args.embeddings:
        mode = "embedding"
    elif args.lexical:
        mode = "lexical_fallback"

    report = asyncio.run(run_evaluation(mode=mode))
    out_dir = write_report(report)
    print(f"RAG retrieval evaluation → {out_dir}")
    print(f"MRR {report['avg_mrr']:.4f} | Hit rate {report['hit_rate']:.2%}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
