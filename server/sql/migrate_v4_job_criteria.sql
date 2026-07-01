-- 增量迁移：岗位硬性匹配条件 + 弱势群体友好标签
USE gba_website;

ALTER TABLE job_postings
    ADD COLUMN IF NOT EXISTS target_criteria JSON DEFAULT NULL COMMENT '岗位目标硬性条件(年龄/性别/残疾/空窗)' AFTER target_group_types,
    ADD COLUMN IF NOT EXISTS vulnerable_group_friendly TINYINT NOT NULL DEFAULT 0 COMMENT '弱势群体友好标签' AFTER target_criteria;

ALTER TABLE company_profiles
    ADD COLUMN IF NOT EXISTS vulnerable_group_friendly TINYINT NOT NULL DEFAULT 0 COMMENT '企业弱势群体友好标签' AFTER inclusivity_info;
