/**
 * 平台访问控制：弱势群体免费；个人非弱势群体需捐款；企业基础功能免费、高级功能需捐款
 */
(function (global) {
  const API_BASE = (function () {
    if (typeof global.resolveNodeApiBase === 'function') {
      return global.resolveNodeApiBase();
    }
    const host = global.location.hostname || 'localhost';
    return `http://${host}:3000/api`;
  })();

  let cachedAccess = null;

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

  function isCorporatePortal() {
    return (global.location.pathname || '').includes('/corporate/');
  }

  function getDonationPageUrl() {
    const path = global.location.pathname.replace(/\\/g, '/');
    if (path.includes('/corporate/')) return 'donation-legal.html';
    if (path.includes('/individual/')) return 'donation-legal.html';
    return null;
  }

  function getLoginPageUrl() {
    const path = global.location.pathname.replace(/\\/g, '/');
    if (path.includes('/corporate/')) return 'auth.html';
    if (path.includes('/individual/')) return 'auth.html';
    return isCorporatePortal() ? 'corporate/auth.html' : 'individual/auth.html';
  }

  async function fetchAccess(forceRefresh) {
    if (!forceRefresh && cachedAccess) return cachedAccess;
    const token = getToken();
    if (!token) {
      cachedAccess = {
        has_access: false,
        has_premium_access: false,
        reason: 'not_logged_in',
        requires_donation: !isCorporatePortal(),
        requires_premium_donation: isCorporatePortal(),
      };
      return cachedAccess;
    }
    try {
      const res = await fetch(`${API_BASE}/donations/access`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        cachedAccess = data.data;
        return cachedAccess;
      }
    } catch (e) {
      /* offline fallback */
    }
    cachedAccess = { has_access: true, has_premium_access: true, reason: 'offline_fallback' };
    return cachedAccess;
  }

  function clearAccessCache() {
    cachedAccess = null;
  }

  function paT(key, fallback, vars) {
    if (global.GBAI18n && global.GBAI18n.t) {
      return global.GBAI18n.t(key, fallback, vars);
    }
    let s = fallback || key;
    if (vars && s) {
      Object.keys(vars).forEach((k) => {
        s = String(s).replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
      });
    }
    return s;
  }

  function showAccessModal(access, options) {
    const opts = options || {};
    const premium = opts.premium === true;
    const existing = document.getElementById('gba-access-modal');
    if (existing) existing.remove();

    const isCorp = isCorporatePortal();
    const donationUrl = getDonationPageUrl() || 'donation-legal.html';
    const loginUrl = getLoginPageUrl();
    const loginLabel = isCorp
      ? paT('platformAccess.btnLoginCorporate', 'Go to corporate login')
      : paT('platformAccess.btnLoginIndividual', 'Go to individual login');

    let messageKey = 'platformAccess.msgDefault';
    let messageFallback = 'Using platform features requires a donation to the Legal Aid for Vulnerable Groups fund (any amount). All funds go to legal services.';
    if (access.reason === 'not_logged_in') {
      messageKey = isCorp ? 'platformAccess.msgNotLoggedInCorporate' : 'platformAccess.msgNotLoggedInIndividual';
      messageFallback = isCorp
        ? 'Please log in with a corporate account. Interview simulation and HR analytics require a donation to unlock.'
        : 'Please log in. Non-vulnerable users must donate before using platform features.';
    } else if (premium && isCorp) {
      messageKey = 'platformAccess.msgPremiumCorporate';
      messageFallback = 'Interview simulation and HR team analytics require a donation to the Legal Aid fund (any amount). Job posting, matching, and legal help remain free.';
    } else if (isCorp) {
      messageKey = 'platformAccess.msgCorporateDefault';
      messageFallback = 'Corporate users must donate to the Legal Aid for Vulnerable Groups fund (any amount) before using platform features.';
    }
    const message = paT(messageKey, messageFallback);
    const title = paT('platformAccess.title', 'Donation box');
    const btnDonation = paT('platformAccess.btnDonation', 'Go to donation box · Legal services');
    const btnLater = paT('platformAccess.btnLater', 'Maybe later');

    const overlay = document.createElement('div');
    overlay.id = 'gba-access-modal';
    overlay.className = 'fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50';
    overlay.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-fade-in">
        <div class="text-center mb-4">
          <div class="w-16 h-16 mx-auto mb-3 rounded-full bg-amber-100 flex items-center justify-center">
            <i class="fas fa-hand-holding-heart text-3xl text-amber-600"></i>
          </div>
          <h3 class="text-xl font-bold text-gray-900">${title}</h3>
          <p class="text-sm text-gray-600 mt-2">${message}</p>
        </div>
        <div class="flex flex-col gap-2">
          <a href="${donationUrl}" class="w-full py-3 px-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-semibold text-center hover:opacity-90">
            ${btnDonation}
          </a>
          <a href="${loginUrl}" class="w-full py-3 px-4 border-2 ${isCorp ? 'border-green-600 text-green-700 hover:bg-green-50' : 'border-blue-600 text-blue-700 hover:bg-blue-50'} rounded-xl font-semibold text-center">
            ${loginLabel}
          </a>
          <button type="button" id="gba-access-modal-close" class="w-full py-2 text-gray-500 hover:text-gray-700 text-sm">${btnLater}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#gba-access-modal-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  function bindGuard(links, checkFn, modalOptions) {
    links.forEach((el) => {
      el.addEventListener('click', async (e) => {
        const access = await fetchAccess();
        if (!checkFn(access)) {
          e.preventDefault();
          showAccessModal(access, modalOptions);
        }
      });
    });
  }

  async function guardFeatureLinks(selector) {
    const links = document.querySelectorAll(selector || '[data-require-access]');
    bindGuard(links, (access) => access.has_access);
  }

  async function guardPremiumFeatureLinks(selector) {
    const links = document.querySelectorAll(selector || '[data-require-premium-access]');
    bindGuard(links, (access) => access.has_premium_access, { premium: true });
  }

  async function guardCurrentPage(options) {
    const opts = options || {};
    if (opts.skipOnDonationPage && /donation-legal\.html/.test(global.location.pathname)) return;

    const access = await fetchAccess();
    const needsAccess = opts.premium ? !access.has_premium_access : !access.has_access;
    if (needsAccess && opts.redirect) {
      global.location.href = opts.redirect;
      return access;
    }
    if (needsAccess && opts.showModal) {
      showAccessModal(access, { premium: opts.premium });
    }
    return access;
  }

  global.PlatformAccess = {
    fetchAccess,
    clearAccessCache,
    showAccessModal,
    guardFeatureLinks,
    guardPremiumFeatureLinks,
    guardCurrentPage,
    getDonationPageUrl,
    getLoginPageUrl,
  };
})(window);
