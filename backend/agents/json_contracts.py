"""Pydantic JSON contracts for agent machine-protocol outputs."""

from __future__ import annotations

from pydantic import BaseModel, Field


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


class ProfileFactOutput(BaseModel):
    id: str = ""
    type: str = "skill"
    content: str = ""
    source_refs: list[str] = Field(default_factory=list)
    updated_at: str = ""


class ProfileExtractionOutput(BaseModel):
    profile_basic: ProfileBasicOutput = Field(default_factory=ProfileBasicOutput)
    facts: list[ProfileFactOutput] = Field(default_factory=list)


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


class GapAnalysisOutput(BaseModel):
    gaps: list[GapOutput] = Field(default_factory=list)
    questions_to_ask: list[QuestionOutput] = Field(default_factory=list)


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


class ResumeGenerationOutput(BaseModel):
    profile: ResumeProfileOutput = Field(default_factory=ResumeProfileOutput)
    summary: str = ""
    skills: list[ResumeSectionItemOutput] = Field(default_factory=list)
    internships: list[ResumeSectionItemOutput] = Field(default_factory=list)
    projects: list[ResumeSectionItemOutput] = Field(default_factory=list)
    awards: list[ResumeSectionItemOutput] = Field(default_factory=list)
    papers: list[ResumeSectionItemOutput] = Field(default_factory=list)
    language: str = "zh"


class PageMarginOutput(BaseModel):
    top: int = 24
    right: int = 24
    bottom: int = 24
    left: int = 24


class RenderInstructionOutput(BaseModel):
    template_id: str = "default"
    theme: str = "light"
    language: str = "zh"
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


class InterviewGenerationOutput(BaseModel):
    interview_qa: list[InterviewQAOutput] = Field(default_factory=list)


class InteractiveInterviewTurnOutput(BaseModel):
    brief_feedback: str = ""
    follow_up_type: str = "new_topic"  # follow_up | new_topic | end
    interviewer_message: str = ""
    category: str = ""
    should_end: bool = False


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
    weeks: str = ""
    skills: list[str] = Field(default_factory=list)
    description: str = ""


class LearningPathAnalysisOutput(BaseModel):
    gaps: list[LearningPathGapOutput] = Field(default_factory=list)
    resources: list[LearningPathResourceOutput] = Field(default_factory=list)
    estimated_total_hours: int = 0
    questions_to_ask: list[QuestionOutput] = Field(default_factory=list)


class LearningPathTimelineOutput(BaseModel):
    timeline: list[LearningPathPhaseOutput] = Field(default_factory=list)


class LearningPathOutput(BaseModel):
    """Legacy combined schema — kept for tests."""
    gaps: list[GapOutput] = Field(default_factory=list)
    timeline: list[LearningPathPhaseOutput] = Field(default_factory=list)
    resources: list[LearningPathResourceOutput] = Field(default_factory=list)
    questions_to_ask: list[QuestionOutput] = Field(default_factory=list)