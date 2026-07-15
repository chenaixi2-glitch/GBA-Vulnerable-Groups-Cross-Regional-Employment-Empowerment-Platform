#!/usr/bin/env python
"""E2E: Chen Aixi Financial Analyst PDF → 基金运营 JD → 生成面试题库。

Usage (backend running on :8000):
  python scripts/e2e_fund_ops_interview.py
"""

from __future__ import annotations

import base64
import json
import sys
import time
from collections import Counter
from pathlib import Path

import requests

BASE = "http://127.0.0.1:8000"
TIMEOUT = 600
_BACKEND = Path(__file__).resolve().parent.parent
_REPO = _BACKEND.parent
PDF = _REPO / "test-data" / "aixi" / "Chen_Aixi__Financial_Analyst.pdf"
OUT = _BACKEND / "tests" / "fixtures" / "e2e_fund_ops_interview_last_run.json"

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


def chat(session_id: str, message: str, *, forced_intent: str = "", language: str = "zh", language_scope: str = "page", attachments=None):
    payload = {
        "session_id": session_id,
        "message": message,
        "attachments": attachments or [],
        "language": language,
        "language_scope": language_scope,
        "forced_intent": forced_intent,
    }
    t0 = time.time()
    r = requests.post(f"{BASE}/api/chat", json=payload, timeout=TIMEOUT)
    return r, round(time.time() - t0, 1)


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
    facts = 0
    name = ""
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
    print(f"  status={r.status_code} time={sec}s agents={r.json().get('triggered_agents') if r.status_code == 200 else r.text[:200]}")
    if r.status_code != 200:
        return 1
    job = (r.json().get("job") or {})
    print(f"  job.title={job.get('title')}")

    print("\n=== 3) generate interview questions (quick) ===")
    message = (
        "Please generate interview questions based on my candidate profile and optional job description. "
        "Target role: Fund Operations Associate. "
        "Industry: Finance / Asset Management. "
        "Employer type: private. "
        "Experience level: Entry Level (0-2 years). "
        "Interview tone: professional. "
        "Program version: quick."
    )
    r, sec = chat(
        session_id,
        message,
        forced_intent="start_interview",
        language="zh",
        language_scope="interview_question",
    )
    print(f"  status={r.status_code} time={sec}s")
    if r.status_code != 200:
        print(r.text[:800])
        return 1
    data = r.json()
    agents = data.get("triggered_agents") or []
    qa_list = data.get("interview_qa") or []
    print(f"  agents={agents}")
    print(f"  interview_qa count={len(qa_list)}")

    result = {
        "session_id": session_id,
        "job_title": job.get("title"),
        "agents": agents,
        "seconds": sec,
        "count": len(qa_list),
        "stages": [],
        "sample": [],
        "ok": False,
        "error": None,
    }

    if "interview_agent" not in agents and not qa_list:
        result["error"] = f"interview_agent not triggered; agents={agents}"
        OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[FAIL] {result['error']}")
        return 1

    if not qa_list:
        result["error"] = "interview_qa empty"
        OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print("[FAIL] no questions generated")
        return 1

    stage_names = Counter((q.get("stage_name") or q.get("stage_id") or "?") for q in qa_list)
    result["stages"] = dict(stage_names)
    print("  stages:")
    for k, v in stage_names.items():
        print(f"    - {k}: {v}")

    has_intro = any(
        marker in (q.get("question") or "").lower()
        for q in qa_list
        for marker in ("tell me about yourself", "introduce yourself", "自我介绍")
    )
    print(f"  fixed self-intro present: {has_intro}")

    for q in qa_list[:5]:
        sample = {
            "stage": q.get("stage_name") or q.get("stage_id"),
            "category": q.get("category"),
            "question": (q.get("question") or "")[:120],
            "answer_len": len(q.get("answer") or ""),
        }
        result["sample"].append(sample)
        print(f"  Q[{sample['stage']}] {sample['question']}")
        print(f"     answer_len={sample['answer_len']}")

    missing_answers = sum(1 for q in qa_list if not (q.get("answer") or "").strip())
    print(f"  missing answers: {missing_answers}/{len(qa_list)}")

    result["ok"] = True
    result["has_self_intro"] = has_intro
    result["missing_answers"] = missing_answers
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    if missing_answers > len(qa_list) // 2:
        print("[FAIL] too many empty reference answers")
        return 1

    print(f"\n[OK] session={session_id} questions={len(qa_list)}")
    print(f"  detail → {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
