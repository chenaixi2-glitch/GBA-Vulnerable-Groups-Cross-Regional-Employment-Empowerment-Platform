-- 密码重置令牌表（v8）
USE gba_website;

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
