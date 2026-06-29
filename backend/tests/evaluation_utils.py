"""Golden-set validation utilities for answer evaluation CI checks."""

from __future__ import annotations

import math
import re
from typing import Any


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def keyword_coverage(text: str, keywords: list[str]) -> float:
    """Return fraction of keywords found in text (case-insensitive)."""
    if not keywords:
        return 1.0
    normalized = normalize_text(text)
    hits = sum(1 for kw in keywords if normalize_text(kw) in normalized)
    return hits / len(keywords)


def combine_evaluation_text(evaluation: dict[str, Any]) -> str:
    parts: list[str] = [
        str(evaluation.get("score", "")),
        *evaluation.get("strengths", []),
        *evaluation.get("improvements", []),
        *evaluation.get("suggestions", []),
    ]
    judge = evaluation.get("judge_scores") or {}
    parts.extend([
        str(judge.get("rationale", "")),
        str(judge.get("relevance", "")),
        str(judge.get("groundedness", "")),
        str(judge.get("actionability", "")),
    ])
    return " ".join(str(p) for p in parts if p)


def cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return 0.0
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(a * a for a in vec_a))
    norm_b = math.sqrt(sum(b * b for b in vec_b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def validate_golden_case(
    evaluation: dict[str, Any],
    expected: dict[str, Any],
    *,
    min_keyword_coverage: float = 0.4,
    min_embedding_similarity: float = 0.5,
    embedding_similarity: float | None = None,
) -> tuple[bool, list[str]]:
    """Validate an evaluation output against golden expected key points."""
    errors: list[str] = []
    combined = combine_evaluation_text(evaluation)

    strength_kws = expected.get("expected_strength_keywords", [])
    improvement_kws = expected.get("expected_improvement_keywords", [])
    general_kws = expected.get("expected_keywords", [])

    strength_cov = keyword_coverage(combined, strength_kws) if strength_kws else 1.0
    improvement_cov = keyword_coverage(combined, improvement_kws) if improvement_kws else 1.0
    general_cov = keyword_coverage(combined, general_kws) if general_kws else 1.0

    if strength_kws and strength_cov < min_keyword_coverage:
        errors.append(f"strength keyword coverage {strength_cov:.2f} < {min_keyword_coverage}")
    if improvement_kws and improvement_cov < min_keyword_coverage:
        errors.append(f"improvement keyword coverage {improvement_cov:.2f} < {min_keyword_coverage}")
    if general_kws and general_cov < min_keyword_coverage:
        errors.append(f"general keyword coverage {general_cov:.2f} < {min_keyword_coverage}")

    min_score = expected.get("min_score")
    max_score = expected.get("max_score")
    score = evaluation.get("score")
    if min_score is not None and score is not None and score < min_score:
        errors.append(f"score {score} < min_score {min_score}")
    if max_score is not None and score is not None and score > max_score:
        errors.append(f"score {score} > max_score {max_score}")

    if embedding_similarity is not None and embedding_similarity < min_embedding_similarity:
        errors.append(
            f"embedding similarity {embedding_similarity:.3f} < {min_embedding_similarity}"
        )

    return len(errors) == 0, errors
