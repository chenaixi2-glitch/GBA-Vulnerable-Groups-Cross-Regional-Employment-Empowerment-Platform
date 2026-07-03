"""Shared gap analysis — resume gap_agent and learning_path_agent both use this."""

from __future__ import annotations

import uuid
from typing import Any

from agents.json_contracts import GapAnalysisOutput, GapOutput, QuestionOutput, ExperienceRemovalOutput
from models.llm import get_llm, ainvoke_json_with_schema
from prompts.gap_analysis import GAP_ANALYSIS_PROMPT
from tools.output_language import gap_prompt_language_kwargs
from tools.quantification_questions import supplement_quantification_gaps_and_questions
from tools.target_job_context import build_enriched_job_json
from workflow.state import CopilotState, Gap, Question, ExperienceRemoval
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


def build_experience_removals(items: list[ExperienceRemovalOutput]) -> list[ExperienceRemoval]:
    removals: list[ExperienceRemoval] = []
    for item in items:
        removals.append(ExperienceRemoval(
            id=item.id or f"rem_{uuid.uuid4().hex[:12]}",
            fact_id=item.fact_id,
            section_type=item.section_type,
            title=item.title,
            reason=item.reason,
            priority=item.priority or "recommended",
            user_confirmed=False,
        ))
    return removals


async def run_gap_analysis(
    state: CopilotState,
    *,
    resolution_source: str = "gap_analysis",
) -> tuple[list[Gap], list[Question], list[ExperienceRemoval]]:
    """Run shared JD vs profile gap analysis (gaps + follow-up questions + removal proposals)."""
    if not has_gap_analysis_context(state):
        return [], [], []

    lang_kwargs = gap_prompt_language_kwargs(state)
    logger.info(
        "Gap analysis output language: %s (chat=%s, ui=%s, render=%s)",
        lang_kwargs["output_language"],
        state.chat_output_language or "-",
        (state.meta.ui_output_language if state.meta else "") or "-",
        state.render_config.language if state.render_config else "-",
    )

    prompt = GAP_ANALYSIS_PROMPT.format(
        job_json=build_enriched_job_json(state),
        profile_json=state.candidate_profile.model_dump_json(indent=2),
        **lang_kwargs,
    )
    llm = get_llm()
    parsed = await ainvoke_json_with_schema(
        llm, prompt, GapAnalysisOutput, logger, "Gap Analysis (shared core)"
    )
    gaps = build_gaps(parsed.gaps, resolution_source=resolution_source)
    questions = build_questions(parsed.questions_to_ask)
    removals = build_experience_removals(parsed.experiences_to_remove)
    gaps, questions = supplement_quantification_gaps_and_questions(
        state.candidate_profile,
        gaps,
        questions,
        language=lang_kwargs.get("output_language"),
    )
    logger.info(
        "Shared gap analysis: %d gaps, %d questions, %d removal proposals",
        len(gaps), len(questions), len(removals),
    )
    return gaps, questions, removals
