"""RAG-style resume optimization metrics: relevance, groundedness, checklist, match score."""

from __future__ import annotations

import json
import math
import re
from dataclasses import asdict, dataclass, field
from typing import Any

from tests.evaluation_utils import cosine_similarity, keyword_coverage, normalize_text
from workflow.state import CandidateProfile, CopilotState, Meta, ResumeContent


@dataclass
class ResumeRagMetrics:
    """Single-version RAG metric snapshot for one resume."""

    case_id: str
    variant: str  # before | after

    # RAG — relevance to JD
    jd_keyword_coverage: float = 0.0
    jd_embedding_similarity: float | None = None

    # RAG — groundedness to candidate profile
    profile_groundedness: float = 0.0
    unsupported_bullet_count: int = 0
    bullet_count: int = 0
    profile_embedding_groundedness: float | None = None

    # Rule-based compliance
    checklist_pass_rate: float = 0.0
    checklist_missing_count: int = 0
    checklist_warning_count: int = 0
    checklist_required_missing_count: int = 0

    # Downstream proxy (job-resume match)
    match_score: int = 0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class ResumeRagComparison:
    """Before/after delta for one golden case."""

    case_id: str
    before: ResumeRagMetrics
    after: ResumeRagMetrics
    jd_keyword_coverage_delta: float = 0.0
    profile_groundedness_delta: float = 0.0
    match_score_delta: int = 0
    checklist_pass_rate_delta: float = 0.0
    improved: bool = False
    improvement_reasons: list[str] = field(default_factory=list)
    regression_flags: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "case_id": self.case_id,
            "before": self.before.to_dict(),
            "after": self.after.to_dict(),
            "deltas": {
                "jd_keyword_coverage": self.jd_keyword_coverage_delta,
                "profile_groundedness": self.profile_groundedness_delta,
                "match_score": self.match_score_delta,
                "checklist_pass_rate": self.checklist_pass_rate_delta,
            },
            "improved": self.improved,
            "improvement_reasons": self.improvement_reasons,
            "regression_flags": self.regression_flags,
        }


def resume_to_text(resume: dict[str, Any] | ResumeContent) -> str:
    if isinstance(resume, ResumeContent):
        resume = resume.model_dump()
    parts: list[str] = []
    profile = resume.get("profile") or {}
    for key in ("name", "email", "phone", "city", "github", "linkedin", "address"):
        val = profile.get(key, "")
        if val:
            parts.append(str(val))
    if resume.get("summary"):
        parts.append(str(resume["summary"]))
    for section in ("skills", "internships", "projects", "awards", "papers"):
        for item in resume.get(section) or []:
            parts.append(str(item.get("title", "")))
            parts.append(str(item.get("content", "")))
    return "\n".join(p for p in parts if p.strip())


def profile_to_text(profile: dict[str, Any] | CandidateProfile) -> str:
    if isinstance(profile, CandidateProfile):
        profile = profile.model_dump()
    parts: list[str] = []
    basic = profile.get("profile_basic") or {}
    for key in ("name", "email", "phone", "city", "school"):
        val = basic.get(key, "")
        if val:
            parts.append(str(val))
    for mat in profile.get("materials") or []:
        parts.append(str(mat.get("content", "")))
    for fact in profile.get("facts") or []:
        parts.append(str(fact.get("content", "")))
    return "\n".join(p for p in parts if p.strip())


def extract_resume_bullets(resume: dict[str, Any] | ResumeContent) -> list[str]:
    if isinstance(resume, ResumeContent):
        resume = resume.model_dump()
    bullets: list[str] = []
    if resume.get("summary"):
        bullets.append(str(resume["summary"]).strip())
    for section in ("skills", "internships", "projects", "awards", "papers"):
        for item in resume.get(section) or []:
            title = str(item.get("title", "")).strip()
            content = str(item.get("content", "")).strip()
            chunk = f"{title} — {content}".strip(" —")
            if chunk:
                bullets.append(chunk)
    return bullets


def _token_set(text: str) -> set[str]:
    tokens = re.findall(r"[a-z\u4e00-\u9fff]{2,}", normalize_text(text))
    return set(tokens)


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union else 0.0


def lexical_groundedness(bullets: list[str], profile_text: str) -> tuple[float, int]:
    """Mean max Jaccard overlap of each bullet against profile corpus (no API)."""
    profile_tokens = _token_set(profile_text)
    profile_chunks = [c.strip() for c in re.split(r"[\n;。]+", profile_text) if c.strip()]
    if not bullets:
        return 0.0, 0

    unsupported = 0
    scores: list[float] = []
    for bullet in bullets:
        bullet_tokens = _token_set(bullet)
        chunk_scores = [_jaccard(bullet_tokens, _token_set(chunk)) for chunk in profile_chunks]
        corpus_score = _jaccard(bullet_tokens, profile_tokens)
        best = max([corpus_score, *chunk_scores], default=0.0)
        scores.append(best)
        if best < 0.08 and len(bullet_tokens) >= 4:
            unsupported += 1
    return (sum(scores) / len(scores) if scores else 0.0), unsupported


async def embedding_groundedness(
    bullets: list[str],
    profile_text: str,
) -> tuple[float, int]:
    from models.embedding import aembed_documents, aembed_query

    if not bullets:
        return 0.0, 0
    profile_chunks = [c.strip() for c in re.split(r"[\n;。]+", profile_text) if c.strip()]
    if not profile_chunks:
        profile_chunks = [profile_text[:2000]]

    profile_vecs = await aembed_documents(profile_chunks)
    bullet_vecs = await aembed_documents(bullets)

    unsupported = 0
    scores: list[float] = []
    for bullet, bvec in zip(bullets, bullet_vecs):
        sims = [cosine_similarity(bvec, pvec) for pvec in profile_vecs]
        best = max(sims, default=0.0)
        scores.append(best)
        if best < 0.45:
            unsupported += 1
    return (sum(scores) / len(scores) if scores else 0.0), unsupported


async def jd_embedding_similarity(resume_text: str, jd_text: str) -> float:
    from models.embedding import aembed_query

    vec_resume = await aembed_query(resume_text[:6000])
    vec_jd = await aembed_query(jd_text[:6000])
    return cosine_similarity(vec_resume, vec_jd)


def _normalize_skill(skill: str) -> str:
    return normalize_text(skill)


def _extract_job_skills(job: dict[str, Any], jd_text: str) -> list[str]:
    skills = job.get("skills") or []
    if isinstance(skills, str):
        skills = [s.strip() for s in re.split(r"[,，;；|/\n]", skills) if s.strip()]
    from_desc = re.findall(r"[a-z\u4e00-\u9fff]{2,30}", normalize_text(jd_text))
    unique: set[str] = set()
    for s in skills:
        n = _normalize_skill(str(s))
        if n:
            unique.add(n)
    for token in from_desc[:30]:
        unique.add(token)
    return sorted(unique)


def _extract_resume_skills(resume: dict[str, Any]) -> list[str]:
    skills: set[str] = set()
    for section in ("skills", "internships", "projects"):
        for item in resume.get(section) or []:
            for token in re.split(r"[,，;；|/\n\s]+", f"{item.get('title', '')} {item.get('content', '')}"):
                n = _normalize_skill(token)
                if len(n) > 2:
                    skills.add(n)
    if resume.get("summary"):
        for token in re.split(r"[,，;；\s]+", str(resume["summary"])):
            n = _normalize_skill(token)
            if len(n) > 2:
                skills.add(n)
    return sorted(skills)


def compute_match_score(job: dict[str, Any], resume: dict[str, Any], jd_text: str) -> int:
    """Python mirror of server/src/services/match.service.js scoreJobResume (0-100)."""
    job_skills = _extract_job_skills(job, jd_text)
    resume_skills = _extract_resume_skills(resume)

    if not job_skills:
        skill_score = 30
    elif not resume_skills:
        skill_score = 15
    else:
        matched = [
            js for js in job_skills
            if any(rs in js or js in rs for rs in resume_skills)
        ]
        ratio = len(matched) / len(job_skills)
        skill_score = round(min(50, ratio * 50))

    job_edu = _normalize_skill(job.get("education") or "")
    if not job_edu or "no requirement" in job_edu or "无" in job_edu:
        edu_score = 10
    else:
        resume_text = normalize_text(json.dumps(resume, ensure_ascii=False))
        levels = ["phd", "doctor", "博士", "master", "硕士", "bachelor", "本科", "diploma", "专科"]
        job_level = next((i for i, l in enumerate(levels) if l in job_edu), -1)
        resume_level = next((i for i, l in enumerate(levels) if l in resume_text), -1)
        if job_level >= 0 and resume_level >= 0 and resume_level <= job_level:
            edu_score = 15
        elif resume_text and job_edu:
            edu_score = 8
        else:
            edu_score = 5

    work_sections = (resume.get("internships") or []) + (resume.get("projects") or [])
    if not work_sections:
        exp_score = 5
    else:
        years_proxy = len(work_sections)
        job_exp = _normalize_skill(job.get("work_experience") or "")
        if "10+" in job_exp and years_proxy >= 3:
            exp_score = 20
        elif "5" in job_exp and years_proxy >= 2:
            exp_score = 18
        elif "3" in job_exp and years_proxy >= 1:
            exp_score = 16
        elif "1" in job_exp or "less" in job_exp:
            exp_score = 15
        else:
            exp_score = 12

    desc = normalize_text(f"{job.get('title', '')} {job.get('description', '')} {jd_text}")
    resume_text = normalize_text(json.dumps(resume, ensure_ascii=False))
    keywords = [w for w in desc.split() if len(w) > 3][:40]
    hits = [k for k in keywords if k in resume_text]
    desc_score = min(15, round((len(hits) / max(len(keywords), 1)) * 15))

    raw = skill_score + edu_score + exp_score + desc_score
    return min(100, max(0, round(raw)))


def _checklist_metrics(
    resume: dict[str, Any],
    profile: dict[str, Any],
    *,
    language: str,
    employer_type: str,
) -> dict[str, int | float]:
    from tools.resume_language_checklist import check_resume_language_requirements

    state = CopilotState(
        candidate_profile=CandidateProfile.model_validate(profile),
        resume_content_json=ResumeContent.model_validate(resume),
        meta=Meta(employer_type=employer_type),
    )
    result = check_resume_language_requirements(state, language, resume=state.resume_content_json)
    total = int(result.get("total_checks") or 0)
    missing = int(result.get("missing_count") or 0)
    warnings = int(result.get("warning_count") or 0)
    required_missing = int(result.get("required_missing_count") or 0)
    pass_rate = (total - missing) / total if total else 0.0
    return {
        "checklist_pass_rate": round(pass_rate, 4),
        "checklist_missing_count": missing,
        "checklist_warning_count": warnings,
        "checklist_required_missing_count": required_missing,
    }


async def evaluate_resume_case(
    case: dict[str, Any],
    *,
    variant: str,
    use_embeddings: bool = False,
) -> ResumeRagMetrics:
    resume = case[f"resume_{variant}"]
    profile = case["candidate_profile"]
    jd_text = case["jd_text"]
    jd_keywords = case.get("jd_keywords") or []
    job = case.get("job") or {"title": "", "description": jd_text}
    language = (resume.get("meta") or {}).get("language") or case.get("language") or "en"
    employer_type = case.get("employer_type") or "private"

    resume_text = resume_to_text(resume)
    profile_text = profile_to_text(profile)
    bullets = extract_resume_bullets(resume)

    jd_cov = keyword_coverage(resume_text, jd_keywords) if jd_keywords else 0.0
    lex_ground, unsupported = lexical_groundedness(bullets, profile_text)

    metrics = ResumeRagMetrics(
        case_id=case["id"],
        variant=variant,
        jd_keyword_coverage=round(jd_cov, 4),
        profile_groundedness=round(lex_ground, 4),
        unsupported_bullet_count=unsupported,
        bullet_count=len(bullets),
        match_score=compute_match_score(job, resume, jd_text),
        **_checklist_metrics(resume, profile, language=language, employer_type=employer_type),
    )

    if use_embeddings:
        try:
            metrics.jd_embedding_similarity = round(
                await jd_embedding_similarity(resume_text, jd_text), 4
            )
            emb_ground, emb_unsupported = await embedding_groundedness(bullets, profile_text)
            metrics.profile_embedding_groundedness = round(emb_ground, 4)
            metrics.unsupported_bullet_count = emb_unsupported
        except Exception:
            pass

    return metrics


def compare_before_after(before: ResumeRagMetrics, after: ResumeRagMetrics) -> ResumeRagComparison:
    jd_delta = after.jd_keyword_coverage - before.jd_keyword_coverage
    ground_delta = after.profile_groundedness - before.profile_groundedness
    match_delta = after.match_score - before.match_score
    checklist_delta = after.checklist_pass_rate - before.checklist_pass_rate

    reasons: list[str] = []
    regressions: list[str] = []

    if jd_delta > 0:
        reasons.append(f"JD keyword coverage +{jd_delta:.2%}")
    if match_delta > 0:
        reasons.append(f"match score +{match_delta}")
    if checklist_delta > 0:
        reasons.append(f"checklist pass rate +{checklist_delta:.2%}")
    if after.checklist_required_missing_count < before.checklist_required_missing_count:
        reasons.append("fewer required checklist gaps")

    if ground_delta < -0.05:
        regressions.append(f"profile groundedness dropped {ground_delta:.2%}")
    if after.unsupported_bullet_count > before.unsupported_bullet_count:
        regressions.append("more unsupported bullets (possible hallucination)")
    if match_delta < 0:
        regressions.append(f"match score decreased by {abs(match_delta)}")

    improved = (
        not regressions
        and (jd_delta > 0 or match_delta > 0 or checklist_delta > 0)
        and ground_delta >= -0.03
    )

    return ResumeRagComparison(
        case_id=before.case_id,
        before=before,
        after=after,
        jd_keyword_coverage_delta=round(jd_delta, 4),
        profile_groundedness_delta=round(ground_delta, 4),
        match_score_delta=match_delta,
        checklist_pass_rate_delta=round(checklist_delta, 4),
        improved=improved,
        improvement_reasons=reasons,
        regression_flags=regressions,
    )
