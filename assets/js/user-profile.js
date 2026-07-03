/**
 * 个人端用户资料编辑
 */
(function (global) {
  let meta = { gender_options: {}, disability_types: {}, group_types: {} };
  let currentUser = null;
  const lastMsgs = {};

  function pt(key, fallback, vars) {
    if (global.GBAI18n && global.GBAI18n.t) return global.GBAI18n.t(key, fallback, vars);
    var s = fallback || key;
    if (vars && s) Object.keys(vars).forEach(function (k) { s = String(s).replace('{' + k + '}', vars[k]); });
    return s;
  }

  function showMsg(id, text, ok, store) {
    const el = document.getElementById(id);
    if (!el) return;
    if (store) {
      if (store.clear) delete lastMsgs[id];
      else lastMsgs[id] = Object.assign({ ok: !!ok }, store);
    } else if (!text) {
      delete lastMsgs[id];
    }
    el.textContent = text || '';
    el.className = 'text-sm ' + (ok ? 'text-green-600' : 'text-red-600');
    el.classList.toggle('hidden', !text);
  }

  function resolveMsg(entry) {
    if (!entry) return '';
    if (entry.api) {
      return (global.GBAI18n && global.GBAI18n.tApiMessage)
        ? global.GBAI18n.tApiMessage(entry.api)
        : entry.api;
    }
    return pt(entry.key, entry.fallback, entry.vars);
  }

  function refreshMessages() {
    Object.keys(lastMsgs).forEach(function (id) {
      var entry = lastMsgs[id];
      showMsg(id, resolveMsg(entry), entry.ok);
    });
  }

  function tOption(category, key, serverLabel) {
    if (global.GBAI18n && global.GBAI18n.tMetaOption) {
      return global.GBAI18n.tMetaOption(category, key, serverLabel);
    }
    return serverLabel || key;
  }

  function renderGroupTags(user) {
    const wrap = document.getElementById('profile-group-tags');
    if (!wrap) return;
    const types = user.group_types || [];
    if (!types.length) {
      wrap.innerHTML = '<span class="text-gray-500 text-sm">' + pt('profile.noGroupTags', 'No inferred tags yet. Complete your profile below to update matching.') + '</span>';
      return;
    }
    wrap.innerHTML = types.map(function (key) {
      const label = tOption('groupTypes', key, meta.group_types[key] || key);
      return '<span class="inline-flex items-center px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-sm font-medium">' + label + '</span>';
    }).join('');
  }

  function fillSelect(id, options, selected, category) {
    const el = document.getElementById(id);
    if (!el || !options) return;
    el.innerHTML = Object.entries(options).map(function (entry) {
      const val = entry[0];
      const label = category ? tOption(category, val, entry[1]) : entry[1];
      const sel = val === selected ? ' selected' : '';
      return '<option value="' + val + '"' + sel + '>' + label + '</option>';
    }).join('');
  }

  function refreshLocalizedFields() {
    if (!currentUser) return;
    fillSelect('profile-gender', meta.gender_options, currentUser.gender || '', 'gender');
    fillSelect('profile-disability', meta.disability_types, currentUser.disability_type || 'none', 'disabilityTypes');
    renderGroupTags(currentUser);
  }

  function fillForm(user) {
    document.getElementById('profile-email').value = user.email || '';
    document.getElementById('profile-full-name').value = user.full_name || '';
    document.getElementById('profile-phone').value = user.phone || '';
    if (user.role === 'individual') {
      document.getElementById('profile-age').value = user.age != null ? user.age : '';
      fillSelect('profile-gender', meta.gender_options, user.gender || '', 'gender');
      fillSelect('profile-disability', meta.disability_types, user.disability_type || 'none', 'disabilityTypes');
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

    fillSelect('profile-gender', meta.gender_options, user.gender || '', 'gender');
    fillSelect('profile-disability', meta.disability_types, user.disability_type || 'none', 'disabilityTypes');
    fillForm(user);
    currentUser = user;
    return user;
  }

  async function saveProfile(e) {
    e.preventDefault();
    const btn = document.getElementById('profile-save-btn');
    btn.disabled = true;
    showMsg('profile-form-msg', '', true, { clear: true });

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
        var errText = (global.GBAI18n && global.GBAI18n.tApiMessage ? global.GBAI18n.tApiMessage(res.message) : res.message) || res.message;
        showMsg('profile-form-msg', errText, false, { api: res.message || errText });
        return;
      }
      fillForm(res.data.user);
      currentUser = res.data.user;
      showMsg('profile-form-msg', pt('profile.saved', 'Profile updated'), true, { key: 'profile.saved', fallback: 'Profile updated' });
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
      showMsg('password-form-msg', pt('auth.passwordsMismatch', 'Passwords do not match.'), false, {
        key: 'auth.passwordsMismatch',
        fallback: 'Passwords do not match.'
      });
      return;
    }

    btn.disabled = true;
    try {
      const res = await AuthAPI.changePassword(current, next);
      const msgText = (global.GBAI18n && global.GBAI18n.tApiMessage ? global.GBAI18n.tApiMessage(res.message) : res.message) || res.message;
      showMsg('password-form-msg', msgText, res.success, { api: res.message || msgText });
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
    window.addEventListener('gba:language-changed', function () {
      refreshLocalizedFields();
      refreshMessages();
    });

    PortalAuth.guardPortalAuth({ portal: 'individual', authPage: 'auth.html' })
      .then(function (guard) {
        if (!guard.ok) return;
        return loadProfile();
      })
      .catch(function (err) {
        var errText = (global.GBAI18n && global.GBAI18n.tApiMessage ? global.GBAI18n.tApiMessage(err.message) : err.message)
          || pt('apiMessages.加载失败', 'Load failed');
        showMsg('profile-form-msg', errText, false, { api: err.message || errText });
      });
  }

  global.UserProfile = { init, loadProfile };
})(window);
