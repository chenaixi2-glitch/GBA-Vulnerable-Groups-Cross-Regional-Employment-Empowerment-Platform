'use strict';

const crypto = require('crypto');
const { query } = require('../config/db');

function parseJson(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    application_id: row.application_id,
    job_id: row.job_id,
    candidate_user_id: row.candidate_user_id,
    invited_by_user_id: row.invited_by_user_id,
    company_org_id: row.company_org_id ?? null,
    invite_token: row.invite_token,
    status: row.status,
    program_version: row.program_version || 'quick',
    question_mode: row.question_mode || 'ai_only',
    custom_questions: parseJson(row.custom_questions) || [],
    meeting_link: row.meeting_link || null,
    meeting_instructions: row.meeting_instructions || null,
    overall_score: row.overall_score != null ? Number(row.overall_score) : null,
    category_scores: parseJson(row.category_scores),
    debrief_summary: row.debrief_summary || null,
    ai_session_id: row.ai_session_id || null,
    ai_record_id: row.ai_record_id || null,
    started_at: row.started_at || null,
    completed_at: row.completed_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    applicant_name: row.applicant_name,
    applicant_email: row.applicant_email,
    job_title: row.job_title,
    company_name: row.company_name,
    job_description: row.job_description,
    job_industry: row.job_industry,
    match_score: row.match_score != null ? Number(row.match_score) : undefined,
    inviter_name: row.inviter_name,
  };
}

function newToken() {
  return crypto.randomBytes(24).toString('hex');
}

async function findById(id) {
  const rows = await query('SELECT * FROM interview_invites WHERE id = ? LIMIT 1', [id]);
  return mapRow(rows[0]);
}

async function findByToken(token) {
  const rows = await query(
    `SELECT i.*,
            u.full_name AS applicant_name, u.email AS applicant_email,
            j.title AS job_title, j.company_name, j.description AS job_description,
            j.department AS job_industry,
            a.match_score
     FROM interview_invites i
     JOIN users u ON u.id = i.candidate_user_id
     JOIN job_postings j ON j.id = i.job_id
     JOIN job_applications a ON a.id = i.application_id
     WHERE i.invite_token = ?
     LIMIT 1`,
    [token]
  );
  return mapRow(rows[0]);
}

async function findActiveByApplication(applicationId, invitedByUserId) {
  const rows = await query(
    `SELECT * FROM interview_invites
     WHERE application_id = ? AND invited_by_user_id = ?
       AND status IN ('invited', 'in_progress')
     ORDER BY id DESC LIMIT 1`,
    [applicationId, invitedByUserId]
  );
  return mapRow(rows[0]);
}

async function findLatestByApplicationIds(applicationIds) {
  if (!applicationIds || !applicationIds.length) return {};
  const placeholders = applicationIds.map(() => '?').join(',');
  const rows = await query(
    `SELECT i.*
     FROM interview_invites i
     INNER JOIN (
       SELECT application_id, MAX(id) AS max_id
       FROM interview_invites
       WHERE application_id IN (${placeholders})
         AND status <> 'cancelled'
       GROUP BY application_id
     ) t ON t.max_id = i.id`,
    applicationIds
  );
  const map = {};
  rows.forEach((row) => {
    map[row.application_id] = mapRow(row);
  });
  return map;
}

async function createInvite(data) {
  const token = newToken();
  const result = await query(
    `INSERT INTO interview_invites
      (application_id, job_id, candidate_user_id, invited_by_user_id, company_org_id,
       invite_token, status, program_version, question_mode, custom_questions,
       meeting_link, meeting_instructions)
     VALUES (?, ?, ?, ?, ?, ?, 'invited', ?, ?, ?, ?, ?)`,
    [
      data.application_id,
      data.job_id,
      data.candidate_user_id,
      data.invited_by_user_id,
      data.company_org_id || null,
      token,
      data.program_version || 'quick',
      data.question_mode || 'ai_only',
      JSON.stringify(data.custom_questions || []),
      data.meeting_link || null,
      data.meeting_instructions || null,
    ]
  );
  return findById(result.insertId);
}

/**
 * 企业用户自己的面试看板（按邀请人隔离，不跨 HR 混显）
 */
async function listBoardForInviter(invitedByUserId, { status } = {}) {
  const where = ['i.invited_by_user_id = ?'];
  const params = [invitedByUserId];
  if (status && status !== 'all') {
    where.push('i.status = ?');
    params.push(status);
  }
  const rows = await query(
    `SELECT i.*,
            u.full_name AS applicant_name, u.email AS applicant_email,
            j.title AS job_title, j.company_name,
            a.match_score
     FROM interview_invites i
     JOIN users u ON u.id = i.candidate_user_id
     JOIN job_postings j ON j.id = i.job_id
     JOIN job_applications a ON a.id = i.application_id
     WHERE ${where.join(' AND ')}
     ORDER BY
       FIELD(i.status, 'invited', 'in_progress', 'completed', 'cancelled'),
       i.updated_at DESC`,
    params
  );
  return rows.map(mapRow);
}

async function listForCandidate(candidateUserId) {
  const rows = await query(
    `SELECT i.*,
            j.title AS job_title, j.company_name, j.description AS job_description,
            inv.full_name AS inviter_name,
            a.match_score
     FROM interview_invites i
     JOIN job_postings j ON j.id = i.job_id
     JOIN job_applications a ON a.id = i.application_id
     LEFT JOIN users inv ON inv.id = i.invited_by_user_id
     WHERE i.candidate_user_id = ?
       AND i.status IN ('invited', 'in_progress', 'completed')
     ORDER BY
       FIELD(i.status, 'invited', 'in_progress', 'completed'),
       i.created_at DESC`,
    [candidateUserId]
  );
  return rows.map(mapRow);
}

async function markInProgress(id, aiSessionId) {
  await query(
    `UPDATE interview_invites
     SET status = 'in_progress',
         ai_session_id = COALESCE(?, ai_session_id),
         started_at = COALESCE(started_at, NOW())
     WHERE id = ? AND status IN ('invited', 'in_progress')`,
    [aiSessionId || null, id]
  );
  return findById(id);
}

async function markCompleted(id, payload) {
  await query(
    `UPDATE interview_invites
     SET status = 'completed',
         overall_score = ?,
         category_scores = ?,
         debrief_summary = ?,
         ai_session_id = COALESCE(?, ai_session_id),
         ai_record_id = COALESCE(?, ai_record_id),
         completed_at = NOW()
     WHERE id = ? AND status IN ('invited', 'in_progress', 'completed')`,
    [
      payload.overall_score != null ? payload.overall_score : null,
      JSON.stringify(payload.category_scores || null),
      payload.debrief_summary || null,
      payload.ai_session_id || null,
      payload.ai_record_id || null,
      id,
    ]
  );
  return findById(id);
}

async function cancelInvite(id) {
  await query(
    `UPDATE interview_invites SET status = 'cancelled' WHERE id = ? AND status IN ('invited', 'in_progress')`,
    [id]
  );
  return findById(id);
}

module.exports = {
  findById,
  findByToken,
  findActiveByApplication,
  findLatestByApplicationIds,
  createInvite,
  listBoardForInviter,
  listForCandidate,
  markInProgress,
  markCompleted,
  cancelInvite,
};
