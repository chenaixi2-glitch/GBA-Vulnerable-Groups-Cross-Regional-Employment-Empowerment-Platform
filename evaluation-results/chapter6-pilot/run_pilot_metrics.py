"""
Chapter-6 pilot metrics (offline, no live LLM required).

Produces:
  - Multilingual resume mixing-detection consistency (zh / zh-TW / en / pt)
  - Structured field presence checks on aixi resume fixtures (proxy for extraction coverage)
  - Job–resume match ranking agreement vs hand labels (Node scoreJobResume)
  - Interview feedback actionability rate on e2e evaluate fixtures

Run from repo root:
  node evaluation-results/chapter6-pilot/run_match_pilot.js
  python evaluation-results/chapter6-pilot/run_pilot_metrics.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
BACKEND = REPO / "backend"
sys.path.insert(0, str(BACKEND))

from tools.resume_language_checklist import _detect_language_mixing  # noqa: E402
from workflow.state import ResumeContent, ResumeContentMeta, ResumeProfile, SectionItem  # noqa: E402


OUT_DIR = Path(__file__).resolve().parent


def _resume(lang: str, summary: str, internship: str, skills: str = "Python, Excel") -> ResumeContent:
    return ResumeContent(
        profile=ResumeProfile(name="Pilot User", email="pilot@example.com"),
        summary=summary,
        skills=[SectionItem(id="s1", title="Skills", content=skills)],
        internships=[SectionItem(id="i1", title="Ops Intern", content=internship)],
        meta=ResumeContentMeta(language=lang, target_role="Fund Operations Associate"),
    )


def multilingual_consistency_pilot() -> dict:
    """
    For each target language, build one clean sample and one intentionally mixed sample.
    Expect: clean → 0 mixing flags; mixed → ≥1 flag.
    """
    cases = [
        {
            "lang": "zh",
            "clean_summary": "具备基金运营与现金对账经验，熟悉结算流程。",
            "clean_intern": "负责日常现金核对与异常上报，缩短处理周期。",
            "mixed_summary": "具备基金运营经验，熟悉 settlement processing。",
            "mixed_intern": "负责 developed 对账模块，提升效率 20%。",
        },
        {
            "lang": "zh-TW",
            "clean_summary": "具備基金運營與現金對賬經驗，熟悉結算流程。",
            "clean_intern": "負責日常現金核對與異常上報，縮短處理週期。",
            "mixed_summary": "具備基金運營經驗，熟悉 settlement processing。",
            "mixed_intern": "負責 developed 對賬模組，提升效率 20%。",
        },
        {
            "lang": "en",
            "clean_summary": "Experienced in fund operations and daily cash reconciliation.",
            "clean_intern": "Owned daily cash checks and escalation of anomalies.",
            "mixed_summary": "Experienced in fund operations and 现金对账.",
            "mixed_intern": "负责 daily cash reconciliation and settlement.",
        },
        {
            "lang": "pt",
            "clean_summary": "Experiência em operações de fundos e reconciliação de caixa.",
            "clean_intern": "Responsável pela verificação diária de caixa e escalação de anomalias.",
            "mixed_summary": "Experiência em operações de fundos e 现金对账.",
            "mixed_intern": "负责 reconciliação diária de caixa.",
        },
    ]

    rows = []
    ok = 0
    for c in cases:
        clean = _resume(c["lang"], c["clean_summary"], c["clean_intern"])
        mixed = _resume(c["lang"], c["mixed_summary"], c["mixed_intern"])
        clean_flags = _detect_language_mixing(clean, c["lang"])
        mixed_flags = _detect_language_mixing(mixed, c["lang"])
        clean_pass = len(clean_flags) == 0
        mixed_pass = len(mixed_flags) >= 1
        case_ok = clean_pass and mixed_pass
        if case_ok:
            ok += 1
        rows.append(
            {
                "language": c["lang"],
                "clean_flags": clean_flags,
                "mixed_flags": mixed_flags,
                "clean_pass": clean_pass,
                "mixed_pass": mixed_pass,
                "pass": case_ok,
            }
        )

    return {
        "name": "multilingual_resume_mixing_consistency",
        "sample_languages": 4,
        "cases_per_language": 2,
        "total_cases": 8,
        "passed": ok,
        "pass_rate": round(ok / len(cases), 4),
        "detail": rows,
        "note": "Offline checklist detector on synthetic clean/mixed samples for zh/zh-TW/en/pt.",
    }


def profile_field_coverage_pilot() -> dict:
    """
    Proxy for structured extraction coverage using golden aixi target-config +
    resume-gen fixture facts (no live LLM). Counts expected core fields present.
    """
    fixture = json.loads((BACKEND / "tests" / "fixtures" / "resume_gen_ready.json").read_text(encoding="utf-8"))
    state = fixture.get("state") or fixture
    profile = (
        state.get("candidate_profile")
        or fixture.get("candidate_profile")
        or fixture.get("profile")
        or {}
    )
    basic = profile.get("profile_basic") or profile.get("basic") or {}
    facts = profile.get("facts") or []

    fact_types = {str(f.get("type")) for f in facts if isinstance(f, dict)}

    # Also inspect aixi target config presence
    aixi_target = json.loads((REPO / "test-data" / "aixi" / "target-config.json").read_text(encoding="utf-8"))
    aixi_ok = bool(aixi_target.get("employer_type") and aixi_target.get("industry"))
    job = state.get("job") or {}
    has_job_skills = bool(job.get("hard_skills") or job.get("tech_stack"))

    core_checks = [
        ("has_name_or_full_name", bool(basic.get("name") or basic.get("full_name"))),
        ("has_email", bool(basic.get("email"))),
        ("has_any_fact", len(facts) > 0),
        ("has_skill_or_experience_fact", bool(fact_types & {"skill", "internship", "work", "project"})),
        ("has_structured_job_skills", has_job_skills),
        ("aixi_target_config_complete", aixi_ok),
    ]
    type_hits = len(fact_types & {"education", "skill", "internship", "work", "project"})
    passed = sum(1 for _, v in core_checks if v)
    return {
        "name": "structured_profile_field_coverage",
        "checks": len(core_checks),
        "passed": passed,
        "accuracy": round(passed / len(core_checks), 4),
        "fact_types_present": sorted(fact_types),
        "expected_type_hits": type_hits,
        "detail": [{k: v} for k, v in core_checks],
        "note": "Fixture-based field presence (proxy). Live LLM extraction accuracy requires API e2e.",
    }


def interview_actionability_pilot() -> dict:
    """
    Score evaluate-answer fixture: improvements/suggestions that contain imperative
    or concrete pattern count as actionable.
    """
    path = BACKEND / "tests" / "fixtures" / "e2e_evaluate_answer_last_run.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    items = list(data.get("improvements") or []) + list(data.get("suggestions") or [])
    # Heuristic: actionable if contains concrete cue words
    cues = re.compile(
        r"\b(quantif|STAR|example|specific|include|provide|try to|state|demonstrat|Excel|data|result)\b",
        re.I,
    )
    actionable = [t for t in items if cues.search(t)]
    rate = round(len(actionable) / max(len(items), 1), 4)

    # Also pull interactive interview bank health
    bank = json.loads((BACKEND / "tests" / "fixtures" / "e2e_fund_ops_interview_last_run.json").read_text(encoding="utf-8"))
    return {
        "name": "interview_feedback_actionability",
        "feedback_items": len(items),
        "actionable_items": len(actionable),
        "actionable_rate": rate,
        "judge_scores": data.get("judge_scores"),
        "overall_score": data.get("score"),
        "question_bank_ok": bool(bank.get("ok")),
        "question_bank_count": bank.get("count"),
        "missing_answers": bank.get("missing_answers"),
        "has_self_intro": bank.get("has_self_intro"),
        "note": "Pilot on stored e2e evaluate-answer + fund-ops interview fixtures.",
    }


def load_match_pilot() -> dict | None:
    match_path = OUT_DIR / "match_pilot_report.json"
    if match_path.exists():
        return json.loads(match_path.read_text(encoding="utf-8"))
    return None


def main() -> None:
    report = {
        "generated_for": "Chapter 6 pilot metrics",
        "multilingual": multilingual_consistency_pilot(),
        "profile_coverage": profile_field_coverage_pilot(),
        "interview": interview_actionability_pilot(),
        "match": load_match_pilot(),
        "unit_tests_reference": {
            "planner_rule_routing": "evaluation-results/planner-routing/latest — 20 cases, 100% intent & chain accuracy (rule_only)",
            "chain_consistency": "evaluation-results/chain-consistency/latest — 2/5 pass (40%) on adversarial + happy paths",
            "pytest_core_ai_subset": "55 passed in language/checklist/planner/interview/profile/normalize suite (1 unrelated custom-stage fail)",
        },
    }
    out = OUT_DIR / "pilot_metrics_report.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    md = OUT_DIR / "summary.md"
    m = report["multilingual"]
    p = report["profile_coverage"]
    i = report["interview"]
    match = report["match"]
    lines = [
        "# Chapter 6 Pilot Metrics Summary",
        "",
        "## Multilingual resume consistency (zh / zh-TW / en / pt)",
        f"- Languages: {m['sample_languages']}; cases: {m['total_cases']} (clean+mixed per language)",
        f"- Pass rate: **{m['pass_rate']*100:.1f}%** ({m['passed']}/{m['sample_languages']} language pairs fully correct)",
        "",
        "## Structured profile field coverage (fixture proxy)",
        f"- Checks passed: **{p['passed']}/{p['checks']}** (accuracy {p['accuracy']*100:.1f}%)",
        f"- Fact types present: {', '.join(p['fact_types_present']) or '(none)'}",
        "",
        "## Interview feedback actionability",
        f"- Actionable feedback rate: **{i['actionable_rate']*100:.1f}%** ({i['actionable_items']}/{i['feedback_items']})",
        f"- Judge scores: {i.get('judge_scores')}",
        f"- Question bank fixture: ok={i['question_bank_ok']}, count={i['question_bank_count']}, missing_answers={i['missing_answers']}",
        "",
    ]
    if match:
        lines += [
            "## Job–resume match ranking (Node rule scorer)",
            f"- Cases: {match.get('cases')}",
            f"- Ranking agreement vs hand labels: **{match.get('ranking_agreement_rate', 0)*100:.1f}%**",
            f"- Score-band agreement: **{match.get('band_agreement_rate', 0)*100:.1f}%**",
            "",
        ]
    else:
        lines += [
            "## Job–resume match ranking",
            "- Run `node evaluation-results/chapter6-pilot/run_match_pilot.js` first.",
            "",
        ]
    lines += [
        "## Existing offline evaluations reused",
        "- Planner routing (rule_only): 20/20 intent & chain accuracy",
        "- Chain consistency: 2/5 pass (documents failure modes for incomplete render)",
        "",
    ]
    md.write_text("\n".join(lines), encoding="utf-8")
    print(md.read_text(encoding="utf-8"))
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
