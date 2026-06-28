/**
 * 企业端 API 客户端（连接 Node 后端 :3000）
 */
(function (global) {
  const API_BASE = (function () {
    const host = global.location.hostname || 'localhost';
    return `http://${host}:3000/api`;
  })();

  function getToken() {
    try {
      const raw = localStorage.getItem('gba_auth_token');
      if (raw) return raw;
      const user = JSON.parse(localStorage.getItem('gba_auth_user') || 'null');
      return user && user.token ? user.token : null;
    } catch (e) {
      return null;
    }
  }

  async function request(path, options = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, Object.assign({}, options, { headers }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || `HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  const JobsAPI = {
    list(params = {}) {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') qs.set(k, v);
      });
      return request(`/jobs?${qs.toString()}`);
    },
    get(id) {
      return request(`/jobs/${id}`);
    },
    create(body) {
      return request('/jobs', { method: 'POST', body: JSON.stringify(body) });
    },
    update(id, body) {
      return request(`/jobs/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    },
    updateStatus(id, status) {
      return request(`/jobs/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    },
    clone(id) {
      return request(`/jobs/${id}/clone`, { method: 'POST' });
    },
    remove(id) {
      return request(`/jobs/${id}`, { method: 'DELETE' });
    },
  };

  global.CorporateAPI = { JobsAPI, API_BASE, getToken };
})(window);
