'use strict';

const { query } = require('../config/db');

function mapRow(row) {
  if (!row) return null;
  return {
    ...row,
    amount: row.amount != null ? Number(row.amount) : 0,
  };
}

const DonationModel = {
  async create({ userId, amount, purpose, message, currency = 'CNY' }) {
    const result = await query(
      `INSERT INTO donations (user_id, amount, currency, purpose, message)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, amount, currency, purpose, message || null]
    );
    return this.findById(result.insertId);
  },

  async findById(id) {
    const rows = await query(
      `SELECT id, user_id, amount, currency, purpose, message, created_at
         FROM donations WHERE id = ? LIMIT 1`,
      [id]
    );
    return mapRow(rows[0]);
  },

  async listByUser(userId, limit = 50) {
    const rows = await query(
      `SELECT id, user_id, amount, currency, purpose, message, created_at
         FROM donations
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ?`,
      [userId, limit]
    );
    return rows.map(mapRow);
  },

  async countByUser(userId) {
    const rows = await query(
      'SELECT COUNT(*) AS cnt FROM donations WHERE user_id = ?',
      [userId]
    );
    return Number(rows[0]?.cnt || 0);
  },

  async getStats(purpose = 'legal_service') {
    const rows = await query(
      `SELECT
          COALESCE(SUM(amount), 0) AS total_amount,
          COUNT(*) AS donation_count,
          COUNT(DISTINCT user_id) AS donor_count
         FROM donations
        WHERE purpose = ?`,
      [purpose]
    );
    const row = rows[0] || {};
    return {
      total_amount: Number(row.total_amount || 0),
      donation_count: Number(row.donation_count || 0),
      donor_count: Number(row.donor_count || 0),
    };
  },
};

module.exports = DonationModel;
