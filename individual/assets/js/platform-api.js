/**
 * 个人端平台 API（连接 Node 后端 :3000）
 */
(function (global) {
  const API_BASE = (function () {
    if (typeof global.resolveNodeApiBase === 'function') {
      return global.resolveNodeApiBase();
    }
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

  function mapApiMessage(msg) {
    if (global.GBAI18n && global.GBAI18n.tApiMessage) {
      return global.GBAI18n.tApiMessage(String(msg || ''));
    }
    return msg || '';
  }

  async function request(path, options = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, Object.assign({}, options, { headers }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(mapApiMessage(data.message) || `HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  const JobsAPI = {
    matched(source, friendly) {
      const params = new URLSearchParams();
      if (source) params.set('source', source);
      if (friendly) params.set('friendly', '1');
      const qs = params.toString() ? `?${params.toString()}` : '';
      return request(`/jobs/matched${qs}`);
    },
    listPublic(query) {
      const qs = query ? `?${new URLSearchParams(query).toString()}` : '';
      return request(`/jobs${qs}`);
    },
    get(id) {
      return request(`/jobs/${id}`);
    },
    apply(id, body) {
      return request(`/jobs/${id}/apply`, { method: 'POST', body: JSON.stringify(body || {}) });
    },
    myApplications() {
      return request('/jobs/applications/me');
    },
    withdraw(applicationId) {
      return request(`/jobs/applications/${applicationId}`, { method: 'DELETE' });
    },
    trackExternalInterest(id) {
      return request(`/jobs/${id}/external-interest`, { method: 'POST' });
    },
  };

  const StatsAPI = {
    individual() {
      return request('/stats/individual');
    },
  };

  const InterviewInvitesAPI = {
    listMine() {
      return request('/interview-invites/me');
    },
    getByToken(token) {
      return request(`/interview-invites/token/${encodeURIComponent(token)}`);
    },
    start(token, body) {
      return request(`/interview-invites/token/${encodeURIComponent(token)}/start`, {
        method: 'POST',
        body: JSON.stringify(body || {}),
      });
    },
    complete(token, body) {
      return request(`/interview-invites/token/${encodeURIComponent(token)}/complete`, {
        method: 'POST',
        body: JSON.stringify(body || {}),
      });
    },
  };

  const CompanyAPI = {
    listFriendly() {
      return request('/company/friendly');
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

  global.PlatformAPI = {
    JobsAPI,
    ResumesAPI,
    StatsAPI,
    InterviewInvitesAPI,
    AuthAPI: global.AuthAPI,
    CompanyAPI,
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
