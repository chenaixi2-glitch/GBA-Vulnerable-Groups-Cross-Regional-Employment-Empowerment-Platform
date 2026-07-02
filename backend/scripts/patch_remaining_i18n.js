const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');

function patch(rel, reps) {
  const p = path.join(root, rel);
  let s = fs.readFileSync(p, 'utf8');
  reps.forEach(([a, b]) => {
    if (!s.includes(a)) console.warn('missing in', rel, ':', a.slice(0, 55));
    else s = s.split(a).join(b);
  });
  fs.writeFileSync(p, s);
  console.log('patched', rel);
}

patch('index.html', [
  ["showToast('Signed out.');", "showToast((window.GBAI18n && GBAI18n.t ? GBAI18n.t('site.signedOut', 'Signed out.') : 'Signed out.'));"],
  ["showToast('Welcome back, ' + res.data.displayName + '!');", "showToast((window.GBAI18n && GBAI18n.t ? GBAI18n.t('site.welcomeBack', 'Welcome back, {name}!', { name: res.data.displayName }) : 'Welcome back, ' + res.data.displayName + '!'));"],
  ["showToast('Account created. Complete your company profile.');", "showToast((window.GBAI18n && GBAI18n.t ? GBAI18n.t('site.corpRegistered', 'Account created. Complete your company profile.') : 'Account created. Complete your company profile.'));"],
  ["showToast('Account created. Explore your portal!');", "showToast((window.GBAI18n && GBAI18n.t ? GBAI18n.t('site.individualRegistered', 'Account created. Explore your portal!') : 'Account created. Explore your portal!'));"],
  ["showToast('Screen reader optimizations remain available via your OS and browser.');", "showToast((window.GBAI18n && GBAI18n.t ? GBAI18n.t('site.screenReaderHint', 'Screen reader optimizations remain available via your OS and browser.') : 'Screen reader optimizations remain available via your OS and browser.'));"],
  ["showToast('Keyboard tips: Tab to focus, Enter to activate, Escape to close dialogs.');", "showToast((window.GBAI18n && GBAI18n.t ? GBAI18n.t('site.keyboardHint', 'Keyboard tips: Tab to focus, Enter to activate, Escape to close dialogs.') : 'Keyboard tips: Tab to focus, Enter to activate, Escape to close dialogs.'));"],
  ["errEl.textContent = res.message || 'Login failed';", "errEl.textContent = (window.GBAI18n && GBAI18n.tApiMessage ? GBAI18n.tApiMessage(res.message) : res.message) || (window.GBAI18n && GBAI18n.t ? GBAI18n.t('auth.errors.loginFailed', 'Login failed') : 'Login failed');"],
  ["errEl.textContent = res.message || 'Registration failed';", "errEl.textContent = (window.GBAI18n && GBAI18n.tApiMessage ? GBAI18n.tApiMessage(res.message) : res.message) || (window.GBAI18n && GBAI18n.t ? GBAI18n.t('auth.errors.registerFailed', 'Registration failed') : 'Registration failed');"],
]);

patch('assets/js/user-profile.js', [
  ["wrap.innerHTML = '<span class=\"text-gray-500 text-sm\">暂无推断标签，完善下方画像信息后系统将自动更新。</span>';", "wrap.innerHTML = '<span class=\"text-gray-500 text-sm\">' + (window.GBAI18n && GBAI18n.t ? GBAI18n.t('profile.noGroupTags', 'No inferred tags yet. Complete your profile below to update matching.') : 'No inferred tags yet. Complete your profile below to update matching.') + '</span>';"],
  ["showMsg('profile-form-msg', '资料已保存', true);", "showMsg('profile-form-msg', (window.GBAI18n && GBAI18n.t ? GBAI18n.t('profile.saved', 'Profile updated') : 'Profile updated'), true);"],
  ["showMsg('password-form-msg', '两次输入的新密码不一致', false);", "showMsg('password-form-msg', (window.GBAI18n && GBAI18n.t ? GBAI18n.t('auth.passwordsMismatch', 'Passwords do not match.') : 'Passwords do not match.'), false);"],
]);

console.log('done');
