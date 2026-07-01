-- 增量迁移：法律诉求多人帮助记录 + 申请人完成状态
USE gba_website;

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

ALTER TABLE legal_aid_requests
    MODIFY status ENUM(
        'pending',
        'assigned',
        'platform_assisting',
        'in_progress',
        'resolved',
        'completed',
        'cancelled'
    ) NOT NULL DEFAULT 'pending';
