'use strict';

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// 根据 NODE_ENV 自动加载对应的环境文件：
//   开发：.env.development（本地 XAMPP MariaDB）
//   生产：.env.production（阿里云 RDS MySQL）
// 加载顺序：.env.${NODE_ENV} 优先，再用 .env 兜底。
// dotenv 默认不覆盖已存在的变量，因此先加载更具体的文件。
const NODE_ENV = process.env.NODE_ENV || 'development';
const cwd = process.cwd();

const candidates = [
  path.resolve(cwd, `.env.${NODE_ENV}`),
  path.resolve(cwd, '.env'),
];

candidates.forEach((file) => {
  if (fs.existsSync(file)) {
    dotenv.config({ path: file });
  }
});

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
}

const config = {
  env: NODE_ENV,
  isProd: NODE_ENV === 'production',
  port: toInt(process.env.PORT, 3000),

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: toInt(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'gba_website',
    charset: process.env.DB_CHARSET || 'utf8mb4',
    connectionLimit: toInt(process.env.DB_CONNECTION_LIMIT, 10),
    ssl: toBool(process.env.DB_SSL, false),
  },

  jwt: {
    // Keep in sync with backend/env.development.example JWT_SECRET for local dev
    secret: process.env.JWT_SECRET || 'change_me_dev_only',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  corsOrigin: process.env.CORS_ORIGIN || '*',
};

module.exports = config;
