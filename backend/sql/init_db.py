# 示例: 在项目根目录执行 python backend/sql/init_db.py
"""执行 init_schema.sql 在 MySQL 服务器上初始化数据库和表结构。

依赖 backend/config.yaml 中的 mysql 配置（host, port, user, password）。
注意：连接时不指定 database，因为 SQL 脚本中包含 CREATE DATABASE。
"""

from __future__ import annotations

import sys
from pathlib import Path

# 确保 backend 目录在 sys.path 中，便于导入 config_loader。
_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

import pymysql

from config_loader import get_mysql_config

_SQL_FILE = Path(__file__).parent / "init_schema.sql"


def run_init_schema() -> None:
    """读取 init_schema.sql 并逐条执行。"""
    cfg = get_mysql_config()

    if not _SQL_FILE.exists():
        print(f"[ERROR] SQL 文件不存在: {_SQL_FILE}")
        sys.exit(1)

    sql_text = _SQL_FILE.read_text(encoding="utf-8")

    # 按分号拆分语句，过滤空白和纯注释
    statements = [s.strip() for s in sql_text.split(";") if s.strip()]
    statements = [s for s in statements if not _is_comment_only(s)]

    print(f"[INFO] 连接 MySQL {cfg['host']}:{cfg['port']} (user={cfg['user']})")

    connection = pymysql.connect(
        host=cfg["host"],
        port=cfg["port"],
        user=cfg["user"],
        password=cfg["password"],
        charset=cfg.get("charset", "utf8mb4"),
        # 不指定 database，由 SQL 脚本中的 USE 语句切换
        autocommit=True,
    )

    try:
        with connection.cursor() as cursor:
            for i, stmt in enumerate(statements, 1):
                try:
                    cursor.execute(stmt)
                    print(f"  [{i}/{len(statements)}] OK")
                except pymysql.Error as e:
                    print(f"  [{i}/{len(statements)}] WARN: {e}")
        print("[INFO] 数据库初始化完成。")
        _migrate_sessions_user_id(connection)
        _migrate_interactive_interview_sessions(connection)
        _migrate_question_bank_sessions(connection)
        _migrate_learning_path_plans(connection)
        _migrate_jd_cache(connection)
        _migrate_saved_profile_records(connection)
    finally:
        connection.close()


def _migrate_sessions_user_id(connection) -> None:
    """为已有 sessions 表补充 user_id 列（幂等）。"""
    cfg = get_mysql_config()
    db_name = cfg["database"]
    sql = f"""
        ALTER TABLE `{db_name}`.`sessions`
        ADD COLUMN user_id BIGINT UNSIGNED DEFAULT NULL
            COMMENT '登录用户 ID（来自 Node JWT sub）' AFTER session_id
    """
    try:
        with connection.cursor() as cursor:
            cursor.execute(sql)
        print("[INFO] sessions.user_id 列已添加。")
    except pymysql.Error as e:
        if e.args and e.args[0] == 1060:
            print("[INFO] sessions.user_id 列已存在，跳过迁移。")
        else:
            print(f"[WARN] sessions.user_id 迁移失败: {e}")


def _migrate_interactive_interview_sessions(connection) -> None:
    """为已有库补充 interactive_interview_sessions 表（幂等）。"""
    cfg = get_mysql_config()
    db_name = cfg["database"]
    sql = f"""
        CREATE TABLE IF NOT EXISTS `{db_name}`.`interactive_interview_sessions` (
            id            VARCHAR(64)      PRIMARY KEY,
            session_id    VARCHAR(64)      NOT NULL,
            user_id       BIGINT UNSIGNED  NOT NULL COMMENT '登录用户 ID（来自 Node JWT sub）',
            job_title     VARCHAR(256)     NOT NULL DEFAULT '',
            industry      VARCHAR(64)      NOT NULL DEFAULT '',
            tone          VARCHAR(32)      NOT NULL DEFAULT 'professional',
            overall_score INT              DEFAULT NULL,
            round_count   INT              NOT NULL DEFAULT 0,
            data          JSON             NOT NULL,
            saved_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_iis_user (user_id),
            INDEX idx_iis_session (session_id),
            INDEX idx_iis_saved_at (saved_at),
            FOREIGN KEY (session_id) REFERENCES `{db_name}`.`sessions`(session_id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """
    try:
        with connection.cursor() as cursor:
            cursor.execute(sql)
        print("[INFO] interactive_interview_sessions 表已就绪。")
    except pymysql.Error as e:
        print(f"[WARN] interactive_interview_sessions 迁移失败: {e}")


def _migrate_question_bank_sessions(connection) -> None:
    """为已有库补充 question_bank_sessions 表（幂等）。"""
    cfg = get_mysql_config()
    db_name = cfg["database"]
    sql = f"""
        CREATE TABLE IF NOT EXISTS `{db_name}`.`question_bank_sessions` (
            id               VARCHAR(64)      PRIMARY KEY,
            session_id       VARCHAR(64)      NOT NULL,
            user_id          BIGINT UNSIGNED  NOT NULL COMMENT '登录用户 ID（来自 Node JWT sub）',
            record_name      VARCHAR(256)     NOT NULL DEFAULT '',
            job_title        VARCHAR(256)     NOT NULL DEFAULT '',
            industry         VARCHAR(64)      NOT NULL DEFAULT '',
            tone             VARCHAR(32)      NOT NULL DEFAULT 'professional',
            mode             VARCHAR(32)      NOT NULL DEFAULT 'question_bank',
            program_version  VARCHAR(32)      NOT NULL DEFAULT '',
            question_count   INT              NOT NULL DEFAULT 0,
            data             JSON             NOT NULL,
            saved_at         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_qbs_user (user_id),
            INDEX idx_qbs_session (session_id),
            INDEX idx_qbs_saved_at (saved_at),
            FOREIGN KEY (session_id) REFERENCES `{db_name}`.`sessions`(session_id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """
    try:
        with connection.cursor() as cursor:
            cursor.execute(sql)
        print("[INFO] question_bank_sessions 表已就绪。")
    except pymysql.Error as e:
        print(f"[WARN] question_bank_sessions 迁移失败: {e}")


def _migrate_learning_path_plans(connection) -> None:
    """为已有库补充 learning_path_plans 表（幂等）。"""
    cfg = get_mysql_config()
    db_name = cfg["database"]
    sql = f"""
        CREATE TABLE IF NOT EXISTS `{db_name}`.`learning_path_plans` (
            id                    VARCHAR(64)      PRIMARY KEY,
            session_id            VARCHAR(64)      NOT NULL,
            user_id               BIGINT UNSIGNED  NOT NULL COMMENT '登录用户 ID（来自 Node JWT sub）',
            target_job            VARCHAR(256)     NOT NULL DEFAULT '',
            industry              VARCHAR(64)      NOT NULL DEFAULT '',
            estimated_total_hours INT              NOT NULL DEFAULT 0,
            daily_hours           DECIMAL(4,1)     NOT NULL DEFAULT 0,
            estimated_weeks       INT              NOT NULL DEFAULT 0,
            phase_count           INT              NOT NULL DEFAULT 0,
            data                  JSON             NOT NULL,
            saved_at              DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_lpp_user (user_id),
            INDEX idx_lpp_session (session_id),
            INDEX idx_lpp_saved_at (saved_at),
            FOREIGN KEY (session_id) REFERENCES `{db_name}`.`sessions`(session_id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """
    try:
        with connection.cursor() as cursor:
            cursor.execute(sql)
        print("[INFO] learning_path_plans 表已就绪。")
    except pymysql.Error as e:
        print(f"[WARN] learning_path_plans 迁移失败: {e}")


def _migrate_jd_cache(connection) -> None:
    """为已有库补充 jd_cache 表（幂等）。"""
    cfg = get_mysql_config()
    db_name = cfg["database"]
    sql = f"""
        CREATE TABLE IF NOT EXISTS `{db_name}`.`jd_cache` (
            id                    VARCHAR(64)      PRIMARY KEY,
            job_title             VARCHAR(256)     NOT NULL DEFAULT '',
            job_title_normalized  VARCHAR(256)     DEFAULT NULL COMMENT '归一化岗位名，用于相似岗位匹配',
            jd_text               LONGTEXT         NOT NULL,
            jd_text_hash          VARCHAR(64)      NOT NULL,
            title                 VARCHAR(256)     NOT NULL DEFAULT '',
            source                ENUM('generated', 'uploaded') NOT NULL DEFAULT 'generated',
            industry              VARCHAR(128)     NOT NULL DEFAULT '',
            employer_type         VARCHAR(32)      NOT NULL DEFAULT '',
            experience_level      VARCHAR(128)     NOT NULL DEFAULT '',
            params_key            VARCHAR(64)      DEFAULT NULL COMMENT '行业+单位性质+经验等级哈希',
            parsed_job            JSON             DEFAULT NULL COMMENT 'jd_agent 解析结果',
            hit_count             INT              NOT NULL DEFAULT 0,
            created_at            DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at            DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uk_jd_cache_title (job_title_normalized),
            UNIQUE KEY uk_jd_cache_hash (jd_text_hash),
            UNIQUE KEY uk_jd_cache_params (params_key),
            INDEX idx_jd_cache_updated (updated_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """
    try:
        with connection.cursor() as cursor:
            cursor.execute(sql)
        print("[INFO] jd_cache 表已就绪。")
    except pymysql.Error as e:
        print(f"[WARN] jd_cache 迁移失败: {e}")


def _migrate_saved_profile_records(connection) -> None:
    """为已有库补充 saved_profile_records 表（幂等）。"""
    cfg = get_mysql_config()
    db_name = cfg["database"]
    sql = f"""
        CREATE TABLE IF NOT EXISTS `{db_name}`.`saved_profile_records` (
            id              VARCHAR(64)      PRIMARY KEY,
            session_id      VARCHAR(64)      NOT NULL,
            user_id         BIGINT UNSIGNED  NOT NULL COMMENT '登录用户 ID（来自 Node JWT sub）',
            record_name     VARCHAR(256)     NOT NULL DEFAULT '',
            candidate_name  VARCHAR(128)     NOT NULL DEFAULT '',
            data            JSON             NOT NULL,
            saved_at        DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_spr_user (user_id),
            INDEX idx_spr_session (session_id),
            INDEX idx_spr_saved_at (saved_at),
            FOREIGN KEY (session_id) REFERENCES `{db_name}`.`sessions`(session_id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """
    try:
        with connection.cursor() as cursor:
            cursor.execute(sql)
        print("[INFO] saved_profile_records 表已就绪。")
    except pymysql.Error as e:
        print(f"[WARN] saved_profile_records 迁移失败: {e}")


def _is_comment_only(sql: str) -> bool:
    """判断 SQL 片段是否只包含注释和空行。"""
    for line in sql.splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("--"):
            return False
    return True


if __name__ == "__main__":
    run_init_schema()
