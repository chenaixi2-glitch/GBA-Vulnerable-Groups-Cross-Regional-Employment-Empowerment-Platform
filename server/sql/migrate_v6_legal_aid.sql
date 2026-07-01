-- 增量迁移：弱势群体法律服务诉求申请与接单
USE gba_website;

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
    status              ENUM('pending','assigned','platform_assisting','in_progress','resolved','cancelled')
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
