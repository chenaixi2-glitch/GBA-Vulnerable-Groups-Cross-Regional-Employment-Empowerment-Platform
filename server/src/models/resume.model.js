'use strict';

const { query } = require('../config/db');

function mapRow(row) {
  if (!row) return null;
  let contentJson = row.content_json;
  if (typeof contentJson === 'string') {
    try { contentJson = JSON.parse(contentJson); } catch { /* keep string */ }
  }
  return {
    id: row.id,
    user_id: row.user_id,
    content_json: contentJson,
    skills_text: row.skills_text,
    version: row.version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function findByUserId(userId) {
  const rows = await query(
    'SELECT * FROM user_resumes WHERE user_id = ? LIMIT 1',
    [userId]
  );
  return mapRow(rows[0]);
}

async function upsert(userId, contentJson, skillsText) {
  const existing = await findByUserId(userId);
  const jsonStr = JSON.stringify(contentJson);

  if (existing) {
    await query(
      `UPDATE user_resumes
       SET content_json = ?, skills_text = ?, version = version + 1
       WHERE user_id = ?`,
      [jsonStr, skillsText || null, userId]
    );
  } else {
    await query(
      `INSERT INTO user_resumes (user_id, content_json, skills_text)
       VALUES (?, ?, ?)`,
      [userId, jsonStr, skillsText || null]
    );
  }
  return findByUserId(userId);
}

module.exports = { findByUserId, upsert };
