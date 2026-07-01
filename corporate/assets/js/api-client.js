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
    matched() {
      return request('/jobs/matched?source=internal');
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
    apply(id, body) {
      return request(`/jobs/${id}/apply`, { method: 'POST', body: JSON.stringify(body || {}) });
    },
    listApplications(id) {
      return request(`/jobs/${id}/applications`);
    },
    updateApplicationStatus(applicationId, status) {
      return request(`/jobs/applications/${applicationId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
    },
  };

  const StatsAPI = {
    corporate() {
      return request('/stats/corporate');
    },
    team() {
      return request('/stats/corporate/team');
    },
  };

  const CompanyAPI = {
    getProfile() {
      return request('/company/profile');
    },
    saveProfile(body) {
      return request('/company/profile', { method: 'PUT', body: JSON.stringify(body) });
    },
    getTeam() {
      return request('/company/team');
    },
  };

  const ResumesAPI = {
    getMine() {
      return request('/resumes/me');
    },
    saveMine(body) {
      return request('/resumes/me', { method: 'PUT', body: JSON.stringify(body) });
    },
  };

  global.CorporateAPI = {
    JobsAPI,
    CompanyAPI,
    ResumesAPI,
    StatsAPI,
    AuthAPI: global.AuthAPI,
    DonationsAPI: {
      getStats() {
        return request('/donations/stats');
      },
      getLegalServices() {
        return request('/donations/legal-services');
      },
      getAccess() {
        return request('/donations/access');
      },
      listMine() {
        return request('/donations/me');
      },
      create(body) {
        return request('/donations', { method: 'POST', body: JSON.stringify(body || {}) });
      },
    },
    LegalAidAPI: {
      getMeta() {
        return request('/legal-aid/meta');
      },
      createRequest(body) {
        return request('/legal-aid/requests', { method: 'POST', body: JSON.stringify(body || {}) });
      },
      listMine() {
        return request('/legal-aid/requests/mine');
      },
      listMineCompleted() {
        return request('/legal-aid/requests/mine/completed');
      },
      listOpen() {
        return request('/legal-aid/requests/open');
      },
      listAssigned() {
        return request('/legal-aid/requests/assigned');
      },
      getOne(id) {
        return request(`/legal-aid/requests/${id}`);
      },
      acceptRequest(id, body) {
        return request(`/legal-aid/requests/${id}/accept`, { method: 'POST', body: JSON.stringify(body || {}) });
      },
      requestPlatformAssist(id, body) {
        return request(`/legal-aid/requests/${id}/platform-assist`, { method: 'POST', body: JSON.stringify(body || {}) });
      },
      updateStatus(id, status) {
        return request(`/legal-aid/requests/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      },
    },
    API_BASE,
    getToken,
  };
})(window);
