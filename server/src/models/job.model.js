'use strict';

const { query } = require('../config/db');

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    external_id: row.external_id,
    source: row.source,
    source_url: row.source_url,
    company_user_id: row.company_user_id,
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
    is_active_on_source: row.is_active_on_source,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function listJobs({ status, search, source, page = 1, pageSize = 10 }) {
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

async function findById(id) {
  const rows = await query('SELECT * FROM job_postings WHERE id = ? LIMIT 1', [id]);
  return mapRow(rows[0]);
}

async function createJob(data) {
  const result = await query(
    `INSERT INTO job_postings
      (source, title, department, company_name, location, post_date,
       applications_count, matches_count, status, description, salary,
       education, work_experience, disability_type, company_user_id)
     VALUES ('internal', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.title,
      data.department || null,
      data.company_name || null,
      data.location || null,
      data.post_date || null,
      data.applications_count || 0,
      data.matches_count || 0,
      data.status || 'active',
      data.description || null,
      data.salary || null,
      data.education || null,
      data.work_experience || null,
      data.disability_type || null,
      data.company_user_id || null,
    ]
  );
  return findById(result.insertId);
}

async function updateJob(id, data) {
  const fields = [];
  const params = [];
  const allowed = [
    'title', 'department', 'company_name', 'location', 'post_date',
    'description', 'salary', 'education', 'work_experience', 'disability_type',
  ];

  allowed.forEach((key) => {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`);
      params.push(data[key]);
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
       education, work_experience, disability_type, company_user_id)
     VALUES ('internal', ?, ?, ?, ?, CURDATE(), 0, 0, 'active', ?, ?, ?, ?, ?, ?)`,
    [
      `${job.title} (Copy)`,
      job.department,
      job.company_name,
      job.location,
      job.description,
      job.salary,
      job.education,
      job.work_experience,
      job.disability_type,
      job.company_user_id,
    ]
  );
  return findById(result.insertId);
}

async function deleteJob(id) {
  const result = await query(
    `DELETE FROM job_postings WHERE id = ? AND source = 'internal'`,
    [id]
  );
  return result.affectedRows > 0;
}

module.exports = {
  listJobs,
  findById,
  createJob,
  updateJob,
  updateStatus,
  cloneJob,
  deleteJob,
};
