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

  function pushSkill(skills, value) {
    String(value || '')
      .split(/[,，;；|\/\n]/)
      .map((s) => s.replace(/^[^:：]{1,48}[:：]\s*/, '').trim())
      .filter((s) => s.length > 1)
      .forEach((s) => {
        if (!skills.some((x) => x.toLowerCase() === s.toLowerCase())) skills.push(s);
      });
  }

  function entryFields(entry) {
    if (!entry || typeof entry !== 'object') return {};
    return Object.assign({}, entry.fields || {}, entry);
  }

  /**
   * Map AI resume draft / resume_content_json into Node user_resumes payload
   * so apply + job matching see the same resume.
   */
  function buildResumePayloadFromAiProfile(source) {
    if (!source || typeof source !== 'object') return null;

    const draft = source.profile_basic || source.education || source.modules
      ? source
      : (source.candidate_profile || source.profile || source);
    const profileBasic = draft.profile_basic || source.profile_basic || {};
    const education = Array.isArray(draft.education) ? draft.education
      : (Array.isArray(source.education) ? source.education : []);
    const modules = Array.isArray(draft.modules) ? draft.modules
      : (Array.isArray(source.modules) ? source.modules : []);

    const skills = [];
    const facts = [];

    if (Array.isArray(source.skills)) {
      source.skills.forEach((s) => pushSkill(skills, s));
    }
    if (Array.isArray(source.facts) && source.facts.length) {
      source.facts.forEach((f) => {
        facts.push(f);
        if (f && f.type === 'skill') pushSkill(skills, f.content);
      });
    }

    education.forEach((edu) => {
      const f = entryFields(edu);
      facts.push({
        type: 'education',
        content: JSON.stringify({
          school: f.school || '',
          major: f.major || '',
          degree: f.degree || '',
          start_date: f.start_date || '',
          end_date: f.end_date || '',
        }),
      });
    });

    modules.forEach((mod) => {
      const type = String(mod.type || 'custom');
      const f = entryFields(mod);
      if (type === 'skill') {
        const skillText = f.skill || mod.title || mod.content || '';
        pushSkill(skills, skillText);
        String(skillText)
          .split(/[,，;；|\/\n]/)
          .map((s) => s.replace(/^[^:：]{1,48}[:：]\s*/, '').trim())
          .filter(Boolean)
          .forEach((s) => facts.push({ type: 'skill', content: s }));
        return;
      }
      if (['work', 'internship', 'project'].includes(type)) {
        facts.push({
          type,
          content: JSON.stringify({
            title: f.title || mod.title || '',
            company: f.company || '',
            role: f.role || '',
            start_date: f.start_date || '',
            end_date: f.end_date || '',
            achievements: f.achievements || f.description || mod.content || '',
          }),
        });
        return;
      }
      if (mod.title || mod.content) {
        facts.push({
          type,
          content: typeof mod.content === 'string' && mod.content.trim().startsWith('{')
            ? mod.content
            : JSON.stringify({
              title: mod.title || '',
              content: mod.content || '',
            }),
        });
      }
    });

    const summary = String(
      profileBasic.extras?.summary
      || source.summary
      || profileBasic.summary
      || ''
    ).trim();

    if (!skills.length && !facts.length && !summary
      && !(profileBasic && Object.keys(profileBasic).length)
      && !education.length) {
      return null;
    }

    const content_json = {
      summary,
      skills,
      facts,
      profile_basic: profileBasic,
      education,
      modules,
      candidate_profile: draft.profile_basic || draft.education || draft.modules
        ? { profile_basic: profileBasic, education, modules, facts }
        : undefined,
    };

    return {
      content_json,
      skills_text: skills.join(', '),
    };
  }

  async function syncResumeFromAiProfile(source) {
    if (!getToken()) return null;
    const payload = buildResumePayloadFromAiProfile(source);
    if (!payload) return null;
    try {
      return await ResumesAPI.saveMine(payload);
    } catch (err) {
      console.warn('[PlatformAPI] sync resume to Node failed:', err);
      return null;
    }
  }

  /** Safe relative returnTo from apply.html → resume page */
  function getSafeReturnTo() {
    try {
      const raw = String(new URLSearchParams(global.location.search).get('returnTo') || '').trim();
      if (!raw) return '';
      if (/^https?:/i.test(raw) || raw.startsWith('//') || raw.includes('..')) return '';
      if (!/^[a-zA-Z0-9_./-]+\.html(\?[^#]*)?(#.*)?$/.test(raw)) return '';
      return raw;
    } catch (e) {
      return '';
    }
  }

  function redirectIfReturnTo(options) {
    const target = getSafeReturnTo();
    if (!target) return false;
    const delay = options && typeof options.delayMs === 'number' ? options.delayMs : 600;
    setTimeout(() => {
      global.location.href = target;
    }, delay);
    return true;
  }

  global.PlatformAPI = {
    JobsAPI,
    ResumesAPI,
    StatsAPI,
    InterviewInvitesAPI,
    AuthAPI: global.AuthAPI,
    CompanyAPI,
    buildResumePayloadFromAiProfile,
    syncResumeFromAiProfile,
    getSafeReturnTo,
    redirectIfReturnTo,
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
