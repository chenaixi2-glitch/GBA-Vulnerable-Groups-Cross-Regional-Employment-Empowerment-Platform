"""Information retrieval metrics for RAG chunk ranking."""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class RetrievalCaseResult:
    case_id: str
    query: str
    relevant_chunk_ids: list[str]
    retrieved_chunk_ids: list[str]
    recall_at_k: dict[int, float]
    mrr: float
    ndcg_at_k: dict[int, float]
    hit: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class RetrievalReport:
    generated_at: str
    mode: str
    k_values: list[int]
    total_cases: int
    avg_recall_at_k: dict[int, float]
    avg_mrr: float
    avg_ndcg_at_k: dict[int, float]
    hit_rate: float
    cases: list[RetrievalCaseResult] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "generated_at": self.generated_at,
            "mode": self.mode,
            "k_values": self.k_values,
            "total_cases": self.total_cases,
            "avg_recall_at_k": self.avg_recall_at_k,
            "avg_mrr": self.avg_mrr,
            "avg_ndcg_at_k": self.avg_ndcg_at_k,
            "hit_rate": self.hit_rate,
            "cases": [c.to_dict() for c in self.cases],
        }


def recall_at_k(relevant: set[str], retrieved: list[str], k: int) -> float:
    if not relevant:
        return 1.0
    top_k = set(retrieved[:k])
    return len(relevant & top_k) / len(relevant)


def reciprocal_rank(relevant: set[str], retrieved: list[str]) -> float:
    for rank, chunk_id in enumerate(retrieved, start=1):
        if chunk_id in relevant:
            return 1.0 / rank
    return 0.0


def ndcg_at_k(relevant: set[str], retrieved: list[str], k: int) -> float:
    if not relevant:
        return 1.0
    dcg = 0.0
    for rank, chunk_id in enumerate(retrieved[:k], start=1):
        rel = 1.0 if chunk_id in relevant else 0.0
        dcg += rel / math.log2(rank + 1)
    ideal_hits = min(len(relevant), k)
    idcg = sum(1.0 / math.log2(i + 1) for i in range(1, ideal_hits + 1))
    return dcg / idcg if idcg else 0.0


def evaluate_retrieval_case(
    case: dict[str, Any],
    retrieved_chunk_ids: list[str],
    *,
    k_values: list[int] | None = None,
) -> RetrievalCaseResult:
    k_values = k_values or [1, 3, 5, 10]
    relevant = set(case.get("relevant_chunk_ids") or [])
    recalls = {k: round(recall_at_k(relevant, retrieved_chunk_ids, k), 4) for k in k_values}
    mrr = round(reciprocal_rank(relevant, retrieved_chunk_ids), 4)
    ndcgs = {k: round(ndcg_at_k(relevant, retrieved_chunk_ids, k), 4) for k in k_values}
    hit = any(cid in relevant for cid in retrieved_chunk_ids[: max(k_values)])

    return RetrievalCaseResult(
        case_id=case["id"],
        query=case.get("query", ""),
        relevant_chunk_ids=sorted(relevant),
        retrieved_chunk_ids=retrieved_chunk_ids,
        recall_at_k=recalls,
        mrr=mrr,
        ndcg_at_k=ndcgs,
        hit=hit,
    )


def build_retrieval_report(
    case_results: list[RetrievalCaseResult],
    *,
    generated_at: str,
    mode: str,
    k_values: list[int],
) -> RetrievalReport:
    n = len(case_results) or 1
    avg_recall = {
        k: round(sum(r.recall_at_k[k] for r in case_results) / n, 4) for k in k_values
    }
    avg_ndcg = {
        k: round(sum(r.ndcg_at_k[k] for r in case_results) / n, 4) for k in k_values
    }
    return RetrievalReport(
        generated_at=generated_at,
        mode=mode,
        k_values=k_values,
        total_cases=len(case_results),
        avg_recall_at_k=avg_recall,
        avg_mrr=round(sum(r.mrr for r in case_results) / n, 4),
        avg_ndcg_at_k=avg_ndcg,
        hit_rate=round(sum(1 for r in case_results if r.hit) / n, 4),
        cases=case_results,
    )
