-- 增量迁移：捐款箱 + 弱势群体法律服务资金记录
USE gba_website;

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
