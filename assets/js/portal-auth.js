/**
 * 门户页导航栏登录状态与访问守卫
 */
(function (global) {
  async function refreshPortalAuthNav(portal) {
    const expected = AuthAPI.normalizePortalRole(portal);
    const guestEl = document.getElementById('portal-auth-guest');
    const userEl = document.getElementById('portal-auth-user');
    const nameEl = document.getElementById('portal-user-name');
    const emailEl = document.getElementById('portal-user-email');

    let session = AuthAPI.getSession();
    if (AuthAPI.isLoggedIn()) {
      try {
        const res = await AuthAPI.me();
        if (res.success) session = res.data;
      } catch (e) { /* use cached */ }
    }

    const check = session ? AuthAPI.requirePortal(expected) : { ok: false, reason: 'guest' };
    const loggedIn = check.ok;

    if (guestEl) guestEl.classList.toggle('hidden', loggedIn);
    if (userEl) userEl.classList.toggle('hidden', !loggedIn);
    if (nameEl && session) nameEl.textContent = session.displayName || session.email;
    if (emailEl && session) emailEl.textContent = session.email;

    const logoutBtn = document.getElementById('portal-logout-btn');
    if (logoutBtn && !logoutBtn._bound) {
      logoutBtn._bound = true;
      logoutBtn.addEventListener('click', function () {
        AuthAPI.logout();
        refreshPortalAuthNav(portal);
        if (typeof global.showPortalToast === 'function') {
          global.showPortalToast('已退出登录');
        }
      });
    }

    return { loggedIn: loggedIn, session: session, check: check };
  }

  async function guardPortalAuth(options) {
    const portal = AuthAPI.normalizePortalRole(options.portal);
    const authPage = options.authPage || 'auth.html';
    const allowGuest = options.allowGuest === true;

    if (!AuthAPI.isLoggedIn()) {
      if (allowGuest) return { ok: true, guest: true };
      global.location.href = authPage + '?next=' + encodeURIComponent(global.location.pathname.split('/').pop() || 'portal.html');
      return { ok: false, guest: true };
    }

    let session;
    try {
      const res = await AuthAPI.me();
      if (!res.success) {
        AuthAPI.logout();
        global.location.href = authPage;
        return { ok: false };
      }
      session = res.data;
    } catch (e) {
      AuthAPI.logout();
      global.location.href = authPage;
      return { ok: false };
    }

    const check = AuthAPI.requirePortal(portal);
    if (!check.ok) {
      AuthAPI.logout();
      const otherPortal = portal === 'corporate' ? '../individual/auth.html' : '../corporate/auth.html';
      alert(check.message || '账号类型与当前门户不匹配，请使用正确的入口登录。');
      global.location.href = otherPortal;
      return { ok: false };
    }

    return { ok: true, session: session };
  }

  function initPortalAuth(options) {
    const portal = AuthAPI.normalizePortalRole(options.portal);
    refreshPortalAuthNav(portal);
    if (options.requireAuth) {
      guardPortalAuth({ portal: portal, authPage: options.authPage, allowGuest: false });
    }
  }

  global.PortalAuth = {
    refreshPortalAuthNav,
    guardPortalAuth,
    initPortalAuth,
  };
})(window);
