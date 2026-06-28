'use strict';

const app = require('./app');
const config = require('./config/env');
const { testConnection, pool } = require('./config/db');

async function bootstrap() {
  try {
    const version = await testConnection();
    console.log(`[db] 连接成功 (${config.env}) -> ${config.db.host}:${config.db.port}/${config.db.database}  Server=${version}`);
  } catch (err) {
    console.error('[db] 连接失败：', err.message);
    console.error('     请检查数据库是否已启动、账号密码与白名单（RDS 需放行服务器公网 IP）。');
    // 数据库不可用时不直接退出，仍允许 /health 探活；接口会返回 503
  }

  const server = app.listen(config.port, () => {
    console.log(`[server] 已启动 (${config.env}) -> http://0.0.0.0:${config.port}`);
  });

  const shutdown = (signal) => {
    console.log(`\n[server] 收到 ${signal}，正在优雅关闭...`);
    server.close(async () => {
      await pool.end().catch(() => {});
      console.log('[server] 已关闭');
      process.exit(0);
    });
  };

  ['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => shutdown(sig)));
}

bootstrap();
