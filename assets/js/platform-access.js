/**
 * 平台访问控制：弱势群体免费；个人非弱势群体需捐款；企业基础功能免费、高级功能需捐款
 */
(function (global) {
  const API_BASE = (function () {
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

  function showAccessModal(access, options) {
    const opts = options || {};
    const premium = opts.premium === true;
    const existing = document.getElementById('gba-access-modal');
    if (existing) existing.remove();

    const isCorp = isCorporatePortal();
    const donationUrl = getDonationPageUrl() || 'donation-legal.html';

    let message = '使用本平台功能需向「弱势群体法律服务」捐款箱捐款，金额不限，资金将全额用于法律服务。';
    if (access.reason === 'not_logged_in') {
      message = isCorp
        ? '请先登录企业账号。面试模拟、HR 绩效统计等高级功能需向捐款箱捐款后解锁。'
        : '请先登录账号。非弱势群体用户需向捐款箱捐款后方可使用平台功能。';
    } else if (premium && isCorp) {
      message = '面试模拟、HR 团队绩效统计等高级功能需向「弱势群体法律服务」捐款箱捐款后解锁（金额不限）。招聘发布、岗位匹配与法律帮助功能可免费使用。';
    } else if (isCorp) {
      message = '企业用户使用平台功能需向「弱势群体法律服务」捐款箱捐款，金额不限，资金将全额用于对弱势群体的法律帮扶。';
    }

    const overlay = document.createElement('div');
    overlay.id = 'gba-access-modal';
    overlay.className = 'fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50';
    overlay.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-fade-in">
        <div class="text-center mb-4">
          <div class="w-16 h-16 mx-auto mb-3 rounded-full bg-amber-100 flex items-center justify-center">
            <i class="fas fa-hand-holding-heart text-3xl text-amber-600"></i>
          </div>
          <h3 class="text-xl font-bold text-gray-900">爱心捐款箱</h3>
          <p class="text-sm text-gray-600 mt-2">${message}</p>
        </div>
        <div class="flex flex-col gap-2">
          <a href="${donationUrl}" class="w-full py-3 px-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-semibold text-center hover:opacity-90">
            前往捐款箱 · 了解法律服务
          </a>
          <button type="button" id="gba-access-modal-close" class="w-full py-2 text-gray-500 hover:text-gray-700 text-sm">稍后再说</button>
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
  };
})(window);
