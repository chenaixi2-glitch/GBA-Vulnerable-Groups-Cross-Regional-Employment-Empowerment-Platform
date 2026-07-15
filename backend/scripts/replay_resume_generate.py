#!/usr/bin/env python
"""跳过简历解析 / 缺口分析，反复测「结合 JD 生成优化简历」。

用法（在 backend/ 目录）:

  # ① 人工跑完一次「解析 + JD +（可选）填缺口」后，把会话存成夹具（只需一次）
  python scripts/replay_resume_generate.py dump --session sess_你的会话id

  # ② 之后每次只测生成（直调 content_agent，不跑解析/缺口）
  python scripts/replay_resume_generate.py generate

  # ③ 想回浏览器继续点：把夹具写回 Redis，并打印要粘贴的 session_id
  python scripts/replay_resume_generate.py seed
  # 然后在浏览器控制台：
  #   localStorage.setItem('gba_session_id', '<打印的 id>')
  #   location.reload()
  # 再点页面上的「跳过解析，直接生成」

默认夹具路径: tests/fixtures/resume_gen_ready.json
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
import uuid
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

DEFAULT_FIXTURE = _BACKEND / "tests" / "fixtures" / "resume_gen_ready.json"


def _load_fixture(path: Path) -> dict:
    if not path.exists():
        raise SystemExit(
            f"夹具不存在: {path}\n"
            f"请先执行一次: python scripts/replay_resume_generate.py dump --session <sess_id>"
        )
    return json.loads(path.read_text(encoding="utf-8"))


async def cmd_dump(session_id: str, out: Path) -> None:
    from storage.redis_client import RedisSessionStore, get_redis_client

    client = await get_redis_client()
    store = RedisSessionStore(session_id, client)
    state = await store.load_state()
    if not state:
        raise SystemExit(f"Redis 中找不到会话: {session_id}")
    if not state.get("candidate_profile"):
        raise SystemExit("会话没有 candidate_profile，请先完成简历解析")
    if not state.get("job"):
        print("警告: 会话没有 job，生成时可能缺少 JD 对齐信息", file=sys.stderr)

    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "dumped_from": session_id,
        "dumped_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "state": state,
    }
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    facts = (state.get("candidate_profile") or {}).get("facts") or []
    print(f"已保存夹具 → {out}")
    print(f"  profile facts: {len(facts)}")
    print(f"  job title: {(state.get('job') or {}).get('title') or '(无)'}")
    print(f"  gaps: {len(state.get('gaps') or [])}")


async def cmd_seed(fixture: Path, session_id: str | None) -> str:
    from storage.redis_client import RedisSessionStore, get_redis_client
    from workflow.state import CopilotState

    payload = _load_fixture(fixture)
    raw = payload.get("state") or payload
    new_id = session_id or f"sess_replay_{uuid.uuid4().hex[:10]}"
    state = CopilotState.model_validate({**raw, "session_id": new_id})
    # 让生成链路可重复跑：清掉上次生成结果，但保留 profile / job / gaps
    data = state.model_dump()
    data["resume_content_json"] = None
    data["resume_html"] = {"html": "", "css": "", "warnings": []}
    data["session_id"] = new_id

    client = await get_redis_client()
    store = RedisSessionStore(new_id, client)
    await store.save_state(data)
    print(f"已写入 Redis session: {new_id}")
    print("浏览器控制台执行:")
    print(f"  localStorage.setItem('gba_session_id', '{new_id}'); location.reload();")
    print("然后点页面按钮「跳过解析，直接生成」（或带 ?devReplay=1 显示该按钮）")
    return new_id


async def cmd_generate(fixture: Path, *, language: str, instruction: str) -> None:
    from agents.content_agent import generate_resume_content_with_progress
    from workflow.state import CopilotState

    payload = _load_fixture(fixture)
    raw = payload.get("state") or payload
    state = CopilotState.model_validate({
        **raw,
        "session_id": raw.get("session_id") or f"sess_replay_{uuid.uuid4().hex[:8]}",
        "resume_content_json": None,
    })
    if state.render_config:
        state.render_config = state.render_config.model_copy(update={"language": language})

    print(f"开始生成 | session={state.session_id} | facts={len(state.candidate_profile.facts if state.candidate_profile else [])}")
    t0 = time.perf_counter()
    phases: list[str] = []

    async def on_progress(_parsed, meta: dict) -> None:
        phase = str(meta.get("phase") or "")
        phases.append(phase)
        print(f"  progress: {phase} pending={meta.get('pending_fact_ids') or []}")

    try:
        resume, render_cfg, _updates = await generate_resume_content_with_progress(
            state,
            edit_instruction=instruction,
            on_progress=on_progress,
            incremental=False,
        )
    except Exception as exc:
        elapsed = time.perf_counter() - t0
        print(f"[FAIL] {elapsed:.1f}s — {type(exc).__name__}: {exc}")
        raise SystemExit(1) from exc

    elapsed = time.perf_counter() - t0
    print(f"[OK] {elapsed:.1f}s")
    print(f"  phases: {phases}")
    print(f"  summary_len: {len(resume.summary or '')}")
    print(f"  skills: {len(resume.skills)} internships: {len(resume.internships)} projects: {len(resume.projects)}")
    print(f"  language: {resume.meta.language} section_order: {render_cfg.section_order}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Replay resume generation without parse/gap")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_dump = sub.add_parser("dump", help="从 Redis 导出已解析会话为夹具")
    p_dump.add_argument("--session", required=True, help="例如 sess_1783506159650_mmzt6hi8d")
    p_dump.add_argument("-o", "--out", type=Path, default=DEFAULT_FIXTURE)

    p_seed = sub.add_parser("seed", help="夹具写回 Redis，供浏览器接着测")
    p_seed.add_argument("--fixture", type=Path, default=DEFAULT_FIXTURE)
    p_seed.add_argument("--session", default="", help="指定 session_id；默认随机 sess_replay_*")

    p_gen = sub.add_parser("generate", help="直调 content_agent 生成（跳过解析/缺口）")
    p_gen.add_argument("--fixture", type=Path, default=DEFAULT_FIXTURE)
    p_gen.add_argument("--language", default="en")
    p_gen.add_argument(
        "--instruction",
        default=(
            "Please generate a customized resume based on my experience and target position. "
            "Keep all content within one A4 page."
        ),
    )

    args = parser.parse_args()
    if args.cmd == "dump":
        asyncio.run(cmd_dump(args.session, args.out))
    elif args.cmd == "seed":
        asyncio.run(cmd_seed(args.fixture, args.session or None))
    elif args.cmd == "generate":
        asyncio.run(cmd_generate(args.fixture, language=args.language, instruction=args.instruction))
    else:
        parser.error(f"unknown command: {args.cmd}")


if __name__ == "__main__":
    main()
