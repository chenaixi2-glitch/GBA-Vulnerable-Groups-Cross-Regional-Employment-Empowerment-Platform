'use strict';

const { query } = require('../config/db');

// 对外返回的安全字段（不含 password_hash）
const PUBLIC_FIELDS =
  'id, username, email, role, full_name, phone, status, last_login_at, created_at, updated_at';

const UserModel = {
  async findById(id) {
    const rows = await query(
      `SELECT ${PUBLIC_FIELDS} FROM users WHERE id = ? LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  /**
   * 按用户名或邮箱查找（含 password_hash，用于登录校验）
   */
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

  async create({ username, email, passwordHash, role = 'individual', fullName = null, phone = null }) {
    const result = await query(
      `INSERT INTO users (username, email, password_hash, role, full_name, phone)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [username, email, passwordHash, role, fullName, phone]
    );
    return this.findById(result.insertId);
  },

  async updateLastLogin(id) {
    await query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
  },
};

module.exports = UserModel;
