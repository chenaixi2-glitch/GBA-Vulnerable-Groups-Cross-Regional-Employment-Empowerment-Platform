-- 爬虫岗位标记为弱势群体友好；已有外部岗位批量更新
USE gba_website;

UPDATE job_postings
   SET vulnerable_group_friendly = 1,
       target_group_types = JSON_ARRAY('disability')
 WHERE source = 'external'
   AND (vulnerable_group_friendly IS NULL OR vulnerable_group_friendly = 0);
