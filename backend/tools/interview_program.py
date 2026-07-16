"""Interview mock program config — quick / full / specialized stage structure."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

ProgramVersion = Literal["quick", "full", "specialized"]
SpecializedFocus = Literal["technical", "final_negotiation", "resume_deep_dive"]
JobTrack = Literal["tech", "business", "functional", "general"]
StageId = Literal["screening", "professional", "final", "screening_final"]

# Keep zh keywords so Chinese job titles still map to tracks; detection only.
TECH_KEYWORDS = ("开发", "工程师", "测试", "算法", "数据", "前端", "后端", "运维", "dev", "engineer", "qa", "test")
BUSINESS_KEYWORDS = ("产品", "运营", "市场", "销售", "商务", "推广", "pm", "product", "marketing", "sales")
FUNCTIONAL_KEYWORDS = ("人事", "行政", "财务", "文员", "hr", "admin", "finance", "会计", "出纳")


@dataclass
class InterviewStageConfig:
    stage_id: str
    name: str
    subtitle: str
    interviewer_role: str
    max_turns: int
    focus_modules: list[str] = field(default_factory=list)
    categories: list[str] = field(default_factory=list)
    track_content: dict[str, str] = field(default_factory=dict)
    elimination_criteria: list[str] = field(default_factory=list)


@dataclass
class InterviewProgramConfig:
    version: str
    specialized_focus: str
    job_track: str
    stages: list[InterviewStageConfig]
    estimated_minutes: str

    @property
    def max_rounds(self) -> int:
        return sum(s.max_turns for s in self.stages)

    @property
    def stage_count(self) -> int:
        return len(self.stages)


SCREENING_MODULES = [
    "Tell me about yourself (structured: background + core experience + role fit strengths + career goal)",
    "Reason for leaving / job search (credibility and stability)",
    "Understanding of this role and the company's business",
    "Career plan (short-term, 1–2 years)",
    "Commute, available start date, and base salary expectations",
    "Light resume fact-check (campus, internships, basic work content)",
]

SCREENING_CATEGORIES = [
    "Resume deep dive & experience",
    "Role understanding & motivation",
    "Career planning & stability",
]

FINAL_MODULES = [
    "Personality, strengths/weaknesses, and teamwork examples",
    "Pressure / overtime / urgent-work scenarios",
    "Why should we hire you — core competitiveness",
    "Salary negotiation, benefits asks, and walk-away lines",
    "Candidate questions for the interviewer (thinking quality)",
]

FINAL_CATEGORIES = [
    "Soft skills & teamwork",
    "Stress handling & self-reflection",
    "Candidate questions for interviewer",
    "Career planning & stability",
]

PROFESSIONAL_TRACK_CONTENT: dict[str, str] = {
    "tech": (
        "Tech track: fundamentals + resume project deep dive (challenges, highlights, retros, debugging) "
        "+ live coding / whiteboard + scenario questions"
    ),
    "business": (
        "Business track: past project outcomes + business scenarios (growth, campaign ops, complaint handling) "
        "+ tools used + case breakdown"
    ),
    "functional": (
        "Functional track: process fluency + day-to-day scenarios + attention-to-detail / execution examples "
        "+ office skills"
    ),
    "general": (
        "General track: project delivery + problem solving + business sense + hands-on experience"
    ),
}

PROFESSIONAL_CATEGORIES = [
    "Professional skills & role fit",
    "Hands-on projects & problem solving",
    "Resume deep dive & experience",
    "Role understanding & motivation",
]

SPECIALIZED_CONFIGS: dict[str, dict] = {
    "technical": {
        "name": "Specialized — Technical / Professional",
        "subtitle": "20–30 min · Core score-driver",
        "interviewer_role": "Hiring manager / senior peer",
        "max_turns": 10,
        "focus_modules": [
            "Fundamentals / hard skills for the role",
            "Resume project deep dive (challenges, highlights, retros, debugging)",
            "Live exercise / scenario / coding (tech) or business case (business)",
            "Formula: what you did → how → problems → fixes → metrics → retros",
        ],
        "categories": PROFESSIONAL_CATEGORIES,
    },
    "final_negotiation": {
        "name": "Specialized — Final Negotiation",
        "subtitle": "10–15 min · Director / HRD round",
        "interviewer_role": "Director / HRD",
        "max_turns": 6,
        "focus_modules": FINAL_MODULES,
        "categories": FINAL_CATEGORIES,
    },
    "resume_deep_dive": {
        "name": "Specialized — Resume Deep Dive",
        "subtitle": "15–20 min · Screening + experience check",
        "interviewer_role": "HR / screening interviewer",
        "max_turns": 8,
        "focus_modules": SCREENING_MODULES,
        "categories": SCREENING_CATEGORIES + ["Resume deep dive & experience"],
    },
}


def detect_job_track(job_title: str = "", jd_text: str = "") -> str:
    """Infer job track from title and JD text."""
    combined = f"{job_title} {jd_text}".lower()
    if any(k in combined for k in TECH_KEYWORDS):
        return "tech"
    if any(k in combined for k in BUSINESS_KEYWORDS):
        return "business"
    if any(k in combined for k in FUNCTIONAL_KEYWORDS):
        return "functional"
    return "general"


def _screening_stage(max_turns: int = 5) -> InterviewStageConfig:
    return InterviewStageConfig(
        stage_id="screening",
        name="Round 1 — Screening",
        subtitle="10–15 min · HR / screening interviewer",
        interviewer_role="HR / screening interviewer",
        max_turns=max_turns,
        focus_modules=SCREENING_MODULES,
        categories=SCREENING_CATEGORIES,
        elimination_criteria=[
            "Unclear communication",
            "Vague motivation",
            "No understanding of the role",
            "Salary expectations far off",
            "Stability concerns",
        ],
    )


def _professional_stage(job_track: str, max_turns: int = 8) -> InterviewStageConfig:
    return InterviewStageConfig(
        stage_id="professional",
        name="Round 2 — Professional / Technical",
        subtitle="20–30 min · Hiring manager / senior peer",
        interviewer_role="Hiring manager / senior peer",
        max_turns=max_turns,
        focus_modules=[
            "Hard skills and project delivery for the role",
            "Problem solving and business sense",
            "Formula: what you did → how → problems → fixes → metrics → retros",
        ],
        categories=PROFESSIONAL_CATEGORIES,
        track_content={job_track: PROFESSIONAL_TRACK_CONTENT[job_track]},
    )


def _final_stage(max_turns: int = 4) -> InterviewStageConfig:
    return InterviewStageConfig(
        stage_id="final",
        name="Round 3 — Director / HR Final",
        subtitle="10–15 min · Director / HRD",
        interviewer_role="Director / HRD",
        max_turns=max_turns,
        focus_modules=FINAL_MODULES,
        categories=FINAL_CATEGORIES,
    )


def _screening_final_merged(max_turns: int = 5) -> InterviewStageConfig:
    return InterviewStageConfig(
        stage_id="screening_final",
        name="Screening + final combined",
        subtitle="15 min · HR + overall assessment (quick merged round)",
        interviewer_role="HR / panel interviewer",
        max_turns=max_turns,
        focus_modules=SCREENING_MODULES + FINAL_MODULES[:3],
        categories=list(dict.fromkeys(SCREENING_CATEGORIES + FINAL_CATEGORIES)),
        elimination_criteria=[
            "Unclear communication",
            "Vague motivation",
            "No understanding of the role",
            "Salary expectations far off",
            "Stability concerns",
            "Clear values mismatch",
        ],
    )


def build_interview_program(
    version: str = "quick",
    specialized_focus: str = "",
    job_title: str = "",
    jd_text: str = "",
) -> InterviewProgramConfig:
    """Build interview program configuration."""
    job_track = detect_job_track(job_title, jd_text)
    version = version if version in ("quick", "full", "specialized") else "quick"

    if version == "specialized":
        focus = specialized_focus if specialized_focus in SPECIALIZED_CONFIGS else "technical"
        cfg = SPECIALIZED_CONFIGS[focus]
        stage = InterviewStageConfig(
            stage_id=f"specialized_{focus}",
            name=cfg["name"],
            subtitle=cfg["subtitle"],
            interviewer_role=cfg["interviewer_role"],
            max_turns=cfg["max_turns"],
            focus_modules=cfg["focus_modules"],
            categories=cfg["categories"],
            track_content={job_track: PROFESSIONAL_TRACK_CONTENT[job_track]} if focus == "technical" else {},
        )
        return InterviewProgramConfig(
            version="specialized",
            specialized_focus=focus,
            job_track=job_track,
            stages=[stage],
            estimated_minutes="15-30",
        )

    if version == "full":
        stages = [
            _screening_stage(5),
            _professional_stage(job_track, 8),
            _final_stage(4),
        ]
        return InterviewProgramConfig(
            version="full",
            specialized_focus="",
            job_track=job_track,
            stages=stages,
            estimated_minutes="50-60",
        )

    # quick (default, recommended)
    stages = [
        _screening_final_merged(5),
        _professional_stage(job_track, 8),
    ]
    return InterviewProgramConfig(
        version="quick",
        specialized_focus="",
        job_track=job_track,
        stages=stages,
        estimated_minutes="25-35",
    )


def format_stage_context(stage: InterviewStageConfig, job_track: str) -> str:
    """Format current-stage focus content for prompt injection."""
    lines = [
        f"[{stage.name}] {stage.subtitle}",
        f"Interviewer role: {stage.interviewer_role}",
        "",
        "Fixed question modules:",
    ]
    for i, mod in enumerate(stage.focus_modules, 1):
        lines.append(f"  {i}. {mod}")

    track_hint = stage.track_content.get(job_track) or PROFESSIONAL_TRACK_CONTENT.get(job_track, "")
    if track_hint:
        lines.extend(["", f"Job-track focus ({job_track}):", f"  {track_hint}"])

    if stage.elimination_criteria:
        lines.extend(["", "Elimination / low-score signals:", *[f"  - {c}" for c in stage.elimination_criteria]])

    lines.extend(["", "Allowed category labels this round:", f"  {' | '.join(stage.categories)}"])
    return "\n".join(lines)


def format_program_overview(program: InterviewProgramConfig) -> str:
    """Format full program overview."""
    version_labels = {
        "quick": "Quick (~30 min): merged screening + final, keep full professional round",
        "full": "Full (~60 min): three complete rounds",
        "specialized": f"Specialized: {program.specialized_focus}",
    }
    lines = [
        version_labels.get(program.version, program.version),
        f"Estimated duration: {program.estimated_minutes} min",
        f"Job track: {program.job_track}",
        f"{program.stage_count} stage(s), {program.max_rounds} Q&A turns",
        "",
    ]
    for i, stage in enumerate(program.stages, 1):
        lines.append(f"Stage {i}: {stage.name} ({stage.max_turns} turns)")
    return "\n".join(lines)


def format_stages_generation_spec(program: InterviewProgramConfig) -> str:
    """Format per-stage generation specs for question-bank prompts."""
    lines = [
        f"Interview program: {format_program_overview(program)}",
        "",
        "Per-stage generation spec (strict order and counts):",
    ]
    for i, stage in enumerate(program.stages):
        lines.extend([
            "",
            f"--- Stage {i + 1} (stage_index={i}) ---",
            f"stage_id: {stage.stage_id}",
            f"stage_name: {stage.name}",
            f"Question count: exactly {stage.max_turns}",
            format_stage_context(stage, program.job_track),
        ])
    return "\n".join(lines)
