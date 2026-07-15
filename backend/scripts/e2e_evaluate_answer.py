#!/usr/bin/env python
"""E2E: 上传简历 → JD → 题库 → Submit Answer（evaluate_answer）→ 校验反馈字段。

Usage (backend on :8000):
  python scripts/e2e_evaluate_answer.py
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
OUT = _BACKEND / "tests" / "fixtures" / "e2e_evaluate_answer_last_run.json"

JD = """Job Title: Fund Operations Associate（基金运营专员）
Company Type: Private Asset Management / Fund Operations
Responsibilities:
- Support daily fund operations including NAV review, trade settlement, and cash reconciliation
- Maintain investor registers and capital call / distribution records
Requirements:
- Bachelor in Finance/Economics/Accounting
- Strong Excel; fund ops or middle-office preferred
"""

SAMPLE_ANSWER = (
    "In my internship at an investment firm, I reconciled daily cash positions across "
    "custodian statements and internal records. When I found a 2-day settlement mismatch, "
    "I traced it to a delayed trade confirmation, escalated to the operations lead, and "
    "updated our checklist so the same exception would be caught earlier. I am applying "
    "because fund operations matches my attention to process accuracy and cross-team communication."
)


def chat(session_id: str, message: str, *, forced_intent: str = "", language: str = "en",
         language_scope: str = "page", attachments=None):
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
    name = ""
    facts = 0
    for attempt in range(1, 4):
        b64 = base64.b64encode(PDF.read_bytes()).decode("ascii")
        r, sec = chat("", "", forced_intent="upload_profile", attachments=[{
            "filename": PDF.name,
            "content": b64,
            "content_encoding": "base64",
        }])
        print(f"  attempt={attempt} status={r.status_code} time={sec}s")
        if r.status_code != 200:
            print(r.text[:500])
            continue
        data = r.json()
        session_id = data["session_id"]
        name = ((data.get("candidate_profile") or {}).get("profile_basic") or {}).get("name") or ""
        facts = len(((data.get("candidate_profile") or {}).get("facts") or []))
        print(f"  session={session_id} name={name!r} facts={facts}")
        if facts > 0:
            break
    if facts <= 0:
        print("[FAIL] empty profile")
        return 1

    print("\n=== 2) submit JD ===")
    r, sec = chat(session_id, JD, forced_intent="upload_jd")
    print(f"  status={r.status_code} time={sec}s")
    if r.status_code != 200:
        print(r.text[:500])
        return 1
    print(f"  job={(r.json().get('job') or {}).get('title')}")

    print("\n=== 3) generate question bank (quick) ===")
    msg = (
        "Please generate interview questions based on my candidate profile and optional job description. "
        "Target role: Fund Operations Associate. Industry: Finance. "
        "Interview tone: professional. Program version: quick."
    )
    r, sec = chat(
        session_id, msg,
        forced_intent="start_interview",
        language="en",
        language_scope="interview_question",
    )
    print(f"  status={r.status_code} time={sec}s")
    if r.status_code != 200:
        print(r.text[:800])
        return 1
    data = r.json()
    qa_list = data.get("interview_qa") or []
    print(f"  agents={data.get('triggered_agents')} count={len(qa_list)}")
    if not qa_list:
        print("[FAIL] no interview_qa")
        OUT.write_text(json.dumps({"ok": False, "step": "questions", "data": data}, ensure_ascii=False, indent=2), encoding="utf-8")
        return 1

    q0 = qa_list[0]
    qid = q0.get("id") or "q_0"
    print(f"  Q0 id={qid}")
    print(f"  Q0 text={(q0.get('question') or '')[:160]}")

    print("\n=== 4) submit answer (evaluate_answer) ===")
    eval_msg = f"Evaluate my answer to question {qid}: {SAMPLE_ANSWER}"
    r, sec = chat(
        session_id, eval_msg,
        forced_intent="evaluate_answer",
        language="en",
        language_scope="interview_feedback",
    )
    print(f"  status={r.status_code} time={sec}s")
    if r.status_code != 200:
        print(r.text[:1200])
        OUT.write_text(json.dumps({"ok": False, "step": "evaluate", "status": r.status_code, "body": r.text[:2000]}, ensure_ascii=False, indent=2), encoding="utf-8")
        return 1

    data = r.json()
    agents = data.get("triggered_agents") or []
    score = data.get("score")
    strengths = data.get("strengths") or []
    improvements = data.get("improvements") or []
    suggestions = data.get("suggestions") or []
    judge = data.get("judge_scores")
    reply = (data.get("reply_message") or "")[:240]

    print(f"  agents={agents}")
    print(f"  score={score}")
    print(f"  strengths({len(strengths)})={strengths[:3]}")
    print(f"  improvements({len(improvements)})={improvements[:3]}")
    print(f"  suggestions({len(suggestions)})={suggestions[:3]}")
    print(f"  judge_scores={judge}")
    print(f"  reply={reply!r}")

    result = {
        "ok": False,
        "session_id": session_id,
        "question_id": qid,
        "question": q0.get("question"),
        "seconds_evaluate": sec,
        "agents": agents,
        "score": score,
        "strengths": strengths,
        "improvements": improvements,
        "suggestions": suggestions,
        "judge_scores": judge,
        "reply_preview": reply,
    }

    has_feedback = (
        score is not None
        or strengths
        or improvements
        or suggestions
    )
    agent_ok = "answer_evaluation_agent" in agents
    result["ok"] = bool(has_feedback and agent_ok)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n  wrote {OUT}")

    if not agent_ok:
        print("[FAIL] answer_evaluation_agent not triggered")
        return 1
    if not has_feedback:
        print("[FAIL] empty feedback fields (score/strengths/improvements/suggestions)")
        return 1

    print("[OK] evaluate_answer returned structured feedback")
    return 0


if __name__ == "__main__":
    sys.exit(main())
