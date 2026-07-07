"""MySQL 客户端封装：基于 aiomysql 的异步持久化存储。"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

import aiomysql

from config_loader import get_mysql_config
from log import get_logger

logger = get_logger("storage")

_pool: aiomysql.Pool | None = None


async def get_mysql_pool() -> aiomysql.Pool:
    """获取 MySQL 异步连接池（单例）。"""
    global _pool
    if _pool is None:
        cfg = get_mysql_config()
        _pool = await aiomysql.create_pool(
            host=cfg["host"],
            port=cfg["port"],
            user=cfg["user"],
            password=cfg["password"],
            db=cfg["database"],
            charset=cfg.get("charset", "utf8mb4"),
            maxsize=cfg.get("pool_size", 5),
            autocommit=False,
            cursorclass=aiomysql.DictCursor,
        )
        logger.info("MySQL async pool initialized: %s:%s/%s", cfg["host"], cfg["port"], cfg["database"])
    return _pool


class MySQLStore:
    """MySQL 异步持久化操作封装。"""

    def __init__(self, pool: aiomysql.Pool) -> None:
        self._pool = pool

    # ---- sessions ----
    async def upsert_session(self, session_id: str, status: str = "active",
                             user_id: int | str | None = None) -> None:
        now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        sql = """
            INSERT INTO sessions (session_id, user_id, created_at, updated_at, status)
            VALUES (%s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                updated_at = %s,
                status = %s,
                user_id = COALESCE(user_id, VALUES(user_id))
        """
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql, (session_id, user_id, now, now, status, now, status))
            await conn.commit()
        logger.debug("Upserted session %s user_id=%s", session_id, user_id)

    async def get_session_user_id(self, session_id: str) -> int | None:
        sql = "SELECT user_id FROM sessions WHERE session_id = %s LIMIT 1"
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql, (session_id,))
                row = await cur.fetchone()
        if row is None:
            return None
        user_id = row["user_id"]
        return int(user_id) if user_id is not None else None

    # ---- generic JSON table helpers ----
    async def _upsert_json(self, table: str, row_id: str, session_id: str, data: dict, version: int = 1,
                           extra_cols: dict | None = None) -> None:
        now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        json_str = json.dumps(data, ensure_ascii=False, default=str)
        extra_col_names = ""
        extra_placeholders = ""
        extra_update = ""
        extra_vals: list = []
        if extra_cols:
            for k, v in extra_cols.items():
                extra_col_names += f", {k}"
                extra_placeholders += ", %s"
                extra_update += f", {k} = %s"
                extra_vals.append(v)

        sql = f"""
            INSERT INTO {table} (id, session_id, version, data{extra_col_names}, created_at, updated_at)
            VALUES (%s, %s, %s, %s{extra_placeholders}, %s, %s)
            ON DUPLICATE KEY UPDATE version = %s, data = %s{extra_update}, updated_at = %s
        """
        vals = [row_id, session_id, version, json_str, *extra_vals, now, now,
                version, json_str, *extra_vals, now]
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql, vals)
            await conn.commit()
        logger.debug("Upserted %s id=%s session=%s v=%s", table, row_id, session_id, version)

    async def _get_json(self, table: str, row_id: str) -> dict | None:
        sql = f"SELECT data, version FROM {table} WHERE id = %s"
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql, (row_id,))
                row = await cur.fetchone()
        if row is None:
            return None
        data = row["data"]
        if isinstance(data, str):
            data = json.loads(data)
        return data

    async def _get_by_session(self, table: str, session_id: str) -> dict | None:
        sql = f"SELECT data, version FROM {table} WHERE session_id = %s ORDER BY updated_at DESC LIMIT 1"
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql, (session_id,))
                row = await cur.fetchone()
        if row is None:
            return None
        data = row["data"]
        if isinstance(data, str):
            data = json.loads(data)
        return data

    # ---- typed helpers ----
    async def save_job(self, row_id: str, session_id: str, data: dict, version: int = 1) -> None:
        await self._upsert_json("jobs", row_id, session_id, data, version)

    async def get_job(self, session_id: str) -> dict | None:
        return await self._get_by_session("jobs", session_id)

    async def save_candidate_profile(self, row_id: str, session_id: str, data: dict) -> None:
        await self._upsert_json("candidate_profiles", row_id, session_id, data)

    async def get_candidate_profile(self, session_id: str) -> dict | None:
        return await self._get_by_session("candidate_profiles", session_id)

    async def session_has_persisted_resume(self, session_id: str) -> bool:
        """Whether this session_id already has session-level resume rows in MySQL."""
        sql = """
            SELECT 1 AS found FROM candidate_profiles WHERE session_id = %s
            UNION ALL
            SELECT 1 FROM resume_contents WHERE session_id = %s
            LIMIT 1
        """
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql, (session_id, session_id))
                row = await cur.fetchone()
        return row is not None

    async def get_latest_candidate_profile_for_user(
        self, user_id: int | str,
    ) -> dict[str, Any] | None:
        """Return the most recently updated candidate profile for a logged-in user."""
        sql = """
            SELECT cp.data, cp.session_id, cp.updated_at
            FROM candidate_profiles cp
            INNER JOIN sessions s ON cp.session_id = s.session_id
            WHERE s.user_id = %s
            ORDER BY cp.updated_at DESC
            LIMIT 1
        """
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql, (int(user_id),))
                row = await cur.fetchone()
        if row is None:
            return None
        data = row["data"]
        if isinstance(data, str):
            data = json.loads(data)
        return {
            "data": data,
            "session_id": row["session_id"],
            "updated_at": row.get("updated_at"),
        }

    async def save_resume_content(self, row_id: str, session_id: str, data: dict, version: int = 1,
                                  content_hash: str = "") -> None:
        await self._upsert_json("resume_contents", row_id, session_id, data, version,
                                extra_cols={"content_hash": content_hash})

    async def get_resume_content(self, session_id: str) -> dict | None:
        return await self._get_by_session("resume_contents", session_id)

    async def save_render_config(self, row_id: str, session_id: str, data: dict, version: int = 1) -> None:
        await self._upsert_json("render_configs", row_id, session_id, data, version)

    async def get_render_config(self, session_id: str) -> dict | None:
        return await self._get_by_session("render_configs", session_id)

    async def save_resume_html(self, row_id: str, session_id: str, html: str, version: int = 1,
                               content_ver: int = 1, render_ver: int = 1, checksum: str = "") -> None:
        now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        sql = """
            INSERT INTO resume_htmls (id, session_id, version, html, derived_from_content_version,
                                      derived_from_render_version, checksum, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE version = %s, html = %s, derived_from_content_version = %s,
                                    derived_from_render_version = %s, checksum = %s
        """
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql, (row_id, session_id, version, html, content_ver, render_ver, checksum, now,
                                        version, html, content_ver, render_ver, checksum))
            await conn.commit()

    async def save_interview_qa(self, row_id: str, session_id: str, data: dict, version: int = 1) -> None:
        await self._upsert_json("interview_qas", row_id, session_id, data, version)

    async def save_interactive_interview_session(
        self,
        row_id: str,
        session_id: str,
        user_id: int | str,
        job_title: str,
        industry: str,
        tone: str,
        overall_score: int | None,
        round_count: int,
        data: dict,
    ) -> None:
        now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        json_str = json.dumps(data, ensure_ascii=False, default=str)
        sql = """
            INSERT INTO interactive_interview_sessions
                (id, session_id, user_id, job_title, industry, tone,
                 overall_score, round_count, data, saved_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                job_title = VALUES(job_title),
                industry = VALUES(industry),
                tone = VALUES(tone),
                overall_score = VALUES(overall_score),
                round_count = VALUES(round_count),
                data = VALUES(data),
                saved_at = VALUES(saved_at)
        """
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql, (
                    row_id, session_id, int(user_id), job_title, industry, tone,
                    overall_score, round_count, json_str, now,
                ))
            await conn.commit()
        logger.debug("Saved interactive interview id=%s user=%s session=%s", row_id, user_id, session_id)

    async def save_question_bank_session(
        self,
        row_id: str,
        session_id: str,
        user_id: int | str,
        record_name: str,
        job_title: str,
        industry: str,
        tone: str,
        mode: str,
        program_version: str,
        question_count: int,
        data: dict,
    ) -> str:
        now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        json_str = json.dumps(data, ensure_ascii=False, default=str)
        sql = """
            INSERT INTO question_bank_sessions
                (id, session_id, user_id, record_name, job_title, industry, tone,
                 mode, program_version, question_count, data, saved_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql, (
                    row_id, session_id, int(user_id), record_name or "", job_title or "",
                    industry or "", tone or "professional", mode or "question_bank",
                    program_version or "", question_count, json_str, now,
                ))
            await conn.commit()
        logger.debug("Saved question bank id=%s user=%s session=%s", row_id, user_id, session_id)
        return now

    async def list_question_bank_sessions_by_user(
        self, user_id: int | str, limit: int = 20,
    ) -> list[dict[str, Any]]:
        sql = """
            SELECT id, session_id, record_name, job_title, industry, tone, mode,
                   program_version, question_count, saved_at
            FROM question_bank_sessions
            WHERE user_id = %s
            ORDER BY saved_at DESC
            LIMIT %s
        """
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql, (int(user_id), limit))
                rows = await cur.fetchall()
        return [dict(row) for row in rows]

    async def get_question_bank_session_for_user(
        self, row_id: str, user_id: int | str,
    ) -> dict[str, Any] | None:
        sql = """
            SELECT id, session_id, record_name, job_title, industry, tone, mode,
                   program_version, question_count, data, saved_at
            FROM question_bank_sessions
            WHERE id = %s AND user_id = %s
            LIMIT 1
        """
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql, (row_id, int(user_id)))
                row = await cur.fetchone()
        if row is None:
            return None
        result = dict(row)
        data = result.get("data")
        if isinstance(data, str):
            result["data"] = json.loads(data)
        return result

    async def list_interactive_interviews_by_user(
        self, user_id: int | str, limit: int = 20,
    ) -> list[dict[str, Any]]:
        sql = """
            SELECT id, session_id, job_title, industry, tone, overall_score,
                   round_count, saved_at
            FROM interactive_interview_sessions
            WHERE user_id = %s
            ORDER BY saved_at DESC
            LIMIT %s
        """
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql, (int(user_id), limit))
                rows = await cur.fetchall()
        return [dict(row) for row in rows]

    async def get_interactive_interview_for_user(
        self, row_id: str, user_id: int | str,
    ) -> dict[str, Any] | None:
        sql = """
            SELECT id, session_id, job_title, industry, tone, overall_score,
                   round_count, data, saved_at
            FROM interactive_interview_sessions
            WHERE id = %s AND user_id = %s
            LIMIT 1
        """
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql, (row_id, int(user_id)))
                row = await cur.fetchone()
        if row is None:
            return None
        result = dict(row)
        data = result.get("data")
        if isinstance(data, str):
            result["data"] = json.loads(data)
        return result

    async def save_learning_path_plan(
        self,
        row_id: str,
        session_id: str,
        user_id: int | str,
        target_job: str,
        industry: str,
        estimated_total_hours: int,
        daily_hours: float,
        estimated_weeks: int,
        phase_count: int,
        data: dict,
    ) -> None:
        now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        json_str = json.dumps(data, ensure_ascii=False, default=str)
        sql = """
            INSERT INTO learning_path_plans
                (id, session_id, user_id, target_job, industry,
                 estimated_total_hours, daily_hours, estimated_weeks, phase_count, data, saved_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                target_job = VALUES(target_job),
                industry = VALUES(industry),
                estimated_total_hours = VALUES(estimated_total_hours),
                daily_hours = VALUES(daily_hours),
                estimated_weeks = VALUES(estimated_weeks),
                phase_count = VALUES(phase_count),
                data = VALUES(data),
                saved_at = VALUES(saved_at)
        """
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql, (
                    row_id, session_id, int(user_id), target_job, industry,
                    estimated_total_hours, daily_hours, estimated_weeks, phase_count, json_str, now,
                ))
            await conn.commit()
        logger.debug("Saved learning path plan id=%s user=%s session=%s", row_id, user_id, session_id)

    async def list_learning_path_plans_by_user(
        self, user_id: int | str, limit: int = 20,
    ) -> list[dict[str, Any]]:
        sql = """
            SELECT id, session_id, target_job, industry, estimated_total_hours,
                   daily_hours, estimated_weeks, phase_count, saved_at
            FROM learning_path_plans
            WHERE user_id = %s
            ORDER BY saved_at DESC
            LIMIT %s
        """
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql, (int(user_id), limit))
                rows = await cur.fetchall()
        return [dict(row) for row in rows]

    async def get_learning_path_plan_for_user(
        self, row_id: str, user_id: int | str,
    ) -> dict[str, Any] | None:
        sql = """
            SELECT id, session_id, target_job, industry, estimated_total_hours,
                   daily_hours, estimated_weeks, phase_count, data, saved_at
            FROM learning_path_plans
            WHERE id = %s AND user_id = %s
            LIMIT 1
        """
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql, (row_id, int(user_id)))
                row = await cur.fetchone()
        if row is None:
            return None
        result = dict(row)
        data = result.get("data")
        if isinstance(data, str):
            result["data"] = json.loads(data)
        if result.get("daily_hours") is not None:
            result["daily_hours"] = float(result["daily_hours"])
        return result

    async def save_profile_record(
        self,
        row_id: str,
        session_id: str,
        user_id: int | str,
        record_name: str,
        candidate_name: str,
        data: dict,
        *,
        overwrite: bool = False,
    ) -> None:
        now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        json_str = json.dumps(data, ensure_ascii=False, default=str)
        if overwrite:
            sql = """
                INSERT INTO saved_profile_records
                    (id, session_id, user_id, record_name, candidate_name, data, saved_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    session_id = VALUES(session_id),
                    record_name = VALUES(record_name),
                    candidate_name = VALUES(candidate_name),
                    data = VALUES(data),
                    saved_at = VALUES(saved_at)
            """
        else:
            sql = """
                INSERT INTO saved_profile_records
                    (id, session_id, user_id, record_name, candidate_name, data, saved_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql, (
                    row_id, session_id, int(user_id),
                    record_name or "", candidate_name or "", json_str, now,
                ))
            await conn.commit()
        logger.debug("Saved profile record id=%s user=%s session=%s", row_id, user_id, session_id)

    async def list_profile_records_by_user(
        self, user_id: int | str, limit: int = 20,
    ) -> list[dict[str, Any]]:
        sql = """
            SELECT id, session_id, record_name, candidate_name, saved_at
            FROM saved_profile_records
            WHERE user_id = %s
            ORDER BY saved_at DESC
            LIMIT %s
        """
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql, (int(user_id), limit))
                rows = await cur.fetchall()
        return [dict(row) for row in rows]

    async def get_profile_record_for_user(
        self, row_id: str, user_id: int | str,
    ) -> dict[str, Any] | None:
        sql = """
            SELECT id, session_id, record_name, candidate_name, data, saved_at
            FROM saved_profile_records
            WHERE id = %s AND user_id = %s
            LIMIT 1
        """
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql, (row_id, int(user_id)))
                row = await cur.fetchone()
        if row is None:
            return None
        result = dict(row)
        data = result.get("data")
        if isinstance(data, str):
            result["data"] = json.loads(data)
        return result

    async def save_event(self, event: dict) -> None:
        now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        sql = """
            INSERT INTO conversation_events
                (event_id, session_id, message_id, intent, triggered_agents, state_diff_summary, status, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE status = %s
        """
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql, (
                    event["event_id"], event["session_id"], event["message_id"],
                    event["intent"],
                    json.dumps(event.get("triggered_agents", []), ensure_ascii=False),
                    json.dumps(event.get("state_diff_summary", {}), ensure_ascii=False),
                    event["status"], now,
                    event["status"],
                ))
            await conn.commit()

    # ---- jd cache ----
    async def get_jd_cache_by_hash(self, jd_hash: str) -> dict[str, Any] | None:
        sql = """
            SELECT id, job_title, job_title_normalized, jd_text, jd_text_hash, title, source,
                   industry, employer_type, experience_level, params_key, parsed_job, hit_count
            FROM jd_cache
            WHERE jd_text_hash = %s
            LIMIT 1
        """
        return await self._fetch_jd_cache_row(sql, (jd_hash,))

    async def get_jd_cache_by_title(self, job_title_normalized: str) -> dict[str, Any] | None:
        sql = """
            SELECT id, job_title, job_title_normalized, jd_text, jd_text_hash, title, source,
                   industry, employer_type, experience_level, params_key, parsed_job, hit_count
            FROM jd_cache
            WHERE job_title_normalized = %s
            LIMIT 1
        """
        return await self._fetch_jd_cache_row(sql, (job_title_normalized,))

    async def get_jd_cache_by_params(self, params_key: str) -> dict[str, Any] | None:
        sql = """
            SELECT id, job_title, job_title_normalized, jd_text, jd_text_hash, title, source,
                   industry, employer_type, experience_level, params_key, parsed_job, hit_count
            FROM jd_cache
            WHERE params_key = %s
            LIMIT 1
        """
        return await self._fetch_jd_cache_row(sql, (params_key,))

    async def increment_jd_cache_hit(self, row_id: str) -> None:
        sql = "UPDATE jd_cache SET hit_count = hit_count + 1 WHERE id = %s"
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql, (row_id,))
            await conn.commit()

    async def upsert_jd_cache(self, payload: dict[str, Any]) -> None:
        parsed_job = payload.get("parsed_job")
        parsed_json = json.dumps(parsed_job, ensure_ascii=False) if parsed_job else None
        now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

        sql = """
            INSERT INTO jd_cache
                (id, job_title, job_title_normalized, jd_text, jd_text_hash, title, source,
                 industry, employer_type, experience_level, params_key, parsed_job, hit_count,
                 created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 0, %s, %s)
            ON DUPLICATE KEY UPDATE
                job_title = VALUES(job_title),
                jd_text = VALUES(jd_text),
                title = VALUES(title),
                source = VALUES(source),
                industry = IF(VALUES(industry) != '', VALUES(industry), industry),
                employer_type = IF(VALUES(employer_type) != '', VALUES(employer_type), employer_type),
                experience_level = IF(VALUES(experience_level) != '', VALUES(experience_level), experience_level),
                params_key = COALESCE(VALUES(params_key), params_key),
                parsed_job = COALESCE(VALUES(parsed_job), parsed_job),
                updated_at = VALUES(updated_at)
        """
        vals = (
            payload["id"],
            payload.get("job_title") or "",
            payload.get("job_title_normalized"),
            payload["jd_text"],
            payload["jd_text_hash"],
            payload.get("title") or "",
            payload.get("source") or "generated",
            payload.get("industry") or "",
            payload.get("employer_type") or "",
            payload.get("experience_level") or "",
            payload.get("params_key"),
            parsed_json,
            now,
            now,
        )
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql, vals)
            await conn.commit()

    async def _fetch_jd_cache_row(self, sql: str, params: tuple) -> dict[str, Any] | None:
        async with self._pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql, params)
                row = await cur.fetchone()
        if row is None:
            return None
        result = dict(row)
        parsed = result.get("parsed_job")
        if isinstance(parsed, str):
            try:
                result["parsed_job"] = json.loads(parsed)
            except json.JSONDecodeError:
                result["parsed_job"] = None
        return result
