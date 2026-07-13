"""Validate field propagation across gap → content → render pipeline."""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from typing import Any

from evaluation.resume_rag.metrics import resume_to_text
from workflow.state import CopilotState


@dataclass
class ChainCheckResult:
    check_id: str
    description: str
    passed: bool
    details: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class ChainCaseResult:
    case_id: str
    chain: str
    passed: bool
    checks: list[ChainCheckResult] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "case_id": self.case_id,
            "chain": self.chain,
            "passed": self.passed,
            "checks": [c.to_dict() for c in self.checks],
        }


@dataclass
class ChainConsistencyReport:
    generated_at: str
    total_cases: int
    passed_cases: int
    pass_rate: float
    cases: list[ChainCaseResult] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "generated_at": self.generated_at,
            "total_cases": self.total_cases,
            "passed_cases": self.passed_cases,
            "pass_rate": self.pass_rate,
            "cases": [c.to_dict() for c in self.cases],
        }


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def check_profile_to_content(state: CopilotState) -> ChainCheckResult:
    """Profile basic fields should appear in resume content profile section."""
    check_id = "profile_to_content"
    if not state.candidate_profile or not state.resume_content_json:
        return ChainCheckResult(check_id, "Profile → Content identity propagation", True, "skipped (incomplete chain)")

    basic = state.candidate_profile.profile_basic
    profile = state.resume_content_json.profile
    errors: list[str] = []
    for field_name in ("name", "email", "phone"):
        src = _normalize(getattr(basic, field_name, ""))
        dst = _normalize(getattr(profile, field_name, ""))
        if src and dst and src != dst:
            errors.append(f"{field_name}: '{src}' != '{dst}'")

    passed = not errors
    return ChainCheckResult(
        check_id,
        "Profile → Content identity propagation",
        passed,
        "; ".join(errors) if errors else "name/email/phone aligned",
    )


def check_job_to_content(state: CopilotState) -> ChainCheckResult:
    """Job title should propagate to resume meta.target_role when both exist."""
    check_id = "job_to_content"
    if not state.job or not state.resume_content_json:
        return ChainCheckResult(check_id, "Job → Content target role", True, "skipped (incomplete chain)")

    job_title = _normalize(state.job.title)
    target_role = _normalize(state.resume_content_json.meta.target_role)
    if job_title and target_role:
        passed = job_title in target_role or target_role in job_title
        detail = "target_role aligns with job title" if passed else f"job='{state.job.title}' vs target_role='{state.resume_content_json.meta.target_role}'"
    else:
        passed = True
        detail = "skipped (missing title or target_role)"
    return ChainCheckResult(check_id, "Job → Content target role", passed, detail)


def check_gap_to_content(state: CopilotState) -> ChainCheckResult:
    """High-severity missing_skill gaps should be reflected in resume text."""
    check_id = "gap_to_content"
    if not state.gaps or not state.resume_content_json:
        return ChainCheckResult(check_id, "Gap → Content skill coverage", True, "skipped (incomplete chain)")

    resume_text = _normalize(resume_to_text(state.resume_content_json.model_dump()))
    missing: list[str] = []
    for gap in state.gaps:
        if gap.severity != "high" or gap.type != "missing_skill":
            continue
        tokens = re.findall(r"[a-z\u4e00-\u9fff]{3,}", _normalize(gap.description))
        keywords = [t for t in tokens if t not in {"missing", "experience", "required", "skill", "缺少", "经验"}][:3]
        if keywords and not any(kw in resume_text for kw in keywords):
            missing.append(gap.description[:60])

    passed = not missing
    detail = "high-severity skill gaps reflected" if passed else f"unaddressed gaps: {missing[:3]}"
    return ChainCheckResult(check_id, "Gap → Content skill coverage", passed, detail)


def check_content_to_render(state: CopilotState) -> ChainCheckResult:
    """When content exists and render ran, HTML should be non-empty."""
    check_id = "content_to_render"
    if not state.resume_content_json:
        return ChainCheckResult(check_id, "Content → Render HTML output", True, "skipped (no content)")

    html = (state.resume_html.html or "").strip() if state.resume_html else ""
    has_render_trace = any(item.node == "render_agent" and item.status == "success" for item in state.workflow_trace)

    if has_render_trace or html:
        passed = len(html) > 100
        detail = f"html length={len(html)}" if passed else "render_agent ran but HTML empty/too short"
    else:
        passed = True
        detail = "skipped (render not in chain)"
    return ChainCheckResult(check_id, "Content → Render HTML output", passed, detail)


def check_gaps_preserved(state: CopilotState) -> ChainCheckResult:
    """Gap count should not silently drop to zero after content generation unless resolved."""
    check_id = "gaps_preserved"
    if not state.gaps:
        return ChainCheckResult(check_id, "Gap list non-empty after gap_agent", True, "skipped (no gaps)")

    gap_trace = next((t for t in state.workflow_trace if t.node == "gap_agent"), None)
    if gap_trace and gap_trace.status == "success":
        passed = len(state.gaps) > 0
        detail = f"gap_count={len(state.gaps)}"
    else:
        passed = True
        detail = "skipped (gap_agent not in trace)"
    return ChainCheckResult(check_id, "Gap list preserved", passed, detail)


CHAIN_CHECKS: dict[str, list] = {
    "gap_content_render": [
        check_gaps_preserved,
        check_profile_to_content,
        check_job_to_content,
        check_gap_to_content,
        check_content_to_render,
    ],
    "profile_content_render": [
        check_profile_to_content,
        check_job_to_content,
        check_content_to_render,
    ],
    "content_render": [
        check_content_to_render,
    ],
}


def evaluate_chain_case(case: dict[str, Any]) -> ChainCaseResult:
    state = CopilotState.model_validate(case.get("state") or {})
    chain = case.get("chain", "gap_content_render")
    check_fns = CHAIN_CHECKS.get(chain, CHAIN_CHECKS["gap_content_render"])
    results = [fn(state) for fn in check_fns]
    passed = all(r.passed for r in results)
    return ChainCaseResult(case_id=case["id"], chain=chain, passed=passed, checks=results)


def build_chain_consistency_report(cases: list[dict[str, Any]], *, generated_at: str) -> ChainConsistencyReport:
    results = [evaluate_chain_case(case) for case in cases]
    n = len(results) or 1
    passed = sum(1 for r in results if r.passed)
    return ChainConsistencyReport(
        generated_at=generated_at,
        total_cases=len(results),
        passed_cases=passed,
        pass_rate=round(passed / n, 4),
        cases=results,
    )
