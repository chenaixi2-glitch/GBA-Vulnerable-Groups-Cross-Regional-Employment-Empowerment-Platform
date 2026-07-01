'use strict';

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../config/env');

const MIGRATIONS = [
  'migrate_v2_matching.sql',
  'migrate_v3_group_inference.sql',
  'migrate_v4_job_criteria.sql',
  'migrate_v5_donations.sql',
  'migrate_v5_external_friendly.sql',
  'migrate_v6_legal_aid.sql',
  'migrate_v7_job_tracking.sql',
  'migrate_v8_company_orgs.sql',
  'migrate_v8_password_reset.sql',
  'migrate_v9_legal_aid_responses.sql',
];

async function main() {
  const sqlDir = path.resolve(__dirname, '../../sql');
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    charset: config.db.charset,
    multipleStatements: true,
    ssl: config.db.ssl ? { rejectUnauthorized: false } : undefined,
  });

  console.log(`[migrate] env=${config.env} ${config.db.host}:${config.db.port}`);

  // Ensure base schema exists
  const initSql = fs.readFileSync(path.join(sqlDir, 'init.sql'), 'utf8');
  await conn.query(initSql);
  console.log('[migrate] init.sql applied');

  for (const file of MIGRATIONS) {
    const filePath = path.join(sqlDir, file);
    if (!fs.existsSync(filePath)) {
      console.log(`[migrate] skip missing ${file}`);
      continue;
    }
    const sql = fs.readFileSync(filePath, 'utf8');
    try {
      await conn.query(sql);
      console.log(`[migrate] ✅ ${file}`);
    } catch (err) {
      console.error(`[migrate] ❌ ${file}: ${err.message}`);
    }
  }

  await conn.end();
  console.log('[migrate] done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
