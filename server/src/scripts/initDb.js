'use strict';

// 一键初始化数据库与表结构（幂等）。
// 用法：npm run db:init  （会按 NODE_ENV 自动连本地或 RDS）
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../config/env');

async function main() {
  const sqlPath = path.resolve(__dirname, '../../sql/init.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  // 初始化时不指定 database，因为脚本里会 CREATE DATABASE
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    charset: config.db.charset,
    multipleStatements: true,
    ssl: config.db.ssl ? { rejectUnauthorized: false } : undefined,
  });

  console.log(`[db:init] 环境=${config.env} 连接 ${config.db.host}:${config.db.port} ...`);
  try {
    await conn.query(sql);
    console.log('[db:init] 数据库与表初始化完成 ✅');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('[db:init] 失败 ❌', err.message);
  process.exit(1);
});
