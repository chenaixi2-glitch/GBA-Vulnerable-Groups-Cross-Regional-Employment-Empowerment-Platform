-- 岗位匹配曝光记录（用于 matches_count 去重统计）
CREATE TABLE IF NOT EXISTS job_match_impressions (
    job_id      BIGINT UNSIGNED NOT NULL,
    user_id     BIGINT UNSIGNED NOT NULL,
    created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (job_id, user_id),
    KEY idx_impression_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 外部岗位跳转意向（爬虫岗位 off-platform 投递追踪）
CREATE TABLE IF NOT EXISTS job_external_interests (
    id          BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    job_id      BIGINT UNSIGNED NOT NULL,
    user_id     BIGINT UNSIGNED NOT NULL,
    created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_external_interest (job_id, user_id),
    KEY idx_external_interest_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
