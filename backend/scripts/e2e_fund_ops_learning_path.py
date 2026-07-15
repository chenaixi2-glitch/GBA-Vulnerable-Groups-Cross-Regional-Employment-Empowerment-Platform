#!/usr/bin/env python
"""E2E: Chen Aixi Financial Analyst PDF → 基金运营 → 学习路线（分析 + timeline）。

Usage (backend running on :8000):
  python scripts/e2e_fund_ops_learning_path.py
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
OUT = _BACKEND / "tests" / "fixtures" / "e2e_fund_ops_learning_path_last_run.json"

JD = """Job Title: Fund Operations Associate（基金运营专员）
Company Type: Private Asset Management / Fund Operations
Industry: Finance / Asset Management
Experience Level: Entry Level (0-2 years)

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

DAILY_HOURS = 2


def chat(session_id: str, message: str, *, forced_intent: str = "", attachments=None, language: str = "en"):
    payload = {
        "session_id": session_id,
        "message": message,
        "attachments": attachments or [],
        "language": language,
        "forced_intent": forced_intent,
    }
    t0 = time.time()
    r = requests.post(f"{BASE}/api/chat", json=payload, timeout=TIMEOUT)
    elapsed = round(time.time() - t0, 1)
    return r, elapsed


def put_target_context(session_id: str, jd_text: str):
    t0 = time.time()
    r = requests.put(
        f"{BASE}/api/resume/target-context",
        json={
            "session_id": session_id,
            "jd_text": jd_text,
            "industry": "Finance",
            "employer_type": "private",
            "experience_level": "Entry Level (0-2 years)",
        },
        timeout=60,
    )
    return r, round(time.time() - t0, 1)


def main() -> int:
    summary: dict = {"ok": False, "steps": {}}

    if not PDF.exists():
        print(f"[FAIL] PDF missing: {PDF}")
        return 1

    print("=== health ===")
    try:
        h = requests.get(f"{BASE}/health", timeout=5)
        print(f"  {h.status_code} {h.json()}")
        summary["steps"]["health"] = {"status": h.status_code, "body": h.json()}
    except Exception as exc:
        print(f"[FAIL] backend not up: {exc}")
        return 1

    print("\n=== 1) upload resume PDF ===")
    session_id = ""
    name = ""
    facts = 0
    for attempt in range(1, 3):
        b64 = base64.b64encode(PDF.read_bytes()).decode("ascii")
        r, sec = chat(
            "",
            "",
            forced_intent="upload_profile",
            attachments=[{
                "filename": PDF.name,
                "content": b64,
                "content_encoding": "base64",
            }],
            language="zh",
        )
        print(f"  attempt={attempt} status={r.status_code} time={sec}s")
        if r.status_code != 200:
            print(r.text[:800])
            summary["steps"]["upload"] = {"status": r.status_code, "error": r.text[:500], "sec": sec}
            OUT.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
            return 1
        data = r.json()
        session_id = data["session_id"]
        profile = data.get("candidate_profile") or {}
        name = ((profile.get("profile_basic") or {}).get("name") or "")
        facts = len(profile.get("facts") or [])
        print(f"  session={session_id} name={name!r} facts={facts} agents={data.get('triggered_agents')}")
        summary["steps"]["upload"] = {
            "status": r.status_code,
            "sec": sec,
            "session_id": session_id,
            "name": name,
            "facts": facts,
            "agents": data.get("triggered_agents"),
            "reply": (data.get("reply_message") or "")[:200],
        }
        if facts > 0 and name:
            break
        print("  profile empty — retrying upload once")
    if facts <= 0:
        print("[FAIL] profile still empty after retry")
        OUT.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        return 1

    print("\n=== 2) sync target context + submit JD (基金运营) ===")
    r, sec = put_target_context(session_id, JD)
    print(f"  target-context status={r.status_code} time={sec}s")
    summary["steps"]["target_context"] = {"status": r.status_code, "sec": sec}
    if r.status_code not in (200, 201):
        print(r.text[:500])

    r, sec = chat(session_id, JD, forced_intent="upload_jd", language="zh")
    print(f"  upload_jd status={r.status_code} time={sec}s")
    if r.status_code != 200:
        print(r.text[:800])
        summary["steps"]["upload_jd"] = {"status": r.status_code, "error": r.text[:500], "sec": sec}
        OUT.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        return 1
    jd_data = r.json()
    job = jd_data.get("job") or {}
    print(f"  job.title={job.get('title')!r} agents={jd_data.get('triggered_agents')}")
    summary["steps"]["upload_jd"] = {
        "status": r.status_code,
        "sec": sec,
        "job_title": job.get("title"),
        "agents": jd_data.get("triggered_agents"),
        "reply": (jd_data.get("reply_message") or "")[:200],
    }

    print("\n=== 3) learning path analysis (gaps + resources) ===")
    r, sec = chat(
        session_id,
        "Please analyze my skill gaps against the target job and recommend learning resources "
        "with estimated study hours. Do not generate a timeline yet.",
        forced_intent="learning_path",
        language="en",
    )
    print(f"  status={r.status_code} time={sec}s")
    if r.status_code != 200:
        print(r.text[:800])
        summary["steps"]["analysis"] = {"status": r.status_code, "error": r.text[:500], "sec": sec}
        OUT.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        return 1
    analysis = r.json()
    gaps = analysis.get("gaps") or []
    resources = analysis.get("resources") or []
    est_hours = analysis.get("estimated_total_hours") or 0
    agents = analysis.get("triggered_agents") or []
    print(f"  agents={agents}")
    print(f"  gaps={len(gaps)} resources={len(resources)} estimated_total_hours={est_hours}")
    print(f"  reply: {(analysis.get('reply_message') or '')[:300]}")
    for g in gaps[:8]:
        print(f"    gap [{g.get('severity')}] {g.get('type')}: {(g.get('description') or '')[:90]}")
    for res in resources[:8]:
        title = res.get("title") or res.get("name") or res.get("skill") or "?"
        hours = res.get("estimated_hours") or res.get("hours") or "?"
        print(f"    resource: {title} ({hours}h)")
    summary["steps"]["analysis"] = {
        "status": r.status_code,
        "sec": sec,
        "agents": agents,
        "gaps_count": len(gaps),
        "resources_count": len(resources),
        "estimated_total_hours": est_hours,
        "gaps": gaps[:10],
        "resources": resources[:10],
        "reply": (analysis.get("reply_message") or "")[:400],
        "daily_hours": analysis.get("daily_hours"),
        "timeline_count": len(analysis.get("timeline") or []),
    }
    if "learning_path_agent" not in agents:
        print("[WARN] learning_path_agent not in triggered_agents")
    if not gaps and not resources:
        print("[FAIL] analysis returned no gaps and no resources")
        OUT.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        return 1

    print(f"\n=== 4) generate timeline ({DAILY_HOURS} hours/day) ===")
    r, sec = chat(
        session_id,
        f"Generate my learning timeline with {DAILY_HOURS} hours per day based on the analyzed "
        "gaps and resources.",
        forced_intent="learning_path",
        language="en",
    )
    print(f"  status={r.status_code} time={sec}s")
    if r.status_code != 200:
        print(r.text[:800])
        summary["steps"]["timeline"] = {"status": r.status_code, "error": r.text[:500], "sec": sec}
        OUT.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        return 1
    tl_data = r.json()
    timeline = tl_data.get("timeline") or []
    agents = tl_data.get("triggered_agents") or []
    print(f"  agents={agents}")
    print(f"  timeline_phases={len(timeline)} daily_hours={tl_data.get('daily_hours')} "
          f"estimated_total_hours={tl_data.get('estimated_total_hours')}")
    print(f"  reply: {(tl_data.get('reply_message') or '')[:300]}")
    for phase in timeline:
        print(
            f"    phase {phase.get('phase')}: {phase.get('title')} "
            f"weeks={phase.get('weeks')} skills={phase.get('skills')}"
        )
        desc = (phase.get("description") or "")[:120]
        if desc:
            print(f"      {desc}")
    summary["steps"]["timeline"] = {
        "status": r.status_code,
        "sec": sec,
        "agents": agents,
        "timeline_count": len(timeline),
        "timeline": timeline,
        "daily_hours": tl_data.get("daily_hours"),
        "estimated_total_hours": tl_data.get("estimated_total_hours"),
        "reply": (tl_data.get("reply_message") or "")[:400],
    }
    if not timeline:
        print("[FAIL] timeline empty")
        OUT.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        return 1

    summary["ok"] = True
    summary["session_id"] = session_id
    OUT.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n=== PASS === session={session_id}")
    print(f"  wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
