'use strict';

const { query } = require('../config/db');
const { parseGroupTypesJson } = require('../constants/groupTypes');

function mapRow(row) {
  if (!row) return null;
  const parse = (v) => {
    if (!v) return null;
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch { return v; }
  };
  return {
    id: row.id,
    job_id: row.job_id,
    user_id: row.user_id,
    resume_snapshot: parse(row.resume_snapshot),
    match_score: row.match_score,
    match_reasons: parse(row.match_reasons),
    cover_message: row.cover_message,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    applicant_name: row.applicant_name,
    applicant_email: row.applicant_email,
    applicant_group_types: parseGroupTypesJson(row.applicant_group_types),
    job_title: row.job_title,
    company_name: row.company_name,
    vulnerable_group_friendly: row.vulnerable_group_friendly != null
      ? Boolean(row.vulnerable_group_friendly)
      : undefined,
    job_source: row.job_source,
    job_status: row.job_status,
    source_url: row.source_url,
  };
}

async function findById(id) {
  const rows = await query('SELECT * FROM job_applications WHERE id = ? LIMIT 1', [id]);
  return mapRow(rows[0]);
}

async function findByJobAndUser(jobId, userId) {
  const rows = await query(
    'SELECT * FROM job_applications WHERE job_id = ? AND user_id = ? LIMIT 1',
    [jobId, userId]
  );
  return mapRow(rows[0]);
}

async function createApplication(data) {
  const result = await query(
    `INSERT INTO job_applications
      (job_id, user_id, resume_snapshot, match_score, match_reasons, cover_message)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.job_id,
      data.user_id,
      JSON.stringify(data.resume_snapshot || null),
      data.match_score || 0,
      JSON.stringify(data.match_reasons || []),
      data.cover_message || null,
    ]
  );
  const rows = await query('SELECT * FROM job_applications WHERE id = ?', [result.insertId]);
  return mapRow(rows[0]);
}

async function deleteByIdForUser(id, userId) {
  const app = await findById(id);
  if (!app || app.user_id !== userId) return null;
  await query('DELETE FROM job_applications WHERE id = ? AND user_id = ?', [id, userId]);
  return app;
}

async function listByJob(jobId) {
  const rows = await query(
    `SELECT a.*, u.full_name AS applicant_name, u.email AS applicant_email,
            u.group_types AS applicant_group_types
     FROM job_applications a
     JOIN users u ON u.id = a.user_id
     WHERE a.job_id = ?
     ORDER BY a.match_score DESC, a.created_at DESC`,
    [jobId]
  );
  return rows.map(mapRow);
}

async function countByJob(jobId) {
  const rows = await query(
    'SELECT COUNT(*) AS cnt FROM job_applications WHERE job_id = ?',
    [jobId]
  );
  return rows[0].cnt;
}

async function listByUser(userId) {
  const rows = await query(
    `SELECT a.*, j.title AS job_title, j.vulnerable_group_friendly, j.company_name,
            j.source AS job_source, j.status AS job_status, j.source_url
     FROM job_applications a
     JOIN job_postings j ON j.id = a.job_id
     WHERE a.user_id = ?
     ORDER BY a.created_at DESC`,
    [userId]
  );
  return rows.map(mapRow);
}

async function updateStatus(id, status, updatedBy) {
  await query(
    'UPDATE job_applications SET status = ?, status_updated_by = ? WHERE id = ?',
    [status, updatedBy || null, id]
  );
  return findById(id);
}

module.exports = {
  findById,
  findByJobAndUser,
  createApplication,
  deleteByIdForUser,
  listByJob,
  countByJob,
  listByUser,
  updateStatus,
};
