#!/usr/bin/env python
"""Dump MySQL session into resume_gen_ready.json for replay_resume_generate.py."""

from __future__ import annotations

import asyncio
import json
import sys
import time
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

OUT = _BACKEND / "tests" / "fixtures" / "resume_gen_ready.json"


async def main(session_id: str) -> None:
    from storage.mysql_client import MySQLStore, get_mysql_pool
    from workflow.state import CandidateProfile, CopilotState, Job, Meta, RenderConfig, ResumeContent, ResumeHtml

    db = MySQLStore(await get_mysql_pool())
    profile = await db.get_candidate_profile(session_id)
    job = await db.get_job(session_id)
    resume = await db.get_resume_content(session_id)
    render = await db.get_render_config(session_id)
    if not profile or not job:
        raise SystemExit("missing profile/job in MySQL")

    state = CopilotState(
        session_id=session_id,
        candidate_profile=CandidateProfile.model_validate(profile),
        job=Job.model_validate(job),
        resume_content_json=ResumeContent.model_validate(resume) if resume else None,
        render_config=RenderConfig.model_validate(render) if render else RenderConfig(language="en"),
        resume_html=ResumeHtml(),
        meta=Meta(),
        skip_render=True,
    )
    payload = {
        "dumped_from": session_id,
        "dumped_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "source": "mysql",
        "state": state.model_dump(),
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    print(f"saved → {OUT}")


if __name__ == "__main__":
    sid = sys.argv[1] if len(sys.argv) > 1 else "sess_1783506159650_mmzt6hi8d"
    asyncio.run(main(sid))
