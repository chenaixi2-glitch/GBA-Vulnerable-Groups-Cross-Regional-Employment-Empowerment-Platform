// PM2 部署配置：在阿里云轻量服务器上以生产模式常驻运行。
// 用法：pm2 start ecosystem.config.js --env production
module.exports = {
  apps: [
    {
      name: 'gba-server',
      script: 'src/server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '300M',
    },
  ],
};
