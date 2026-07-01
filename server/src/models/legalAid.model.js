'use strict';

const { query } = require('../config/db');
const { parseAttachments } = require('../constants/legalAid');

function maskName(name) {
  if (!name || typeof name !== 'string') return '用户';
  const trimmed = name.trim();
  if (trimmed.length <= 1) return trimmed + '*';
  return trimmed[0] + '*'.repeat(Math.min(trimmed.length - 1, 2));
}

function mapRow(row) {
  if (!row) return null;
  return {
    ...row,
    prefer_platform: Boolean(row.prefer_platform),
    attachments: parseAttachments(row.attachments),
    applicant_display_name: row.applicant_full_name
      ? maskName(row.applicant_full_name)
      : maskName(row.applicant_username),
    assignee_display_name: row.assignee_full_name
      ? maskName(row.assignee_full_name)
      : row.assignee_username
        ? maskName(row.assignee_username)
        : null,
  };
}

function mapResponseRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    request_id: row.request_id,
    helper_user_id: row.helper_user_id,
    helper_role: row.helper_role,
    contact: row.contact,
    note: row.note,
    created_at: row.created_at,
    helper_display_name: row.helper_full_name
      ? maskName(row.helper_full_name)
      : maskName(row.helper_username),
  };
}

const SELECT_FIELDS = `
  r.id, r.applicant_user_id, r.category, r.title, r.description, r.attachments,
  r.contact_phone, r.contact_email, r.prefer_platform, r.status,
  r.assignee_user_id, r.assignee_role, r.assignee_note, r.assignee_contact,
  r.platform_note, r.accepted_at, r.resolved_at, r.created_at, r.updated_at,
  ua.username AS applicant_username, ua.full_name AS applicant_full_name,
  ug.username AS assignee_username, ug.full_name AS assignee_full_name
`;


const LegalAidModel = {
  async create({
    applicantUserId,
    category,
    title,
    description,
    attachments,
    contactPhone,
    contactEmail,
    preferPlatform,
    status = 'pending',
    platformNote = null,
  }) {
    const result = await query(
      `INSERT INTO legal_aid_requests
        (applicant_user_id, category, title, description, attachments,
         contact_phone, contact_email, prefer_platform, status, platform_note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        applicantUserId,
        category,
        title,
        description,
        attachments ? JSON.stringify(attachments) : null,
        contactPhone || null,
        contactEmail || null,
        preferPlatform ? 1 : 0,
        status,
        platformNote,
      ]
    );
    return this.findById(result.insertId);
  },

  async findById(id) {
    const rows = await query(
      `SELECT ${SELECT_FIELDS}
         FROM legal_aid_requests r
         JOIN users ua ON ua.id = r.applicant_user_id
         LEFT JOIN users ug ON ug.id = r.assignee_user_id
        WHERE r.id = ?
        LIMIT 1`,
      [id]
    );
    return mapRow(rows[0]);
  },

  async listByApplicant(userId, { completed = false } = {}, limit = 50) {
    const statusClause = completed
      ? `r.status = 'completed'`
      : `r.status NOT IN ('completed', 'cancelled')`;
    const rows = await query(
      `SELECT ${SELECT_FIELDS}
         FROM legal_aid_requests r
         JOIN users ua ON ua.id = r.applicant_user_id
         LEFT JOIN users ug ON ug.id = r.assignee_user_id
        WHERE r.applicant_user_id = ?
          AND ${statusClause}
        ORDER BY r.created_at DESC
        LIMIT ?`,
      [userId, limit]
    );
    return rows.map(mapRow);
  },

  async listByHelper(userId, limit = 50) {
    const rows = await query(
      `SELECT DISTINCT ${SELECT_FIELDS}
         FROM legal_aid_responses resp
         JOIN legal_aid_requests r ON r.id = resp.request_id
         JOIN users ua ON ua.id = r.applicant_user_id
         LEFT JOIN users ug ON ug.id = r.assignee_user_id
        WHERE resp.helper_user_id = ?
        ORDER BY resp.created_at DESC
        LIMIT ?`,
      [userId, limit]
    );
    return rows.map(mapRow);
  },

  async listOpen(excludeUserId, limit = 50) {
    const rows = await query(
      `SELECT ${SELECT_FIELDS}
         FROM legal_aid_requests r
         JOIN users ua ON ua.id = r.applicant_user_id
         LEFT JOIN users ug ON ug.id = r.assignee_user_id
        WHERE r.status NOT IN ('completed', 'cancelled')
          AND r.applicant_user_id != ?
        ORDER BY r.prefer_platform DESC, r.created_at ASC
        LIMIT ?`,
      [excludeUserId, limit]
    );
    return rows.map(mapRow);
  },

  async findResponse(requestId, helperUserId) {
    const rows = await query(
      `SELECT id FROM legal_aid_responses
        WHERE request_id = ? AND helper_user_id = ?
        LIMIT 1`,
      [requestId, helperUserId]
    );
    return rows[0] || null;
  },

  async addResponse(requestId, { helperUserId, helperRole, helperNote, helperContact }) {
    const result = await query(
      `INSERT INTO legal_aid_responses
        (request_id, helper_user_id, helper_role, contact, note)
       VALUES (?, ?, ?, ?, ?)`,
      [requestId, helperUserId, helperRole, helperContact || null, helperNote || null]
    );
    return result.insertId;
  },

  async listResponses(requestIds) {
    if (!requestIds.length) return {};
    const placeholders = requestIds.map(() => '?').join(', ');
    const rows = await query(
      `SELECT resp.*, u.username AS helper_username, u.full_name AS helper_full_name
         FROM legal_aid_responses resp
         JOIN users u ON u.id = resp.helper_user_id
        WHERE resp.request_id IN (${placeholders})
        ORDER BY resp.created_at ASC`,
      requestIds
    );
    const map = {};
    rows.forEach((row) => {
      const mapped = mapResponseRow(row);
      if (!map[mapped.request_id]) map[mapped.request_id] = [];
      map[mapped.request_id].push(mapped);
    });
    return map;
  },

  async attachResponses(requests) {
    const ids = requests.map((r) => r.id);
    const responseMap = await this.listResponses(ids);
    return requests.map((r) => ({
      ...r,
      responses: responseMap[r.id] || [],
      response_count: (responseMap[r.id] || []).length,
    }));
  },

  async requestPlatformAssist(id, { platformNote }) {
    const result = await query(
      `UPDATE legal_aid_requests
          SET status = 'platform_assisting',
              platform_note = COALESCE(?, platform_note)
        WHERE id = ? AND status = 'pending'`,
      [platformNote || null, id]
    );
    return result.affectedRows > 0;
  },

  async updateStatus(id, status, { platformNote } = {}) {
    let sql = `UPDATE legal_aid_requests SET status = ?`;
    const params = [status];

    if (platformNote !== undefined) {
      sql += ', platform_note = ?';
      params.push(platformNote);
    }
    if (status === 'resolved' || status === 'completed') {
      sql += ', resolved_at = CURRENT_TIMESTAMP';
    }
    sql += ' WHERE id = ?';
    params.push(id);

    const result = await query(sql, params);
    return result.affectedRows > 0;
  },

  async completeByApplicant(id, applicantUserId) {
    const result = await query(
      `UPDATE legal_aid_requests
          SET status = 'completed', resolved_at = CURRENT_TIMESTAMP
        WHERE id = ? AND applicant_user_id = ?
          AND status NOT IN ('completed', 'cancelled')`,
      [id, applicantUserId]
    );
    return result.affectedRows > 0;
  },

  async cancelByApplicant(id, applicantUserId) {
    const result = await query(
      `UPDATE legal_aid_requests
          SET status = 'cancelled'
        WHERE id = ? AND applicant_user_id = ?
          AND status IN ('pending', 'platform_assisting')`,
      [id, applicantUserId]
    );
    return result.affectedRows > 0;
  },
};

module.exports = LegalAidModel;
