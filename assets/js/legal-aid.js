/**
 * 弱势群体法律服务 — 诉求申请 / 多人帮助 / 平台协助
 */
(function (global) {
  const STATUS_CLASS = {
    pending: 'bg-yellow-100 text-yellow-800',
    assigned: 'bg-blue-100 text-blue-800',
    platform_assisting: 'bg-purple-100 text-purple-800',
    in_progress: 'bg-indigo-100 text-indigo-800',
    resolved: 'bg-green-100 text-green-800',
    completed: 'bg-emerald-100 text-emerald-800',
    cancelled: 'bg-gray-100 text-gray-600',
  };

  let metaCache = null;
  let pendingFiles = [];

  function getApi(opts) {
    const base = opts.portal === 'corporate' ? global.CorporateAPI : global.PlatformAPI;
    return base && base.LegalAidAPI;
  }

  function toast(msg, type) {
    let el = document.getElementById('legal-aid-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'legal-aid-toast';
      el.className = 'fixed bottom-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-xl shadow-lg z-[10001] text-white text-sm transition-all opacity-0 translate-y-4';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = el.className.replace(/bg-\S+/g, '');
    el.classList.add(type === 'error' ? 'bg-red-600' : 'bg-gray-900', 'text-white');
    requestAnimationFrame(() => el.classList.remove('opacity-0', 'translate-y-4'));
    setTimeout(() => el.classList.add('opacity-0', 'translate-y-4'), 3500);
  }

  async function loadMeta(api) {
    if (metaCache) return metaCache;
    const res = await api.getMeta();
    metaCache = res.data || {};
    return metaCache;
  }

  function statusBadge(status, meta) {
    const label = (meta.statuses && meta.statuses[status]) || status;
    const cls = STATUS_CLASS[status] || 'bg-gray-100 text-gray-700';
    return `<span class="inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}">${label}</span>`;
  }

  function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function renderResponsesBlock(r, meta, opts, mode) {
    const responses = r.responses || [];
    if (!responses.length) return '';

    const items = responses
      .map((resp) => {
        const role = (meta.helper_roles && meta.helper_roles[resp.helper_role]) || resp.helper_role || '帮助者';
        const note = resp.note ? `<p class="text-gray-600 mt-0.5">「${resp.note}」</p>` : '';
        const contact =
          mode === 'mine' && resp.contact
            ? `<p class="text-xs text-gray-500 mt-0.5">联系方式：${resp.contact}</p>`
            : '';
        return `<li class="p-2 bg-green-50 rounded-lg border border-green-100">
          <div class="flex justify-between gap-2 text-xs">
            <span class="font-medium text-green-900">${resp.helper_display_name || '帮助者'}</span>
            <span class="text-green-700">${role}</span>
          </div>
          ${note}
          ${contact}
          <p class="text-xs text-gray-400 mt-1">${formatDate(resp.created_at)}</p>
        </li>`;
      })
      .join('');

    return `<div class="mt-3 pt-3 border-t">
      <p class="text-xs font-semibold text-gray-700 mb-2"><i class="fas fa-hands-helping mr-1 text-green-600"></i>已收到的帮助（${responses.length}）</p>
      <ul class="space-y-2">${items}</ul>
    </div>`;
  }

  function renderTabs(container, opts) {
    const showSubmit = opts.allowSubmit !== false;
    container.innerHTML = `
      <div class="legal-aid-tabs flex flex-wrap gap-2 mb-6 border-b pb-3">
        ${showSubmit ? '<button type="button" data-tab="submit" class="la-tab px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white">提交诉求</button>' : ''}
        <button type="button" data-tab="open" class="la-tab px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100">待接单 · 提供帮助</button>
        ${showSubmit ? '<button type="button" data-tab="mine" class="la-tab px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100">我的诉求</button>' : ''}
        ${showSubmit ? '<button type="button" data-tab="completed" class="la-tab px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100">已完成诉求</button>' : ''}
        <button type="button" data-tab="assigned" class="la-tab px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100">我的帮助</button>
      </div>
      <div id="la-panel-submit" class="la-panel ${showSubmit ? '' : 'hidden'}"></div>
      <div id="la-panel-open" class="la-panel hidden"></div>
      <div id="la-panel-mine" class="la-panel hidden"></div>
      <div id="la-panel-completed" class="la-panel hidden"></div>
      <div id="la-panel-assigned" class="la-panel hidden"></div>`;

    container.querySelectorAll('.la-tab').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(container, btn.dataset.tab, opts));
    });
  }

  function switchTab(container, tab, opts) {
    container.querySelectorAll('.la-tab').forEach((b) => {
      const active = b.dataset.tab === tab;
      b.classList.toggle('bg-blue-600', active);
      b.classList.toggle('text-white', active);
      b.classList.toggle('text-gray-600', !active);
      b.classList.toggle('hover:bg-gray-100', !active);
    });
    container.querySelectorAll('.la-panel').forEach((p) => p.classList.add('hidden'));
    const panel = container.querySelector('#la-panel-' + tab);
    if (panel) panel.classList.remove('hidden');

    if (tab === 'submit') renderSubmitForm(panel, opts);
    if (tab === 'open') renderOpenList(panel, opts);
    if (tab === 'mine') renderMyList(panel, opts);
    if (tab === 'completed') renderCompletedList(panel, opts);
    if (tab === 'assigned') renderAssignedList(panel, opts);
  }

  function renderSubmitForm(panel, opts) {
    const api = getApi(opts);
    panel.innerHTML = `
      <form id="la-submit-form" class="space-y-4 max-w-xl">
        <p class="text-sm text-gray-600">上传您的法律诉求，律师、法律志愿者或其他用户可接单为您提供帮助；也可选择由<strong>平台协助联系</strong>法律资源。</p>
        <div>
          <label class="block text-sm font-medium mb-1">诉求类别 <span class="text-red-500">*</span></label>
          <select id="la-category" class="w-full border rounded-xl px-4 py-2.5" required></select>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">诉求标题 <span class="text-red-500">*</span></label>
          <input id="la-title" class="w-full border rounded-xl px-4 py-2.5" maxlength="200" placeholder="简要概括您的法律问题" required />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">诉求详情 <span class="text-red-500">*</span></label>
          <textarea id="la-description" rows="5" class="w-full border rounded-xl px-4 py-2.5" placeholder="请详细描述事件经过、您的疑问与期望获得的帮助…" required></textarea>
        </div>
        <div class="grid sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium mb-1">联系电话</label>
            <input id="la-phone" type="tel" class="w-full border rounded-xl px-4 py-2.5" placeholder="便于接单人联系" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">联系邮箱</label>
            <input id="la-email" type="email" class="w-full border rounded-xl px-4 py-2.5" />
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">上传材料（选填，最多3个，每个≤200KB）</label>
          <input id="la-files" type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt" class="w-full text-sm" />
          <ul id="la-file-list" class="mt-2 text-xs text-gray-500 space-y-1"></ul>
        </div>
        <label class="flex items-start gap-2 text-sm">
          <input type="checkbox" id="la-prefer-platform" class="mt-1" />
          <span>优先请求<strong>平台协助联系</strong>律师或法律资源（不等待用户接单）</span>
        </label>
        <button type="submit" class="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700">
          <i class="fas fa-paper-plane mr-1"></i> 提交诉求申请
        </button>
      </form>`;

    pendingFiles = [];
    loadMeta(api).then((meta) => {
      const sel = panel.querySelector('#la-category');
      Object.entries(meta.categories || {}).forEach(([k, v]) => {
        sel.innerHTML += `<option value="${k}">${v}</option>`;
      });
    });

    panel.querySelector('#la-files').addEventListener('change', (e) => {
      pendingFiles = Array.from(e.target.files || []).slice(0, 3);
      panel.querySelector('#la-file-list').innerHTML = pendingFiles
        .map((f) => `<li><i class="fas fa-file mr-1"></i>${f.name} (${Math.round(f.size / 1024)}KB)</li>`)
        .join('');
    });

    panel.querySelector('#la-submit-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const attachments = await readFilesAsBase64(pendingFiles);
        const res = await api.createRequest({
          category: panel.querySelector('#la-category').value,
          title: panel.querySelector('#la-title').value.trim(),
          description: panel.querySelector('#la-description').value.trim(),
          contact_phone: panel.querySelector('#la-phone').value.trim() || undefined,
          contact_email: panel.querySelector('#la-email').value.trim() || undefined,
          prefer_platform: panel.querySelector('#la-prefer-platform').checked,
          attachments,
        });
        toast(res.message || '提交成功', 'success');
        e.target.reset();
        pendingFiles = [];
        panel.querySelector('#la-file-list').innerHTML = '';
        const root = panel.closest('[data-legal-aid-root]');
        if (root) switchTab(root, 'mine', opts);
      } catch (err) {
        toast(err.message || '提交失败', 'error');
      }
    });
  }

  function readFilesAsBase64(files) {
    const maxBytes = 200 * 1024;
    return Promise.all(
      files.map(
        (file) =>
          new Promise((resolve, reject) => {
            if (file.size > maxBytes) {
              reject(new Error(`文件 ${file.name} 超过 200KB`));
              return;
            }
            const reader = new FileReader();
            reader.onload = () => {
              const base64 = String(reader.result || '').split(',')[1] || '';
              resolve({ name: file.name, mime: file.type, size: file.size, data_base64: base64 });
            };
            reader.onerror = () => reject(new Error('读取文件失败'));
            reader.readAsDataURL(file);
          })
      )
    );
  }

  function renderRequestCard(r, meta, opts, mode) {
    const cat = (meta.categories && meta.categories[r.category]) || r.category;
    let actions = '';

    if (mode === 'open' && !['completed', 'cancelled'].includes(r.status) && !r.viewer_has_helped) {
      actions = `
        <div class="mt-3 pt-3 border-t flex flex-wrap gap-2">
          <button type="button" class="la-accept-btn px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700" data-id="${r.id}">提供帮助</button>
        </div>`;
    } else if (mode === 'open' && r.viewer_has_helped) {
      actions = '<p class="mt-3 pt-3 border-t text-xs text-green-700"><i class="fas fa-check mr-1"></i>您已为此诉求提供过帮助</p>';
    }

    if (mode === 'mine') {
      if (r.status === 'pending' || r.status === 'platform_assisting') {
        actions += `<div class="mt-3 flex flex-wrap gap-3 text-xs">
          <button type="button" class="la-platform-btn text-purple-700 hover:underline" data-id="${r.id}">请求平台协助联系</button>
          <button type="button" class="la-cancel-btn text-red-600 hover:underline" data-id="${r.id}">取消诉求</button>
        </div>`;
      }
      if (!['completed', 'cancelled'].includes(r.status)) {
        actions += `<div class="mt-3">
          <button type="button" class="la-complete-btn px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700" data-id="${r.id}">
            <i class="fas fa-check-double mr-1"></i>标记诉求已完成
          </button>
        </div>`;
      }
      if (r.status === 'platform_assisting' && r.platform_note) {
        actions += `<p class="mt-2 text-xs text-purple-700"><i class="fas fa-headset mr-1"></i>${r.platform_note}</p>`;
      }
    }

    if (mode === 'assigned') {
      const myResp = r.viewer_response;
      actions = `<p class="mt-2 text-xs text-gray-500">申请人：${r.applicant_display_name} · ${r.contact_phone || ''}</p>`;
      if (myResp && myResp.note) {
        actions += `<p class="mt-1 text-xs text-green-800 bg-green-50 p-2 rounded-lg">您提供的帮助：「${myResp.note}」</p>`;
      }
    }

    const attachInfo =
      r.attachments && r.attachments.length
        ? `<p class="text-xs text-gray-400 mt-1"><i class="fas fa-paperclip mr-1"></i>${r.attachments.length} 个附件</p>`
        : '';

    const responsesBlock = renderResponsesBlock(r, meta, opts, mode);

    return `
      <article class="border rounded-xl p-4 bg-white hover:shadow-sm transition-shadow" data-request-id="${r.id}">
        <div class="flex flex-wrap items-start justify-between gap-2 mb-2">
          <h4 class="font-semibold text-gray-900">${r.title}</h4>
          ${statusBadge(r.status, meta)}
        </div>
        <p class="text-xs text-gray-500 mb-2">${cat} · ${r.applicant_display_name || '申请人'} · ${formatDate(r.created_at)}</p>
        <p class="text-sm text-gray-700 line-clamp-3">${r.description}</p>
        ${attachInfo}
        ${responsesBlock}
        ${actions}
      </article>`;
  }

  async function renderOpenList(panel, opts) {
    const api = getApi(opts);
    panel.innerHTML = '<p class="text-sm text-gray-500">加载中…</p>';
    try {
      const [meta, res] = await Promise.all([loadMeta(api), api.listOpen()]);
      const list = res.data?.requests || [];
      panel.innerHTML = `
        <p class="text-sm text-gray-600 mb-4">以下为用户提交的法律诉求。提供法律帮助后诉求<strong>不会下架</strong>，可继续供更多人参与；已提供的帮助将公开展示。</p>
        <div class="space-y-4" id="la-open-list">${list.length ? list.map((r) => renderRequestCard(r, meta, opts, 'open')).join('') : '<p class="text-gray-400 text-sm">暂无进行中的诉求</p>'}</div>`;
      bindOpenActions(panel, api, meta, opts);
    } catch (e) {
      panel.innerHTML = `<p class="text-red-600 text-sm">${e.message || '加载失败，请先登录'}</p>`;
    }
  }

  function bindOpenActions(panel, api, meta, opts) {
    panel.querySelectorAll('.la-accept-btn').forEach((btn) => {
      btn.addEventListener('click', () => showAcceptModal(btn.dataset.id, api, meta, opts));
    });
  }

  function showAcceptModal(requestId, api, meta, opts) {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50';
    overlay.innerHTML = `
      <div class="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <h3 class="text-lg font-bold mb-4">提供法律帮助</h3>
        <div class="space-y-3 text-sm">
          <div>
            <label class="block font-medium mb-1">您的身份</label>
            <select id="accept-role" class="w-full border rounded-lg px-3 py-2">
              ${Object.entries(meta.helper_roles || {}).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block font-medium mb-1">联系方式（供申请人联系）</label>
            <input id="accept-contact" class="w-full border rounded-lg px-3 py-2" placeholder="手机 / 微信 / 邮箱" />
          </div>
          <div>
            <label class="block font-medium mb-1">提供的帮助说明 <span class="text-red-500">*</span></label>
            <textarea id="accept-note" rows="3" class="w-full border rounded-lg px-3 py-2" placeholder="请说明您能提供什么法律帮助…" required></textarea>
          </div>
        </div>
        <div class="flex gap-2 mt-5">
          <button type="button" id="accept-confirm" class="flex-1 py-2.5 bg-green-600 text-white rounded-xl font-medium">确认提供帮助</button>
          <button type="button" id="accept-cancel" class="px-4 py-2.5 text-gray-500">取消</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#accept-cancel').onclick = () => overlay.remove();
    overlay.querySelector('#accept-confirm').onclick = async () => {
      const note = overlay.querySelector('#accept-note').value.trim();
      if (!note) {
        toast('请填写您提供的帮助说明', 'error');
        return;
      }
      try {
        const res = await api.acceptRequest(requestId, {
          helper_role: overlay.querySelector('#accept-role').value,
          contact: overlay.querySelector('#accept-contact').value.trim(),
          note,
        });
        toast(res.message || '已记录您的帮助', 'success');
        overlay.remove();
        const root = document.querySelector('[data-legal-aid-root]');
        if (root) switchTab(root, 'assigned', opts);
      } catch (err) {
        toast(err.message || '提交失败', 'error');
      }
    };
  }

  function bindMineActions(panel, api, opts) {
    panel.querySelectorAll('.la-platform-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const res = await api.requestPlatformAssist(btn.dataset.id);
          toast(res.message || '已请求平台协助', 'success');
          renderMyList(panel, opts);
        } catch (e) {
          toast(e.message, 'error');
        }
      });
    });
    panel.querySelectorAll('.la-cancel-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('确定取消该诉求？')) return;
        try {
          await api.updateStatus(btn.dataset.id, 'cancelled');
          toast('已取消', 'success');
          renderMyList(panel, opts);
        } catch (e) {
          toast(e.message, 'error');
        }
      });
    });
    panel.querySelectorAll('.la-complete-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('确认该诉求已处理完成？完成后将移至「已完成诉求」。')) return;
        try {
          await api.updateStatus(btn.dataset.id, 'completed');
          toast('诉求已标记为已完成', 'success');
          const root = panel.closest('[data-legal-aid-root]');
          if (root) switchTab(root, 'completed', opts);
        } catch (e) {
          toast(e.message, 'error');
        }
      });
    });
  }

  async function renderMyList(panel, opts) {
    const api = getApi(opts);
    panel.innerHTML = '<p class="text-sm text-gray-500">加载中…</p>';
    try {
      const [meta, res] = await Promise.all([loadMeta(api), api.listMine()]);
      const list = res.data?.requests || [];
      panel.innerHTML = `<div class="space-y-4">${list.length ? list.map((r) => renderRequestCard(r, meta, opts, 'mine')).join('') : '<p class="text-gray-400 text-sm">您还没有进行中的诉求</p>'}</div>`;
      bindMineActions(panel, api, opts);
    } catch (e) {
      panel.innerHTML = `<p class="text-red-600 text-sm">${e.message || '请先登录个人账号'}</p>`;
    }
  }

  async function renderCompletedList(panel, opts) {
    const api = getApi(opts);
    panel.innerHTML = '<p class="text-sm text-gray-500">加载中…</p>';
    try {
      const [meta, res] = await Promise.all([loadMeta(api), api.listMineCompleted()]);
      const list = res.data?.requests || [];
      panel.innerHTML = `
        <p class="text-sm text-gray-600 mb-4">您已标记为完成的法律诉求，含各方提供的帮助记录。</p>
        <div class="space-y-4">${list.length ? list.map((r) => renderRequestCard(r, meta, opts, 'mine')).join('') : '<p class="text-gray-400 text-sm">暂无已完成的诉求</p>'}</div>`;
    } catch (e) {
      panel.innerHTML = `<p class="text-red-600 text-sm">${e.message || '请先登录个人账号'}</p>`;
    }
  }

  async function renderAssignedList(panel, opts) {
    const api = getApi(opts);
    panel.innerHTML = '<p class="text-sm text-gray-500">加载中…</p>';
    try {
      const [meta, res] = await Promise.all([loadMeta(api), api.listAssigned()]);
      const list = res.data?.requests || [];
      panel.innerHTML = `<div class="space-y-4">${list.length ? list.map((r) => renderRequestCard(r, meta, opts, 'assigned')).join('') : '<p class="text-gray-400 text-sm">您还没有提供过法律帮助</p>'}</div>`;
    } catch (e) {
      panel.innerHTML = `<p class="text-red-600 text-sm">${e.message || '请先登录'}</p>`;
    }
  }

  function init(container, options) {
    if (!container) return;
    const opts = Object.assign({ portal: 'individual', allowSubmit: true }, options);
    container.setAttribute('data-legal-aid-root', '1');
    renderTabs(container, opts);
    switchTab(container, opts.allowSubmit ? 'submit' : 'open', opts);
  }

  global.LegalAidUI = { init };
})(window);
