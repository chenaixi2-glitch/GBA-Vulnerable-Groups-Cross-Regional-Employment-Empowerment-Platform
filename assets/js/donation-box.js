/**
 * 捐款箱 UI 组件（个人端 / 企业端共用）
 */
(function (global) {
  function formatMoney(n) {
    return Number(n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function renderDonationBox(container, options) {
    const opts = Object.assign({ portal: 'individual', showLegal: true }, options);
    if (!container) return;

    container.innerHTML = `
      <div class="donation-box-wrap">
        <style>
          .donation-box-wrap { font-family: 'Noto Sans SC', 'Inter', sans-serif; }
          .donation-box-visual {
            perspective: 800px;
            display: flex;
            justify-content: center;
            margin-bottom: 1.5rem;
          }
          .donation-box-3d {
            width: 140px;
            height: 180px;
            position: relative;
            transform-style: preserve-3d;
            animation: boxFloat 3s ease-in-out infinite;
          }
          @keyframes boxFloat {
            0%, 100% { transform: rotateY(-8deg) translateY(0); }
            50% { transform: rotateY(8deg) translateY(-6px); }
          }
          .box-body {
            width: 100%;
            height: 130px;
            background: linear-gradient(145deg, #f59e0b 0%, #d97706 50%, #b45309 100%);
            border-radius: 8px 8px 4px 4px;
            box-shadow: inset 0 -8px 16px rgba(0,0,0,.15), 0 12px 24px rgba(245,158,11,.35);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: white;
            position: relative;
          }
          .box-slot {
            width: 70%;
            height: 12px;
            background: #1f2937;
            border-radius: 6px;
            margin-bottom: 12px;
            box-shadow: inset 0 2px 4px rgba(0,0,0,.5);
          }
          .box-label {
            font-size: 0.75rem;
            font-weight: 700;
            text-align: center;
            line-height: 1.3;
            padding: 0 8px;
            text-shadow: 0 1px 2px rgba(0,0,0,.2);
          }
          .box-heart {
            position: absolute;
            bottom: -20px;
            font-size: 1.5rem;
            animation: heartPulse 1.5s ease-in-out infinite;
          }
          @keyframes heartPulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.15); opacity: .85; }
          }
          .coin-drop {
            position: absolute;
            top: -10px;
            left: 50%;
            transform: translateX(-50%);
            width: 20px;
            height: 20px;
            background: radial-gradient(circle at 30% 30%, #fde68a, #f59e0b);
            border-radius: 50%;
            animation: coinFall 2s ease-in infinite;
            opacity: 0;
          }
          @keyframes coinFall {
            0% { top: -10px; opacity: 1; }
            80% { top: 50px; opacity: 1; }
            100% { top: 60px; opacity: 0; }
          }
        </style>

        <div class="donation-box-visual">
          <div class="donation-box-3d">
            <div class="coin-drop"></div>
            <div class="box-body">
              <div class="box-slot"></div>
              <div class="box-label">弱势群体<br>法律服务基金</div>
              <div class="box-heart">❤️</div>
            </div>
          </div>
        </div>

        <div id="donation-access-banner" class="hidden mb-4 p-4 rounded-xl text-sm"></div>

        <div class="grid grid-cols-3 gap-3 mb-6 text-center">
          <div class="bg-amber-50 rounded-xl p-3 border border-amber-100">
            <div class="text-xs text-amber-700 mb-1">累计募集</div>
            <div class="text-lg font-bold text-amber-800" id="fund-total">¥0.00</div>
          </div>
          <div class="bg-orange-50 rounded-xl p-3 border border-orange-100">
            <div class="text-xs text-orange-700 mb-1">捐款人次</div>
            <div class="text-lg font-bold text-orange-800" id="fund-count">0</div>
          </div>
          <div class="bg-red-50 rounded-xl p-3 border border-red-100">
            <div class="text-xs text-red-700 mb-1">资金用途</div>
            <div class="text-lg font-bold text-red-800">100%</div>
          </div>
        </div>

        <p class="text-xs text-center text-gray-500 mb-4">
          <i class="fas fa-info-circle mr-1"></i>捐款箱募集到的资金将<strong>全额</strong>用于弱势群体法律服务
        </p>

        <form id="donation-form" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">捐款金额（元，不限）</label>
            <div class="flex gap-2 mb-2">
              <button type="button" class="donation-preset px-3 py-1.5 text-sm border rounded-lg hover:bg-amber-50" data-amount="10">¥10</button>
              <button type="button" class="donation-preset px-3 py-1.5 text-sm border rounded-lg hover:bg-amber-50" data-amount="50">¥50</button>
              <button type="button" class="donation-preset px-3 py-1.5 text-sm border rounded-lg hover:bg-amber-50" data-amount="100">¥100</button>
              <button type="button" class="donation-preset px-3 py-1.5 text-sm border rounded-lg hover:bg-amber-50" data-amount="500">¥500</button>
            </div>
            <input type="number" id="donation-amount" min="0.01" step="0.01" placeholder="自定义金额"
              class="w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-amber-400 focus:border-amber-400" required />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">留言（选填）</label>
            <input type="text" id="donation-message" maxlength="500" placeholder="愿弱势群体就业之路更平坦"
              class="w-full border rounded-xl px-4 py-3" />
          </div>
          <button type="submit" id="donation-submit"
            class="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
            <i class="fas fa-coins"></i> 投入捐款箱
          </button>
        </form>

        <div id="donation-vulnerable-notice" class="hidden mt-4 p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800">
          <i class="fas fa-check-circle mr-1"></i>
          您属于弱势群体（<span id="vulnerable-types-label"></span>），平台各项功能<strong>免费</strong>使用，无需捐款。
        </div>

        <div id="donation-history" class="hidden mt-6">
          <h4 class="font-semibold text-gray-800 mb-2">我的捐款记录</h4>
          <ul id="donation-history-list" class="space-y-2 text-sm"></ul>
        </div>
      </div>`;

    bindDonationBoxEvents(container, opts);
    loadDonationBoxData(container, opts);
  }

  function bindDonationBoxEvents(container, opts) {
    const form = container.querySelector('#donation-form');
    const amountInput = container.querySelector('#donation-amount');

    container.querySelectorAll('.donation-preset').forEach((btn) => {
      btn.addEventListener('click', () => {
        amountInput.value = btn.dataset.amount;
      });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = container.querySelector('#donation-submit');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 处理中…';

      try {
        const api = opts.portal === 'corporate' ? global.CorporateAPI : global.PlatformAPI;
        const DonationsAPI = api && api.DonationsAPI;
        if (!DonationsAPI) throw new Error('API 未加载');

        const res = await DonationsAPI.create({
          amount: Number(amountInput.value),
          message: container.querySelector('#donation-message').value.trim() || undefined,
        });

        if (global.PlatformAccess) global.PlatformAccess.clearAccessCache();
        showToast(container, res.message || '捐款成功，感谢您的爱心！', 'success');
        form.reset();
        await loadDonationBoxData(container, opts);
      } catch (err) {
        showToast(container, err.message || '捐款失败，请稍后重试', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-coins"></i> 投入捐款箱';
      }
    });
  }

  async function loadDonationBoxData(container, opts) {
    const api = opts.portal === 'corporate' ? global.CorporateAPI : global.PlatformAPI;
    const DonationsAPI = api && api.DonationsAPI;
    if (!DonationsAPI) return;

    try {
      const [statsRes, accessRes] = await Promise.all([
        DonationsAPI.getStats(),
        DonationsAPI.getAccess().catch(() => ({ data: {} })),
      ]);

      const stats = statsRes.data || {};
      container.querySelector('#fund-total').textContent = '¥' + formatMoney(stats.total_amount);
      container.querySelector('#fund-count').textContent = String(stats.donation_count || 0);

      const access = accessRes.data || {};
      const banner = container.querySelector('#donation-access-banner');
      const form = container.querySelector('#donation-form');
      const vulnNotice = container.querySelector('#donation-vulnerable-notice');

      banner.classList.remove('hidden', 'bg-green-50', 'border-green-200', 'text-green-800', 'bg-amber-50', 'border-amber-200', 'text-amber-900');

      if (access.is_vulnerable) {
        vulnNotice.classList.remove('hidden');
        container.querySelector('#vulnerable-types-label').textContent = access.group_types_label || '已识别';
        form.classList.add('hidden');
        banner.classList.add('bg-green-50', 'border', 'border-green-200', 'text-green-800');
        banner.innerHTML = '<i class="fas fa-gift mr-1"></i>弱势群体用户：平台功能永久免费';
        banner.classList.remove('hidden');
      } else if (access.has_premium_access && access.reason === 'donated') {
        form.classList.remove('hidden');
        vulnNotice.classList.add('hidden');
        banner.classList.add('bg-green-50', 'border', 'border-green-200', 'text-green-800');
        const corpMsg = opts.portal === 'corporate'
          ? '您已完成捐款，面试模拟与 HR 绩效统计等高级功能已解锁。欢迎继续支持法律服务基金。'
          : '您已完成捐款，平台功能已解锁。欢迎继续支持法律服务基金。';
        banner.innerHTML = '<i class="fas fa-unlock mr-1"></i>' + corpMsg;
        banner.classList.remove('hidden');
      } else if (access.requires_premium_donation) {
        form.classList.remove('hidden');
        vulnNotice.classList.add('hidden');
        banner.classList.add('bg-amber-50', 'border', 'border-amber-200', 'text-amber-900');
        banner.innerHTML = '<i class="fas fa-exclamation-circle mr-1"></i>企业用户：招聘与法律帮助免费；面试模拟、HR 绩效统计需捐款解锁（金额不限）';
        banner.classList.remove('hidden');
      } else if (access.requires_donation) {
        form.classList.remove('hidden');
        vulnNotice.classList.add('hidden');
        banner.classList.add('bg-amber-50', 'border', 'border-amber-200', 'text-amber-900');
        const roleHint = opts.portal === 'corporate'
          ? '企业用户使用平台需向捐款箱捐款（金额不限）'
          : '非弱势群体用户使用平台需向捐款箱捐款（金额不限）';
        banner.innerHTML = '<i class="fas fa-exclamation-circle mr-1"></i>' + roleHint;
        banner.classList.remove('hidden');
      }

      if (access.has_access && !access.is_vulnerable) {
        const mineRes = await DonationsAPI.listMine().catch(() => ({ data: { donations: [] } }));
        const list = mineRes.data?.donations || [];
        if (list.length) {
          container.querySelector('#donation-history').classList.remove('hidden');
          container.querySelector('#donation-history-list').innerHTML = list
            .slice(0, 5)
            .map((d) => `<li class="flex justify-between p-2 bg-gray-50 rounded-lg"><span>¥${formatMoney(d.amount)}</span><span class="text-gray-500">${new Date(d.created_at).toLocaleDateString('zh-CN')}</span></li>`)
            .join('');
        }
      }
    } catch (e) {
      /* stats may still work without login */
    }
  }

  function renderLegalServices(container, services) {
    if (!container || !services) return;
    container.innerHTML = services
      .map(
        (s) => `
        <div class="bg-white rounded-xl p-5 border shadow-sm hover:shadow-md transition-shadow">
          <div class="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mb-3">
            <i class="fas fa-${s.icon} text-blue-600 text-lg"></i>
          </div>
          <h3 class="font-bold text-gray-900 mb-2">${s.title}</h3>
          <p class="text-sm text-gray-600 leading-relaxed">${s.description}</p>
        </div>`
      )
      .join('');
  }

  function showToast(container, message, type) {
    let toast = document.getElementById('donation-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'donation-toast';
      toast.className = 'fixed bottom-4 right-4 px-6 py-3 rounded-xl shadow-lg z-[10000] transition-all duration-300 translate-y-20 opacity-0';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = toast.className.replace(/bg-\S+/g, '');
    toast.classList.add(type === 'error' ? 'bg-red-600' : 'bg-gray-900', 'text-white');
    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-20', 'opacity-0');
    });
    setTimeout(() => toast.classList.add('translate-y-20', 'opacity-0'), 3500);
  }

  global.DonationBox = { renderDonationBox, renderLegalServices, formatMoney };
})(window);
