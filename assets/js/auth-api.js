/**
 * 平台统一认证 API（个人端 / 企业端 / 首页共用）
 */
(function (global) {
  function authT(key, fallback, vars) {
    if (global.GBAI18n && global.GBAI18n.t) return global.GBAI18n.t(key, fallback, vars);
    var s = fallback || key;
    if (vars && s) Object.keys(vars).forEach(function (k) { s = String(s).replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]); });
    return s;
  }

  function mapApiMessage(msg) {
    if (!msg) return msg;
    if (global.GBAI18n && global.GBAI18n.tApiMessage) return global.GBAI18n.tApiMessage(String(msg));
    return String(msg);
  }

  const AUTH_SESSION_KEY = 'gba_auth_user';
  const AUTH_TOKEN_KEY = 'gba_auth_token';

  function apiBase() {
    if (typeof global.resolveNodeApiBase === 'function') {
      return global.resolveNodeApiBase();
    }
    const host = (global.location && global.location.hostname) || 'localhost';
    return `http://${host}:3000/api`;
  }

  function normalizePortalRole(value) {
    if (!value) return 'individual';
    if (value === 'company' || value === 'corporate') return 'corporate';
    return 'individual';
  }

  function roleToPortal(role) {
    return role === 'corporate' || role === 'admin' ? 'corporate' : 'individual';
  }

  function emailToUsername(email) {
    const e = String(email || '').trim().toLowerCase();
    const sanitized = e
      .replace(/@/g, '_at_')
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    return (sanitized || 'user').slice(0, 50);
  }

  function getToken() {
    try {
      const raw = localStorage.getItem(AUTH_TOKEN_KEY);
      if (raw) return raw;
      const session = getSession();
      return session && session.token ? session.token : null;
    } catch (e) {
      return null;
    }
  }

  function getSession() {
    try {
      const raw = localStorage.getItem(AUTH_SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function saveSession(session) {
    try {
      localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
      if (session && session.token) {
        localStorage.setItem(AUTH_TOKEN_KEY, session.token);
      }
    } catch (e) { /* ignore */ }
  }

  function clearSession() {
    try {
      localStorage.removeItem(AUTH_SESSION_KEY);
      localStorage.removeItem(AUTH_TOKEN_KEY);
    } catch (e) { /* ignore */ }
  }

  function buildSession(user, portalHint, token) {
    const portal = normalizePortalRole(portalHint || user.role);
    return {
      id: user.id,
      email: user.email,
      displayName: user.full_name || user.username,
      portal: portal,
      role: user.role,
      group_types: user.group_types || [],
      token: token,
      loginAt: new Date().toISOString(),
    };
  }

  function portalMismatchMessage(expectedPortal, actualRole) {
    if (normalizePortalRole(expectedPortal) === 'corporate') {
      return actualRole === 'individual'
        ? authT('apiMessages.该账号为个人账号，请前往个人端登录。', 'This is an individual account. Please sign in via the individual portal.')
        : authT('apiMessages.请使用企业账号登录。', 'Please sign in with a corporate account.');
    }
    return actualRole === 'corporate'
      ? authT('apiMessages.该账号为企业账号，请前往企业端登录。', 'This is a corporate account. Please sign in via the corporate portal.')
      : authT('apiMessages.请使用个人账号登录。', 'Please sign in with an individual account.');
  }

  function assertPortalMatch(user, expectedPortal) {
    const expected = normalizePortalRole(expectedPortal);
    const actual = roleToPortal(user.role);
    if (user.role === 'admin') return null;
    if (expected !== actual) {
      return { success: false, message: portalMismatchMessage(expected, user.role) };
    }
    return null;
  }

  async function request(path, options, skipAuth) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, (options && options.headers) || {});
    if (!skipAuth) {
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    try {
      const res = await fetch(`${apiBase()}${path}`, Object.assign({}, options, { headers }));
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok) {
        return { success: false, message: mapApiMessage(data.message) || `HTTP ${res.status}`, data: data };
      }
      return Object.assign({ success: true }, data);
    } catch (e) {
      return {
        success: false,
        message: authT('auth.errors.networkDetailed', 'Cannot reach auth service. Ensure the backend is running (npm start in server/).'),
      };
    }
  }

  async function login(identifier, password, portalHint) {
    const id = String(identifier || '').trim();
    if (!id || !password) {
      return { success: false, message: authT('apiMessages.请输入邮箱和密码。', 'Please enter email and password.') };
    }
    if (String(password).length < 6) {
      return { success: false, message: authT('apiMessages.密码至少 6 位。', 'Password must be at least 6 characters.') };
    }

    const expectedPortal = normalizePortalRole(portalHint);
    const expectedRole = expectedPortal === 'corporate' ? 'corporate' : 'individual';

    const nodeRes = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        identifier: id,
        password: password,
        expected_role: expectedRole,
      }),
    }, true);

    if (!nodeRes.success || !nodeRes.data) {
      return { success: false, message: mapApiMessage(nodeRes.message) || authT('apiMessages.登录失败，请检查账号密码或后端服务是否已启动。', 'Login failed. Check credentials or ensure the backend is running.') };
    }

    const u = nodeRes.data.user;
    const mismatch = assertPortalMatch(u, expectedPortal);
    if (mismatch) return mismatch;

    const session = buildSession(u, expectedPortal, nodeRes.data.token);
    saveSession(session);
    return { success: true, data: session };
  }

  async function register(identifier, password, portalHint, displayNameOptional, profileOptional, corporateExtras) {
    const id = String(identifier || '').trim();
    if (!id || !password) {
      return { success: false, message: authT('apiMessages.请填写邮箱和密码。', 'Please enter email and password.') };
    }
    if (String(password).length < 6) {
      return { success: false, message: authT('apiMessages.密码至少 6 位。', 'Password must be at least 6 characters.') };
    }

    const portal = normalizePortalRole(portalHint);
    const role = portal === 'corporate' ? 'corporate' : 'individual';

    const body = {
      username: emailToUsername(id),
      email: id,
      password: password,
      role: role,
      full_name: String(displayNameOptional || '').trim() || null,
    };

    if (role === 'individual') {
      if (!profileOptional || profileOptional.age == null || !profileOptional.gender || profileOptional.current_income == null) {
        return { success: false, message: authT('apiMessages.请填写年龄、性别和月收入。', 'Please complete age, gender, and monthly income.') };
      }
      body.age = profileOptional.age;
      body.gender = profileOptional.gender;
      body.disability_type = profileOptional.disability_type || 'none';
      body.career_gap_years = profileOptional.career_gap_years != null ? profileOptional.career_gap_years : 0;
      body.current_income = profileOptional.current_income;
    }

    if (role === 'corporate' && corporateExtras) {
      if (corporateExtras.org_invite_code) body.org_invite_code = corporateExtras.org_invite_code;
      if (corporateExtras.hr_title) body.hr_title = corporateExtras.hr_title;
    }

    const nodeRes = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
    }, true);

    if (!nodeRes.success || !nodeRes.data) {
      return { success: false, message: mapApiMessage(nodeRes.message) || authT('auth.errors.registerFailed', 'Registration failed. Please try again.') };
    }

    const u = nodeRes.data.user;
    const session = buildSession(u, portal, nodeRes.data.token);
    saveSession(session);
    return { success: true, data: session };
  }

  async function me() {
    const token = getToken();
    if (!token) {
      return { success: false, message: authT('auth.errors.notLoggedIn', 'Not signed in') };
    }
    const nodeRes = await request('/auth/me');
    if (!nodeRes.success || !nodeRes.data || !nodeRes.data.user) {
      clearSession();
      return { success: false, message: mapApiMessage(nodeRes.message) || authT('auth.errors.sessionExpired', 'Session expired') };
    }
    const prev = getSession() || {};
    const session = buildSession(nodeRes.data.user, prev.portal || nodeRes.data.user.role, token);
    saveSession(session);
    return { success: true, data: session };
  }

  async function updateProfile(body) {
    const nodeRes = await request('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(body || {}),
    });
    if (!nodeRes.success) {
      return { success: false, message: mapApiMessage(nodeRes.message) || authT('auth.errors.updateFailed', 'Update failed') };
    }
    const token = getToken();
    const session = buildSession(nodeRes.data.user, getSession() && getSession().portal, token);
    saveSession(session);
    return { success: true, data: { session: session, user: nodeRes.data.user } };
  }

  async function fetchGroupTypes() {
    return request('/auth/group-types', {}, true);
  }

  async function fetchUser() {
    const nodeRes = await request('/auth/me');
    if (!nodeRes.success || !nodeRes.data || !nodeRes.data.user) {
      return { success: false, message: mapApiMessage(nodeRes.message) || authT('auth.errors.fetchFailed', 'Failed to load profile') };
    }
    return { success: true, data: { user: nodeRes.data.user } };
  }

  async function changePassword(currentPassword, newPassword) {
    if (!currentPassword || !newPassword) {
      return { success: false, message: authT('auth.errors.changePasswordRequired', 'Please enter current and new password') };
    }
    if (String(newPassword).length < 6) {
      return { success: false, message: authT('auth.errors.newPasswordMin', 'New password must be at least 6 characters') };
    }
    const nodeRes = await request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    });
    if (!nodeRes.success) {
      return { success: false, message: mapApiMessage(nodeRes.message) || authT('auth.errors.changeFailed', 'Change failed') };
    }
    return { success: true, message: mapApiMessage(nodeRes.message) || authT('apiMessages.密码已修改', 'Password updated') };
  }

  function logout() {
    clearSession();
    return { success: true };
  }

  function isLoggedIn() {
    return !!getToken();
  }

  function requirePortal(portalHint) {
    const session = getSession();
    if (!session || !getToken()) {
      return { ok: false, reason: 'guest' };
    }
    const expected = normalizePortalRole(portalHint);
    const mismatch = assertPortalMatch({ role: session.role }, expected);
    if (mismatch) {
      return { ok: false, reason: 'wrong_portal', message: mapApiMessage(mismatch.message) };
    }
    return { ok: true, session: session };
  }

  const AuthAPI = {
    AUTH_SESSION_KEY,
    AUTH_TOKEN_KEY,
    apiBase,
    normalizePortalRole,
    roleToPortal,
    emailToUsername,
    getToken,
    getSession,
    saveSession,
    clearSession,
    buildSession,
    login,
    register,
    me,
    updateProfile,
    fetchGroupTypes,
    fetchUser,
    changePassword,
    logout,
    isLoggedIn,
    requirePortal,
    portalMismatchMessage,
  };

  global.AuthAPI = AuthAPI;
})(typeof window !== 'undefined' ? window : global);
