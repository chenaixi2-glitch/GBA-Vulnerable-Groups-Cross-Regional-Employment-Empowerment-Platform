'use strict';

const { query } = require('../config/db');
const {
  parseGroupTypesJson,
  parseTargetCriteria,
  userMatchesJobCriteria,
  buildJobTargetingFromCriteria,
  deriveJobGroupTypes,
  computeVulnerableFriendly,
} = require('../constants/groupTypes');
const { mapRowSkills } = require('../services/match.service');

function mapRow(row) {
  if (!row) return null;
  return mapRowSkills({
    id: row.id,
    external_id: row.external_id,
    source: row.source,
    source_url: row.source_url,
    company_user_id: row.company_user_id,
    company_org_id: row.company_org_id ?? null,
    title: row.title,
    department: row.department,
    company_name: row.company_name,
    location: row.location,
    post_date: row.post_date,
    applications_count: row.applications_count,
    matches_count: row.matches_count,
    status: row.status,
    description: row.description,
    salary: row.salary,
    education: row.education,
    work_experience: row.work_experience,
    disability_type: row.disability_type,
    target_group_types: row.target_group_types,
    target_criteria: row.target_criteria,
    vulnerable_group_friendly: Boolean(row.vulnerable_group_friendly),
    interview_format: row.interview_format || 'ai_only',
    interview_custom_questions: (() => {
      const v = row.interview_custom_questions;
      if (!v) return [];
      if (Array.isArray(v)) return v;
      if (typeof v === 'object') return v;
      try { return JSON.parse(v); } catch { return []; }
    })(),
    meeting_link: row.meeting_link || null,
    meeting_instructions: row.meeting_instructions || null,
    skills: row.skills,
    is_active_on_source: row.is_active_on_source,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
}

async function listJobs({ status, search, source, companyUserId, vulnerableGroupFriendly, page = 1, pageSize = 10 }) {
  const where = ['1=1'];
  const params = [];

  if (status && status !== 'all') {
    where.push('status = ?');
    params.push(status);
  }
  if (source && ['internal', 'external'].includes(source)) {
    where.push('source = ?');
    params.push(source);
  }
  if (companyUserId) {
    where.push('company_user_id = ?');
    params.push(companyUserId);
  }
  if (vulnerableGroupFriendly === true || vulnerableGroupFriendly === 'true' || vulnerableGroupFriendly === '1') {
    where.push('vulnerable_group_friendly = 1');
  }
  if (search) {
    where.push('(title LIKE ? OR department LIKE ? OR company_name LIKE ? OR location LIKE ?)');
    const kw = `%${search}%`;
    params.push(kw, kw, kw, kw);
  }

  const whereSql = where.join(' AND ');
  const offset = (page - 1) * pageSize;

  const countRows = await query(
    `SELECT COUNT(*) AS total FROM job_postings WHERE ${whereSql}`,
    params
  );
  const total = countRows[0].total;

  const rows = await query(
    `SELECT * FROM job_postings
     WHERE ${whereSql}
     ORDER BY
       CASE source WHEN 'internal' THEN 0 ELSE 1 END,
       post_date DESC,
       id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return {
    items: rows.map(mapRow),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

/** 获取活跃岗位（供个人端硬性条件筛选 + 评分） */
async function listActiveForMatching({ user, source = 'internal' } = {}) {
  const where = ["status = 'active'"];
  const params = [];
  if (source) {
    where.push('source = ?');
    params.push(source);
  }

  const rows = await query(
    `SELECT * FROM job_postings WHERE ${where.join(' AND ')} ORDER BY post_date DESC, id DESC`,
    params
  );

  return rows
    .map(mapRow)
    .filter((job) => userMatchesJobCriteria(user, job.target_criteria, {
      source: job.source,
      vulnerable_group_friendly: job.vulnerable_group_friendly,
    }));
}

async function findById(id) {
  const rows = await query('SELECT * FROM job_postings WHERE id = ? LIMIT 1', [id]);
  return mapRow(rows[0]);
}

function serializeJsonField(val) {
  if (val === undefined || val === null) return null;
  if (typeof val === 'string') return val;
  return JSON.stringify(val);
}

function applyTargetingFields(data) {
  if (data.target_criteria === undefined) return data;
  const criteria = data.target_criteria;
  if (
    criteria.min_age !== undefined ||
    criteria.max_age !== undefined ||
    criteria.prioritize_vulnerable !== undefined
  ) {
    const target_group_types = deriveJobGroupTypes(criteria);
    return {
      ...data,
      target_criteria: criteria,
      target_group_types,
      vulnerable_group_friendly: computeVulnerableFriendly(criteria, target_group_types),
    };
  }
  const built = buildJobTargetingFromCriteria(criteria);
  return {
    ...data,
    target_criteria: built.target_criteria,
    target_group_types: built.target_group_types,
    vulnerable_group_friendly: built.vulnerable_group_friendly,
  };
}

async function createJob(data) {
  const payload = applyTargetingFields(data);
  const result = await query(
    `INSERT INTO job_postings
      (source, title, department, company_name, location, post_date,
       applications_count, matches_count, status, description, salary,
       education, work_experience, disability_type, target_group_types,
       target_criteria, vulnerable_group_friendly,
       interview_format, interview_custom_questions, meeting_link, meeting_instructions,
       skills, company_user_id, company_org_id)
     VALUES ('internal', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.title,
      payload.department || null,
      payload.company_name || null,
      payload.location || null,
      payload.post_date || null,
      payload.applications_count || 0,
      payload.matches_count || 0,
      payload.status || 'active',
      payload.description || null,
      payload.salary || null,
      payload.education || null,
      payload.work_experience || null,
      payload.disability_type || null,
      serializeJsonField(payload.target_group_types),
      serializeJsonField(payload.target_criteria),
      payload.vulnerable_group_friendly ? 1 : 0,
      payload.interview_format || 'ai_only',
      serializeJsonField(payload.interview_custom_questions || []),
      payload.meeting_link || null,
      payload.meeting_instructions || null,
      serializeJsonField(payload.skills),
      payload.company_user_id || null,
      payload.company_org_id || null,
    ]
  );
  return findById(result.insertId);
}

async function updateJob(id, data) {
  const payload = applyTargetingFields(data);
  const fields = [];
  const params = [];
  const allowed = [
    'title', 'department', 'company_name', 'location', 'post_date',
    'description', 'salary', 'education', 'work_experience', 'disability_type',
    'target_group_types', 'target_criteria', 'vulnerable_group_friendly', 'skills',
    'interview_format', 'interview_custom_questions', 'meeting_link', 'meeting_instructions',
  ];

  allowed.forEach((key) => {
    if (payload[key] !== undefined) {
      fields.push(`${key} = ?`);
      const val = ['target_group_types', 'target_criteria', 'skills', 'interview_custom_questions'].includes(key)
        ? serializeJsonField(payload[key])
        : key === 'vulnerable_group_friendly'
          ? (payload[key] ? 1 : 0)
          : payload[key];
      params.push(val);
    }
  });

  if (!fields.length) return findById(id);

  params.push(id);
  await query(
    `UPDATE job_postings SET ${fields.join(', ')} WHERE id = ? AND source = 'internal'`,
    params
  );
  return findById(id);
}

async function incrementApplicationsCount(id) {
  await query(
    'UPDATE job_postings SET applications_count = applications_count + 1 WHERE id = ?',
    [id]
  );
}

async function updateStatus(id, status) {
  await query(
    `UPDATE job_postings SET status = ? WHERE id = ? AND source = 'internal'`,
    [status, id]
  );
  return findById(id);
}

async function cloneJob(id) {
  const job = await findById(id);
  if (!job || job.source !== 'internal') return null;

  const result = await query(
    `INSERT INTO job_postings
      (source, title, department, company_name, location, post_date,
       applications_count, matches_count, status, description, salary,
       education, work_experience, disability_type, target_group_types,
       target_criteria, vulnerable_group_friendly,
       interview_format, interview_custom_questions, meeting_link, meeting_instructions,
       skills, company_user_id, company_org_id)
     VALUES ('internal', ?, ?, ?, ?, CURDATE(), 0, 0, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      `${job.title} (Copy)`,
      job.department ?? null,
      job.company_name ?? null,
      job.location ?? null,
      job.description ?? null,
      job.salary ?? null,
      job.education ?? null,
      job.work_experience ?? null,
      job.disability_type ?? null,
      serializeJsonField(job.target_group_types),
      serializeJsonField(job.target_criteria),
      job.vulnerable_group_friendly ? 1 : 0,
      job.interview_format || 'ai_only',
      serializeJsonField(job.interview_custom_questions || []),
      job.meeting_link || null,
      job.meeting_instructions || null,
      serializeJsonField(job.skills),
      job.company_user_id ?? null,
      job.company_org_id ?? null,
    ]
  );
  return findById(result.insertId);
}

async function decrementApplicationsCount(id) {
  await query(
    'UPDATE job_postings SET applications_count = GREATEST(0, applications_count - 1) WHERE id = ?',
    [id]
  );
}

/** 记录匹配曝光（去重），并更新 matches_count */
async function recordMatchImpressions(jobIds, userId) {
  if (!jobIds?.length || !userId) return;
  for (const jobId of jobIds) {
    const result = await query(
      'INSERT IGNORE INTO job_match_impressions (job_id, user_id) VALUES (?, ?)',
      [jobId, userId]
    );
    if (result.affectedRows > 0) {
      await query(
        'UPDATE job_postings SET matches_count = matches_count + 1 WHERE id = ?',
        [jobId]
      );
    }
  }
}

/** 记录外部岗位跳转意向 */
async function recordExternalInterest(jobId, userId) {
  const result = await query(
    'INSERT IGNORE INTO job_external_interests (job_id, user_id) VALUES (?, ?)',
    [jobId, userId]
  );
  return result.affectedRows > 0;
}

async function deleteJob(id) {
  await query('DELETE FROM job_applications WHERE job_id = ?', [id]);
  await query('DELETE FROM job_match_impressions WHERE job_id = ?', [id]);
  const result = await query(
    `DELETE FROM job_postings WHERE id = ? AND source = 'internal'`,
    [id]
  );
  return result.affectedRows > 0;
}

module.exports = {
  listJobs,
  listActiveForMatching,
  findById,
  createJob,
  updateJob,
  incrementApplicationsCount,
  decrementApplicationsCount,
  updateStatus,
  cloneJob,
  deleteJob,
  recordMatchImpressions,
  recordExternalInterest,
  parseGroupTypesJson,
  parseTargetCriteria,
};
