"""Shared gap analysis — resume gap_agent and learning_path_agent both use this."""

from __future__ import annotations

import uuid
from typing import Any

from agents.json_contracts import GapAnalysisOutput, GapOutput, QuestionOutput
from models.llm import get_llm, ainvoke_json_with_schema
from prompts.gap_analysis import GAP_ANALYSIS_PROMPT
from tools.output_language import prompt_language_kwargs
from tools.target_job_context import build_enriched_job_json
from workflow.state import CopilotState, Gap, Question
from log import get_logger

logger = get_logger("agent")


def has_gap_analysis_context(state: CopilotState) -> bool:
    has_job = state.job is not None or bool((state.meta.target_jd_text or "").strip())
    return has_job and state.candidate_profile is not None


def build_gaps(
    items: list[GapOutput] | list[Any],
    *,
    resolution_source: str = "gap_analysis",
) -> list[Gap]:
    gaps: list[Gap] = []
    for item in items:
        estimated_hours = getattr(item, "estimated_hours", 0) or 0
        gaps.append(Gap(
            id=item.id or f"gap_{uuid.uuid4().hex[:12]}",
            type=item.type,
            severity=item.severity,
            description=item.description,
            estimated_hours=int(estimated_hours),
            related_section_ids=list(item.related_section_ids),
            resolved=item.resolved,
            resolution_source=getattr(item, "resolution_source", None) or resolution_source,
        ))
    return gaps


def build_questions(items: list[QuestionOutput]) -> list[Question]:
    questions: list[Question] = []
    for item in items:
        questions.append(Question(
            id=item.id or f"q_{uuid.uuid4().hex[:12]}",
            question=item.question,
            reason=item.reason,
            target_field=item.target_field,
            priority=item.priority,
            status=item.status,
            answer_ref=item.answer_ref,
        ))
    return questions


async def run_gap_analysis(
    state: CopilotState,
    *,
    resolution_source: str = "gap_analysis",
) -> tuple[list[Gap], list[Question]]:
    """Run shared JD vs profile gap analysis (gaps + follow-up questions)."""
    if not has_gap_analysis_context(state):
        return [], []

    prompt = GAP_ANALYSIS_PROMPT.format(
        job_json=build_enriched_job_json(state),
        profile_json=state.candidate_profile.model_dump_json(indent=2),
        **prompt_language_kwargs(state),
    )
    llm = get_llm()
    parsed = await ainvoke_json_with_schema(
        llm, prompt, GapAnalysisOutput, logger, "Gap Analysis (shared core)"
    )
    gaps = build_gaps(parsed.gaps, resolution_source=resolution_source)
    questions = build_questions(parsed.questions_to_ask)
    logger.info("Shared gap analysis: %d gaps, %d questions", len(gaps), len(questions))
    return gaps, questions
