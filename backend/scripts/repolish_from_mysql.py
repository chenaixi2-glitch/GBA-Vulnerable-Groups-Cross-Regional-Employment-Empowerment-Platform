#!/usr/bin/env python
"""从 MySQL 恢复日志会话，仅重跑经历润色（跳过解析/缺口）。

用法（backend/）:
  python scripts/repolish_from_mysql.py --session sess_1783506159650_mmzt6hi8d
  python scripts/repolish_from_mysql.py --session sess_... --facts fact_internship_3,fact_internship_4,fact_project_1
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))


async def _mysql_store():
    from storage.mysql_client import MySQLStore, get_mysql_pool

    pool = await get_mysql_pool()
    return MySQLStore(pool)


async def _load_state_from_mysql(session_id: str):
    from workflow.state import (
        CandidateProfile,
        CopilotState,
        Job,
        Meta,
        RenderConfig,
        ResumeContent,
        ResumeHtml,
    )

    db = await _mysql_store()
    profile_data = await db.get_candidate_profile(session_id)
    job_data = await db.get_job(session_id)
    resume_data = await db.get_resume_content(session_id)
    render_data = await db.get_render_config(session_id)

    if not profile_data:
        raise SystemExit(f"MySQL 中找不到 candidate_profile: {session_id}")
    if not job_data:
        raise SystemExit(f"MySQL 中找不到 job: {session_id}")

    profile = CandidateProfile.model_validate(profile_data)
    job = Job.model_validate(job_data)
    resume = ResumeContent.model_validate(resume_data) if resume_data else None
    render = RenderConfig.model_validate(render_data) if render_data else RenderConfig(language="en")

    state = CopilotState(
        session_id=session_id,
        candidate_profile=profile,
        job=job,
        resume_content_json=resume,
        render_config=render,
        resume_html=ResumeHtml(),
        meta=Meta(),
        skip_render=True,
    )
    return state


async def cmd_repolish(session_id: str, fact_ids: list[str] | None, *, save: bool) -> None:
    from agents.content_agent import generate_resume_content_with_progress
    from tools.resume_layout import normalize_language

    state = await _load_state_from_mysql(session_id)
    lang = normalize_language(state.render_config.language if state.render_config else "en")
    if state.render_config:
        state.render_config = state.render_config.model_copy(update={"language": lang})

    facts = state.candidate_profile.facts if state.candidate_profile else []
    exp = [f for f in facts if f.type in ("internship", "project")]
    print(f"session={session_id}")
    print(f"  job={(state.job.title if state.job else '')}")
    print(f"  language={lang} facts={len(facts)} experience={len(exp)}")
    print(f"  experience ids: {[f.id for f in exp]}")
    if state.resume_content_json:
        rc = state.resume_content_json
        print(f"  existing resume: internships={len(rc.internships)} projects={len(rc.projects)}")
        for item in list(rc.internships) + list(rc.projects):
            preview = (item.content or "").replace("\n", " ")[:90]
            print(f"    BEFORE {item.id}: {preview}")
    else:
        print("  existing resume: none — will run full modular generate (skeleton+polish)")

    t0 = time.perf_counter()
    phases: list[str] = []
    batch_errors: list[str] = []

    async def on_progress(_parsed, meta: dict) -> None:
        phase = str(meta.get("phase") or "")
        phases.append(phase)
        err = meta.get("batch_error")
        line = f"  progress: {phase} pending={meta.get('pending_fact_ids') or []}"
        if err:
            batch_errors.append(str(err))
            line += f" ERROR={err[:120]}"
        print(line)

    instruction = (
        "Please generate a customized resume based on my experience and target position. "
        "Polish each experience entry to align with the target job. Keep within one A4 page. "
        "QUANTIFICATION_MODE=industry_standard: Prefer any real metrics the user provided in clarifications. "
        "For experience entries still lacking user-provided metrics, supplement with conservative, "
        "industry-typical quantified outcomes appropriate to the target industry/role and experience level "
        "(e.g. team size, users served, latency/throughput, process efficiency ranges commonly seen in similar work). "
        "Do not invent company-specific revenue, exclusive awards, or unverifiable personal claims; "
        "keep estimates plausible and role-typical."
    )

    target_ids = set(fact_ids or [])
    if not target_ids:
        # Default to experience facts that failed in the 19:14 log (and any others of same types).
        target_ids = {f.id for f in exp}

    try:
        if state.resume_content_json is not None and target_ids:
            resume, render_cfg, _updates = await generate_resume_content_with_progress(
                state,
                edit_instruction=instruction,
                on_progress=on_progress,
                incremental=True,
                affected_fact_ids=target_ids,
                affected_sections={"internships", "projects"},
                clarifications="",
            )
        else:
            # Clear resume so modular path rebuilds polish from profile facts.
            state.resume_content_json = None
            resume, render_cfg, _updates = await generate_resume_content_with_progress(
                state,
                edit_instruction=instruction,
                on_progress=on_progress,
                incremental=False,
            )
    except Exception as exc:
        print(f"[FAIL] {time.perf_counter() - t0:.1f}s — {type(exc).__name__}: {exc}")
        raise SystemExit(1) from exc

    elapsed = time.perf_counter() - t0
    print(f"[OK] {elapsed:.1f}s phases={phases} batch_errors={len(batch_errors)}")
    print("--- AFTER polish ---")
    for item in list(resume.internships) + list(resume.projects):
        preview = (item.content or "").replace("\n", " ")[:140]
        print(f"  {item.id} | {item.title}")
        print(f"    {preview}")

    out = _BACKEND / "tests" / "fixtures" / "repolish_last_run.json"
    payload = {
        "session_id": session_id,
        "elapsed_s": round(elapsed, 1),
        "phases": phases,
        "batch_errors": batch_errors,
        "internships": [i.model_dump() for i in resume.internships],
        "projects": [i.model_dump() for i in resume.projects],
    }
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"saved → {out}")

    if save:
        from storage.redis_client import RedisSessionStore, get_redis_client

        state.resume_content_json = resume
        if render_cfg:
            state.render_config = render_cfg
        data = state.model_dump()
        client = await get_redis_client()
        store = RedisSessionStore(session_id, client)
        await store.save_state(data)
        print(f"wrote Redis session={session_id}")

        db = await _mysql_store()
        await db.save_resume_content(
            f"rc_{session_id}",
            session_id,
            resume.model_dump(),
            version=getattr(resume.meta, "version", 1) or 1,
        )
        print("updated MySQL resume_contents")


def main() -> None:
    parser = argparse.ArgumentParser(description="Re-run experience polish from MySQL session")
    parser.add_argument("--session", required=True)
    parser.add_argument(
        "--facts",
        default="fact_internship_3,fact_internship_4,fact_project_1",
        help="Comma-separated fact ids to polish; empty = all experience",
    )
    parser.add_argument("--all-experience", action="store_true", help="Polish all internship/project facts")
    parser.add_argument("--save", action="store_true", help="Write result back to Redis/MySQL")
    args = parser.parse_args()
    facts = [] if args.all_experience else [x.strip() for x in args.facts.split(",") if x.strip()]
    asyncio.run(cmd_repolish(args.session, facts or None, save=args.save))


if __name__ == "__main__":
    main()
