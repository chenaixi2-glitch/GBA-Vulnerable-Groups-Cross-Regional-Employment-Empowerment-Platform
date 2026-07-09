"""Shared gap analysis — resume gap_agent and learning_path_agent both use this."""

from __future__ import annotations

import json
import time
import uuid
from typing import Any

from agents.json_contracts import GapAnalysisOutput, GapOutput, QuestionOutput, ExperienceRemovalOutput
from models.llm import get_llm
from tools.output_language_guard import ainvoke_json_with_language_guard
from prompts.gap_analysis import GAP_ANALYSIS_PROMPT
from tools.output_language import gap_prompt_language_kwargs
from tools.quantification_questions import supplement_quantification_gaps_and_questions
from tools.resume_profile_context import build_profile_dict
from tools.target_job_context import build_enriched_job_json
from services.jd_experience_match import compute_jd_experience_matches_batched
from workflow.state import CopilotState, Gap, Question, ExperienceRemoval
from log import get_logger, elapsed_ms, log_stage_timing

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
    for item in sanitize_experience_removals(items):
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


_PROTECTED_REMOVAL_SECTIONS = frozenset({"education"})

_PAGE_LENGTH_REASON_MARKERS = (
    "a4", "one page", "one-page", "single page", "page limit", "fit on",
    "单页", "篇幅", "页数", "排版", "间距", "节省", "精简以", "caber numa",
    "uma página", "一頁", "一页",
)

_LOW_RELEVANCE_REASON_MARKERS = (
    "相关度", "關聯度", "关联度", "低相关", "低相關", "relevance", "relevant",
    "very_low", "very low", "重复", "重複", "duplicate", "redundant", "irrelevant",
    "baixa relev", "irrelev",
)


def _reason_has_marker(text: str, markers: tuple[str, ...]) -> bool:
    lowered = text.lower()
    return any(m in lowered for m in markers)


def sanitize_experience_removals(
    items: list[ExperienceRemovalOutput],
) -> list[ExperienceRemovalOutput]:
    """Drop removals that target protected sections or cite page length without low relevance."""
    kept: list[ExperienceRemovalOutput] = []
    for item in items:
        section = (item.section_type or "").strip().lower()
        reason = item.reason or ""

        if section in _PROTECTED_REMOVAL_SECTIONS:
            logger.info(
                "Filtered experience removal: protected section %s (%s)",
                section,
                item.title or item.fact_id,
            )
            continue

        has_page = _reason_has_marker(reason, _PAGE_LENGTH_REASON_MARKERS)
        has_relevance = _reason_has_marker(reason, _LOW_RELEVANCE_REASON_MARKERS)
        if has_page and not has_relevance:
            logger.info(
                "Filtered experience removal: page-length-only reason (%s)",
                item.title or item.fact_id,
            )
            continue

        kept.append(item)
    return kept


def _build_experience_match_json(matches: list[dict[str, Any]] | None) -> str:
    if not matches:
        return "[]"
    return json.dumps(matches, ensure_ascii=False, indent=2)


def _build_gap_profile_json(state: CopilotState, matches: list[dict[str, Any]] | None = None) -> str:
    profile_dict = build_profile_dict(state)
    if matches:
        profile_dict["jd_experience_matches"] = matches
    return json.dumps(profile_dict, ensure_ascii=False, indent=2)


async def _load_jd_experience_matches(state: CopilotState) -> list[dict[str, Any]]:
    match_t0 = time.perf_counter()
    matches = await compute_jd_experience_matches_batched(state)
    log_stage_timing(
        logger,
        "gap_analysis.jd_experience_match",
        elapsed_ms(match_t0),
        session_id=state.session_id,
        facts=len(matches),
    )
    return matches


async def prepare_gap_analysis_context(state: CopilotState) -> list[dict[str, Any]]:
    """Compute batch JD–experience semantic match scores before gap LLM call."""
    return await _load_jd_experience_matches(state)


async def run_gap_analysis(
    state: CopilotState,
    *,
    resolution_source: str = "gap_analysis",
) -> tuple[list[Gap], list[Question], list[ExperienceRemoval]]:
    """Run shared JD vs profile gap analysis (gaps + follow-up questions + removal proposals)."""
    if not has_gap_analysis_context(state):
        return [], [], []

    jd_experience_matches = await prepare_gap_analysis_context(state)

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
        profile_json=_build_gap_profile_json(state, jd_experience_matches),
        experience_match_json=_build_experience_match_json(jd_experience_matches),
        **lang_kwargs,
    )
    llm = get_llm()
    gap_t0 = time.perf_counter()
    parsed = await ainvoke_json_with_language_guard(
        llm,
        prompt,
        GapAnalysisOutput,
        logger,
        "Gap Analysis (shared core)",
        lang_kwargs["output_language"],
    )
    log_stage_timing(
        logger,
        "gap_analysis.llm",
        elapsed_ms(gap_t0),
        session_id=state.session_id,
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
