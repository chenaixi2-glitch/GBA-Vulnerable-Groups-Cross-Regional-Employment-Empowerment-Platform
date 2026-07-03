-- ============================================================
-- AI Career Copilot — 建库与建表（幂等，可重复执行）
-- 兼容 MySQL 8.0 / MariaDB 10.x
--
-- 部署：在 backend/ 目录配置 .env 后执行
--   python sql/init_db.py
-- 线上 RDS 与 Node 认证库 gba_website 同实例，本脚本创建 ai_career_copilot 库
-- ============================================================

-- 1. 创建数据库（如不存在）
CREATE DATABASE IF NOT EXISTS ai_career_copilot
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE ai_career_copilot;

-- 2. 会话表
CREATE TABLE IF NOT EXISTS sessions (
    session_id  VARCHAR(64)  PRIMARY KEY,
    user_id     BIGINT UNSIGNED DEFAULT NULL COMMENT '登录用户 ID（来自 Node JWT sub）',
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    status      ENUM('active', 'archived') NOT NULL DEFAULT 'active',
    INDEX idx_sessions_status (status),
    INDEX idx_sessions_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. JD 表
CREATE TABLE IF NOT EXISTS jobs (
    id          VARCHAR(64)  PRIMARY KEY,
    session_id  VARCHAR(64)  NOT NULL,
    version     INT          NOT NULL DEFAULT 1,
    data        JSON         NOT NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_jobs_session (session_id),
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. 候选人画像表
CREATE TABLE IF NOT EXISTS candidate_profiles (
    id          VARCHAR(64)  PRIMARY KEY,
    session_id  VARCHAR(64)  NOT NULL,
    version     INT          NOT NULL DEFAULT 1,
    data        JSON         NOT NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_profiles_session (session_id),
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. 简历内容表
CREATE TABLE IF NOT EXISTS resume_contents (
    id            VARCHAR(64)  PRIMARY KEY,
    session_id    VARCHAR(64)  NOT NULL,
    version       INT          NOT NULL DEFAULT 1,
    data          JSON         NOT NULL,
    content_hash  VARCHAR(64)  NOT NULL DEFAULT '',
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_resume_contents_session (session_id),
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. 渲染配置表
CREATE TABLE IF NOT EXISTS render_configs (
    id          VARCHAR(64)  PRIMARY KEY,
    session_id  VARCHAR(64)  NOT NULL,
    version     INT          NOT NULL DEFAULT 1,
    data        JSON         NOT NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_render_configs_session (session_id),
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. HTML 快照表
CREATE TABLE IF NOT EXISTS resume_htmls (
    id                           VARCHAR(64)  PRIMARY KEY,
    session_id                   VARCHAR(64)  NOT NULL,
    version                      INT          NOT NULL DEFAULT 1,
    html                         LONGTEXT     NOT NULL,
    derived_from_content_version INT          NOT NULL DEFAULT 1,
    derived_from_render_version  INT          NOT NULL DEFAULT 1,
    checksum                     VARCHAR(64)  NOT NULL DEFAULT '',
    created_at                   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_resume_htmls_session (session_id),
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. 面试问答表
CREATE TABLE IF NOT EXISTS interview_qas (
    id          VARCHAR(64)  PRIMARY KEY,
    session_id  VARCHAR(64)  NOT NULL,
    version     INT          NOT NULL DEFAULT 1,
    data        JSON         NOT NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_interview_qas_session (session_id),
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. 交互式模拟面试记录表（登录用户主动保存）
CREATE TABLE IF NOT EXISTS interactive_interview_sessions (
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
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10a. 题库模式保存记录（登录用户主动保存，含自定义名称）
CREATE TABLE IF NOT EXISTS question_bank_sessions (
    id               VARCHAR(64)      PRIMARY KEY,
    session_id       VARCHAR(64)      NOT NULL,
    user_id          BIGINT UNSIGNED  NOT NULL COMMENT '登录用户 ID（来自 Node JWT sub）',
    record_name      VARCHAR(256)     NOT NULL DEFAULT '',
    job_title        VARCHAR(256)     NOT NULL DEFAULT '',
    industry         VARCHAR(64)      NOT NULL DEFAULT '',
    tone             VARCHAR(32)      NOT NULL DEFAULT 'professional',
    mode             VARCHAR(32)      NOT NULL DEFAULT 'question_bank' COMMENT 'question_bank | custom',
    program_version  VARCHAR(32)      NOT NULL DEFAULT '',
    question_count   INT              NOT NULL DEFAULT 0,
    data             JSON             NOT NULL,
    saved_at         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_qbs_user (user_id),
    INDEX idx_qbs_session (session_id),
    INDEX idx_qbs_saved_at (saved_at),
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10b. 学习路径计划表（登录用户主动保存）
CREATE TABLE IF NOT EXISTS learning_path_plans (
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
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10d. 用户主动保存的简历资料记录（可多条，含自定义名称）
CREATE TABLE IF NOT EXISTS saved_profile_records (
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
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10c. JD 缓存表（按岗位名称 / JD 文本 / 生成参数复用，减少 LLM 调用）
CREATE TABLE IF NOT EXISTS jd_cache (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. 事件流表
CREATE TABLE IF NOT EXISTS conversation_events (
    event_id           VARCHAR(64)  PRIMARY KEY,
    session_id         VARCHAR(64)  NOT NULL,
    message_id         VARCHAR(64)  NOT NULL,
    intent             VARCHAR(32)  NOT NULL,
    triggered_agents   JSON         NOT NULL,
    state_diff_summary JSON         DEFAULT NULL,
    status             ENUM('success', 'failed', 'partial') NOT NULL DEFAULT 'success',
    created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_events_session (session_id),
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
