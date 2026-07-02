/**
 * 个人端用户资料编辑
 */
(function (global) {
  let meta = { gender_options: {}, disability_types: {}, group_types: {} };

  function showMsg(id, text, ok) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text || '';
    el.className = 'text-sm ' + (ok ? 'text-green-600' : 'text-red-600');
    el.classList.toggle('hidden', !text);
  }

  function renderGroupTags(user) {
    const wrap = document.getElementById('profile-group-tags');
    if (!wrap) return;
    const types = user.group_types || [];
    if (!types.length) {
      wrap.innerHTML = '<span class="text-gray-500 text-sm">暂无推断标签，完善下方画像信息后系统将自动更新。</span>';
      return;
    }
    wrap.innerHTML = types.map(function (key) {
      const label = meta.group_types[key] || key;
      return '<span class="inline-flex items-center px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-sm font-medium">' + label + '</span>';
    }).join('');
  }

  function fillSelect(id, options, selected) {
    const el = document.getElementById(id);
    if (!el || !options) return;
    el.innerHTML = Object.entries(options).map(function (entry) {
      const val = entry[0];
      const label = entry[1];
      const sel = val === selected ? ' selected' : '';
      return '<option value="' + val + '"' + sel + '>' + label + '</option>';
    }).join('');
  }

  function fillForm(user) {
    document.getElementById('profile-email').value = user.email || '';
    document.getElementById('profile-full-name').value = user.full_name || '';
    document.getElementById('profile-phone').value = user.phone || '';
    if (user.role === 'individual') {
      document.getElementById('profile-age').value = user.age != null ? user.age : '';
      fillSelect('profile-gender', meta.gender_options, user.gender || '');
      fillSelect('profile-disability', meta.disability_types, user.disability_type || 'none');
      document.getElementById('profile-gap').value = user.career_gap_years != null ? user.career_gap_years : 0;
      document.getElementById('profile-income').value = user.current_income != null ? user.current_income : '';
    }
    renderGroupTags(user);
  }

  async function loadProfile() {
    const [metaRes, userRes] = await Promise.all([
      AuthAPI.fetchGroupTypes(),
      AuthAPI.fetchUser(),
    ]);

    if (metaRes.success && metaRes.data) {
      meta = metaRes.data;
    }
    if (!userRes.success || !userRes.data.user) {
      throw new Error((window.GBAI18n && GBAI18n.tApiMessage ? GBAI18n.tApiMessage(userRes.message) : userRes.message) || (window.GBAI18n && GBAI18n.t ? GBAI18n.t('apiMessages.无法加载资料', 'Failed to load profile') : 'Failed to load profile'));
    }

    const user = userRes.data.user;
    if (user.role !== 'individual') {
      throw new Error(window.GBAI18n && GBAI18n.t ? GBAI18n.t('errors.individualOnlyProfile', 'Only individual accounts can edit this page') : 'Only individual accounts can edit this page');
    }

    fillSelect('profile-gender', meta.gender_options, user.gender || '');
    fillSelect('profile-disability', meta.disability_types, user.disability_type || 'none');
    fillForm(user);
    return user;
  }

  async function saveProfile(e) {
    e.preventDefault();
    const btn = document.getElementById('profile-save-btn');
    btn.disabled = true;
    showMsg('profile-form-msg', '', true);

    const body = {
      full_name: document.getElementById('profile-full-name').value.trim() || null,
      phone: document.getElementById('profile-phone').value.trim() || null,
      age: parseInt(document.getElementById('profile-age').value, 10),
      gender: document.getElementById('profile-gender').value,
      disability_type: document.getElementById('profile-disability').value,
      career_gap_years: parseFloat(document.getElementById('profile-gap').value) || 0,
      current_income: parseFloat(document.getElementById('profile-income').value),
    };

    try {
      const res = await AuthAPI.updateProfile(body);
      if (!res.success) {
        showMsg('profile-form-msg', res.message, false);
        return;
      }
      fillForm(res.data.user);
      showMsg('profile-form-msg', '资料已保存', true);
      if (typeof PortalAuth !== 'undefined') {
        PortalAuth.refreshPortalAuthNav('individual');
      }
    } finally {
      btn.disabled = false;
    }
  }

  async function savePassword(e) {
    e.preventDefault();
    const btn = document.getElementById('password-save-btn');
    const current = document.getElementById('password-current').value;
    const next = document.getElementById('password-new').value;
    const next2 = document.getElementById('password-new2').value;

    if (next !== next2) {
      showMsg('password-form-msg', '两次输入的新密码不一致', false);
      return;
    }

    btn.disabled = true;
    try {
      const res = await AuthAPI.changePassword(current, next);
      showMsg('password-form-msg', res.success ? res.message : res.message, res.success);
      if (res.success) {
        document.getElementById('password-current').value = '';
        document.getElementById('password-new').value = '';
        document.getElementById('password-new2').value = '';
      }
    } finally {
      btn.disabled = false;
    }
  }

  function init() {
    document.getElementById('profile-form').addEventListener('submit', saveProfile);
    document.getElementById('password-form').addEventListener('submit', savePassword);

    PortalAuth.guardPortalAuth({ portal: 'individual', authPage: 'auth.html' })
      .then(function (guard) {
        if (!guard.ok) return;
        return loadProfile();
      })
      .catch(function (err) {
        showMsg('profile-form-msg', (window.GBAI18n && GBAI18n.tApiMessage ? GBAI18n.tApiMessage(err.message) : err.message) || (window.GBAI18n && GBAI18n.t ? GBAI18n.t('apiMessages.加载失败', 'Load failed') : 'Load failed'), false);
      });
  }

  global.UserProfile = { init, loadProfile };
})(window);
