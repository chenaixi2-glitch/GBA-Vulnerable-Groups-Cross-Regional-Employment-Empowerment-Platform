/**
 * Vulnerable-group legal aid — request submission / multi-helper / platform assist
 */
(function (global) {
  const instances = [];

  function laT(key, fallback, vars) {
    if (global.GBAI18n && global.GBAI18n.t) return global.GBAI18n.t(key, fallback, vars);
    var s = fallback;
    if (vars && s) Object.keys(vars).forEach(function (k) { s = String(s).replace('{' + k + '}', vars[k]); });
    return s;
  }
  function mapMsg(msg) {
    if (!msg) return msg;
    if (global.GBAI18n && global.GBAI18n.tApiMessage) return global.GBAI18n.tApiMessage(String(msg));
    return String(msg);
  }

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
    return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function renderResponsesBlock(r, meta, opts, mode) {
    const responses = r.responses || [];
    if (!responses.length) return '';

    const items = responses
      .map((resp) => {
        const role = (meta.helper_roles && meta.helper_roles[resp.helper_role]) || resp.helper_role || laT('legal.helper', 'Helper');
        const note = resp.note ? `<p class="text-gray-600 mt-0.5">「${resp.note}」</p>` : '';
        const contact =
          mode === 'mine' && resp.contact
            ? `<p class="text-xs text-gray-500 mt-0.5">${laT('legal.contactLabel', 'Contact')}: ${resp.contact}</p>`
            : '';
        return `<li class="p-2 bg-green-50 rounded-lg border border-green-100">
          <div class="flex justify-between gap-2 text-xs">
            <span class="font-medium text-green-900">${resp.helper_display_name || laT('legal.helper', 'Helper')}</span>
            <span class="text-green-700">${role}</span>
          </div>
          ${note}
          ${contact}
          <p class="text-xs text-gray-400 mt-1">${formatDate(resp.created_at)}</p>
        </li>`;
      })
      .join('');

    return `<div class="mt-3 pt-3 border-t">
      <p class="text-xs font-semibold text-gray-700 mb-2"><i class="fas fa-hands-helping mr-1 text-green-600"></i>${laT('legal.receivedHelp', 'Help received ({count})', { count: responses.length })}</p>
      <ul class="space-y-2">${items}</ul>
    </div>`;
  }

  function renderTabs(container, opts) {
    const showSubmit = opts.allowSubmit !== false;
    container.innerHTML = `
      <div class="legal-aid-tabs flex flex-wrap gap-2 mb-6 border-b pb-3">
        ${showSubmit ? '<button type="button" data-tab="submit" class="la-tab px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white">' + laT('legal.tabSubmit', 'Submit request') + '</button>' : ''}
        <button type="button" data-tab="open" class="la-tab px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100">${laT('legal.tabOpen', 'Open · Offer help')}</button>
        ${showSubmit ? '<button type="button" data-tab="mine" class="la-tab px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100">' + laT('legal.tabMine', 'My requests') + '</button>' : ''}
        ${showSubmit ? '<button type="button" data-tab="completed" class="la-tab px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100">' + laT('legal.tabCompleted', 'Completed requests') + '</button>' : ''}
        <button type="button" data-tab="assigned" class="la-tab px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100">${laT('legal.tabAssigned', 'My help')}</button>
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
    const inst = instances.find(function (i) { return i.container === container; });
    if (inst) inst.activeTab = tab;

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
        <p class="text-sm text-gray-600">${laT('legal.submitIntro', 'Upload your legal request. Lawyers, volunteers or other users can offer help; you may also ask the platform to connect you with legal resources.')}</p>
        <div>
          <label class="block text-sm font-medium mb-1">${laT('legal.categoryLabel', 'Category')} <span class="text-red-500">*</span></label>
          <select id="la-category" class="w-full border rounded-xl px-4 py-2.5" required></select>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">${laT('legal.titleLabel', 'Request title')} <span class="text-red-500">*</span></label>
          <input id="la-title" class="w-full border rounded-xl px-4 py-2.5" maxlength="200" placeholder="${laT('legal.titlePlaceholder', 'Brief summary of your legal issue')}" required />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">${laT('legal.descriptionLabel', 'Details')} <span class="text-red-500">*</span></label>
          <textarea id="la-description" rows="5" class="w-full border rounded-xl px-4 py-2.5" placeholder="${laT('legal.descriptionPlaceholder', 'Describe what happened, your questions and the help you need…')}" required></textarea>
        </div>
        <div class="grid sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium mb-1">${laT('legal.phoneLabel', 'Phone')}</label>
            <input id="la-phone" type="tel" class="w-full border rounded-xl px-4 py-2.5" placeholder="${laT('legal.phonePlaceholder', 'For helpers to reach you')}" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">${laT('legal.emailLabel', 'Email')}</label>
            <input id="la-email" type="email" class="w-full border rounded-xl px-4 py-2.5" />
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">${laT('legal.filesLabel', 'Attachments (optional, max 3, ≤200KB each)')}</label>
          <div class="flex flex-wrap items-center gap-3">
            <input id="la-files" type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt" class="sr-only" />
            <button type="button" id="la-files-btn" class="px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
              ${laT('legal.chooseFiles', 'Choose files')}
            </button>
            <span id="la-files-status" class="text-sm text-gray-500">${laT('legal.noFileChosen', 'No file chosen')}</span>
          </div>
          <ul id="la-file-list" class="mt-2 text-xs text-gray-500 space-y-1"></ul>
        </div>
        <label class="flex items-start gap-2 text-sm">
          <input type="checkbox" id="la-prefer-platform" class="mt-1" />
          <span>${laT('legal.preferPlatform', 'Prefer platform assistance to connect with lawyers or legal resources (without waiting for user helpers)')}</span>
        </label>
        <button type="submit" class="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700">
          <i class="fas fa-paper-plane mr-1"></i> ${laT('legal.submitBtn', 'Submit request')}
        </button>
      </form>`;

    pendingFiles = [];
    const fileInput = panel.querySelector('#la-files');
    const fileBtn = panel.querySelector('#la-files-btn');
    const fileStatus = panel.querySelector('#la-files-status');
    const fileList = panel.querySelector('#la-file-list');

    function syncFileStatus() {
      if (!pendingFiles.length) {
        fileStatus.textContent = laT('legal.noFileChosen', 'No file chosen');
        fileList.innerHTML = '';
        return;
      }
      fileStatus.textContent = pendingFiles.length === 1
        ? pendingFiles[0].name
        : laT('legal.filesSelected', '{count} files selected', { count: pendingFiles.length });
      fileList.innerHTML = pendingFiles
        .map((f) => `<li><i class="fas fa-file mr-1"></i>${f.name} (${Math.round(f.size / 1024)}KB)</li>`)
        .join('');
    }

    loadMeta(api).then((meta) => {
      const sel = panel.querySelector('#la-category');
      sel.innerHTML = '<option value="">' + laT('legal.categoryPlaceholder', 'Select a category') + '</option>';
      Object.entries(meta.categories || {}).forEach(([k, v]) => {
        sel.innerHTML += `<option value="${k}">${v}</option>`;
      });
    });

    fileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      pendingFiles = Array.from(e.target.files || []).slice(0, 3);
      syncFileStatus();
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
        toast(mapMsg(res.message) || laT('legal.submitSuccess', 'Submitted successfully'), 'success');
        e.target.reset();
        pendingFiles = [];
        fileInput.value = '';
        syncFileStatus();
        const root = panel.closest('[data-legal-aid-root]');
        if (root) switchTab(root, 'mine', opts);
      } catch (err) {
        toast(mapMsg(err.message) || laT('legal.submitFailed', 'Submission failed'), 'error');
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
              reject(new Error(laT('legal.fileTooLarge', 'File {name} exceeds 200KB', { name: file.name })));
              return;
            }
            const reader = new FileReader();
            reader.onload = () => {
              const base64 = String(reader.result || '').split(',')[1] || '';
              resolve({ name: file.name, mime: file.type, size: file.size, data_base64: base64 });
            };
            reader.onerror = () => reject(new Error(laT('legal.fileReadFailed', 'Failed to read file')));
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
          <button type="button" class="la-accept-btn px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700" data-id="${r.id}">${laT('legal.offerHelp', 'Offer help')}</button>
        </div>`;
    } else if (mode === 'open' && r.viewer_has_helped) {
      actions = '<p class="mt-3 pt-3 border-t text-xs text-green-700"><i class="fas fa-check mr-1"></i>' + laT('legal.alreadyHelped', 'You have already helped with this request') + '</p>';
    }

    if (mode === 'mine') {
      if (r.status === 'pending' || r.status === 'platform_assisting') {
        actions += `<div class="mt-3 flex flex-wrap gap-3 text-xs">
          <button type="button" class="la-platform-btn text-purple-700 hover:underline" data-id="${r.id}">${laT('legal.requestPlatform', 'Request platform assistance')}</button>
          <button type="button" class="la-cancel-btn text-red-600 hover:underline" data-id="${r.id}">${laT('legal.cancelRequest', 'Cancel request')}</button>
        </div>`;
      }
      if (!['completed', 'cancelled'].includes(r.status)) {
        actions += `<div class="mt-3">
          <button type="button" class="la-complete-btn px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700" data-id="${r.id}">
            <i class="fas fa-check-double mr-1"></i>${laT('legal.markComplete', 'Mark as completed')}
          </button>
        </div>`;
      }
      if (r.status === 'platform_assisting' && r.platform_note) {
        actions += `<p class="mt-2 text-xs text-purple-700"><i class="fas fa-headset mr-1"></i>${r.platform_note}</p>`;
      }
    }

    if (mode === 'assigned') {
      const myResp = r.viewer_response;
      actions = `<p class="mt-2 text-xs text-gray-500">${laT('legal.applicantLabel', 'Applicant')}: ${r.applicant_display_name} · ${r.contact_phone || ''}</p>`;
      if (myResp && myResp.note) {
        actions += `<p class="mt-1 text-xs text-green-800 bg-green-50 p-2 rounded-lg">${laT('legal.yourHelp', 'Your help')}: 「${myResp.note}」</p>`;
      }
    }

    const attachInfo =
      r.attachments && r.attachments.length
        ? `<p class="text-xs text-gray-400 mt-1"><i class="fas fa-paperclip mr-1"></i>${laT('legal.attachmentCount', '{count} attachment(s)', { count: r.attachments.length })}</p>`
        : '';

    const responsesBlock = renderResponsesBlock(r, meta, opts, mode);

    return `
      <article class="border rounded-xl p-4 bg-white hover:shadow-sm transition-shadow" data-request-id="${r.id}">
        <div class="flex flex-wrap items-start justify-between gap-2 mb-2">
          <h4 class="font-semibold text-gray-900">${r.title}</h4>
          ${statusBadge(r.status, meta)}
        </div>
        <p class="text-xs text-gray-500 mb-2">${cat} · ${r.applicant_display_name || laT('legal.applicant', 'Applicant')} · ${formatDate(r.created_at)}</p>
        <p class="text-sm text-gray-700 line-clamp-3">${r.description}</p>
        ${attachInfo}
        ${responsesBlock}
        ${actions}
      </article>`;
  }

  async function renderOpenList(panel, opts) {
    const api = getApi(opts);
    panel.innerHTML = '<p class="text-sm text-gray-500">' + laT('legal.loading', 'Loading…') + '</p>';
    try {
      const [meta, res] = await Promise.all([loadMeta(api), api.listOpen()]);
      const list = res.data?.requests || [];
      panel.innerHTML = `
        <p class="text-sm text-gray-600 mb-4">${laT('legal.openIntro', 'Legal requests submitted by users. After you offer help the request stays visible; help provided is shown publicly.')}</p>
        <div class="space-y-4" id="la-open-list">${list.length ? list.map((r) => renderRequestCard(r, meta, opts, 'open')).join('') : '<p class="text-gray-400 text-sm">' + laT('legal.noOpenRequests', 'No active requests') + '</p>'}</div>`;
      bindOpenActions(panel, api, meta, opts);
    } catch (e) {
      panel.innerHTML = `<p class="text-red-600 text-sm">${mapMsg(e.message) || laT('legal.loadFailed', 'Load failed. Please sign in first')}</p>`;
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
        <h3 class="text-lg font-bold mb-4">${laT('legal.acceptModalTitle', 'Offer legal help')}</h3>
        <div class="space-y-3 text-sm">
          <div>
            <label class="block font-medium mb-1">${laT('legal.yourRole', 'Your role')}</label>
            <select id="accept-role" class="w-full border rounded-lg px-3 py-2">
              ${Object.entries(meta.helper_roles || {}).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block font-medium mb-1">${laT('legal.contactForApplicant', 'Contact (for applicant)')}</label>
            <input id="accept-contact" class="w-full border rounded-lg px-3 py-2" placeholder="${laT('legal.contactPlaceholder', 'Phone / WeChat / email')}" />
          </div>
          <div>
            <label class="block font-medium mb-1">${laT('legal.helpNoteLabel', 'Help description')} <span class="text-red-500">*</span></label>
            <textarea id="accept-note" rows="3" class="w-full border rounded-lg px-3 py-2" placeholder="${laT('legal.helpNotePlaceholder', 'Describe the legal help you can provide…')}" required></textarea>
          </div>
        </div>
        <div class="flex gap-2 mt-5">
          <button type="button" id="accept-confirm" class="flex-1 py-2.5 bg-green-600 text-white rounded-xl font-medium">${laT('legal.confirmHelp', 'Confirm help')}</button>
          <button type="button" id="accept-cancel" class="px-4 py-2.5 text-gray-500">${laT('legal.cancel', 'Cancel')}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#accept-cancel').onclick = () => overlay.remove();
    overlay.querySelector('#accept-confirm').onclick = async () => {
      const note = overlay.querySelector('#accept-note').value.trim();
      if (!note) {
        toast(laT('legal.helpNoteRequired', 'Please describe the help you are offering'), 'error');
        return;
      }
      try {
        const res = await api.acceptRequest(requestId, {
          helper_role: overlay.querySelector('#accept-role').value,
          contact: overlay.querySelector('#accept-contact').value.trim(),
          note,
        });
        toast(mapMsg(res.message) || laT('legal.helpRecorded', 'Your help has been recorded'), 'success');
        overlay.remove();
        const root = document.querySelector('[data-legal-aid-root]');
        if (root) switchTab(root, 'assigned', opts);
      } catch (err) {
        toast(mapMsg(err.message) || laT('legal.submitFailed', 'Submission failed'), 'error');
      }
    };
  }

  function bindMineActions(panel, api, opts) {
    panel.querySelectorAll('.la-platform-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const res = await api.requestPlatformAssist(btn.dataset.id);
          toast(mapMsg(res.message) || laT('legal.platformAssist', 'Platform assistance requested'), 'success');
          renderMyList(panel, opts);
        } catch (e) {
          toast(e.message, 'error');
        }
      });
    });
    panel.querySelectorAll('.la-cancel-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm(laT('legal.confirmCancel', 'Cancel this request?'))) return;
        try {
          await api.updateStatus(btn.dataset.id, 'cancelled');
          toast(laT('legal.cancelled', 'Cancelled'), 'success');
          renderMyList(panel, opts);
        } catch (e) {
          toast(e.message, 'error');
        }
      });
    });
    panel.querySelectorAll('.la-complete-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm(laT('legal.confirmComplete', 'Mark this request as completed? It will move to Completed requests.'))) return;
        try {
          await api.updateStatus(btn.dataset.id, 'completed');
          toast(laT('legal.markedComplete', 'Request marked as completed'), 'success');
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
    panel.innerHTML = '<p class="text-sm text-gray-500">' + laT('legal.loading', 'Loading…') + '</p>';
    try {
      const [meta, res] = await Promise.all([loadMeta(api), api.listMine()]);
      const list = res.data?.requests || [];
      panel.innerHTML = `<div class="space-y-4">${list.length ? list.map((r) => renderRequestCard(r, meta, opts, 'mine')).join('') : '<p class="text-gray-400 text-sm">' + laT('legal.noActiveRequests', 'You have no active requests') + '</p>'}</div>`;
      bindMineActions(panel, api, opts);
    } catch (e) {
      panel.innerHTML = `<p class="text-red-600 text-sm">${mapMsg(e.message) || laT('legal.loginIndividual', 'Please sign in with an individual account')}</p>`;
    }
  }

  async function renderCompletedList(panel, opts) {
    const api = getApi(opts);
    panel.innerHTML = '<p class="text-sm text-gray-500">' + laT('legal.loading', 'Loading…') + '</p>';
    try {
      const [meta, res] = await Promise.all([loadMeta(api), api.listMineCompleted()]);
      const list = res.data?.requests || [];
      panel.innerHTML = `
        <p class="text-sm text-gray-600 mb-4">${laT('legal.completedIntro', 'Requests you marked as completed, including help records from all parties.')}</p>
        <div class="space-y-4">${list.length ? list.map((r) => renderRequestCard(r, meta, opts, 'mine')).join('') : '<p class="text-gray-400 text-sm">' + laT('legal.noCompletedRequests', 'No completed requests') + '</p>'}</div>`;
    } catch (e) {
      panel.innerHTML = `<p class="text-red-600 text-sm">${mapMsg(e.message) || laT('legal.loginIndividual', 'Please sign in with an individual account')}</p>`;
    }
  }

  async function renderAssignedList(panel, opts) {
    const api = getApi(opts);
    panel.innerHTML = '<p class="text-sm text-gray-500">' + laT('legal.loading', 'Loading…') + '</p>';
    try {
      const [meta, res] = await Promise.all([loadMeta(api), api.listAssigned()]);
      const list = res.data?.requests || [];
      panel.innerHTML = `<div class="space-y-4">${list.length ? list.map((r) => renderRequestCard(r, meta, opts, 'assigned')).join('') : '<p class="text-gray-400 text-sm">' + laT('legal.noProvidedHelp', 'You have not provided legal help yet') + '</p>'}</div>`;
    } catch (e) {
      panel.innerHTML = `<p class="text-red-600 text-sm">${mapMsg(e.message) || laT('legal.loginRequired', 'Please sign in first')}</p>`;
    }
  }

  function init(container, options) {
    if (!container) return;
    const opts = Object.assign({ portal: 'individual', allowSubmit: true }, options);
    container.setAttribute('data-legal-aid-root', '1');
    const existing = instances.find(function (i) { return i.container === container; });
    const activeTab = existing ? existing.activeTab : (opts.allowSubmit ? 'submit' : 'open');
    if (existing) {
      existing.opts = opts;
      existing.activeTab = activeTab;
    } else {
      instances.push({ container: container, opts: opts, activeTab: activeTab });
    }
    renderTabs(container, opts);
    switchTab(container, activeTab, opts);
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('gba:language-changed', function () {
      metaCache = null;
      instances.forEach(function (inst) {
        init(inst.container, inst.opts);
      });
    });
  }

  global.LegalAidUI = { init };
})(window);
