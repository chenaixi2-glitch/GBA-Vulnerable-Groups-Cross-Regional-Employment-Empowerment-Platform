/**
 * Node 后端 API 根路径（本地 :3000；生产环境走同源 /api 反向代理）
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
