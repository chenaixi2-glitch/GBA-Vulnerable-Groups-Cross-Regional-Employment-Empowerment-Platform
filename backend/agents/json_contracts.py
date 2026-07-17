"""Pydantic JSON contracts for agent machine-protocol outputs."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, model_validator


class IntentClassificationOutput(BaseModel):
    intent: str = "ask_question"
    reason: str = ""


class JDGenerationOutput(BaseModel):
    title: str = ""
    jd_text: str = ""


class JDTitleGenerationOutput(BaseModel):
    title: str = ""
    jd_text: str = ""
    primary_tech_stack: list[str] = Field(default_factory=list)
    alignment_note: str = ""
    needs_clarification: bool = False
    clarification_hint: str = ""


class JDAnalysisOutput(BaseModel):
    industry: str = ""
    title: str = ""
    tech_stack: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    hard_skills: list[str] = Field(default_factory=list)
    soft_skills: list[str] = Field(default_factory=list)
    responsibilities: list[str] = Field(default_factory=list)
    education_requirement: str = ""
    experience_requirement: str = ""
    implicit_preferences: list[str] = Field(default_factory=list)
    bonus_items: list[str] = Field(default_factory=list)


class ProfileBasicOutput(BaseModel):
    name: str = ""
    email: str = ""
    phone: str = ""
    city: str = ""
    school: str = ""
    extras: dict[str, str] = Field(default_factory=dict)


class ProfileFactOutput(BaseModel):
    id: str = ""
    type: str = "skill"
    content: str = ""
    source_refs: list[str] = Field(default_factory=list)
    updated_at: str = ""


class ProfileExtractionOutput(BaseModel):
    profile_basic: ProfileBasicOutput = Field(default_factory=ProfileBasicOutput)
    facts: list[ProfileFactOutput] = Field(default_factory=list)


class ProfilePatchOutput(BaseModel):
    facts: list[ProfileFactOutput] = Field(default_factory=list)


class BatchTranslationOutput(BaseModel):
    translations: dict[str, str] = Field(default_factory=dict)


class GapOutput(BaseModel):
    id: str = ""
    type: str = "missing_skill"
    severity: str = "medium"
    description: str = ""
    related_section_ids: list[str] = Field(default_factory=list)
    resolved: bool = False
    resolution_source: str = "gap_analysis"


class QuestionOutput(BaseModel):
    id: str = ""
    question: str = ""
    reason: str = ""
    target_field: str = ""
    priority: str = "medium"
    status: str = "pending"
    answer_ref: str = ""


class ExperienceRemovalOutput(BaseModel):
    id: str = ""
    fact_id: str = ""
    section_type: str = ""  # work | internship | project | award | paper | skill | education
    title: str = ""
    reason: str = ""
    priority: str = "recommended"  # recommended | optional


class GapAnalysisOutput(BaseModel):
    gaps: list[GapOutput] = Field(default_factory=list)
    questions_to_ask: list[QuestionOutput] = Field(default_factory=list)
    experiences_to_remove: list[ExperienceRemovalOutput] = Field(default_factory=list)


class EducationOutput(BaseModel):
    id: str = ""
    school: str = ""
    major: str = ""
    degree: str = ""
    start_date: str = ""
    end_date: str = ""


class ResumeProfileOutput(BaseModel):
    name: str = ""
    email: str = ""
    phone: str = ""
    city: str = ""
    github: str = ""
    linkedin: str = ""
    address: str = ""
    education: list[EducationOutput] = Field(default_factory=list)
    extras: dict[str, str] = Field(default_factory=dict)


class ResumeSectionItemOutput(BaseModel):
    id: str = ""
    title: str = ""
    content: str = ""
    source_refs: list[str] = Field(default_factory=list)
    updated_at: str = ""


def _coerce_section_items(value: Any, *, id_prefix: str = "item") -> list[dict[str, Any]]:
    """Accept list[str] / bad shapes from small models and normalize to section items."""
    if value is None or value == "" or isinstance(value, (bool, int, float)):
        return []
    if isinstance(value, str):
        # Model sometimes emits a sibling section name instead of a list.
        return []
    if isinstance(value, dict):
        value = [value]
    if not isinstance(value, list):
        return []
    items: list[dict[str, Any]] = []
    for index, raw in enumerate(value):
        if isinstance(raw, str):
            text = raw.strip()
            if not text:
                continue
            items.append({
                "id": f"{id_prefix}_{index + 1}",
                "title": text,
                "content": text,
                "source_refs": [],
                "updated_at": "",
            })
        elif isinstance(raw, dict):
            items.append(raw)
    return items


def normalize_resume_generation_payload(data: Any) -> Any:
    """Repair common resume skeleton/generation JSON shape mistakes."""
    if not isinstance(data, dict):
        return data
    payload = dict(data)

    # Mis-nest: {"summary": {"skills": [...], "works": [], "internships": []}, ...}
    summary = payload.get("summary")
    if isinstance(summary, dict):
        for key in ("skills", "works", "internships", "projects", "awards", "papers", "language", "section_order"):
            if key in summary and (key not in payload or payload.get(key) in (None, "", [], {})):
                payload[key] = summary.get(key)
        payload["summary"] = (
            summary.get("summary")
            or summary.get("text")
            or summary.get("content")
            or ""
        )

    profile = payload.get("profile")
    if isinstance(profile, str):
        # Model sometimes dumps a prose paragraph into profile.
        text = profile.strip()
        payload["profile"] = {"name": "", "extras": {}}
        if text and not payload.get("summary"):
            payload["summary"] = text
    elif isinstance(profile, dict):
        if isinstance(profile.get("summary"), str) and not payload.get("summary"):
            payload["summary"] = profile["summary"]
    elif profile is None:
        payload["profile"] = {}

    if not isinstance(payload.get("summary"), str):
        payload["summary"] = ""

    for key, prefix in (
        ("skills", "skill"),
        ("works", "work"),
        ("internships", "internship"),
        ("projects", "project"),
        ("awards", "award"),
        ("papers", "paper"),
    ):
        payload[key] = _coerce_section_items(payload.get(key), id_prefix=prefix)

    # section_order may be broken into reg_order / mangled dicts
    order = payload.get("section_order")
    if not isinstance(order, list):
        alt = payload.get("reg_order") or payload.get("order")
        if isinstance(alt, list):
            order = alt
        elif isinstance(alt, str) and alt.strip():
            order = [alt.strip()]
        else:
            order = []
    cleaned_order: list[str] = []
    for item in order:
        if isinstance(item, str) and item.strip():
            token = item.strip().strip(",").strip('"').strip()
            if token and token not in cleaned_order:
                cleaned_order.append(token)
    payload["section_order"] = cleaned_order

    if not isinstance(payload.get("language"), str) or not payload.get("language"):
        payload["language"] = "zh"

    return payload


class ResumeClarificationPatchOutput(BaseModel):
    """Incremental skills/summary patch after gap clarifications."""

    update_summary: bool = False
    summary: str = ""
    update_skills: bool = False
    skills: list[ResumeSectionItemOutput] = Field(default_factory=list)


class ResumeGenerationOutput(BaseModel):
    profile: ResumeProfileOutput = Field(default_factory=ResumeProfileOutput)
    summary: str = ""
    skills: list[ResumeSectionItemOutput] = Field(default_factory=list)
    works: list[ResumeSectionItemOutput] = Field(default_factory=list)
    internships: list[ResumeSectionItemOutput] = Field(default_factory=list)
    projects: list[ResumeSectionItemOutput] = Field(default_factory=list)
    awards: list[ResumeSectionItemOutput] = Field(default_factory=list)
    papers: list[ResumeSectionItemOutput] = Field(default_factory=list)
    language: str = "en"
    section_order: list[str] = Field(
        default_factory=list,
        description="Optimized section display order; omit to infer from content",
    )

    @classmethod
    def model_validate(cls, obj: Any, *args: Any, **kwargs: Any):  # type: ignore[override]
        return super().model_validate(normalize_resume_generation_payload(obj), *args, **kwargs)


class ResumeModulePolishOutput(BaseModel):
    """Single resume section batch output for modular JD-tailored generation."""

    items: list[ResumeSectionItemOutput] = Field(default_factory=list)


class ResumeModuleTranslateOutput(BaseModel):
    """Single resume module translation output — field-level when available."""

    id: str = ""
    title: str = ""
    content: str = ""
    fields: dict[str, Any] = Field(default_factory=dict)


class ResumeEducationTranslateOutput(BaseModel):
    """Single education entry translation output."""

    id: str = ""
    school: str = ""
    major: str = ""
    degree: str = ""
    fields: dict[str, Any] = Field(default_factory=dict)


class PageMarginOutput(BaseModel):
    top: int = 24
    right: int = 24
    bottom: int = 24
    left: int = 24


class RenderInstructionOutput(BaseModel):
    template_id: str = "default"
    theme: str = "light"
    language: str = "en"
    font_family: str = "Source Han Sans"
    font_size: int = 14
    line_height: float = 1.5
    page_margin: PageMarginOutput = Field(default_factory=PageMarginOutput)
    section_order: list[str] = Field(default_factory=list)
    dense_mode: bool = False
    accent_style: str = "minimal"
    visibility_map: dict[str, bool] = Field(default_factory=dict)
    layout_mode: str = "single-column"
    spacing_scale: str = "standard"
    last_render_reason: str = ""


class InterviewQAOutput(BaseModel):
    id: str = ""
    category: str = "technical"
    question: str = ""
    answer: str = ""
    source_refs: list[str] = Field(default_factory=list)
    version: int = 1
    stage_id: str = ""
    stage_name: str = ""
    stage_index: int = 0


class InterviewGenerationOutput(BaseModel):
    interview_qa: list[InterviewQAOutput] = Field(default_factory=list)


class InteractiveInterviewTurnOutput(BaseModel):
    brief_feedback: str = ""
    follow_up_type: str = "new_topic"  # follow_up | new_topic | end
    interviewer_message: str = ""
    category: str = ""
    should_end: bool = False


class InteractiveBankFeedbackOutput(BaseModel):
    """异步点评：对单题回答生成点评与追问，不影响下一题展示。"""
    brief_feedback: str = ""
    follow_up_questions: list[str] = Field(default_factory=list)
    follow_up_categories: list[str] = Field(default_factory=list)
    should_end: bool = False
    end_reason: str = ""
    closing_message: str = ""
    dimensions_covered: bool = False
    resume_cleared: bool = False
    can_decide: bool = False
    no_more_value: bool = False
    hard_mismatch: bool = False
    high_match: bool = False


class InteractiveInterviewKeyMomentOutput(BaseModel):
    question: str = ""
    your_answer_summary: str = ""
    analysis: str = ""
    improved_answer: str = ""
    score: int = 0


class InteractiveInterviewDebriefOutput(BaseModel):
    overall_score: int = 0
    summary: str = ""
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    key_moments: list[InteractiveInterviewKeyMomentOutput] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    category_scores: dict[str, int] = Field(default_factory=dict)
    stage_scores: dict[str, int] = Field(default_factory=dict)


class LLMJudgeRubricOutput(BaseModel):
    """LLM-as-judge rubric scores (0–100 each dimension)."""
    relevance: int = 0
    groundedness: int = 0
    actionability: int = 0
    rationale: str = ""


class AnswerEvaluationOutput(BaseModel):
    """Structured feedback for free-text interview answer evaluation."""
    score: int = 0
    strengths: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
    judge_scores: LLMJudgeRubricOutput = Field(default_factory=LLMJudgeRubricOutput)


class LearningPathGapOutput(BaseModel):
    id: str = ""
    type: str = "missing_skill"
    severity: str = "medium"
    description: str = ""
    estimated_hours: int = 0
    related_section_ids: list[str] = Field(default_factory=list)
    resolved: bool = False
    resolution_source: str = "learning_path"


class LearningPathResourceOutput(BaseModel):
    id: str = ""
    skill: str = ""
    type: str = "course"  # course | article | video | project
    title: str = ""
    platform: str = ""
    duration: str = ""
    duration_hours: float = 0.0
    url: str = ""
    rating: float = 0.0


class LearningPathPhaseOutput(BaseModel):
    phase: int = 1
    title: str = ""
    period: str = ""
    unit: str = "week"  # month | week | day
    skills: list[str] = Field(default_factory=list)
    description: str = ""
    children: list["LearningPathPhaseOutput"] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def _compat_legacy_period(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        data = dict(data)
        if not str(data.get("period") or "").strip():
            if str(data.get("days") or "").strip():
                data["period"] = data["days"]
                data.setdefault("unit", "day")
            elif str(data.get("weeks") or "").strip():
                data["period"] = data["weeks"]
                data.setdefault("unit", "week")
        unit = str(data.get("unit") or "").strip().lower()
        if unit not in {"month", "week", "day"}:
            data["unit"] = "week"
        else:
            data["unit"] = unit
        return data


class LearningPathAnalysisOutput(BaseModel):
    gaps: list[LearningPathGapOutput] = Field(default_factory=list)
    resources: list[LearningPathResourceOutput] = Field(default_factory=list)
    estimated_total_hours: int = 0
    questions_to_ask: list[QuestionOutput] = Field(default_factory=list)


class GapHourEstimateOutput(BaseModel):
    id: str = ""
    estimated_hours: int = 0


class LearningPathResourcesOutput(BaseModel):
    resources: list[LearningPathResourceOutput] = Field(default_factory=list)
    estimated_total_hours: int = 0
    gap_hours: list[GapHourEstimateOutput] = Field(default_factory=list)


class LearningPathTimelineOutput(BaseModel):
    timeline: list[LearningPathPhaseOutput] = Field(default_factory=list)


class LearningPathExpandOutput(BaseModel):
    children: list[LearningPathPhaseOutput] = Field(default_factory=list)


class LearningPathOutput(BaseModel):
    """Legacy combined schema — kept for tests."""
    gaps: list[GapOutput] = Field(default_factory=list)
    timeline: list[LearningPathPhaseOutput] = Field(default_factory=list)
    resources: list[LearningPathResourceOutput] = Field(default_factory=list)
    questions_to_ask: list[QuestionOutput] = Field(default_factory=list)