"""Batch JD–experience semantic matching for gap analysis."""

from __future__ import annotations

import json
import re
from typing import Any

from models.embedding import aembed_documents, aembed_query, EmbeddingDisabledError
from tests.evaluation_utils import cosine_similarity
from tools.resume_profile_context import batch_facts_by_size, facts_of_type
from tools.target_job_context import build_enriched_job_dict
from workflow.state import CopilotState, Fact
from config_loader import is_embedding_enabled
from log import get_logger

logger = get_logger("agent")

_EXPERIENCE_TYPES = ("work", "internship", "project")
_EMBED_BATCH_SIZE = 8


def extract_fact_title(fact: Fact) -> str:
    content = (fact.content or "").strip()
    if not content:
        return fact.id
    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict):
            for key in ("title", "company", "name", "project", "role"):
                val = str(parsed.get(key) or "").strip()
                if val:
                    return val
    except json.JSONDecodeError:
        pass
    first_line = content.splitlines()[0].strip()
    return first_line[:120] if first_line else fact.id


def _fact_match_text(fact: Fact) -> str:
    title = extract_fact_title(fact)
    body = (fact.content or "").strip()
    if title and title not in body[:80]:
        return f"{title}\n{body}".strip()
    return body or title


def build_jd_match_text(state: CopilotState) -> str:
    """Compact JD text for embedding similarity (title + skills + responsibilities)."""
    enriched = build_enriched_job_dict(state)
    ctx = enriched.get("user_target_context") or {}
    parts: list[str] = []
    for key in ("title", "industry", "experience_requirement"):
        val = str(enriched.get(key) or ctx.get(key.replace("experience_requirement", "experience_level")) or "").strip()
        if val:
            parts.append(val)
    for group_key in ("hard_skills", "soft_skills", "keywords", "tech_stack", "responsibilities"):
        for item in enriched.get(group_key) or []:
            text = str(item).strip()
            if text:
                parts.append(text)
    jd_text = str(ctx.get("jd_text") or enriched.get("source") or "").strip()
    if jd_text:
        parts.append(jd_text[:4000])
    return "\n".join(parts)


def _relevance_label(score: float) -> str:
    if score >= 0.72:
        return "high"
    if score >= 0.52:
        return "medium"
    if score >= 0.35:
        return "low"
    return "very_low"


async def _embed_texts_in_batches(texts: list[str]) -> list[list[float]]:
    vectors: list[list[float]] = []
    for start in range(0, len(texts), _EMBED_BATCH_SIZE):
        batch = texts[start:start + _EMBED_BATCH_SIZE]
        vectors.extend(await aembed_documents(batch))
    return vectors


async def compute_jd_experience_matches(
    state: CopilotState,
    *,
    fact_types: tuple[str, ...] = _EXPERIENCE_TYPES,
) -> list[dict[str, Any]]:
    """Score each internship/project fact against the target JD via batch embeddings."""
    if not is_embedding_enabled():
        logger.info("JD-experience embedding match skipped: embedding.enabled=false")
        return []

    jd_text = build_jd_match_text(state)
    if not jd_text.strip():
        return []

    facts: list[Fact] = []
    for fact_type in fact_types:
        facts.extend(facts_of_type(state, fact_type))
    if not facts:
        return []

    try:
        jd_vector = await aembed_query(jd_text)
        fact_texts = [_fact_match_text(fact) for fact in facts]
        fact_vectors = await _embed_texts_in_batches(fact_texts)
    except EmbeddingDisabledError:
        logger.info("JD-experience embedding match skipped: embedding disabled")
        return []
    except Exception as exc:
        logger.warning("JD-experience embedding match skipped: %s", exc)
        return []

    matches: list[dict[str, Any]] = []
    for fact, text, vector in zip(facts, fact_texts, fact_vectors):
        score = cosine_similarity(jd_vector, vector)
        matches.append({
            "fact_id": fact.id,
            "fact_type": fact.type,
            "title": extract_fact_title(fact),
            "jd_match_score": round(score, 4),
            "relevance": _relevance_label(score),
            "content_preview": re.sub(r"\s+", " ", text)[:240],
        })

    matches.sort(key=lambda item: item["jd_match_score"], reverse=True)
    logger.info(
        "JD-experience semantic match: %d facts, top=%.3f",
        len(matches),
        matches[0]["jd_match_score"] if matches else 0.0,
    )
    return matches


async def compute_jd_experience_matches_batched(
    state: CopilotState,
    *,
    fact_types: tuple[str, ...] = _EXPERIENCE_TYPES,
) -> list[dict[str, Any]]:
    """Same as compute_jd_experience_matches but respects fact batching for large profiles."""
    if not is_embedding_enabled():
        logger.info("JD-experience embedding match skipped: embedding.enabled=false")
        return []

    jd_text = build_jd_match_text(state)
    if not jd_text.strip():
        return []

    facts: list[Fact] = []
    for fact_type in fact_types:
        facts.extend(facts_of_type(state, fact_type))
    if not facts:
        return []

    try:
        jd_vector = await aembed_query(jd_text)
    except EmbeddingDisabledError:
        logger.info("JD-experience embedding match skipped: embedding disabled")
        return []
    except Exception as exc:
        logger.warning("JD-experience embedding match skipped: %s", exc)
        return []

    matches: list[dict[str, Any]] = []
    for batch in batch_facts_by_size(facts):
        texts = [_fact_match_text(fact) for fact in batch]
        try:
            vectors = await _embed_texts_in_batches(texts)
        except Exception as exc:
            logger.warning("JD-experience batch embed failed: %s", exc)
            continue
        for fact, text, vector in zip(batch, texts, vectors):
            score = cosine_similarity(jd_vector, vector)
            matches.append({
                "fact_id": fact.id,
                "fact_type": fact.type,
                "title": extract_fact_title(fact),
                "jd_match_score": round(score, 4),
                "relevance": _relevance_label(score),
                "content_preview": re.sub(r"\s+", " ", text)[:240],
            })

    matches.sort(key=lambda item: item["jd_match_score"], reverse=True)
    return matches
