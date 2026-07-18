-- 增量迁移：企业指派 AI 评估面试邀请（按邀请人隔离看板）
USE gba_website;

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
