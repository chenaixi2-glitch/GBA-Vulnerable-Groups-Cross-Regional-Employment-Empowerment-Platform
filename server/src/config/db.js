'use strict';

const mysql = require('mysql2/promise');
const config = require('./env');

// mysql2 同时兼容 MariaDB 10.x 与 MySQL 8.0：
// - 支持 MySQL 8.0 默认的 caching_sha2_password 认证插件
// - 同一套 SQL 在 MariaDB / MySQL 上均可运行
const poolConfig = {
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  charset: config.db.charset,
  waitForConnections: true,
  connectionLimit: config.db.connectionLimit,
  queueLimit: 0,
  // 返回的 DATETIME 保持字符串，避免时区偏移问题
  dateStrings: true,
  timezone: '+08:00',
};

// 阿里云 RDS 如启用强制 SSL，可通过 DB_SSL=true 开启
if (config.db.ssl) {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = mysql.createPool(poolConfig);

/**
 * 执行 SQL，返回行数组。
 * @param {string} sql
 * @param {Array} params
 */
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/**
 * 启动时测试数据库连接，便于快速发现配置问题。
 */
async function testConnection() {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
    const [rows] = await conn.query('SELECT VERSION() AS version');
    return rows[0] && rows[0].version;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, testConnection };
