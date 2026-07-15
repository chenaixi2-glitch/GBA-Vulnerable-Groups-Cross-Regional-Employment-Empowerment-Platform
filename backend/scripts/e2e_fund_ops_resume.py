#!/usr/bin/env python
"""E2E: Chen Aixi Financial Analyst PDF → 基金运营 → 填缺口 → 生成优化简历。

Usage (backend running on :8000):
  python scripts/e2e_fund_ops_resume.py
"""

from __future__ import annotations

import base64
import json
import sys
import time
from pathlib import Path

import requests

BASE = "http://127.0.0.1:8000"
TIMEOUT = 600
_BACKEND = Path(__file__).resolve().parent.parent
_REPO = _BACKEND.parent
PDF = _REPO / "test-data" / "aixi" / "Chen_Aixi__Financial_Analyst.pdf"
OUT = _BACKEND / "tests" / "fixtures" / "e2e_fund_ops_last_run.json"

JD = """Job Title: Fund Operations Associate（基金运营专员）
Company Type: Private Asset Management / Fund Operations

Responsibilities:
- Support daily fund operations including NAV review, trade settlement, and cash reconciliation
- Maintain investor registers, capital call / distribution records, and subscription documentation
- Coordinate with custodians, administrators, and internal finance/compliance teams
- Prepare operational reports and assist with audit / regulatory data requests
- Monitor fund workflows and escalate exceptions in a timely manner

Requirements:
- Bachelor's degree in Finance, Economics, Accounting, or related field
- Strong Excel / data organization skills; familiarity with fund operations or middle-office preferred
- Careful, detail-oriented, and comfortable with process documentation
- Good communication in Chinese and English; able to work with cross-functional teams
- Internship or project experience in finance / investment research is a plus
"""


def chat(session_id: str, message: str, *, forced_intent: str = "", attachments=None):
    payload = {
        "session_id": session_id,
        "message": message,
        "attachments": attachments or [],
        "language": "zh",
        "forced_intent": forced_intent,
    }
    t0 = time.time()
    r = requests.post(f"{BASE}/api/chat", json=payload, timeout=TIMEOUT)
    elapsed = round(time.time() - t0, 1)
    return r, elapsed


def generate_stream(session_id: str, instruction: str, jd_text: str):
    t0 = time.time()
    with requests.post(
        f"{BASE}/api/resume/generate-stream",
        json={
            "session_id": session_id,
            "instruction": instruction,
            "language": "zh",
            "jd_text": jd_text,
            "industry": "Finance",
            "employer_type": "private",
            "experience_level": "Entry Level (0-2 years)",
            "clear_generated_resume": True,
            "incremental": False,
        },
        stream=True,
        timeout=TIMEOUT,
    ) as r:
        events = []
        buf = ""
        for chunk in r.iter_content(chunk_size=None, decode_unicode=True):
            if not chunk:
                continue
            buf += chunk
            while "\n\n" in buf:
                block, buf = buf.split("\n\n", 1)
                data_lines = [
                    line[6:] for line in block.splitlines()
                    if line.startswith("data: ")
                ]
                if not data_lines:
                    continue
                raw = "\n".join(data_lines).strip()
                if raw == "[DONE]":
                    continue
                try:
                    events.append(json.loads(raw))
                except json.JSONDecodeError:
                    events.append({"raw": raw[:300]})
        return r.status_code, round(time.time() - t0, 1), events


def invent_answers(gap_payload: dict) -> list[dict]:
    questions = gap_payload.get("questions_to_ask") or []
    gaps = gap_payload.get("gaps") or []
    answers = []
    for q in questions:
        target = (q.get("target_field") or "internships").lower()
        question = q.get("question") or ""
        if "quant" in question.lower() or "量化" in question or "指标" in question:
            ans = "在实习中把月度对账差异排查时间缩短约 30%，并维护约 50 个投资人档案的周度更新。"
        elif "fund" in question.lower() or "运营" in question or "NAV" in question.upper():
            ans = "协助过净值核对与资金流水勾稽；熟悉申购赎回资料归档，能配合托管/行政方催收材料。"
        elif "excel" in question.lower() or "系统" in question:
            ans = "熟练使用 Excel（VLOOKUP/透视表）整理申购赎回与对账台账，并输出周报。"
        elif target in {"projects", "project"}:
            ans = "课程项目中做过投资组合业绩归因分析，用 Python/Excel 输出持仓与收益分解报告。"
        else:
            ans = "具备跨团队沟通经验，能跟进审计/合规所需清单并按时回复资料需求。"
        answers.append({
            "question": question or f"补充 {target}",
            "answer": ans,
            "target_field": target,
            "related_fact_ids": q.get("related_section_ids") or [],
        })
    # If gap analysis returned gaps but no questions, invent clarifications from high gaps
    if not answers:
        for g in gaps[:4]:
            answers.append({
                "question": g.get("description") or g.get("type") or "能力补充",
                "answer": "有基金运营相关实习/项目接触：对账、台账维护、投资人资料整理与跨部门催收材料。",
                "target_field": (g.get("related_section_ids") or ["internships"])[0]
                if isinstance(g.get("related_section_ids"), list) and g.get("related_section_ids")
                else "internships",
                "related_fact_ids": g.get("related_section_ids") or [],
            })
    if not answers:
        answers = [{
            "question": "请补充与基金运营相关的经历",
            "answer": "实习中参与财务数据核对与台账维护，熟悉流程文档；可迁移到基金运营的 NAV/资金核对与投资人资料管理。",
            "target_field": "internships",
            "related_fact_ids": [],
        }]
    return answers


def main() -> int:
    if not PDF.exists():
        print(f"[FAIL] PDF missing: {PDF}")
        return 1

    print("=== health ===")
    try:
        h = requests.get(f"{BASE}/health", timeout=5)
        print(f"  {h.status_code} {h.json()}")
    except Exception as exc:
        print(f"[FAIL] backend not up: {exc}")
        return 1

    print("\n=== 1) upload resume ===")
    session_id = ""
    name = ""
    facts = 0
    for attempt in range(1, 3):
        b64 = base64.b64encode(PDF.read_bytes()).decode("ascii")
        r, sec = chat("", "", attachments=[{
            "filename": PDF.name,
            "content": b64,
            "content_encoding": "base64",
        }])
        print(f"  attempt={attempt} status={r.status_code} time={sec}s")
        if r.status_code != 200:
            print(r.text[:500])
            return 1
        data = r.json()
        session_id = data["session_id"]
        name = ((data.get("candidate_profile") or {}).get("profile_basic") or {}).get("name") or ""
        facts = len(((data.get("candidate_profile") or {}).get("facts") or []))
        print(f"  session={session_id} name={name!r} facts={facts} agents={data.get('triggered_agents')}")
        if facts > 0 and name:
            break
        print("  profile empty — retrying upload once")
    if facts <= 0:
        print("[FAIL] profile still empty after retry")
        return 1

    print("\n=== 2) submit JD (基金运营) ===")
    r, sec = chat(session_id, JD, forced_intent="upload_jd")
    print(f"  status={r.status_code} time={sec}s agents={r.json().get('triggered_agents') if r.status_code==200 else r.text[:200]}")
    if r.status_code != 200:
        return 1
    jd_data = r.json()
    job = jd_data.get("job") or {}
    print(f"  job.title={job.get('title')}")

    print("\n=== 3) gap analysis ===")
    r, sec = chat(
        session_id,
        "Please analyze skill gaps between my profile and the Fund Operations role.",
        forced_intent="gap_analysis",
    )
    print(f"  status={r.status_code} time={sec}s")
    if r.status_code != 200:
        print(r.text[:500])
        return 1
    gap_data = r.json()
    gaps = gap_data.get("gaps") or []
    questions = gap_data.get("questions_to_ask") or []
    removals = gap_data.get("experiences_to_remove") or []
    print(f"  gaps={len(gaps)} questions={len(questions)} removals={len(removals)}")
    for g in gaps[:5]:
        print(f"    - [{g.get('severity')}] {g.get('type')}: {(g.get('description') or '')[:80]}")
    for q in questions[:5]:
        print(f"    ? {q.get('question')}")

    print("\n=== 4) fill clarifications (synthetic) ===")
    answers = invent_answers(gap_data)
    for a in answers:
        print(f"  Q: {a['question'][:70]}")
        print(f"  A: {a['answer'][:90]}")
    sections = [
        "Please update my candidate profile for resume optimization based on the feedback below.",
        "Use only the facts I provide — do not invent numbers or achievements.",
        "",
        "CLARIFICATIONS (add or update profile facts from my answers):",
    ]
    for a in answers:
        meta = []
        if a.get("target_field"):
            meta.append(f"target_field={a['target_field']}")
        related = a.get("related_fact_ids") or []
        if related:
            meta.append(f"related_fact_ids={','.join(map(str, related))}")
        header = f" [{'|'.join(meta)}]" if meta else ""
        sections.append(f"Q{header}: {a['question']}\nA: {a['answer']}")
    r, sec = chat(session_id, "\n".join(sections), forced_intent="profile_patch")
    print(f"  status={r.status_code} time={sec}s agents={r.json().get('triggered_agents') if r.status_code==200 else r.text[:300]}")
    if r.status_code != 200:
        return 1
    patched = r.json().get("candidate_profile") or {}
    print(f"  facts after patch: {len(patched.get('facts') or [])}")

    print("\n=== 5) generate optimized resume ===")
    instruction = (
        "请基于我的经历与目标基金运营岗位生成定制简历。"
        "突出对账、台账、投资人资料与跨团队协作等可迁移能力；"
        "量化指标仅使用我已提供的事实，禁止捏造；控制在一页 A4。"
    )
    status, sec, events = generate_stream(session_id, instruction, JD)
    print(f"  http={status} time={sec}s events={len(events)}")
    phases = [e.get("phase") or e.get("type") for e in events]
    print(f"  phases={phases}")

    final = None
    error = None
    for e in events:
        if e.get("type") == "error" or e.get("error"):
            error = e
        if e.get("type") in {"complete", "done", "result"} or e.get("resume_content_json"):
            final = e
    # Prefer last event that has resume_content_json
    for e in reversed(events):
        if e.get("resume_content_json"):
            final = e
            break
        if e.get("type") == "error":
            error = e
            break

    result = {
        "session_id": session_id,
        "job_title": job.get("title"),
        "gaps": gaps,
        "questions": questions,
        "answers": answers,
        "generate_status": status,
        "generate_seconds": sec,
        "phases": phases,
        "error": error,
        "resume_summary": None,
        "resume_counts": None,
    }

    if error:
        print(f"[FAIL] generate error: {error}")
        OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  wrote {OUT}")
        return 1

    if not (final and final.get("resume_content_json")):
        print("[FAIL] no resume_content_json in stream events")
        OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        return 1

    rcj = (final or {}).get("resume_content_json") or {}
    result["resume_summary"] = (rcj.get("summary") or "")[:200]
    result["resume_counts"] = {
        "skills": len(rcj.get("skills") or []),
        "internships": len(rcj.get("internships") or []),
        "projects": len(rcj.get("projects") or []),
        "awards": len(rcj.get("awards") or []),
    }
    print(f"  summary: {result['resume_summary']}")
    print(f"  counts: {result['resume_counts']}")
    if not result["resume_counts"]["internships"] and not result["resume_counts"]["projects"]:
        print("[FAIL] polished experience modules still empty")
        OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        return 1
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n[OK] session={session_id}")
    print(f"  detail → {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
