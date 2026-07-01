/**
 * 独立登录/注册页 UI（individual/auth.html、corporate/auth.html）
 */
(function (global) {
  function showError(id, message) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!message) {
      el.classList.add('hidden');
      el.textContent = '';
      return;
    }
    el.textContent = message;
    el.classList.remove('hidden');
  }

  function switchTab(view) {
    const loginPanel = document.getElementById('auth-panel-login');
    const regPanel = document.getElementById('auth-panel-register');
    const loginTab = document.getElementById('auth-tab-login');
    const regTab = document.getElementById('auth-tab-register');
    const heading = document.getElementById('auth-heading');

    if (loginPanel) loginPanel.hidden = view !== 'login';
    if (regPanel) regPanel.hidden = view !== 'register';
    if (loginTab) loginTab.classList.toggle('active', view === 'login');
    if (regTab) regTab.classList.toggle('active', view === 'register');
    if (heading) heading.textContent = view === 'register' ? '注册账号' : '登录账号';

    showError('auth-login-error', '');
    showError('auth-register-error', '');
  }

  function toggleProfileFields(portal) {
    const wrap = document.getElementById('auth-register-profile-wrap');
    if (wrap) wrap.style.display = portal === 'corporate' ? 'none' : 'block';
  }

  function getRegisterProfile(portal) {
    if (portal !== 'individual') return null;
    const age = document.getElementById('auth-register-age').value;
    const gender = document.getElementById('auth-register-gender').value;
    const disability = document.getElementById('auth-register-disability').value;
    const gap = document.getElementById('auth-register-gap').value;
    const income = document.getElementById('auth-register-income').value;
    if (!age || !gender || income === '') return null;
    return {
      age: parseInt(age, 10),
      gender: gender,
      disability_type: disability || 'none',
      career_gap_years: parseFloat(gap) || 0,
      current_income: parseFloat(income),
    };
  }

  function initAuthPage(config) {
    const portal = AuthAPI.normalizePortalRole(config.portal);
    const redirectTo = config.redirectTo || 'portal.html';
    const homeHref = config.homeHref || '../index.html';

    toggleProfileFields(portal);

    const params = new URLSearchParams(global.location.search);
    const initialTab = params.get('tab') === 'register' ? 'register' : 'login';
    switchTab(initialTab);

    const backLink = document.getElementById('auth-back-link');
    if (backLink) backLink.href = homeHref;

    document.getElementById('auth-tab-login') &&
      document.getElementById('auth-tab-login').addEventListener('click', function () {
        switchTab('login');
      });
    document.getElementById('auth-tab-register') &&
      document.getElementById('auth-tab-register').addEventListener('click', function () {
        switchTab('register');
      });

    document.getElementById('auth-login-submit') &&
      document.getElementById('auth-login-submit').addEventListener('click', async function () {
        const email = document.getElementById('auth-login-email').value;
        const password = document.getElementById('auth-login-password').value;
        const btn = document.getElementById('auth-login-submit');
        btn.disabled = true;
        showError('auth-login-error', '');
        try {
          const res = await AuthAPI.login(email, password, portal);
          if (!res.success) {
            showError('auth-login-error', res.message);
            return;
          }
          global.location.href = redirectTo;
        } finally {
          btn.disabled = false;
        }
      });

    document.getElementById('auth-register-submit') &&
      document.getElementById('auth-register-submit').addEventListener('click', async function () {
        const email = document.getElementById('auth-register-email').value;
        const password = document.getElementById('auth-register-password').value;
        const password2 = document.getElementById('auth-register-password2').value;
        const name = document.getElementById('auth-register-name').value;
        const btn = document.getElementById('auth-register-submit');
        btn.disabled = true;
        showError('auth-register-error', '');

        if (password !== password2) {
          showError('auth-register-error', '两次输入的密码不一致。');
          btn.disabled = false;
          return;
        }

        const profile = getRegisterProfile(portal);
        if (portal === 'individual' && !profile) {
          showError('auth-register-error', '请填写年龄、性别和月收入。');
          btn.disabled = false;
          return;
        }

        const corporateExtras = portal === 'corporate' ? {
          org_invite_code: (document.getElementById('auth-register-invite') || {}).value || '',
          hr_title: (document.getElementById('auth-register-hr-title') || {}).value || '',
        } : null;

        try {
          const res = await AuthAPI.register(email, password, portal, name, profile, corporateExtras);
          if (!res.success) {
            showError('auth-register-error', res.message);
            return;
          }
          if (portal === 'corporate') {
            global.location.href = 'company-profile.html?onboard=1';
            return;
          }
          global.location.href = redirectTo;
        } finally {
          btn.disabled = false;
        }
      });

    if (AuthAPI.isLoggedIn()) {
      AuthAPI.me().then(function (res) {
        if (res.success) {
          const check = AuthAPI.requirePortal(portal);
          if (check.ok) {
            global.location.replace(redirectTo);
          }
        }
      }).catch(function () { /* ignore */ });
    }
  }

  global.AuthUI = { initAuthPage, switchTab };
})(window);
