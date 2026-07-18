-- 企业评估面试：自拟题目模式
USE gba_website;

ALTER TABLE interview_invites
    ADD COLUMN question_mode ENUM('ai_only','partial_custom','full_custom')
        NOT NULL DEFAULT 'ai_only'
        COMMENT 'ai_only=仅AI题库; partial_custom=AI+企业题+追问; full_custom=仅企业题'
        AFTER program_version;

ALTER TABLE interview_invites
    ADD COLUMN custom_questions JSON DEFAULT NULL
        COMMENT '企业自拟题目列表'
        AFTER question_mode;
