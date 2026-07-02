/**
 * 企业端 My Jobs 模块
 */
(function () {
  function cT(key, fallback, vars) {
    if (window.GBAI18n && window.GBAI18n.t) return window.GBAI18n.t(key, fallback, vars);
    var s = fallback;
    if (vars && s) Object.keys(vars).forEach(function (k) { s = String(s).replace('{' + k + '}', vars[k]); });
    return s;
  }
  function mapMsg(msg) {
    if (!msg) return msg;
    if (window.GBAI18n && window.GBAI18n.tApiMessage) return window.GBAI18n.tApiMessage(String(msg));
    return String(msg);
  }

  const PAGE_SIZE = 10;
  const state = {
    page: 1,
    status: 'all',
    search: '',
    location: '',
    total: 0,
    loading: false,
    allItems: [],       // full result set from API (for client-side location filter)
  };

  const els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function formatDate(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function statusBadge(status) {
    const map = {
      active: 'bg-green-100 text-green-800',
      interviewing: 'bg-yellow-100 text-yellow-800',
      closed: 'bg-gray-100 text-gray-800',
    };
    const label = status.charAt(0).toUpperCase() + status.slice(1);
    return `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${map[status] || map.active}">${label}</span>`;
  }

  function friendlyBadge(job) {
    if (!job.vulnerable_group_friendly) return '';
    return '<span class="ml-2 px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800">弱势群体友好</span>';
  }

  function subTitle(job) {
    if (job.source === 'external') {
      return job.company_name || '外部岗位 · 广东省残疾人就业服务网';
    }
    return job.department || 'Internal Posting';
  }

  function renderActions(job) {
    if (job.source === 'external') {
      const href = job.source_url || 'https://www.jyfw.org.cn/';
      return `<a href="${href}" target="_blank" rel="noopener" class="text-green-600 hover:text-green-900">View</a>`;
    }

    const view = `<a href="#" data-action="view" data-id="${job.id}" class="text-green-600 hover:text-green-900 mr-3">View</a>`;
    const applicants = job.source === 'internal'
      ? `<a href="#" data-action="applicants" data-id="${job.id}" class="text-purple-600 hover:text-purple-900 mr-3">Applicants</a>`
      : '';
    if (job.status === 'closed') {
      return (
        view + applicants +
        `<a href="#" data-action="reopen" data-id="${job.id}" class="text-emerald-600 hover:text-emerald-900 mr-3">Reopen</a>` +
        `<a href="#" data-action="clone" data-id="${job.id}" class="text-blue-600 hover:text-blue-900 mr-3">Clone</a>` +
        `<a href="#" data-action="delete" data-id="${job.id}" class="text-red-600 hover:text-red-900">Delete</a>`
      );
    }
    if (job.status === 'interviewing') {
      return (
        view + applicants +
        `<a href="#" data-action="edit" data-id="${job.id}" class="text-blue-600 hover:text-blue-900 mr-3">Edit</a>` +
        `<a href="#" data-action="close" data-id="${job.id}" class="text-red-600 hover:text-red-900">Close</a>`
      );
    }
    return (
      view + applicants +
      `<a href="#" data-action="edit" data-id="${job.id}" class="text-blue-600 hover:text-blue-900 mr-3">Edit</a>` +
      `<a href="#" data-action="interviewing" data-id="${job.id}" class="text-yellow-600 hover:text-yellow-900 mr-3">Interviewing</a>` +
      `<a href="#" data-action="close" data-id="${job.id}" class="text-red-600 hover:text-red-900">Close</a>`
    );
  }

  function renderRows(items) {
    if (!items.length) {
      return `<tr><td colspan="6" class="px-6 py-10 text-center text-gray-500">No jobs found. Run the crawler or post a new job.</td></tr>`;
    }

    return items
      .map(
        (job) => `
      <tr data-source="${job.source}">
        <td class="px-6 py-4 whitespace-nowrap">
          <div class="text-sm font-medium text-gray-900">${escapeHtml(job.title)}${friendlyBadge(job)}</div>
          <div class="text-sm text-gray-500">${escapeHtml(subTitle(job))}</div>
        </td>
        <td class="px-6 py-4 whitespace-nowrap"><div class="text-sm text-gray-900">${escapeHtml(job.location || '-')}</div></td>
        <td class="px-6 py-4 whitespace-nowrap"><div class="text-sm text-gray-900">${formatDate(job.post_date)}</div></td>
        <td class="px-6 py-4 whitespace-nowrap">
          <div class="text-sm text-gray-900">${job.applications_count || 0}</div>
          <div class="text-xs text-green-600">${job.matches_count || 0} matches</div>
        </td>
        <td class="px-6 py-4 whitespace-nowrap">${statusBadge(job.status)}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">${renderActions(job)}</td>
      </tr>`
      )
      .join('');
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderPagination(pagination) {
    const { page, totalPages, total } = pagination;
    const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
    const end = Math.min(page * PAGE_SIZE, total);
    els.summary.textContent = cT('corporate.showingJobs', 'Showing {start}-{end} of {total} jobs', { start: start, end: end, total: total });

    let html = '';
    html += `<button data-page="prev" class="px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50" ${page <= 1 ? 'disabled' : ''}>Previous</button>`;

    for (let i = 1; i <= totalPages; i += 1) {
      if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) {
        const active = i === page ? 'bg-green-600 text-white' : 'border border-gray-300 text-gray-600 hover:bg-gray-50';
        html += `<button data-page="${i}" class="px-4 py-2 rounded-lg ${active}">${i}</button>`;
      } else if (Math.abs(i - page) === 2) {
        html += `<span class="px-2 text-gray-400">...</span>`;
      }
    }

    html += `<button data-page="next" class="px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50" ${page >= totalPages ? 'disabled' : ''}>Next</button>`;
    els.pagination.innerHTML = html;
  }

  function applyLocationFilter(items) {
    if (!state.location) return items;
    const loc = state.location.toLowerCase();
    return items.filter(function (job) {
      return (job.location || '').toLowerCase().includes(loc);
    });
  }

  async function loadJobs() {
    if (state.loading) return;
    state.loading = true;
    els.tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-gray-500"><i class="fas fa-spinner fa-spin mr-2"></i>${cT('corporate.loadingJobs', 'Loading jobs...')}</td></tr>`;

    try {
      const res = await CorporateAPI.JobsAPI.list({
        page: state.page,
        pageSize: PAGE_SIZE,
        status: state.status,
        search: state.search,
        mine: 'true',
        source: 'internal',
      });
      const { items, pagination } = res.data;
      state.allItems = items;
      state.total = pagination.total;

      const filtered = applyLocationFilter(items);
      els.tbody.innerHTML = renderRows(filtered);
      // Adjust pagination summary if location filter is active
      const paginationData = state.location
        ? { page: 1, totalPages: 1, total: filtered.length }
        : pagination;
      renderPagination(paginationData);
      if (typeof window.loadCorporateStats === 'function') window.loadCorporateStats();
    } catch (err) {
      els.tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-red-600">${cT('corporate.loadJobsFailed', 'Failed to load jobs: {msg}. Is the API server running on port 3000?', { msg: escapeHtml(mapMsg(err.message)) })}</td></tr>`;
    } finally {
      state.loading = false;
    }
  }

  function setStatusFilter(status, btn) {
    state.status = status;
    state.page = 1;
    els.filterBtns.forEach((b) => {
      b.className = 'px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg';
    });
    btn.className = 'px-4 py-2 bg-green-100 text-green-800 rounded-lg';
    loadJobs();
  }

  async function showJobModal(id) {
    const res = await CorporateAPI.JobsAPI.get(id);
    const job = res.data.job;
    els.modalTitle.textContent = job.title;
    els.modalBody.innerHTML = `
      <p><strong>Source:</strong> ${job.source === 'external' ? '外部岗位' : '企业自建'}</p>
      <p><strong>Location:</strong> ${escapeHtml(job.location || '-')}</p>
      <p><strong>Department:</strong> ${escapeHtml(job.department || '-')}</p>
      <p><strong>Company:</strong> ${escapeHtml(job.company_name || '-')}</p>
      <p><strong>Salary:</strong> ${escapeHtml(job.salary || '-')}</p>
      <p><strong>Education:</strong> ${escapeHtml(job.education || '-')}</p>
      <p><strong>Experience:</strong> ${escapeHtml(job.work_experience || '-')}</p>
      <p><strong>弱势群体友好:</strong> ${job.vulnerable_group_friendly ? '是' : '否'}</p>
      <p><strong>Derived Tags:</strong> ${escapeHtml((job.target_group_types || []).join(', ') || '-')}</p>
      <p><strong>Target Criteria:</strong> ${escapeHtml(job.target_criteria ? JSON.stringify(job.target_criteria) : '-')}</p>
      <p><strong>Skills:</strong> ${escapeHtml((job.skills || []).join(', ') || '-')}</p>
      <p><strong>Disability Type:</strong> ${escapeHtml(job.disability_type || '-')}</p>
      <p class="mt-3 whitespace-pre-wrap">${escapeHtml(job.description || 'No description.')}</p>
    `;
    els.modal.classList.remove('hidden');
  }

  function hideModal() {
    els.modal.classList.add('hidden');
  }

  async function showApplicantsModal(id) {
    try {
      const res = await CorporateAPI.JobsAPI.listApplications(id);
      const apps = res.data.applications || [];
      const friendly = res.data.vulnerable_group_friendly;
      els.modalTitle.textContent = friendly
        ? 'Applicants (弱势群体优先 · then match score)'
        : 'Applicants (sorted by match score)';
      if (!apps.length) {
        els.modalBody.innerHTML = '<p class="text-gray-500">No applications yet. Scores appear after candidates apply.</p>';
      } else {
        if (friendly && res.data.sort_note) {
          els.modalBody.innerHTML = '<p class="text-xs text-emerald-700 mb-3 font-medium">' + escapeHtml(res.data.sort_note) + '</p>';
        } else {
          els.modalBody.innerHTML = '';
        }
        els.modalBody.innerHTML += '<div class="space-y-3">' + apps.map(function (a) {
          const isVulnerable = (a.applicant_group_types || []).length > 0;
          const vBadge = isVulnerable
            ? '<span class="ml-2 px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-800">弱势群体</span>'
            : '';
          const reasons = (a.match_reasons || []).map(function (r) { return '<li>' + escapeHtml(r) + '</li>'; }).join('');
          const statusOpts = ['pending', 'reviewing', 'accepted', 'rejected'].map(function (st) {
            return '<option value="' + st + '"' + (a.status === st ? ' selected' : '') + '>' + st + '</option>';
          }).join('');
          return '<div class="border rounded-xl p-4 bg-gray-50" data-app-id="' + a.id + '">' +
            '<div class="flex justify-between items-start gap-3">' +
            '<div><p class="font-semibold text-gray-900">' + escapeHtml(a.applicant_name || 'Candidate') + vBadge + '</p>' +
            '<p class="text-sm text-gray-500">' + escapeHtml(a.applicant_email || '') + '</p>' +
            '<p class="text-xs text-gray-400 mt-1">Groups: ' + escapeHtml((a.applicant_group_types || []).join(', ') || '-') + '</p></div>' +
            '<span class="text-lg font-bold text-green-700">' + (a.match_score || 0) + '</span></div>' +
            (reasons ? '<ul class="text-sm text-gray-600 mt-2 list-disc pl-5">' + reasons + '</ul>' : '') +
            (a.cover_message ? '<p class="text-sm text-gray-600 mt-2 italic">' + escapeHtml(a.cover_message) + '</p>' : '') +
            '<div class="mt-3 flex items-center gap-2">' +
            '<label class="text-xs text-gray-500">Status:</label>' +
            '<select data-app-status="' + a.id + '" class="text-sm border rounded-lg px-2 py-1">' + statusOpts + '</select>' +
            '</div></div>';
        }).join('') + '</div>';
        els.modalBody.querySelectorAll('[data-app-status]').forEach(function (sel) {
          sel.addEventListener('change', async function () {
            try {
              await CorporateAPI.JobsAPI.updateApplicationStatus(this.dataset.appStatus, this.value);
            } catch (err) {
              alert(mapMsg(err.message) || cT('corporate.updateStatusFailed', 'Failed to update status'));
            }
          });
        });
      }
      els.modal.classList.remove('hidden');
    } catch (err) {
      alert(mapMsg(err.message) || cT('corporate.loadApplicantsFailed', 'Failed to load applicants'));
    }
  }

  async function handleAction(action, id) {
    try {
      if (action === 'view') {
        await showJobModal(id);
        return;
      }
      if (action === 'applicants') {
        await showApplicantsModal(id);
        return;
      }
      if (action === 'close') {
        if (!confirm('Close this job posting?')) return;
        await CorporateAPI.JobsAPI.updateStatus(id, 'closed');
      } else if (action === 'reopen') {
        await CorporateAPI.JobsAPI.updateStatus(id, 'active');
      } else if (action === 'interviewing') {
        await CorporateAPI.JobsAPI.updateStatus(id, 'interviewing');
      } else if (action === 'delete') {
        if (!confirm('Delete this job posting?')) return;
        await CorporateAPI.JobsAPI.remove(id);
      } else if (action === 'clone') {
        await CorporateAPI.JobsAPI.clone(id);
      } else if (action === 'edit') {
        window.location.href = 'post-job.html?id=' + encodeURIComponent(id);
      }
      loadJobs();
    } catch (err) {
      alert(mapMsg(err.message) || cT('corporate.operationFailed', 'Operation failed'));
    }
  }

  function bindEvents() {
    els.searchInput.addEventListener('input', debounce((e) => {
      state.search = e.target.value.trim();
      state.page = 1;
      loadJobs();
    }, 300));

    els.filterBtns.forEach((btn) => {
      btn.addEventListener('click', () => setStatusFilter(btn.dataset.status, btn));
    });

    els.tbody.addEventListener('click', (e) => {
      const link = e.target.closest('[data-action]');
      if (!link) return;
      e.preventDefault();
      handleAction(link.dataset.action, link.dataset.id);
    });

    els.pagination.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-page]');
      if (!btn || btn.disabled) return;
      const val = btn.dataset.page;
      if (val === 'prev') state.page -= 1;
      else if (val === 'next') state.page += 1;
      else state.page = parseInt(val, 10);
      loadJobs();
    });

    els.modalClose.addEventListener('click', hideModal);
    els.modal.addEventListener('click', (e) => {
      if (e.target === els.modal) hideModal();
    });
  }

  function debounce(fn, wait) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function setLocationFilter(value) {
    state.location = value;
    state.page = 1;

    // Show / hide active filter indicator
    const indicator = $('jobs-active-filters');
    const tagText   = $('jobs-filter-tag-text');
    if (indicator) {
      if (value) {
        indicator.classList.remove('hidden');
        indicator.classList.add('flex');
        if (tagText) tagText.textContent = value;
      } else {
        indicator.classList.add('hidden');
        indicator.classList.remove('flex');
      }
    }

    // Re-render using already-fetched items (no extra network call)
    if (state.allItems.length) {
      const filtered = applyLocationFilter(state.allItems);
      els.tbody.innerHTML = renderRows(filtered);
      const paginationData = value
        ? { page: 1, totalPages: 1, total: filtered.length }
        : { page: state.page, totalPages: Math.ceil(state.total / PAGE_SIZE), total: state.total };
      renderPagination(paginationData);
    } else {
      loadJobs();
    }
  }

  function init() {
    els.tbody = $('jobs-table-body');
    els.summary = $('jobs-page-summary');
    els.pagination = $('jobs-pagination');
    els.searchInput = $('jobs-search-input');
    els.filterBtns = document.querySelectorAll('[data-jobs-filter]');
    els.postBtn = $('jobs-post-btn');
    els.modal = $('job-detail-modal');
    els.modalTitle = $('job-detail-title');
    els.modalBody = $('job-detail-body');
    els.modalClose = $('job-detail-close');
    els.locationSelect = $('jobs-location-filter');
    els.clearLocation  = $('jobs-clear-location');

    if (!els.tbody) return;

    // Location filter events
    if (els.locationSelect) {
      els.locationSelect.addEventListener('change', function () {
        setLocationFilter(this.value);
      });
    }
    if (els.clearLocation) {
      els.clearLocation.addEventListener('click', function () {
        if (els.locationSelect) els.locationSelect.value = '';
        setLocationFilter('');
      });
    }

    bindEvents();
    loadJobs();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
