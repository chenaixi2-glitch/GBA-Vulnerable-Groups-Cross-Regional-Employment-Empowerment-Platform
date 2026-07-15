#!/usr/bin/env python
"""Real-API check: generate-stream must not leave polish placeholders.

1) Direct content_agent call (SiliconFlow) with compact profile
2) HTTP /api/resume/generate-stream after upload+JD (same check)

Usage (backend/):
  python scripts/verify_polish_placeholder_api.py
  python scripts/verify_polish_placeholder_api.py --http-only
  python scripts/verify_polish_placeholder_api.py --direct-only
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import sys
import time
import uuid
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent.parent
_REPO = _BACKEND.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

BASE = "http://127.0.0.1:8000"
TIMEOUT = 600
PDF = _REPO / "test-data" / "aixi" / "Chen_Aixi__Financial_Analyst.pdf"
PLACEHOLDER_MARKERS = (
    "Polishing in progress",
    "正在润色",
    "正在潤色",
    "Polimento em curso",
)

JD = """Job Title: AI Developer
Responsibilities:
- Build and ship LLM-powered applications with clear module boundaries
- Integrate retrieval, evaluation, and tool-calling workflows
Requirements:
- Python, APIs, prompt engineering; internship or project experience preferred
"""


def _content_has_placeholder(text: str) -> bool:
    raw = (text or "").strip()
    return any(marker in raw for marker in PLACEHOLDER_MARKERS)


def _scan_resume(resume_obj) -> list[dict]:
    hits: list[dict] = []
    if resume_obj is None:
        return hits
    if hasattr(resume_obj, "model_dump"):
        data = resume_obj.model_dump()
    elif isinstance(resume_obj, dict):
        data = resume_obj
    else:
        return hits
    for section in ("internships", "projects", "skills", "awards", "papers"):
        for item in data.get(section) or []:
            content = str(item.get("content") or "")
            if _content_has_placeholder(content):
                hits.append({
                    "section": section,
                    "id": item.get("id"),
                    "title": item.get("title"),
                    "content": content[:120],
                })
    return hits


def _print_section_heads(resume_obj, label: str) -> None:
    if hasattr(resume_obj, "model_dump"):
        data = resume_obj.model_dump()
    else:
        data = resume_obj or {}
    print(f"  [{label}]")
    for section in ("internships", "projects"):
        items = data.get(section) or []
        print(f"    {section}: {len(items)}")
        for item in items[:6]:
            content = str(item.get("content") or "").replace("\n", " ")
            flag = "PLACEHOLDER" if _content_has_placeholder(content) else "ok"
            print(
                f"      [{flag}] id={item.get('id')} title={(item.get('title') or '')[:40]!r} "
                f"len={len(content)} head={content[:90]!r}"
            )


async def run_direct() -> int:
    from agents.content_agent import generate_resume_content_with_progress, polish_placeholder_for_language
    from workflow.state import (
        CandidateProfile,
        CopilotState,
        Fact,
        Job,
        ProfileBasic,
        RenderConfig,
    )

    print("\n=== A) direct content_agent (real LLM) ===")
    session_id = f"sess_polish_verify_{uuid.uuid4().hex[:8]}"
    facts = [
        Fact(
            id="fact_internship_1",
            type="internship",
            content=json.dumps({
                "company": "Shenzhen Stock Exchange",
                "role": "Data Analysis Intern",
                "responsibilities": "Built Python checks for compliance data and assisted credit-risk model validation.",
                "achievements": "Cut manual spot-check time by documenting repeatable scripts.",
            }, ensure_ascii=False),
        ),
        Fact(
            id="fact_internship_2",
            type="internship",
            content=json.dumps({
                "company": "Campus Trading Lab",
                "role": "Research Assistant",
                "responsibilities": "Maintained market datasets and weekly research notes for equities.",
            }, ensure_ascii=False),
        ),
        Fact(
            id="fact_project_1",
            type="project",
            content=json.dumps({
                "title": "RAG Career Copilot Module",
                "role": "Backend Developer",
                "responsibilities": "Implemented resume generation pipeline with SSE progress and module polish batches.",
                "achievements": "Delivered modular polish path that updates experience sections independently.",
            }, ensure_ascii=False),
        ),
        Fact(
            id="fact_skill_1",
            type="skill",
            content=json.dumps({"skill": "Python, FastAPI, prompt engineering"}, ensure_ascii=False),
        ),
    ]
    state = CopilotState(
        session_id=session_id,
        candidate_profile=CandidateProfile(
            profile_basic=ProfileBasic(
                name="Chen Aixi",
                email="aixi@example.com",
                phone="",
                city="Hong Kong",
            ),
            facts=facts,
        ),
        job=Job(
            title="AI Developer",
            source=JD,
            hard_skills=["Python", "LLM"],
            soft_skills=["Communication"],
            responsibilities=["Build LLM apps", "Ship modular pipelines"],
        ),
        render_config=RenderConfig(language="en"),
        meta={"target_jd_text": JD},
    )

    phases: list[str] = []
    skeleton_hits: list[dict] = []
    mid_hits: list[dict] = []

    async def on_progress(parsed, meta: dict) -> None:
        phase = str(meta.get("phase") or "")
        phases.append(phase)
        hits = _scan_resume(parsed)
        print(
            f"  progress: {phase} pending={meta.get('pending_fact_ids') or []} "
            f"placeholder_hits={len(hits)} err={meta.get('batch_error') or ''}"
        )
        if phase == "skeleton_with_placeholders":
            skeleton_hits.extend(hits)
            expected = polish_placeholder_for_language("en")
            if not hits:
                print(f"  WARN: skeleton had no placeholders (expected something like {expected!r})")
        elif phase.startswith("module_polished"):
            mid_hits.append({"phase": phase, "hits": hits})

    t0 = time.perf_counter()
    resume, _render, _updates = await generate_resume_content_with_progress(
        state,
        edit_instruction=(
            "Generate a one-page English resume tailored to the AI Developer role. "
            "Polish experience modules with STAR bullets without fabricating numbers."
        ),
        on_progress=on_progress,
        incremental=False,
    )
    elapsed = time.perf_counter() - t0
    final_hits = _scan_resume(resume)
    _print_section_heads(resume, "final")
    print(f"  elapsed={elapsed:.1f}s phases={phases}")
    print(f"  skeleton_placeholder_count={len(skeleton_hits)} final_placeholder_count={len(final_hits)}")
    if final_hits:
        print("[FAIL] final resume still contains polish placeholders:")
        print(json.dumps(final_hits, ensure_ascii=False, indent=2))
        return 1
    if "skeleton_with_placeholders" in phases and not skeleton_hits:
        # still ok if placeholders were skipped somehow; force success only on final
        pass
    print("[OK] direct real-LLM generate cleared placeholders")
    return 0


def _chat(session_id: str, message: str, *, forced_intent: str = "", attachments=None):
    import requests

    payload = {
        "session_id": session_id,
        "message": message,
        "attachments": attachments or [],
        "language": "en",
        "forced_intent": forced_intent,
    }
    t0 = time.time()
    r = requests.post(f"{BASE}/api/chat", json=payload, timeout=TIMEOUT)
    return r, round(time.time() - t0, 1)


def _generate_stream(session_id: str, jd_text: str):
    import requests

    t0 = time.time()
    with requests.post(
        f"{BASE}/api/resume/generate-stream",
        json={
            "session_id": session_id,
            "instruction": (
                "Generate a customized one-page English resume for the target AI Developer role. "
                "Polish each experience entry; never fabricate numbers."
            ),
            "language": "en",
            "jd_text": jd_text,
            "industry": "Technology",
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
                data_lines = [line[6:] for line in block.splitlines() if line.startswith("data: ")]
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


def run_http() -> int:
    import requests

    print("\n=== B) HTTP /api/resume/generate-stream ===")
    try:
        health = requests.get(f"{BASE}/health", timeout=5)
        print(f"  health={health.status_code} {health.json()}")
    except Exception as exc:
        print(f"[FAIL] backend not up: {exc}")
        return 1
    if not PDF.exists():
        print(f"[FAIL] PDF missing: {PDF}")
        return 1

    print("  uploading resume…")
    b64 = base64.b64encode(PDF.read_bytes()).decode("ascii")
    r, sec = _chat("", "", attachments=[{
        "filename": PDF.name,
        "content": b64,
        "content_encoding": "base64",
    }])
    print(f"  upload status={r.status_code} time={sec}s")
    if r.status_code != 200:
        print(r.text[:500])
        return 1
    data = r.json()
    session_id = data["session_id"]
    facts = len(((data.get("candidate_profile") or {}).get("facts") or []))
    name = ((data.get("candidate_profile") or {}).get("profile_basic") or {}).get("name") or ""
    print(f"  session={session_id} name={name!r} facts={facts}")
    if facts <= 0:
        print("[FAIL] empty profile")
        return 1

    print("  uploading JD…")
    r, sec = _chat(session_id, JD, forced_intent="upload_jd")
    print(f"  jd status={r.status_code} time={sec}s")
    if r.status_code != 200:
        print(r.text[:400])
        return 1

    print("  generate-stream…")
    status, sec, events = _generate_stream(session_id, JD)
    print(f"  stream status={status} time={sec}s events={len(events)}")
    if status != 200:
        print(events[:3])
        return 1

    phases = [e.get("phase") or e.get("type") for e in events]
    print(f"  phases={phases}")
    for e in events:
        if e.get("type") == "error":
            print(f"[FAIL] stream error: {e.get('detail')}")
            return 1
        if e.get("phase") == "skeleton_with_placeholders":
            hits = _scan_resume(e.get("resume_content_json"))
            print(f"  skeleton placeholder_hits={len(hits)}")
        if e.get("phase") == "module_polished":
            hits = _scan_resume(e.get("resume_content_json"))
            print(
                f"  polished section={e.get('section_key')} "
                f"pending={e.get('pending_fact_ids')} placeholder_hits={len(hits)} "
                f"batch_error={e.get('batch_error') or ''}"
            )

    complete = next((e for e in events if e.get("type") == "complete"), None)
    if not complete:
        print("[FAIL] no complete event")
        return 1
    final_hits = _scan_resume(complete.get("resume_content_json"))
    _print_section_heads(complete.get("resume_content_json"), "http-final")
    print(f"  final_placeholder_count={len(final_hits)}")
    if final_hits:
        print("[FAIL] HTTP complete payload still has placeholders:")
        print(json.dumps(final_hits, ensure_ascii=False, indent=2))
        return 1
    print("[OK] HTTP generate-stream cleared placeholders")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--direct-only", action="store_true")
    parser.add_argument("--http-only", action="store_true")
    args = parser.parse_args()

    codes: list[int] = []
    if not args.http_only:
        codes.append(asyncio.run(run_direct()))
    if not args.direct_only:
        codes.append(run_http())
    return 1 if any(codes) else 0


if __name__ == "__main__":
    raise SystemExit(main())
