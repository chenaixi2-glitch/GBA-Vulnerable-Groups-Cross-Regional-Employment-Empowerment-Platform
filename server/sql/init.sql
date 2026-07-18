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
    full_name           VARCHAR(100) DEFAULT NULL,
    phone               VARCHAR(30)  DEFAULT NULL,
    age                 TINYINT UNSIGNED DEFAULT NULL COMMENT '年龄',
    gender              ENUM('male','female','other','prefer_not_say') DEFAULT NULL COMMENT '性别',
    disability_type     VARCHAR(50)  DEFAULT NULL COMMENT '残疾类型，none=无',
    career_gap_years    DECIMAL(4,1) DEFAULT NULL COMMENT '职业空窗年限',
    current_income      DECIMAL(12,2) DEFAULT NULL COMMENT '当前月收入(元)',
    group_types         JSON         DEFAULT NULL COMMENT '系统推断的人群类型数组',
    status        TINYINT      NOT NULL DEFAULT 1 COMMENT '1=正常,0=禁用',
    last_login_at DATETIME     DEFAULT NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_users_username (username),
    UNIQUE KEY uk_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 密码重置令牌
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id          BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    user_id     BIGINT UNSIGNED NOT NULL,
    token_hash  CHAR(64)     NOT NULL COMMENT 'SHA256 hex',
    expires_at  DATETIME     NOT NULL,
    used_at     DATETIME     DEFAULT NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_prt_user (user_id),
    KEY idx_prt_hash (token_hash),
    KEY idx_prt_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 企业招聘岗位表（含爬虫同步的外部岗位）
CREATE TABLE IF NOT EXISTS job_postings (
    id                  BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    external_id         VARCHAR(64)   DEFAULT NULL COMMENT '外部平台岗位原始ID',
    source              ENUM('internal', 'external') NOT NULL DEFAULT 'internal',
    source_url          VARCHAR(500)  DEFAULT NULL COMMENT '外部岗位详情链接',
    company_user_id     BIGINT UNSIGNED DEFAULT NULL COMMENT '企业自建岗位所属用户',
    company_org_id      BIGINT UNSIGNED DEFAULT NULL COMMENT '所属企业组织',
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
    target_group_types  JSON          DEFAULT NULL COMMENT '推导的弱势群体类型标签',
    target_criteria     JSON          DEFAULT NULL COMMENT '岗位目标硬性条件(年龄/性别/残疾/空窗)',
    vulnerable_group_friendly TINYINT NOT NULL DEFAULT 0 COMMENT '弱势群体友好标签',
    interview_format    ENUM('ai_only','partial_custom','full_custom','human') NOT NULL DEFAULT 'ai_only'
                        COMMENT '岗位面试方式',
    interview_custom_questions JSON DEFAULT NULL COMMENT '岗位自拟面试题',
    meeting_link        VARCHAR(500)  DEFAULT NULL COMMENT '人工面第三方会议链接',
    meeting_instructions TEXT         DEFAULT NULL COMMENT '入会说明',
    skills              JSON          DEFAULT NULL COMMENT '岗位所需技能',
    raw_data            JSON          DEFAULT NULL COMMENT '爬虫原始JSON',
    is_active_on_source TINYINT       NOT NULL DEFAULT 1 COMMENT '外部源站是否仍在招',
    created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_job_external (source, external_id),
    KEY idx_job_source (source),
    KEY idx_job_status (status),
    KEY idx_job_company_user (company_user_id),
    KEY idx_job_org (company_org_id),
    KEY idx_job_post_date (post_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 企业组织（多 HR 共享）
CREATE TABLE IF NOT EXISTS company_orgs (
    id                  BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    name                VARCHAR(200)  NOT NULL,
    invite_code         VARCHAR(16)   NOT NULL,
    created_by_user_id  BIGINT UNSIGNED DEFAULT NULL,
    created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_org_invite (invite_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS company_org_members (
    org_id        BIGINT UNSIGNED NOT NULL,
    user_id       BIGINT UNSIGNED NOT NULL,
    member_role   ENUM('owner', 'recruiter', 'viewer') NOT NULL DEFAULT 'recruiter',
    hr_title      VARCHAR(100)  DEFAULT NULL,
    joined_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (org_id, user_id),
    UNIQUE KEY uk_org_member_user (user_id),
    KEY idx_org_member_org (org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 企业信息表
CREATE TABLE IF NOT EXISTS company_profiles (
    id                  BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    user_id             BIGINT UNSIGNED NOT NULL,
    org_id              BIGINT UNSIGNED DEFAULT NULL COMMENT '所属企业组织',
    company_name        VARCHAR(200)  NOT NULL,
    industry            VARCHAR(100)  DEFAULT NULL,
    description         TEXT          DEFAULT NULL,
    address             VARCHAR(300)  DEFAULT NULL,
    contact_email       VARCHAR(120)  DEFAULT NULL,
    contact_phone       VARCHAR(30)   DEFAULT NULL,
    website             VARCHAR(300)  DEFAULT NULL,
    license_no          VARCHAR(100)  DEFAULT NULL COMMENT '营业执照编号',
    employee_count      VARCHAR(50)   DEFAULT NULL,
    inclusivity_info    TEXT          DEFAULT NULL COMMENT '包容性用工说明',
    vulnerable_group_friendly TINYINT NOT NULL DEFAULT 0 COMMENT '企业弱势群体友好标签',
    created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_company_user (user_id),
    KEY idx_company_name (company_name),
    KEY idx_company_org (org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 用户最新简历（用于岗位匹配）
CREATE TABLE IF NOT EXISTS user_resumes (
    id            BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    user_id       BIGINT UNSIGNED NOT NULL,
    content_json  JSON            NOT NULL,
    skills_text   TEXT            DEFAULT NULL COMMENT '技能摘要，便于检索',
    version       INT UNSIGNED    NOT NULL DEFAULT 1,
    created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_resume_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 岗位投递记录（含匹配评分）
CREATE TABLE IF NOT EXISTS job_applications (
    id              BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    job_id          BIGINT UNSIGNED NOT NULL,
    user_id         BIGINT UNSIGNED NOT NULL,
    resume_snapshot JSON            DEFAULT NULL,
    match_score     TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '0-100',
    match_reasons   JSON            DEFAULT NULL,
    cover_message   TEXT            DEFAULT NULL,
    status          ENUM('pending','reviewing','accepted','rejected') NOT NULL DEFAULT 'pending',
    status_updated_by BIGINT UNSIGNED DEFAULT NULL COMMENT '最近更新状态的企业用户',
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_application_job_user (job_id, user_id),
    KEY idx_application_job (job_id),
    KEY idx_application_user (user_id),
    KEY idx_application_score (job_id, match_score),
    KEY idx_app_status_updater (status_updated_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 岗位匹配曝光记录（matches_count 去重统计）
CREATE TABLE IF NOT EXISTS job_match_impressions (
    job_id      BIGINT UNSIGNED NOT NULL,
    user_id     BIGINT UNSIGNED NOT NULL,
    created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (job_id, user_id),
    KEY idx_impression_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 外部岗位跳转意向
CREATE TABLE IF NOT EXISTS job_external_interests (
    id          BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    job_id      BIGINT UNSIGNED NOT NULL,
    user_id     BIGINT UNSIGNED NOT NULL,
    created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_external_interest (job_id, user_id),
    KEY idx_external_interest_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 捐款箱记录（全额用于弱势群体法律服务）
CREATE TABLE IF NOT EXISTS donations (
    id              BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    user_id         BIGINT UNSIGNED NOT NULL COMMENT '捐款用户',
    amount          DECIMAL(12,2)   NOT NULL COMMENT '捐款金额(元)，不限上限',
    currency        VARCHAR(10)     NOT NULL DEFAULT 'CNY',
    purpose         VARCHAR(100)    NOT NULL DEFAULT 'legal_service' COMMENT '用途：弱势群体法律服务',
    message         VARCHAR(500)    DEFAULT NULL COMMENT '留言/备注',
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_donation_user (user_id),
    KEY idx_donation_purpose (purpose),
    KEY idx_donation_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 弱势群体法律服务诉求（用户申请 / 律师或志愿者接单 / 平台协助）
CREATE TABLE IF NOT EXISTS legal_aid_requests (
    id                  BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    applicant_user_id   BIGINT UNSIGNED NOT NULL COMMENT '申请人',
    category            VARCHAR(50)     NOT NULL COMMENT '诉求类别',
    title               VARCHAR(200)    NOT NULL COMMENT '诉求标题',
    description         TEXT            NOT NULL COMMENT '诉求详情',
    attachments         JSON            DEFAULT NULL COMMENT '附件[{name,mime,size,data_base64}]',
    contact_phone       VARCHAR(30)     DEFAULT NULL,
    contact_email       VARCHAR(120)    DEFAULT NULL,
    prefer_platform     TINYINT         NOT NULL DEFAULT 0 COMMENT '1=优先请求平台协助联系',
    status              ENUM('pending','assigned','platform_assisting','in_progress','resolved','completed','cancelled')
                        NOT NULL DEFAULT 'pending',
    assignee_user_id    BIGINT UNSIGNED DEFAULT NULL COMMENT '接单人',
    assignee_role       ENUM('lawyer','volunteer','other') DEFAULT NULL COMMENT '接单人身份',
    assignee_note       VARCHAR(500)    DEFAULT NULL COMMENT '接单人留言',
    assignee_contact    VARCHAR(120)    DEFAULT NULL COMMENT '接单人联系方式',
    platform_note       VARCHAR(1000)   DEFAULT NULL COMMENT '平台协助备注',
    accepted_at         DATETIME        DEFAULT NULL,
    resolved_at         DATETIME        DEFAULT NULL,
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_legal_aid_applicant (applicant_user_id),
    KEY idx_legal_aid_assignee (assignee_user_id),
    KEY idx_legal_aid_status (status),
    KEY idx_legal_aid_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS legal_aid_responses (
    id              BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    request_id      BIGINT UNSIGNED NOT NULL COMMENT '关联诉求',
    helper_user_id  BIGINT UNSIGNED NOT NULL COMMENT '提供帮助的用户',
    helper_role     ENUM('lawyer','volunteer','other') NOT NULL DEFAULT 'volunteer' COMMENT '帮助者身份',
    contact         VARCHAR(120)    DEFAULT NULL COMMENT '联系方式',
    note            VARCHAR(500)    DEFAULT NULL COMMENT '提供的帮助说明',
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_legal_aid_response (request_id, helper_user_id),
    KEY idx_legal_aid_response_request (request_id),
    KEY idx_legal_aid_response_helper (helper_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 企业指派 AI 评估面试邀请（看板按 invited_by_user_id 隔离）
CREATE TABLE IF NOT EXISTS interview_invites (
    id                  BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    application_id      BIGINT UNSIGNED NOT NULL COMMENT '关联投递',
    job_id              BIGINT UNSIGNED NOT NULL,
    candidate_user_id   BIGINT UNSIGNED NOT NULL,
    invited_by_user_id  BIGINT UNSIGNED NOT NULL COMMENT '发起邀请的企业用户（看板隔离键）',
    company_org_id      BIGINT UNSIGNED DEFAULT NULL,
    invite_token        VARCHAR(64)     NOT NULL,
    status              ENUM('invited','in_progress','completed','cancelled') NOT NULL DEFAULT 'invited',
    program_version     VARCHAR(32)     NOT NULL DEFAULT 'quick',
    question_mode       ENUM('ai_only','partial_custom','full_custom','human') NOT NULL DEFAULT 'ai_only'
                        COMMENT 'ai_only=仅AI题库; partial_custom=AI+企业题+追问; full_custom=仅企业题; human=人工会议',
    custom_questions    JSON            DEFAULT NULL COMMENT '企业自拟题目列表（邀约时从岗位快照）',
    meeting_link        VARCHAR(500)    DEFAULT NULL COMMENT '人工面会议链接快照',
    meeting_instructions TEXT           DEFAULT NULL COMMENT '入会说明快照',
    overall_score       TINYINT UNSIGNED DEFAULT NULL COMMENT '0-100 最终得分',
    category_scores     JSON            DEFAULT NULL,
    debrief_summary     TEXT            DEFAULT NULL,
    ai_session_id       VARCHAR(80)     DEFAULT NULL,
    ai_record_id        VARCHAR(80)     DEFAULT NULL,
    started_at          DATETIME        DEFAULT NULL,
    completed_at        DATETIME        DEFAULT NULL,
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_interview_invite_token (invite_token),
    KEY idx_interview_invite_app (application_id),
    KEY idx_interview_invite_job (job_id),
    KEY idx_interview_invite_candidate (candidate_user_id),
    KEY idx_interview_invite_inviter (invited_by_user_id, status),
    KEY idx_interview_invite_org (company_org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 演示用企业自建岗位（与 My Jobs 截图一致；canonical copy: test-data/seed/demo-jobs.sql）
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
