-- ============================================================
-- GBA 平台 Node 后端建库建表（幂等，可重复执行）
-- 兼容 MariaDB 10.x 与 MySQL 8.0
-- ============================================================

CREATE DATABASE IF NOT EXISTS gba_website
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE gba_website;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id            BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    username      VARCHAR(50)  NOT NULL,
    email         VARCHAR(120) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role          ENUM('individual', 'corporate', 'admin') NOT NULL DEFAULT 'individual',
    full_name     VARCHAR(100) DEFAULT NULL,
    phone         VARCHAR(30)  DEFAULT NULL,
    status        TINYINT      NOT NULL DEFAULT 1 COMMENT '1=正常,0=禁用',
    last_login_at DATETIME     DEFAULT NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_users_username (username),
    UNIQUE KEY uk_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 企业招聘岗位表（含爬虫同步的外部岗位）
CREATE TABLE IF NOT EXISTS job_postings (
    id                  BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    external_id         VARCHAR(64)   DEFAULT NULL COMMENT '外部平台岗位原始ID',
    source              ENUM('internal', 'external') NOT NULL DEFAULT 'internal',
    source_url          VARCHAR(500)  DEFAULT NULL COMMENT '外部岗位详情链接',
    company_user_id     BIGINT UNSIGNED DEFAULT NULL COMMENT '企业自建岗位所属用户',
    title               VARCHAR(200)  NOT NULL,
    department          VARCHAR(100)  DEFAULT NULL,
    company_name        VARCHAR(200)  DEFAULT NULL COMMENT '招聘单位（外部岗位）',
    location            VARCHAR(100)  DEFAULT NULL,
    post_date           DATE          DEFAULT NULL,
    applications_count  INT UNSIGNED  NOT NULL DEFAULT 0,
    matches_count       INT UNSIGNED  NOT NULL DEFAULT 0,
    status              ENUM('active', 'interviewing', 'closed') NOT NULL DEFAULT 'active',
    description         TEXT          DEFAULT NULL,
    salary              VARCHAR(100)  DEFAULT NULL,
    education           VARCHAR(100)  DEFAULT NULL,
    work_experience     VARCHAR(100)  DEFAULT NULL,
    disability_type     VARCHAR(200)  DEFAULT NULL,
    raw_data            JSON          DEFAULT NULL COMMENT '爬虫原始JSON',
    is_active_on_source TINYINT       NOT NULL DEFAULT 1 COMMENT '外部源站是否仍在招',
    created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_job_external (source, external_id),
    KEY idx_job_source (source),
    KEY idx_job_status (status),
    KEY idx_job_company_user (company_user_id),
    KEY idx_job_post_date (post_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 演示用企业自建岗位（与 My Jobs 截图一致）
INSERT INTO job_postings
    (source, title, department, location, post_date, applications_count, matches_count, status)
SELECT 'internal', v.title, v.department, v.location, v.post_date, v.applications_count, v.matches_count, v.status
FROM (
    SELECT 'Senior Software Developer' AS title, 'Technology Department' AS department, 'Hong Kong' AS location, '2026-05-15' AS post_date, 45 AS applications_count, 8 AS matches_count, 'active' AS status
    UNION ALL SELECT 'Marketing Manager', 'Marketing Department', 'Shenzhen', '2026-05-10', 32, 5, 'active'
    UNION ALL SELECT 'Financial Analyst', 'Finance Department', 'Macau', '2026-05-05', 28, 3, 'active'
    UNION ALL SELECT 'Customer Service Representative', 'Customer Service Department', 'Guangzhou', '2026-04-28', 56, 12, 'interviewing'
    UNION ALL SELECT 'Human Resources Manager', 'HR Department', 'Hong Kong', '2026-04-20', 38, 6, 'closed'
) AS v
WHERE NOT EXISTS (SELECT 1 FROM job_postings WHERE source = 'internal' LIMIT 1);
