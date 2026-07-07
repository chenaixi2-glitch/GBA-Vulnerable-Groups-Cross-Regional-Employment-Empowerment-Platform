/**
 * Node 平台 API 基址：本地开发走 :3000，线上同域 /api（经 Nginx 反代）。
 * 在 auth-api.js / platform-api.js 等之前加载。
 */
(function (global) {
  function resolveNodeApiBase() {
    if (global.GBA_NODE_API_BASE) {
      return String(global.GBA_NODE_API_BASE).replace(/\/$/, '');
    }
    const loc = global.location;
    if (!loc || !loc.hostname) {
      return 'http://localhost:3000/api';
    }
    const host = loc.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return `http://${host}:3000/api`;
    }
    return `${loc.origin}/api`;
  }

  global.resolveNodeApiBase = resolveNodeApiBase;
})(typeof window !== 'undefined' ? window : global);
