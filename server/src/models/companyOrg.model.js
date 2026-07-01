'use strict';

const { query } = require('../config/db');
const crypto = require('crypto');

function generateInviteCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

async function findMemberByUserId(userId) {
  const rows = await query(
    `SELECT m.*, o.name AS org_name, o.invite_code
     FROM company_org_members m
     JOIN company_orgs o ON o.id = m.org_id
     WHERE m.user_id = ? LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function findOrgIdByUserId(userId) {
  const member = await findMemberByUserId(userId);
  return member ? member.org_id : null;
}

async function createOrgForUser(userId, companyName) {
  let inviteCode = generateInviteCode();
  for (let i = 0; i < 5; i += 1) {
    const dup = await query('SELECT id FROM company_orgs WHERE invite_code = ? LIMIT 1', [inviteCode]);
    if (!dup.length) break;
    inviteCode = generateInviteCode();
  }

  const result = await query(
    'INSERT INTO company_orgs (name, invite_code, created_by_user_id) VALUES (?, ?, ?)',
    [companyName, inviteCode, userId]
  );
  const orgId = result.insertId;

  await query(
    `INSERT INTO company_org_members (org_id, user_id, member_role, hr_title)
     VALUES (?, ?, 'owner', 'HR Owner')`,
    [orgId, userId]
  );

  await query('UPDATE company_profiles SET org_id = ? WHERE user_id = ?', [orgId, userId]);

  return { orgId, inviteCode };
}

async function joinOrgByInviteCode(userId, inviteCode, hrTitle) {
  const rows = await query(
    'SELECT id, name FROM company_orgs WHERE invite_code = ? LIMIT 1',
    [String(inviteCode).trim().toUpperCase()]
  );
  if (!rows.length) return null;

  const org = rows[0];
  const existing = await findMemberByUserId(userId);
  if (existing) {
    if (existing.org_id === org.id) {
      return { orgId: org.id, inviteCode: existing.invite_code, alreadyMember: true };
    }
    return { error: 'already_in_other_org' };
  }

  await query(
    `INSERT INTO company_org_members (org_id, user_id, member_role, hr_title)
     VALUES (?, ?, 'recruiter', ?)`,
    [org.id, userId, hrTitle || 'Recruiter']
  );
  await query('UPDATE company_profiles SET org_id = ? WHERE user_id = ?', [org.id, userId]);

  return { orgId: org.id, orgName: org.name };
}

async function listMembers(orgId) {
  const rows = await query(
    `SELECT m.user_id, m.member_role, m.hr_title, m.joined_at,
            u.username, u.full_name, u.email, cp.company_name
     FROM company_org_members m
     JOIN users u ON u.id = m.user_id
     LEFT JOIN company_profiles cp ON cp.user_id = m.user_id
     WHERE m.org_id = ?
     ORDER BY FIELD(m.member_role, 'owner', 'recruiter', 'viewer'), m.joined_at ASC`,
    [orgId]
  );
  return rows.map((row) => ({
    user_id: row.user_id,
    username: row.username,
    full_name: row.full_name,
    email: row.email,
    company_name: row.company_name,
    member_role: row.member_role,
    hr_title: row.hr_title,
    joined_at: row.joined_at,
  }));
}

async function getOrgSummary(userId) {
  const member = await findMemberByUserId(userId);
  if (!member) return null;

  const members = await listMembers(member.org_id);
  return {
    org_id: member.org_id,
    org_name: member.org_name,
    invite_code: member.member_role === 'owner' ? member.invite_code : null,
    my_role: member.member_role,
    my_hr_title: member.hr_title,
    member_count: members.length,
    members,
  };
}

module.exports = {
  findMemberByUserId,
  findOrgIdByUserId,
  createOrgForUser,
  joinOrgByInviteCode,
  listMembers,
  getOrgSummary,
};
