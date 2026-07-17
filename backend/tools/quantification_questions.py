"""Rule-based follow-up questions when experience entries lack quantifiable metrics."""

from __future__ import annotations

import json
import re
import uuid
from typing import Any

from workflow.state import CandidateProfile, Fact, Gap, Question

_EXPERIENCE_TYPES = frozenset({"work", "internship", "project"})
_QUANT_PATTERNS = [
    re.compile(p, re.IGNORECASE)
    for p in (
        r"\d+\s*%",
        r"\d+[万千亿]?[+]?",
        r"\d+\s*(人|个|项|次|天|月|年|user|users|client|clients|project|projects|k|m|million|billion)",
        r"(提升|降低|增长|减少|提高|优化).{0,8}\d",
        r"(increased|reduced|improved|boosted|decreased|saved|generated).{0,20}\d",
        r"by\s+\d",
        r"\d+\s*(ms|qps|tps|rps|gb|mb|tb|node|nodes|server|servers)",
    )
]

_QUESTION_TEMPLATES: dict[str, tuple[str, str]] = {
    "zh": (
        "您在「{label}」这段经历中，是否有可量化的成果数据？"
        "例如：服务用户/客户数量、性能提升比例、团队人数、项目周期、营收或成本节省等。"
        "填写真实数据为可选项；若不填写，可在上方选择「按行业标准补充」或「生成无量化指标版本」。",
        "真实数据优先；未填写时将按您选择的补充方式处理，不会在未授权时编造数字。",
    ),
    "zh-TW": (
        "您在「{label}」這段經歷中，是否有可量化的成果數據？"
        "例如：服務用戶/客戶數量、性能提升比例、團隊人數、項目週期、營收或成本節省等。"
        "填寫真實數據為可選項；若不填寫，可在上方選擇「按行業標準補充」或「生成無量化指標版本」。",
        "真實數據優先；未填寫時將按您選擇的補充方式處理，不會在未授權時編造數字。",
    ),
    "en": (
        'For your experience "{label}", do you have any quantifiable results '
        "(e.g., users/clients served, performance improvement %, team size, project duration, revenue or cost savings)? "
        "Entering real numbers is optional; if left blank, use the choice above to either apply industry-standard estimates "
        "or generate a non-quantified version.",
        "Real metrics take priority; if left blank, your selected supplementation mode applies — no inventing numbers without consent.",
    ),
    "pt": (
        'Na experiência "{label}", tem resultados quantificáveis '
        "(ex.: utilizadores/clientes, % de melhoria, tamanho da equipa, duração, receita ou poupança)? "
        "Preencher números reais é opcional; se deixar em branco, use a escolha acima para métricas típicas do setor "
        "ou uma versão sem quantificação.",
        "Números reais têm prioridade; se deixar em branco, aplica-se o modo que escolher — sem inventar valores sem autorização.",
    ),
}

_GAP_DESCRIPTIONS: dict[str, str] = {
    "zh": "关键经历缺少量化描述：{label}",
    "zh-TW": "關鍵經歷缺少量化描述：{label}",
    "en": "Key experience lacks quantified results: {label}",
    "pt": "Experiência-chave sem resultados quantificados: {label}",
}


def _normalize_lang(language: str | None) -> str:
    code = (language or "zh").strip()
    if code.lower().startswith("zh-tw") or code == "zh-TW":
        return "zh-TW"
    if code.lower().startswith("en"):
        return "en"
    if code.lower().startswith("pt"):
        return "pt"
    return "zh"


def has_quantification(text: str) -> bool:
    if not text or not text.strip():
        return False
    return any(p.search(text) for p in _QUANT_PATTERNS)


def _parse_fact_content(content: str) -> dict[str, Any]:
    content = (content or "").strip()
    if not content:
        return {}
    if content.startswith("{"):
        try:
            data = json.loads(content)
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            pass
    return {"description": content}


def _experience_label(fact: Fact) -> str:
    data = _parse_fact_content(fact.content)
    parts = [
        str(data.get("title") or "").strip(),
        str(data.get("company") or "").strip(),
        str(data.get("role") or "").strip(),
    ]
    label = " — ".join(p for p in parts if p)
    if label:
        return label[:80]
    desc = str(data.get("description") or fact.content or "").strip()
    return (desc.split("\n")[0] if desc else fact.type)[:80] or fact.type


def _experience_text(fact: Fact) -> str:
    data = _parse_fact_content(fact.content)
    chunks = [
        str(data.get("title") or ""),
        str(data.get("company") or ""),
        str(data.get("role") or ""),
        str(data.get("achievements") or ""),
        str(data.get("responsibilities") or ""),
        str(data.get("description") or ""),
        fact.content or "",
    ]
    return "\n".join(c for c in chunks if c.strip())


def _collect_experience_facts(profile: CandidateProfile) -> list[Fact]:
    experiences = [
        f for f in profile.facts
        if (f.type or "").lower() in _EXPERIENCE_TYPES and _experience_text(f).strip()
    ]
    if experiences:
        return experiences

    # Fallback: scan materials when facts are not structured yet
    fallback: list[Fact] = []
    for idx, material in enumerate(profile.materials):
        text = (material.content or "").strip()
        if not text or has_quantification(text):
            continue
        if len(text) < 40:
            continue
        fallback.append(Fact(
            id=f"mat_{idx}",
            type="project",
            content=json.dumps({"title": f"Material {idx + 1}", "description": text[:200]}, ensure_ascii=False),
            source_refs=[material.material_id],
            updated_at=material.uploaded_at,
        ))
    return fallback[:3]


def _question_exists(questions: list[Question], label: str) -> bool:
    needle = label.lower()
    for q in questions:
        if needle in (q.question or "").lower():
            return True
    return False


def _gap_exists(gaps: list[Gap], label: str) -> bool:
    needle = label.lower()
    for g in gaps:
        if g.type == "no_quantification" and needle in (g.description or "").lower():
            return True
    return False


def supplement_quantification_gaps_and_questions(
    profile: CandidateProfile | None,
    existing_gaps: list[Gap],
    existing_questions: list[Question],
    *,
    language: str | None = "zh",
    max_questions: int = 3,
) -> tuple[list[Gap], list[Question]]:
    """Add no_quantification gaps and optional user prompts for missing metrics."""
    if profile is None:
        return existing_gaps, existing_questions

    lang = _normalize_lang(language)
    q_tpl, q_reason = _QUESTION_TEMPLATES.get(lang, _QUESTION_TEMPLATES["zh"])
    gap_tpl = _GAP_DESCRIPTIONS.get(lang, _GAP_DESCRIPTIONS["zh"])

    gaps = list(existing_gaps)
    questions = list(existing_questions)
    added = 0

    for fact in _collect_experience_facts(profile):
        if added >= max_questions:
            break
        text = _experience_text(fact)
        if has_quantification(text):
            continue

        label = _experience_label(fact)
        if _question_exists(questions, label):
            continue

        if not _gap_exists(gaps, label):
            gaps.append(Gap(
                id=f"gap_quant_{uuid.uuid4().hex[:10]}",
                type="no_quantification",
                severity="medium",
                description=gap_tpl.format(label=label),
                related_section_ids=[fact.id] if fact.id else [],
                resolved=False,
                resolution_source="quantification_probe",
            ))

        fact_type = (fact.type or "").lower()
        if fact_type == "work":
            target_field = "works"
        elif fact_type == "internship":
            target_field = "internships"
        else:
            target_field = "projects"
        questions.append(Question(
            id=f"q_quant_{uuid.uuid4().hex[:10]}",
            question=q_tpl.format(label=label),
            reason=q_reason,
            target_field=target_field,
            priority="medium",
            status="pending",
            answer_ref=fact.id or "",
        ))
        added += 1

    return gaps, questions
