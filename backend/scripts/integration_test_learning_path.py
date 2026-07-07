#!/usr/bin/env python
"""Learning path 前后端 + 数据库联调脚本。

用法（在 backend/ 目录）:
    python scripts/integration_test_learning_path.py

可选环境变量:
    API_BASE=http://127.0.0.1:8000
    SKIP_LLM=1   # 跳过真实 LLM chat 测试（默认跳过）
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import jwt
import pymysql

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from config_loader import get_jwt_config, get_mysql_config
from storage.redis_client import RedisSessionStore, get_redis_client
from workflow.state import CopilotState, Gap, Job, LearningPathPhase, LearningPathResource

API_BASE = os.getenv("API_BASE", "http://127.0.0.1:8000").rstrip("/")
SKIP_LLM = os.getenv("SKIP_LLM", "1") == "1"
TEST_USER_ID = 90001


def _jwt_token(user_id: int = TEST_USER_ID) -> str:
    cfg = get_jwt_config()
    payload = {
        "sub": str(user_id),
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
    }
    return jwt.encode(payload, cfg["secret"], algorithm="HS256")


def _auth_headers(user_id: int = TEST_USER_ID) -> dict[str, str]:
    return {"Authorization": f"Bearer {_jwt_token(user_id)}"}


async def seed_session(session_id: str) -> None:
    client = await get_redis_client()
    store = RedisSessionStore(session_id, client)
    state = CopilotState(
        session_id=session_id,
        job=Job(id="job_test", title="Software Engineer", industry="tech"),
        gaps=[
            Gap(
                id="gap_1",
                type="missing_skill",
                severity="high",
                description="System design",
                estimated_hours=40,
                resolution_source="learning_path",
            ),
        ],
        learning_path_resources=[
            LearningPathResource(
                id="res_1",
                skill="System design",
                type="course",
                title="System Design Basics",
                platform="Coursera",
                duration="20 hours",
                duration_hours=20,
                url="https://example.com/course",
                rating=4.5,
            ),
        ],
        learning_path_timeline=[
            LearningPathPhase(
                phase=1,
                title="Foundation",
                weeks="1-4",
                skills=["System design"],
                description="Learn fundamentals",
            ),
        ],
        learning_path_estimated_hours=120,
        learning_path_daily_hours=2.0,
    )
    await store.save_state(state.model_dump(exclude={
        "user_message", "user_attachments", "current_intent",
        "execution_plan", "reply_message", "triggered_agents",
        "workflow_trace", "resume_language_target",
    }))


def check_db_table() -> None:
    cfg = get_mysql_config()
    conn = pymysql.connect(
        host=cfg["host"],
        port=cfg["port"],
        user=cfg["user"],
        password=cfg["password"],
        database=cfg["database"],
        charset=cfg.get("charset", "utf8mb4"),
    )
    try:
        with conn.cursor() as cur:
            cur.execute("SHOW TABLES LIKE 'learning_path_plans'")
            assert cur.fetchone(), "learning_path_plans table missing"
            cur.execute("DESCRIBE learning_path_plans")
            cols = {row[0] for row in cur.fetchall()}
            required = {
                "id", "session_id", "user_id", "target_job", "estimated_total_hours",
                "daily_hours", "estimated_weeks", "phase_count", "data", "saved_at",
            }
            missing = required - cols
            assert not missing, f"Missing columns: {missing}"
        print("[OK] DB table learning_path_plans")
    finally:
        conn.close()


def check_frontend_assets() -> None:
    root = _BACKEND.parent
    html = (root / "individual" / "demo-learning-path.html").read_text(encoding="utf-8")
    js = (root / "individual" / "assets" / "js" / "learning-path.js").read_text(encoding="utf-8")
    api = (root / "individual" / "assets" / "js" / "api-client.js").read_text(encoding="utf-8")

    for needle in ("btn-edit-timeline", "btn-save-plan", "exportLearningPlanJson", "daily-hours-section", "btn-learning-submit-profile"):
        assert needle in html or needle in js, f"Frontend missing: {needle}"

    for needle in (
        "updateLearningPathTimeline",
        "saveLearningPathToAccount",
        "/learning-path/timeline",
        "/learning-path/save",
    ):
        assert needle in api or needle in js, f"API client missing: {needle}"

    print("[OK] Frontend assets (HTML/JS/API client)")


async def run_api_flow(session_id: str, *, in_process: bool = False) -> str:
    if in_process:
        from httpx import ASGITransport
        from main import app
        transport = ASGITransport(app=app)
        client_ctx = httpx.AsyncClient(transport=transport, base_url="http://test", timeout=30.0)
    else:
        client_ctx = httpx.AsyncClient(base_url=API_BASE, timeout=30.0)

    async with client_ctx as client:
        if not in_process:
            health = await client.get("/health")
            assert health.status_code == 200, f"Health failed: {health.status_code}"
            print("[OK] Backend /health (live server)")

        history_anon = await client.get("/api/learning-path/history")
        assert history_anon.status_code == 401, f"Expected 401, got {history_anon.status_code}"
        print("[OK] GET /api/learning-path/history requires auth")

        edited_timeline = [
            {
                "phase": 1,
                "title": "Foundation (edited)",
                "weeks": "1-3",
                "skills": ["System design", "Architecture"],
                "description": "Updated phase goal",
            },
            {
                "phase": 2,
                "title": "Practice",
                "weeks": "4-8",
                "skills": ["Case studies"],
                "description": "Apply knowledge",
            },
        ]
        update_resp = await client.put(
            "/api/learning-path/timeline",
            json={"session_id": session_id, "timeline": edited_timeline},
        )
        assert update_resp.status_code == 200, update_resp.text
        body = update_resp.json()
        assert body.get("ok") is True
        assert len(body.get("timeline", [])) == 2
        print("[OK] PUT /api/learning-path/timeline")

        save_resp = await client.post(
            "/api/learning-path/save",
            json={"session_id": session_id, "record_id": ""},
            headers=_auth_headers(),
        )
        assert save_resp.status_code == 200, save_resp.text
        save_body = save_resp.json()
        record_id = save_body.get("record_id")
        assert save_body.get("ok") is True and record_id
        print(f"[OK] POST /api/learning-path/save -> {record_id}")

        history = await client.get("/api/learning-path/history", headers=_auth_headers())
        assert history.status_code == 200, history.text
        records = history.json().get("records", [])
        assert any(r.get("id") == record_id for r in records), "Saved record not in history"
        print("[OK] GET /api/learning-path/history")

        detail = await client.get(
            f"/api/learning-path/saved/{record_id}",
            headers=_auth_headers(),
        )
        assert detail.status_code == 200, detail.text
        detail_body = detail.json()
        assert detail_body.get("target_job") == "Software Engineer"
        assert len(detail_body.get("data", {}).get("timeline", [])) == 2
        print("[OK] GET /api/learning-path/saved/{id}")

        return record_id


def verify_db_record(record_id: str) -> None:
    cfg = get_mysql_config()
    conn = pymysql.connect(
        host=cfg["host"],
        port=cfg["port"],
        user=cfg["user"],
        password=cfg["password"],
        database=cfg["database"],
        charset=cfg.get("charset", "utf8mb4"),
        cursorclass=pymysql.cursors.DictCursor,
    )
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT target_job, estimated_total_hours, daily_hours, phase_count, data "
                "FROM learning_path_plans WHERE id = %s AND user_id = %s",
                (record_id, TEST_USER_ID),
            )
            row = cur.fetchone()
            assert row, "Record not found in MySQL"
            data = row["data"]
            if isinstance(data, str):
                data = json.loads(data)
            assert row["target_job"] == "Software Engineer"
            assert row["estimated_total_hours"] == 120
            assert float(row["daily_hours"]) == 2.0
            assert row["phase_count"] == 2
            assert len(data.get("timeline", [])) == 2
        print("[OK] MySQL row verified")
    finally:
        conn.close()


async def check_static_page() -> None:
    static_base = os.getenv("STATIC_BASE", "http://127.0.0.1:8080")
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(f"{static_base}/individual/demo-learning-path.html")
        assert resp.status_code == 200, f"Static page unreachable: {resp.status_code}"
        text = resp.text
        for needle in ("Generate Learning Timeline", "Save to My Account", "learning-path.js"):
            assert needle in text, f"Static HTML missing: {needle}"
        js_resp = await client.get(f"{static_base}/individual/assets/js/learning-path.js")
        assert js_resp.status_code == 200
        assert "saveLearningPathToAccount" in js_resp.text
    print("[OK] Static frontend page + JS served")


async def main() -> None:
    session_id = f"sess_lp_{uuid.uuid4().hex[:12]}"
    print(f"Integration test session: {session_id}")

    check_db_table()
    check_frontend_assets()
    await check_static_page()

    # In-process API + DB (shared fakeredis when Redis unavailable)
    await seed_session(session_id)
    print("[OK] Seeded session state")
    record_id = await run_api_flow(session_id, in_process=True)
    verify_db_record(record_id)

    # Live server smoke test (optional)
    try:
        async with httpx.AsyncClient(base_url=API_BASE, timeout=5.0) as client:
            r = await client.get("/health")
            if r.status_code == 200:
                r2 = await client.get("/api/learning-path/history")
                assert r2.status_code == 401
                print(f"[OK] Live server at {API_BASE} is up with learning-path routes")
            else:
                print(f"[WARN] Live server at {API_BASE} returned {r.status_code}")
    except Exception as exc:
        print(f"[WARN] Live server not reachable at {API_BASE}: {exc}")
        print("       Start with: cd backend && python main.py")

    print("\n=== All learning path integration checks passed ===")


if __name__ == "__main__":
    asyncio.run(main())
