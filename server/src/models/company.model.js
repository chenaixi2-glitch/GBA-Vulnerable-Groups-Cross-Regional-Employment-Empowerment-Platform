'use strict';

const { query } = require('../config/db');

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    company_name: row.company_name,
    industry: row.industry,
    description: row.description,
    address: row.address,
    contact_email: row.contact_email,
    contact_phone: row.contact_phone,
    website: row.website,
    license_no: row.license_no,
    employee_count: row.employee_count,
    inclusivity_info: row.inclusivity_info,
    vulnerable_group_friendly: Boolean(row.vulnerable_group_friendly),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function findByUserId(userId) {
  const rows = await query(
    'SELECT * FROM company_profiles WHERE user_id = ? LIMIT 1',
    [userId]
  );
  return mapRow(rows[0]);
}

async function syncVulnerableFriendlyFlag(userId) {
  const rows = await query(
    `SELECT COUNT(*) AS cnt FROM job_postings
      WHERE company_user_id = ? AND vulnerable_group_friendly = 1 AND status != 'closed'`,
    [userId]
  );
  const friendly = rows[0].cnt > 0 ? 1 : 0;
  await query(
    'UPDATE company_profiles SET vulnerable_group_friendly = ? WHERE user_id = ?',
    [friendly, userId]
  );
  return friendly === 1;
}

async function upsert(userId, data) {
  const existing = await findByUserId(userId);
  const fields = [
    'company_name', 'industry', 'description', 'address',
    'contact_email', 'contact_phone', 'website', 'license_no',
    'employee_count', 'inclusivity_info',
  ];

  if (existing) {
    const sets = [];
    const params = [];
    fields.forEach((key) => {
      if (data[key] !== undefined) {
        sets.push(`${key} = ?`);
        params.push(data[key]);
      }
    });
    if (!sets.length) return existing;
    params.push(userId);
    await query(`UPDATE company_profiles SET ${sets.join(', ')} WHERE user_id = ?`, params);
    await syncVulnerableFriendlyFlag(userId);
    return findByUserId(userId);
  }

  const result = await query(
    `INSERT INTO company_profiles
      (user_id, company_name, industry, description, address, contact_email,
       contact_phone, website, license_no, employee_count, inclusivity_info)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      data.company_name,
      data.industry || null,
      data.description || null,
      data.address || null,
      data.contact_email || null,
      data.contact_phone || null,
      data.website || null,
      data.license_no || null,
      data.employee_count || null,
      data.inclusivity_info || null,
    ]
  );
  const rows = await query('SELECT * FROM company_profiles WHERE id = ?', [result.insertId]);
  await syncVulnerableFriendlyFlag(userId);
  return mapRow(rows[0]);
}

async function listFriendly() {
  const rows = await query(
    `SELECT company_name, industry, description, inclusivity_info, vulnerable_group_friendly
       FROM company_profiles
      WHERE vulnerable_group_friendly = 1
      ORDER BY company_name ASC`
  );
  return rows.map((row) => ({
    company_name: row.company_name,
    industry: row.industry,
    description: row.description,
    inclusivity_info: row.inclusivity_info,
    vulnerable_group_friendly: Boolean(row.vulnerable_group_friendly),
  }));
}

module.exports = { findByUserId, upsert, syncVulnerableFriendlyFlag, listFriendly };
