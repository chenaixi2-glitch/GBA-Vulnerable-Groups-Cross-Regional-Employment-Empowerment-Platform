const fs = require('fs');
const path = require('path');

function patch(file, reps) {
  const p = path.join(__dirname, '../..', file);
  let s = fs.readFileSync(p, 'utf8');
  reps.forEach(([a, b]) => {
    if (!s.includes(a)) console.warn('missing in', file, ':', a.slice(0, 60));
    s = s.split(a).join(b);
  });
  fs.writeFileSync(p, s);
  console.log('patched', file);
}

const authHelper = `
  function authT(key, fallback, vars) {
    if (global.GBAI18n && global.GBAI18n.t) return global.GBAI18n.t(key, fallback, vars);
    var s = fallback || key;
    if (vars && s) Object.keys(vars).forEach(function (k) { s = String(s).replace(new RegExp('\\\\{' + k + '\\\\}', 'g'), vars[k]); });
    return s;
  }

  function mapApiMessage(msg) {
    if (!msg) return msg;
    if (global.GBAI18n && global.GBAI18n.tApiMessage) return global.GBAI18n.tApiMessage(String(msg));
    return String(msg);
  }
`;

patch('assets/js/auth-api.js', [
  ['(function (global) {', '(function (global) {' + authHelper],
  ["? '该账号为个人账号，请前往个人端登录。'", "? authT('apiMessages.该账号为个人账号，请前往个人端登录。', 'This is an individual account. Please sign in via the individual portal.')"],
  [": '请使用企业账号登录。';", ": authT('apiMessages.请使用企业账号登录。', 'Please sign in with a corporate account.');"],
  ["? '该账号为企业账号，请前往企业端登录。'", "? authT('apiMessages.该账号为企业账号，请前往企业端登录。', 'This is a corporate account. Please sign in via the corporate portal.')"],
  [": '请使用个人账号登录。';", ": authT('apiMessages.请使用个人账号登录。', 'Please sign in with an individual account.');"],
  ['message: data.message || `HTTP ${res.status}`', 'message: mapApiMessage(data.message) || `HTTP ${res.status}`'],
  ["message: '无法连接认证服务，请确认后端已启动（在 server 目录运行 npm start）。',", "message: authT('auth.errors.networkDetailed', 'Cannot reach auth service. Ensure the backend is running (npm start in server/).'),"],
  ["return { success: false, message: '请输入邮箱和密码。' };", "return { success: false, message: authT('apiMessages.请输入邮箱和密码。', 'Please enter email and password.') };"],
  ["return { success: false, message: '密码至少 6 位。' };", "return { success: false, message: authT('apiMessages.密码至少 6 位。', 'Password must be at least 6 characters.') };"],
  ["return { success: false, message: nodeRes.message || '登录失败，请检查账号密码或后端服务是否已启动。' };", "return { success: false, message: mapApiMessage(nodeRes.message) || authT('apiMessages.登录失败，请检查账号密码或后端服务是否已启动。', 'Login failed. Check credentials or ensure the backend is running.') };"],
  ["return { success: false, message: '请填写邮箱和密码。' };", "return { success: false, message: authT('apiMessages.请填写邮箱和密码。', 'Please enter email and password.') };"],
  ["return { success: false, message: '请填写年龄、性别和月收入。' };", "return { success: false, message: authT('apiMessages.请填写年龄、性别和月收入。', 'Please complete age, gender, and monthly income.') };"],
  ["return { success: false, message: nodeRes.message || '注册失败，请稍后重试。' };", "return { success: false, message: mapApiMessage(nodeRes.message) || authT('auth.errors.registerFailed', 'Registration failed. Please try again.') };"],
  ["return { success: false, message: '未登录' };", "return { success: false, message: authT('auth.errors.notLoggedIn', 'Not signed in') };"],
  ["return { success: false, message: nodeRes.message || '会话已失效' };", "return { success: false, message: mapApiMessage(nodeRes.message) || authT('auth.errors.sessionExpired', 'Session expired') };"],
  ["return { success: false, message: nodeRes.message || '更新失败' };", "return { success: false, message: mapApiMessage(nodeRes.message) || authT('auth.errors.updateFailed', 'Update failed') };"],
  ["return { success: false, message: nodeRes.message || '获取资料失败' };", "return { success: false, message: mapApiMessage(nodeRes.message) || authT('auth.errors.fetchFailed', 'Failed to load profile') };"],
  ["return { success: false, message: '请填写当前密码和新密码' };", "return { success: false, message: authT('auth.errors.changePasswordRequired', 'Please enter current and new password') };"],
  ["return { success: false, message: '新密码至少 6 位' };", "return { success: false, message: authT('auth.errors.newPasswordMin', 'New password must be at least 6 characters') };"],
  ["return { success: false, message: nodeRes.message || '修改失败' };", "return { success: false, message: mapApiMessage(nodeRes.message) || authT('auth.errors.changeFailed', 'Change failed') };"],
  ["return { success: true, message: nodeRes.message || '密码已修改' };", "return { success: true, message: mapApiMessage(nodeRes.message) || authT('apiMessages.密码已修改', 'Password updated') };"],
  ['return { ok: false, reason: \'wrong_portal\', message: mismatch.message };', 'return { ok: false, reason: \'wrong_portal\', message: mapApiMessage(mismatch.message) };'],
]);

const authUiHelper = `
  function authT(key, fallback, vars) {
    if (window.GBAI18n && window.GBAI18n.t) return window.GBAI18n.t(key, fallback, vars);
    var s = fallback || key;
    if (vars && s) Object.keys(vars).forEach(function (k) { s = String(s).replace(new RegExp('\\\\{' + k + '\\\\}', 'g'), vars[k]); });
    return s;
  }

  function mapApiMessage(msg) {
    if (!msg) return msg;
    if (window.GBAI18n && window.GBAI18n.tApiMessage) return window.GBAI18n.tApiMessage(String(msg));
    return String(msg);
  }
`;

patch('assets/js/auth-ui.js', [
  ['(function (global) {', '(function (global) {' + authUiHelper],
  ["heading.textContent = view === 'register' ? '注册账号' : '登录账号';", "heading.textContent = view === 'register' ? authT('auth.registerAccount', 'Create account') : authT('auth.loginAccount', 'Sign in');"],
  ["showError('auth-login-error', res.message);", "showError('auth-login-error', mapApiMessage(res.message));"],
  ["showError('auth-login-error', '无法连接认证服务，请确认后端已启动（在 server 目录运行 npm start）。');", "showError('auth-login-error', authT('auth.errors.networkDetailed', 'Cannot reach auth service. Ensure the backend is running (npm start in server/).'));"],
  ["showError('auth-register-error', '两次输入的密码不一致。');", "showError('auth-register-error', authT('auth.passwordsMismatch', 'Passwords do not match.'));"],
  ["showError('auth-register-error', '请填写年龄、性别和月收入。');", "showError('auth-register-error', authT('apiMessages.请填写年龄、性别和月收入。', 'Please complete age, gender, and monthly income.'));"],
  ["showError('auth-register-error', res.message);", "showError('auth-register-error', mapApiMessage(res.message));"],
  ["showError('auth-register-error', '无法连接认证服务，请确认后端已启动（在 server 目录运行 npm start）。');", "showError('auth-register-error', authT('auth.errors.networkDetailed', 'Cannot reach auth service. Ensure the backend is running (npm start in server/).'));"],
]);

patch('assets/js/portal-auth.js', [
  ['(function (global) {', `(function (global) {
  function authT(key, fallback, vars) {
    if (global.GBAI18n && global.GBAI18n.t) return global.GBAI18n.t(key, fallback, vars);
    var s = fallback || key;
    if (vars && s) Object.keys(vars).forEach(function (k) { s = String(s).replace(new RegExp('\\\\{' + k + '\\\\}', 'g'), vars[k]); });
    return s;
  }
  function mapApiMessage(msg) {
    if (!msg) return msg;
    if (global.GBAI18n && global.GBAI18n.tApiMessage) return global.GBAI18n.tApiMessage(String(msg));
    return String(msg);
  }`],
  ["global.showPortalToast('已退出登录');", "global.showPortalToast(authT('site.signedOut', 'Signed out.'));"],
  ["alert(check.message || '账号类型与当前门户不匹配，请使用正确的入口登录。');", "alert(mapApiMessage(check.message) || authT('apiMessages.账号类型与当前门户不匹配，请使用正确的入口登录。', 'Account type does not match this portal. Please use the correct sign-in page.'));"],
]);

patch('assets/js/user-profile.js', [
  ["throw new Error(userRes.message || '无法加载资料');", "throw new Error((window.GBAI18n && GBAI18n.tApiMessage ? GBAI18n.tApiMessage(userRes.message) : userRes.message) || (window.GBAI18n && GBAI18n.t ? GBAI18n.t('apiMessages.无法加载资料', 'Failed to load profile') : 'Failed to load profile'));"],
  ["throw new Error('仅个人账号可编辑此页面');", "throw new Error(window.GBAI18n && GBAI18n.t ? GBAI18n.t('errors.individualOnlyProfile', 'Only individual accounts can edit this page') : 'Only individual accounts can edit this page');"],
  ["showMsg('profile-form-msg', err.message || '加载失败', false);", "showMsg('profile-form-msg', (window.GBAI18n && GBAI18n.tApiMessage ? GBAI18n.tApiMessage(err.message) : err.message) || (window.GBAI18n && GBAI18n.t ? GBAI18n.t('apiMessages.加载失败', 'Load failed') : 'Load failed'), false);"],
]);

patch('assets/site-enhancements.js', [
  ["window.showToast('Open the related workflow from the interactive tools section.');", "window.showToast((window.GBAI18n && GBAI18n.t ? GBAI18n.t('site.openWorkflow', 'Open the related workflow from the interactive tools section.') : 'Open the related workflow from the interactive tools section.'));"],
  ["window.showToast('Recommended jobs refreshed.');", "window.showToast((window.GBAI18n && GBAI18n.t ? GBAI18n.t('site.jobsRefreshed', 'Recommended jobs refreshed.') : 'Recommended jobs refreshed.'));"],
]);

console.log('auth/shared patches done');
