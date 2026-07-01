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
    hr_title      VARCHAR(100)  DEFAULT NULL COMMENT 'HR 职位头衔',
    joined_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (org_id, user_id),
    UNIQUE KEY uk_org_member_user (user_id),
    KEY idx_org_member_org (org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE company_profiles
    ADD COLUMN org_id BIGINT UNSIGNED DEFAULT NULL COMMENT '所属企业组织',
    ADD KEY idx_company_org (org_id);

ALTER TABLE job_postings
    ADD COLUMN company_org_id BIGINT UNSIGNED DEFAULT NULL COMMENT '所属企业组织',
    ADD KEY idx_job_org (company_org_id);

ALTER TABLE job_applications
    ADD COLUMN status_updated_by BIGINT UNSIGNED DEFAULT NULL COMMENT '最近更新状态的企业用户',
    ADD KEY idx_app_status_updater (status_updated_by);

-- 为已有企业账号回填组织（MySQL 8+）
INSERT INTO company_orgs (name, invite_code, created_by_user_id)
SELECT cp.company_name, UPPER(LEFT(MD5(CONCAT('gba-org-', cp.user_id)), 8)), cp.user_id
FROM company_profiles cp
WHERE cp.org_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM company_orgs o WHERE o.created_by_user_id = cp.user_id
  );

UPDATE company_profiles cp
JOIN company_orgs o ON o.created_by_user_id = cp.user_id
SET cp.org_id = o.id
WHERE cp.org_id IS NULL;

INSERT IGNORE INTO company_org_members (org_id, user_id, member_role, hr_title)
SELECT cp.org_id, cp.user_id, 'owner', 'HR Owner'
FROM company_profiles cp
WHERE cp.org_id IS NOT NULL;

UPDATE job_postings j
JOIN company_profiles cp ON cp.user_id = j.company_user_id
SET j.company_org_id = cp.org_id
WHERE j.company_org_id IS NULL AND j.source = 'internal' AND cp.org_id IS NOT NULL;
