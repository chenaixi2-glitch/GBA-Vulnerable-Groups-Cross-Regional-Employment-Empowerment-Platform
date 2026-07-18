-- 岗位级面试配置 + 人工面会议链接；邀约改为继承岗位配置快照
USE gba_website;

ALTER TABLE job_postings
    ADD COLUMN interview_format ENUM('ai_only','partial_custom','full_custom','human')
        NOT NULL DEFAULT 'ai_only'
        COMMENT '岗位面试方式：AI全自动/部分自拟/全部自拟/人工会议'
        AFTER vulnerable_group_friendly;

ALTER TABLE job_postings
    ADD COLUMN interview_custom_questions JSON DEFAULT NULL
        COMMENT '岗位自拟面试题'
        AFTER interview_format;

ALTER TABLE job_postings
    ADD COLUMN meeting_link VARCHAR(500) DEFAULT NULL
        COMMENT '人工面第三方会议链接'
        AFTER interview_custom_questions;

ALTER TABLE job_postings
    ADD COLUMN meeting_instructions TEXT DEFAULT NULL
        COMMENT '入会说明（时间/密码/注意事项）'
        AFTER meeting_link;

-- 邀约表扩展：支持 human，并快照会议信息
ALTER TABLE interview_invites
    MODIFY question_mode ENUM('ai_only','partial_custom','full_custom','human')
        NOT NULL DEFAULT 'ai_only';

ALTER TABLE interview_invites
    ADD COLUMN meeting_link VARCHAR(500) DEFAULT NULL AFTER custom_questions;

ALTER TABLE interview_invites
    ADD COLUMN meeting_instructions TEXT DEFAULT NULL AFTER meeting_link;
