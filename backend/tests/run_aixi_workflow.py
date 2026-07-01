"""Quick step runner for Aixi resume E2E tests."""
from __future__ import annotations

import base64
import json
import sys
import time
from pathlib import Path

import requests

BASE = "http://localhost:8000"
TIMEOUT = 600

TARGET_JD = """Job Title: AI Application Development Engineer（民企 AI 应用开发工程师）
Company Type: Private Technology Enterprise（民营科技企业）

Responsibilities:
- Design and develop AI-powered business applications using LLM APIs and agent workflows
- Integrate AI capabilities into internal products (RAG, prompt engineering, tool calling)
- Collaborate with product and engineering teams to translate business needs into AI features
- Monitor application performance, reliability, and cost of AI services

Requirements:
- Bachelor's degree or above (Economics, Finance, Data Science, CS or related)
- Proficiency in Python or JavaScript; experience with REST APIs
- Strong interest or hands-on experience in LLM/AI application development
- Data analysis background and ability to connect business problems with AI solutions
- Good communication in Chinese and English
"""

GENERATE_MSG = (
    "Please generate a customized resume for the target AI Application Development role "
    "at a private technology enterprise. Highlight transferable skills from finance/data "
    "background relevant to AI application development. Keep all content within one A4 page."
)

OPTIMIZE_MSG = (
    "Optimize my resume for the private enterprise AI Application Development Engineer role. "
    "Shorten wording and spacing so the entire resume fits on one A4 page without losing key achievements."
)


def post(path, payload):
    t0 = time.time()
    r = requests.post(f"{BASE}{path}", json=payload, timeout=TIMEOUT)
    elapsed = round(time.time() - t0, 1)
    return r, elapsed


def put(path, payload):
    t0 = time.time()
    r = requests.put(f"{BASE}{path}", json=payload, timeout=TIMEOUT)
    elapsed = round(time.time() - t0, 1)
    return r, elapsed


def upload(path: Path):
    raw = path.read_bytes()
    b64 = base64.b64encode(raw).decode("ascii")
    return post("/api/chat", {
        "session_id": "",
        "message": "",
        "attachments": [{"filename": path.name, "content": b64, "content_encoding": "base64"}],
    })


def full_workflow(label: str, file_path: Path | None, session_id: str | None, out_dir: Path):
    print(f"\n=== {label} ===")
    results = {}

    if file_path and not session_id:
        print("[upload]")
        r, sec = upload(file_path)
        print(f"  status={r.status_code} time={sec}s")
        if r.status_code != 200:
            print(r.text[:300])
            return False
        data = r.json()
        session_id = data["session_id"]
        results["upload"] = "profile_agent" in (data.get("triggered_agents") or [])
        name = (data.get("candidate_profile") or {}).get("profile_basic", {}).get("name")
        print(f"  session={session_id} name={name} agents={data.get('triggered_agents')}")
    else:
        print(f"[reuse session] {session_id}")

    print("[config] employer=private, generate JD")
    put("/api/resume/employer-type", {"session_id": session_id, "employer_type": "private"})
    r, sec = post("/api/resume/generate-jd", {
        "session_id": session_id,
        "industry": "Technology",
        "experience_level": "Entry Level (0-2 years)",
        "employer_type": "private",
    })
    jd = r.json().get("jd_text") or TARGET_JD
    print(f"  jd_gen time={sec}s title={r.json().get('title','')[:60]}")

    print("[jd analysis]")
    r, sec = post("/api/chat", {"session_id": session_id, "message": jd, "attachments": []})
    data = r.json()
    results["jd"] = "jd_agent" in (data.get("triggered_agents") or [])
    print(f"  time={sec}s gaps={len(data.get('gaps') or [])} agents={data.get('triggered_agents')}")

    print("[generate resume]")
    r, sec = post("/api/chat", {"session_id": session_id, "message": GENERATE_MSG, "attachments": []})
    data = r.json()
    html = (data.get("resume_html") or {}).get("html") or ""
    lang = ((data.get("resume_content_json") or {}).get("meta") or {}).get("language", "?")
    results["generate"] = len(html) > 200
    print(f"  time={sec}s html={len(html)} lang={lang} agents={data.get('triggered_agents')}")
    safe = label.replace(" ", "_")
    (out_dir / f"{safe}_generated.html").write_text(html, encoding="utf-8")

    target = "en" if str(lang).lower().startswith("zh") else "zh"
    print(f"[translate -> {target}]")
    r, sec = post("/api/resume/translate", {"session_id": session_id, "target_language": target})
    if r.status_code == 200:
        tdata = r.json()
        thtml = (tdata.get("resume_html") or {}).get("html") or ""
        tlang = ((tdata.get("resume_content_json") or {}).get("meta") or {}).get("language", target)
        results["translate"] = len(thtml) > 200
        print(f"  time={sec}s html={len(thtml)} lang={tlang}")
        (out_dir / f"{safe}_translated_{target}.html").write_text(thtml, encoding="utf-8")
    else:
        results["translate"] = False
        print(f"  FAIL {r.status_code} {r.text[:200]}")

    print("[optimize]")
    r, sec = post("/api/chat", {"session_id": session_id, "message": OPTIMIZE_MSG, "attachments": []})
    if r.status_code == 200:
        odata = r.json()
        ohtml = (odata.get("resume_html") or {}).get("html") or ""
        results["optimize"] = len(ohtml) > 200
        print(f"  time={sec}s html={len(ohtml)} agents={odata.get('triggered_agents')}")
        (out_dir / f"{safe}_optimized.html").write_text(ohtml, encoding="utf-8")
    else:
        results["optimize"] = False
        print(f"  FAIL {r.status_code}")

    ok = all(results.values())
    print(f"RESULT: {'PASS' if ok else 'FAIL'} {results}")
    return ok


def main():
    out_dir = Path(__file__).resolve().parent / "output" / "aixi_resumes"
    out_dir.mkdir(parents=True, exist_ok=True)

    cases = [
        ("DOCX_finance_compliance", Path(r"D:\简历\金融&数分商分\陈艾希-香港大学-金融合规.docx"), None),
        ("PDF_financial_analyst_en", Path(r"D:\简历\金融&数分商分\Chen_Aixi__Financial_Analyst.pdf"), None),
        ("PDF_data_zh", None, "sess_5ca2ecc1c4a84cce"),
    ]

    summary = []
    for label, path, sid in cases:
        summary.append((label, full_workflow(label, path, sid, out_dir)))

    print("\n=== SUMMARY ===")
    for label, ok in summary:
        print(f"  {label}: {'PASS' if ok else 'FAIL'}")
    return 0 if all(ok for _, ok in summary) else 1


if __name__ == "__main__":
    sys.exit(main())
