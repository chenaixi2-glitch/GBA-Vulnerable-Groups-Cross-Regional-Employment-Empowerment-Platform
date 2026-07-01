-- 演示用企业自建岗位（与 My Jobs 截图一致）
INSERT INTO job_postings
    (source, title, department, location, post_date, applications_count, matches_count, status)
SELECT 'internal', v.title, v.department, v.location, v.post_date, v.applications_count, v.matches_count, v.status
FROM (
    SELECT 'Senior Software Developer' AS title, 'Technology Department' AS department, 'Hong Kong' AS location, '2026-05-15' AS post_date, 45 AS applications_count, 8 AS matches_count, 'active' AS status
    UNION ALL SELECT 'Marketing Manager', 'Marketing Department', 'Shenzhen', '2026-05-10', 32, 5, 'active'
    UNION ALL SELECT 'Financial Analyst', 'Finance Department', 'Macau', '2026-05-05', 28, 3, 'active'
    UNION ALL SELECT 'Customer Service Representative', 'Customer Service Department', 'Guangzhou', '2026-04-28', 56, 12, 'interviewing'
    UNION ALL SELECT 'Human Resources Manager', 'HR Department', 'Hong Kong', '2026-04-20', 38, 6, 'closed'
) AS v
WHERE NOT EXISTS (SELECT 1 FROM job_postings WHERE source = 'internal' LIMIT 1);