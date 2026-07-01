'use strict';

const { query } = require('../config/db');
const { parseGroupTypesJson } = require('../constants/groupTypes');

const PUBLIC_FIELDS =
  'id, username, email, role, full_name, phone, age, gender, disability_type, career_gap_years, current_income, group_types, status, last_login_at, created_at, updated_at';

function mapUserRow(row) {
  if (!row) return null;
  return {
    ...row,
    group_types: parseGroupTypesJson(row.group_types),
    current_income: row.current_income != null ? Number(row.current_income) : null,
    career_gap_years: row.career_gap_years != null ? Number(row.career_gap_years) : null,
  };
}

const UserModel = {
  async findById(id) {
    const rows = await query(
      `SELECT ${PUBLIC_FIELDS} FROM users WHERE id = ? LIMIT 1`,
      [id]
    );
    return mapUserRow(rows[0]);
  },

  async findByEmail(email) {
    const rows = await query(
      `SELECT id, email, role, status FROM users WHERE email = ? LIMIT 1`,
      [email]
    );
    return rows[0] || null;
  },

  async updatePassword(id, passwordHash) {
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, id]);
    return this.findById(id);
  },

  async findByIdentifier(identifier) {
    const rows = await query(
      `SELECT id, username, email, password_hash, role, full_name, phone, status,
              last_login_at, created_at, updated_at
         FROM users
        WHERE username = ? OR email = ?
        LIMIT 1`,
      [identifier, identifier]
    );
    return rows[0] || null;
  },

  async existsByUsernameOrEmail(username, email) {
    const rows = await query(
      'SELECT id, username, email FROM users WHERE username = ? OR email = ? LIMIT 1',
      [username, email]
    );
    return rows[0] || null;
  },

  async create({
    username,
    email,
    passwordHash,
    role = 'individual',
    fullName = null,
    phone = null,
    age = null,
    gender = null,
    disabilityType = null,
    careerGapYears = null,
    currentIncome = null,
    groupTypes = null,
  }) {
    const result = await query(
      `INSERT INTO users
        (username, email, password_hash, role, full_name, phone,
         age, gender, disability_type, career_gap_years, current_income, group_types)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        username,
        email,
        passwordHash,
        role,
        fullName,
        phone,
        age,
        gender,
        disabilityType,
        careerGapYears,
        currentIncome,
        groupTypes ? JSON.stringify(groupTypes) : null,
      ]
    );
    return this.findById(result.insertId);
  },

  async findPasswordHashById(id) {
    const rows = await query(
      'SELECT id, password_hash FROM users WHERE id = ? LIMIT 1',
      [id]
    );
    return rows[0] || null;
  },

  async updateProfile(id, fields) {
    const allowed = {
      fullName: 'full_name',
      phone: 'phone',
      age: 'age',
      gender: 'gender',
      disabilityType: 'disability_type',
      careerGapYears: 'career_gap_years',
      currentIncome: 'current_income',
      groupTypes: 'group_types',
    };

    const updates = [];
    const params = [];

    for (const [key, column] of Object.entries(allowed)) {
      if (fields[key] === undefined) continue;
      updates.push(`${column} = ?`);
      if (key === 'groupTypes') {
        params.push(fields[key] ? JSON.stringify(fields[key]) : null);
      } else {
        params.push(fields[key]);
      }
    }

    if (!updates.length) return this.findById(id);
    params.push(id);
    await query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    return this.findById(id);
  },

  async updateLastLogin(id) {
    await query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
  },
};

module.exports = UserModel;
