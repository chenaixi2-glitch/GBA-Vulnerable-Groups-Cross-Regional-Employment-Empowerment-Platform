-- 增量迁移：人群类型、企业信息、简历、投递（已有库执行一次即可）
USE gba_website;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS group_type VARCHAR(50) DEFAULT NULL COMMENT '弱势群体类型(个人用户注册时选择)' AFTER phone;

ALTER TABLE job_postings
    ADD COLUMN IF NOT EXISTS target_group_types JSON DEFAULT NULL COMMENT '目标人群类型数组' AFTER disability_type,
    ADD COLUMN IF NOT EXISTS skills JSON DEFAULT NULL COMMENT '岗位所需技能' AFTER target_group_types;

CREATE TABLE IF NOT EXISTS company_profiles (
    id                  BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    user_id             BIGINT UNSIGNED NOT NULL,
    company_name        VARCHAR(200)  NOT NULL,
    industry            VARCHAR(100)  DEFAULT NULL,
    description         TEXT          DEFAULT NULL,
    address             VARCHAR(300)  DEFAULT NULL,
    contact_email       VARCHAR(120)  DEFAULT NULL,
    contact_phone       VARCHAR(30)   DEFAULT NULL,
    website             VARCHAR(300)  DEFAULT NULL,
    license_no          VARCHAR(100)  DEFAULT NULL,
    employee_count      VARCHAR(50)   DEFAULT NULL,
    inclusivity_info    TEXT          DEFAULT NULL,
    created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_company_user (user_id),
    KEY idx_company_name (company_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_resumes (
    id            BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    user_id       BIGINT UNSIGNED NOT NULL,
    content_json  JSON            NOT NULL,
    skills_text   TEXT            DEFAULT NULL,
    version       INT UNSIGNED    NOT NULL DEFAULT 1,
    created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_resume_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS job_applications (
    id              BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    job_id          BIGINT UNSIGNED NOT NULL,
    user_id         BIGINT UNSIGNED NOT NULL,
    resume_snapshot JSON            DEFAULT NULL,
    match_score     TINYINT UNSIGNED NOT NULL DEFAULT 0,
    match_reasons   JSON            DEFAULT NULL,
    cover_message   TEXT            DEFAULT NULL,
    status          ENUM('pending','reviewing','accepted','rejected') NOT NULL DEFAULT 'pending',
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_application_job_user (job_id, user_id),
    KEY idx_application_job (job_id),
    KEY idx_application_user (user_id),
    KEY idx_application_score (job_id, match_score)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
