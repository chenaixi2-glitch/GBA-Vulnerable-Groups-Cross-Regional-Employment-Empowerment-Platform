"""MySQL 读写封装。"""
import json
from contextlib import contextmanager
from datetime import datetime

import pymysql

from config import DB_CONFIG


@contextmanager
def get_connection():
    conn = pymysql.connect(
        host=DB_CONFIG["host"],
        port=DB_CONFIG["port"],
        user=DB_CONFIG["user"],
        password=DB_CONFIG["password"],
        database=DB_CONFIG["database"],
        charset=DB_CONFIG["charset"],
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
    )
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def parse_post_date(value):
    if not value:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(str(value)[:19], fmt).date().isoformat()
        except ValueError:
            continue
    return None


def upsert_external_job(job):
    """插入或更新外部岗位。"""
    external_id = job.get("_resolved_id") or job.get("id")
    if not external_id:
        return False
    external_id = str(external_id)

    post_date = parse_post_date(job.get("updateDate") or job.get("newTime") or job.get("createDate"))
    status = "active" if str(job.get("status", "1")) == "1" else "closed"
    source_url = f"{job.get('_base_url', '')}/#/jobDetail?id={external_id}"

    sql = """
        INSERT INTO job_postings (
            external_id, source, source_url, title, department, company_name,
            location, post_date, status, description, salary, education,
            work_experience, disability_type, raw_data, is_active_on_source
        ) VALUES (
            %(external_id)s, 'external', %(source_url)s, %(title)s, %(department)s, %(company_name)s,
            %(location)s, %(post_date)s, %(status)s, %(description)s, %(salary)s, %(education)s,
            %(work_experience)s, %(disability_type)s, %(raw_data)s, %(is_active_on_source)s
        )
        ON DUPLICATE KEY UPDATE
            title = VALUES(title),
            department = VALUES(department),
            company_name = VALUES(company_name),
            location = VALUES(location),
            post_date = VALUES(post_date),
            status = VALUES(status),
            description = VALUES(description),
            salary = VALUES(salary),
            education = VALUES(education),
            work_experience = VALUES(work_experience),
            disability_type = VALUES(disability_type),
            raw_data = VALUES(raw_data),
            is_active_on_source = VALUES(is_active_on_source),
            updated_at = CURRENT_TIMESTAMP
    """

    params = {
        "external_id": external_id,
        "source_url": source_url,
        "title": job.get("name") or "未命名岗位",
        "department": job.get("industryNature") or job.get("positionType"),
        "company_name": job.get("complayName"),
        "location": job.get("workArea") or job.get("city"),
        "post_date": post_date,
        "status": status,
        "description": job.get("workSpecification"),
        "salary": job.get("monthlyPay"),
        "education": job.get("education"),
        "work_experience": job.get("workExp"),
        "disability_type": job.get("disabilityType"),
        "raw_data": json.dumps(job, ensure_ascii=False),
        "is_active_on_source": 1 if status == "active" else 0,
    }

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
    return True


def mark_missing_external_jobs(active_external_ids):
    """将本次未抓取到的外部岗位标记为已关闭。"""
    with get_connection() as conn:
        with conn.cursor() as cur:
            if not active_external_ids:
                cur.execute(
                    "UPDATE job_postings SET status='closed', is_active_on_source=0 "
                    "WHERE source='external' AND is_active_on_source=1"
                )
                return cur.rowcount

            placeholders = ",".join(["%s"] * len(active_external_ids))
            sql = (
                f"UPDATE job_postings SET status='closed', is_active_on_source=0 "
                f"WHERE source='external' AND external_id NOT IN ({placeholders}) "
                f"AND is_active_on_source=1"
            )
            cur.execute(sql, list(active_external_ids))
            return cur.rowcount
