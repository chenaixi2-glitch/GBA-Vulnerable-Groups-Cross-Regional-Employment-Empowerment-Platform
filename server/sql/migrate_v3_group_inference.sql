-- 增量迁移：用户画像字段 + 自动推断人群类型（已有库执行一次即可）
USE gba_website;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS age              TINYINT UNSIGNED DEFAULT NULL COMMENT '年龄' AFTER phone,
    ADD COLUMN IF NOT EXISTS gender           ENUM('male','female','other','prefer_not_say') DEFAULT NULL COMMENT '性别' AFTER age,
    ADD COLUMN IF NOT EXISTS disability_type  VARCHAR(50) DEFAULT NULL COMMENT '残疾类型，none=无' AFTER gender,
    ADD COLUMN IF NOT EXISTS career_gap_years DECIMAL(4,1) DEFAULT NULL COMMENT '职业空窗年限' AFTER disability_type,
    ADD COLUMN IF NOT EXISTS current_income   DECIMAL(12,2) DEFAULT NULL COMMENT '当前月收入(元)' AFTER career_gap_years,
    ADD COLUMN IF NOT EXISTS group_types      JSON DEFAULT NULL COMMENT '系统推断的人群类型数组' AFTER current_income;

-- 将旧版单选 group_type 迁移为 JSON 数组（若存在旧列）
UPDATE users
   SET group_types = JSON_ARRAY(group_type)
 WHERE group_type IS NOT NULL
   AND group_type != ''
   AND group_type != 'ethnic_minority'
   AND (group_types IS NULL OR JSON_LENGTH(group_types) = 0);

-- 可选：删除已废弃的单选列（MariaDB 10.5+ / MySQL 8）
-- ALTER TABLE users DROP COLUMN IF EXISTS group_type;
