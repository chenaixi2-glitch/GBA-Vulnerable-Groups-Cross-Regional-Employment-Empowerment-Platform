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

  function statusLabel(status) {
    var map = {
      active: cT('corporate.statusActive', 'Active'),
      interviewing: cT('corporate.statusInterviewing', 'Interviewing'),
      closed: cT('corporate.statusClosed', 'Closed'),
    };
    return map[status] || status;
  }

  const PAGE_SIZE = 10;
  const state = {
    page: 1,
    status: 'all',
    search: '',
    location: '',
    total: 0,
    loading: false,
    allItems: [],
  };

  const els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function formatDate(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    var lang = (window.GBAI18n && GBAI18n.getLang) ? GBAI18n.getLang() : 'en';
    return d.toLocaleDateString(lang === 'en' ? 'en-US' : lang, { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function statusBadge(status) {
    const map = {
      active: 'bg-green-100 text-green-800',
      interviewing: 'bg-yellow-100 text-yellow-800',
      closed: 'bg-gray-100 text-gray-800',
    };
    return '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ' + (map[status] || map.active) + '">' + escapeHtml(statusLabel(status)) + '</span>';
  }

  function friendlyBadge(job) {
    if (!job.vulnerable_group_friendly) return '';
    return '<span class="ml-2 px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800">' + escapeHtml(cT('corporate.vulnerableFriendly', 'Vulnerable-group friendly')) + '</span>';
  }

  function subTitle(job) {
    if (job.source === 'external') {
      return job.company_name || cT('corporate.externalJob', 'External job · Guangdong disability employment network');
    }
    return job.department || cT('corporate.internalPosting', 'Internal Posting');
  }

  function renderActions(job) {
    if (job.source === 'external') {
      const href = job.source_url || 'https://www.jyfw.org.cn/';
      return '<a href="' + href + '" target="_blank" rel="noopener" class="text-green-600 hover:text-green-900">' + escapeHtml(cT('corporate.view', 'View')) + '</a>';
    }

    const view = '<a href="#" data-action="view" data-id="' + job.id + '" class="text-green-600 hover:text-green-900 mr-3">' + escapeHtml(cT('corporate.view', 'View')) + '</a>';
    const applicants = job.source === 'internal'
      ? '<a href="#" data-action="applicants" data-id="' + job.id + '" class="text-purple-600 hover:text-purple-900 mr-3">' + escapeHtml(cT('corporate.applicants', 'Applicants')) + '</a>'
      : '';
    if (job.status === 'closed') {
      return (
        view + applicants +
        '<a href="#" data-action="reopen" data-id="' + job.id + '" class="text-emerald-600 hover:text-emerald-900 mr-3">' + escapeHtml(cT('corporate.reopen', 'Reopen')) + '</a>' +
        '<a href="#" data-action="clone" data-id="' + job.id + '" class="text-blue-600 hover:text-blue-900 mr-3">' + escapeHtml(cT('corporate.clone', 'Clone')) + '</a>' +
        '<a href="#" data-action="delete" data-id="' + job.id + '" class="text-red-600 hover:text-red-900">' + escapeHtml(cT('corporate.delete', 'Delete')) + '</a>'
      );
    }
    if (job.status === 'interviewing') {
      return (
        view + applicants +
        '<a href="#" data-action="edit" data-id="' + job.id + '" class="text-blue-600 hover:text-blue-900 mr-3">' + escapeHtml(cT('corporate.edit', 'Edit')) + '</a>' +
        '<a href="#" data-action="close" data-id="' + job.id + '" class="text-red-600 hover:text-red-900">' + escapeHtml(cT('corporate.close', 'Close')) + '</a>'
      );
    }
    return (
      view + applicants +
      '<a href="#" data-action="edit" data-id="' + job.id + '" class="text-blue-600 hover:text-blue-900 mr-3">' + escapeHtml(cT('corporate.edit', 'Edit')) + '</a>' +
      '<a href="#" data-action="interviewing" data-id="' + job.id + '" class="text-yellow-600 hover:text-yellow-900 mr-3">' + escapeHtml(cT('corporate.interviewing', 'Interviewing')) + '</a>' +
      '<a href="#" data-action="close" data-id="' + job.id + '" class="text-red-600 hover:text-red-900">' + escapeHtml(cT('corporate.close', 'Close')) + '</a>'
    );
  }

  function renderRows(items) {
    if (!items.length) {
      return '<tr><td colspan="6" class="px-6 py-10 text-center text-gray-500">' + escapeHtml(cT('corporate.noJobsFound', 'No jobs found. Run the crawler or post a new job.')) + '</td></tr>';
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
          <div class="text-xs text-green-600">${escapeHtml(cT('corporate.matches', '{count} matches', { count: job.matches_count || 0 }))}</div>
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
    html += '<button data-page="prev" class="px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50" ' + (page <= 1 ? 'disabled' : '') + '>' + escapeHtml(cT('corporate.previous', 'Previous')) + '</button>';

    for (let i = 1; i <= totalPages; i += 1) {
      if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) {
        const active = i === page ? 'bg-green-600 text-white' : 'border border-gray-300 text-gray-600 hover:bg-gray-50';
        html += '<button data-page="' + i + '" class="px-4 py-2 rounded-lg ' + active + '">' + i + '</button>';
      } else if (Math.abs(i - page) === 2) {
        html += '<span class="px-2 text-gray-400">...</span>';
      }
    }

    html += '<button data-page="next" class="px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50" ' + (page >= totalPages ? 'disabled' : '') + '>' + escapeHtml(cT('corporate.next', 'Next')) + '</button>';
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
    els.tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-8 text-center text-gray-500"><i class="fas fa-spinner fa-spin mr-2"></i>' + escapeHtml(cT('corporate.loadingJobs', 'Loading jobs...')) + '</td></tr>';

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
      const paginationData = state.location
        ? { page: 1, totalPages: 1, total: filtered.length }
        : pagination;
      renderPagination(paginationData);
      if (typeof window.loadCorporateStats === 'function') window.loadCorporateStats();
    } catch (err) {
      els.tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-8 text-center text-red-600">' + escapeHtml(cT('corporate.loadJobsFailed', 'Failed to load jobs: {msg}. Is the API server running on port 3000?', { msg: mapMsg(err.message) })) + '</td></tr>';
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
    els.modalBody.innerHTML = [
      '<p><strong>' + escapeHtml(cT('corporate.sourceLabel', 'Source:')) + '</strong> ' + escapeHtml(job.source === 'external' ? cT('corporate.sourceExternal', 'External') : cT('corporate.sourceInternal', 'Internal')) + '</p>',
      '<p><strong>' + escapeHtml(cT('corporate.locationLabel', 'Location:')) + '</strong> ' + escapeHtml(job.location || '-') + '</p>',
      '<p><strong>' + escapeHtml(cT('corporate.departmentLabel', 'Department:')) + '</strong> ' + escapeHtml(job.department || '-') + '</p>',
      '<p><strong>' + escapeHtml(cT('corporate.companyLabel', 'Company:')) + '</strong> ' + escapeHtml(job.company_name || '-') + '</p>',
      '<p><strong>' + escapeHtml(cT('corporate.salaryLabel', 'Salary:')) + '</strong> ' + escapeHtml(job.salary || '-') + '</p>',
      '<p><strong>' + escapeHtml(cT('corporate.educationLabel', 'Education:')) + '</strong> ' + escapeHtml(job.education || '-') + '</p>',
      '<p><strong>' + escapeHtml(cT('corporate.experienceLabel', 'Experience:')) + '</strong> ' + escapeHtml(job.work_experience || '-') + '</p>',
      '<p><strong>' + escapeHtml(cT('corporate.vulnerableFriendlyLabel', 'Vulnerable-group friendly:')) + '</strong> ' + escapeHtml(job.vulnerable_group_friendly ? cT('corporate.yes', 'Yes') : cT('corporate.no', 'No')) + '</p>',
      '<p><strong>' + escapeHtml(cT('corporate.derivedTagsLabel', 'Derived Tags:')) + '</strong> ' + escapeHtml((job.target_group_types || []).join(', ') || '-') + '</p>',
      '<p><strong>' + escapeHtml(cT('corporate.targetCriteriaLabel', 'Target Criteria:')) + '</strong> ' + escapeHtml(job.target_criteria ? JSON.stringify(job.target_criteria) : '-') + '</p>',
      '<p><strong>' + escapeHtml(cT('corporate.skillsLabel', 'Skills:')) + '</strong> ' + escapeHtml((job.skills || []).join(', ') || '-') + '</p>',
      '<p><strong>' + escapeHtml(cT('corporate.disabilityTypeLabel', 'Disability Type:')) + '</strong> ' + escapeHtml(job.disability_type || '-') + '</p>',
      '<p class="mt-3 whitespace-pre-wrap">' + escapeHtml(job.description || cT('corporate.noDescription', 'No description.')) + '</p>',
    ].join('');
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
        ? cT('corporate.applicantsVulnerableTitle', 'Applicants (vulnerable groups first · then match score)')
        : cT('corporate.applicantsTitle', 'Applicants (sorted by match score)');
      if (!apps.length) {
        els.modalBody.innerHTML = '<p class="text-gray-500">' + escapeHtml(cT('corporate.noApplications', 'No applications yet. Scores appear after candidates apply.')) + '</p>';
      } else {
        if (friendly && res.data.sort_note) {
          els.modalBody.innerHTML = '<p class="text-xs text-emerald-700 mb-3 font-medium">' + escapeHtml(mapMsg(res.data.sort_note)) + '</p>';
        } else {
          els.modalBody.innerHTML = '';
        }
        els.modalBody.innerHTML += '<div class="space-y-3">' + apps.map(function (a) {
          const isVulnerable = (a.applicant_group_types || []).length > 0;
          const vBadge = isVulnerable
            ? '<span class="ml-2 px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-800">' + escapeHtml(cT('corporate.vulnerableFriendly', 'Vulnerable-group friendly')) + '</span>'
            : '';
          const reasons = (a.match_reasons || []).map(function (r) { return '<li>' + escapeHtml(mapMsg(r)) + '</li>'; }).join('');
          const statusOpts = ['pending', 'reviewing', 'accepted', 'rejected'].map(function (st) {
            var lbl = cT('corporate.status' + st.charAt(0).toUpperCase() + st.slice(1), st);
            if (st === 'pending') lbl = cT('corporate.statusPending', 'Pending');
            if (st === 'reviewing') lbl = cT('corporate.statusReviewing', 'Reviewing');
            if (st === 'accepted') lbl = cT('corporate.statusAccepted', 'Accepted');
            if (st === 'rejected') lbl = cT('corporate.statusRejected', 'Rejected');
            return '<option value="' + st + '"' + (a.status === st ? ' selected' : '') + '>' + escapeHtml(lbl) + '</option>';
          }).join('');
          const invite = a.interview_invite;
          let inviteBtn = '';
          let scoreHtml = '';
          if (invite && invite.status === 'completed' && invite.overall_score != null) {
            scoreHtml = '<span class="text-sm font-bold text-purple-700 ml-2" title="AI assessment">' +
              escapeHtml(cT('corporate.aiScore', 'AI')) + ' ' + invite.overall_score + '</span>';
            inviteBtn = '<button type="button" disabled class="text-xs px-2 py-1 rounded bg-gray-100 text-gray-500">' +
              escapeHtml(cT('corporate.assessmentDone', 'Assessment done')) + '</button>';
          } else if (invite && (invite.status === 'invited' || invite.status === 'in_progress')) {
            inviteBtn = '<button type="button" disabled class="text-xs px-2 py-1 rounded bg-amber-50 text-amber-800 border border-amber-200">' +
              escapeHtml(cT('corporate.assessmentPending', 'Interview invited')) + '</button>';
          } else {
            inviteBtn = '<button type="button" data-invite-ai="' + a.id + '" class="text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700">' +
              escapeHtml(cT('corporate.inviteInterview', 'Invite interview')) + '</button>';
          }
          return '<div class="border rounded-xl p-4 bg-gray-50" data-app-id="' + a.id + '">' +
            '<div class="flex justify-between items-start gap-3">' +
            '<div><p class="font-semibold text-gray-900">' + escapeHtml(a.applicant_name || cT('corporate.candidate', 'Candidate')) + vBadge + '</p>' +
            '<p class="text-sm text-gray-500">' + escapeHtml(a.applicant_email || '') + '</p>' +
            '<p class="text-xs text-gray-400 mt-1">' + escapeHtml(cT('corporate.groups', 'Groups:')) + ' ' + escapeHtml((a.applicant_group_types || []).join(', ') || '-') + '</p></div>' +
            '<div class="text-right"><span class="text-lg font-bold text-green-700">' + (a.match_score || 0) + '</span>' + scoreHtml + '</div></div>' +
            (reasons ? '<ul class="text-sm text-gray-600 mt-2 list-disc pl-5">' + reasons + '</ul>' : '') +
            (a.cover_message ? '<p class="text-sm text-gray-600 mt-2 italic">' + escapeHtml(a.cover_message) + '</p>' : '') +
            '<div class="mt-3 flex flex-wrap items-center gap-2">' +
            '<label class="text-xs text-gray-500">' + escapeHtml(cT('corporate.statusLabel', 'Status:')) + '</label>' +
            '<select data-app-status="' + a.id + '" class="text-sm border rounded-lg px-2 py-1">' + statusOpts + '</select>' +
            inviteBtn +
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
        els.modalBody.querySelectorAll('[data-invite-ai]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            openInviteModal(this.dataset.inviteAi, id);
          });
        });
      }
      els.modal.classList.remove('hidden');
    } catch (err) {
      alert(mapMsg(err.message) || cT('corporate.loadApplicantsFailed', 'Failed to load applicants'));
    }
  }

  var inviteState = { applicationId: null, jobId: null, job: null };

  function formatLabel(fmt) {
    var map = {
      ai_only: cT('corporate.formatAiOnly', 'AI question bank only'),
      partial_custom: cT('corporate.formatPartial', 'Partial custom (AI + your questions)'),
      full_custom: cT('corporate.formatFull', 'Full custom (your questions only)'),
      human: cT('corporate.formatHuman', 'Live interview (third-party meeting)'),
    };
    return map[fmt] || fmt;
  }

  async function openInviteModal(applicationId, jobId) {
    inviteState.applicationId = applicationId;
    inviteState.jobId = jobId;
    inviteState.job = null;
    var summary = document.getElementById('ai-invite-job-summary');
    var errEl = document.getElementById('ai-invite-error');
    var confirmBtn = document.getElementById('ai-invite-confirm');
    if (errEl) { errEl.classList.add('hidden'); errEl.textContent = ''; }
    if (summary) summary.innerHTML = '<p class="text-gray-400 text-xs">Loading job interview setup…</p>';
    if (confirmBtn) confirmBtn.disabled = true;
    var modal = document.getElementById('ai-invite-modal');
    if (modal) modal.classList.remove('hidden');
    try {
      var res = await CorporateAPI.JobsAPI.get(jobId);
      var job = res.data.job;
      inviteState.job = job;
      var fmt = job.interview_format || 'ai_only';
      var lines = [
        '<p><strong>' + escapeHtml(cT('corporate.interviewFormat', 'Format:')) + '</strong> ' + escapeHtml(formatLabel(fmt)) + '</p>',
      ];
      if (fmt === 'partial_custom' || fmt === 'full_custom') {
        var n = (job.interview_custom_questions || []).length;
        lines.push('<p><strong>' + escapeHtml(cT('corporate.customQCount', 'Custom questions:')) + '</strong> ' + n + '</p>');
        if (!n) throw new Error(cT('corporate.jobMissingCustomQs', 'Edit the job posting and add custom questions first.'));
      }
      if (fmt === 'human') {
        if (!job.meeting_link) throw new Error(cT('corporate.jobMissingMeeting', 'Edit the job posting and add a meeting link first.'));
        lines.push('<p><strong>' + escapeHtml(cT('corporate.meetingLink', 'Meeting:')) + '</strong> ' + escapeHtml(job.meeting_link) + '</p>');
        if (job.meeting_instructions) {
          lines.push('<p class="text-xs text-gray-500 whitespace-pre-wrap">' + escapeHtml(job.meeting_instructions) + '</p>');
        }
      }
      lines.push('<p class="text-xs text-gray-400 mt-2">' + escapeHtml(cT('corporate.editJobHint', 'Change setup in Edit Job.')) +
        ' <a class="text-emerald-700 underline" href="post-job.html?id=' + jobId + '">' + escapeHtml(cT('corporate.editJob', 'Edit job')) + '</a></p>');
      if (summary) summary.innerHTML = lines.join('');
      if (confirmBtn) confirmBtn.disabled = false;
    } catch (err) {
      if (summary) summary.innerHTML = '';
      if (errEl) {
        errEl.textContent = mapMsg(err.message) || String(err.message || err);
        errEl.classList.remove('hidden');
      }
    }
  }

  function hideInviteModal() {
    var modal = document.getElementById('ai-invite-modal');
    if (modal) modal.classList.add('hidden');
    inviteState.applicationId = null;
    inviteState.job = null;
  }

  async function confirmInvite() {
    if (!inviteState.applicationId) return;
    var confirmBtn = document.getElementById('ai-invite-confirm');
    if (confirmBtn) confirmBtn.disabled = true;
    try {
      var jobId = inviteState.jobId;
      await CorporateAPI.JobsAPI.inviteInterview(inviteState.applicationId, {});
      hideInviteModal();
      if (window.CorporateInterviewBoard && CorporateInterviewBoard.reload) {
        CorporateInterviewBoard.reload();
      }
      if (jobId) await showApplicantsModal(jobId);
    } catch (err) {
      alert(mapMsg(err.message) || cT('corporate.inviteFailed', 'Failed to send interview invitation'));
    } finally {
      if (confirmBtn) confirmBtn.disabled = false;
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
        if (!confirm(cT('corporate.confirmClose', 'Close this job posting?'))) return;
        await CorporateAPI.JobsAPI.updateStatus(id, 'closed');
      } else if (action === 'reopen') {
        await CorporateAPI.JobsAPI.updateStatus(id, 'active');
      } else if (action === 'interviewing') {
        await CorporateAPI.JobsAPI.updateStatus(id, 'interviewing');
      } else if (action === 'delete') {
        if (!confirm(cT('corporate.confirmDelete', 'Delete this job posting?'))) return;
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

    var inviteClose = document.getElementById('ai-invite-close');
    var inviteCancel = document.getElementById('ai-invite-cancel');
    var inviteConfirm = document.getElementById('ai-invite-confirm');
    var inviteModal = document.getElementById('ai-invite-modal');
    if (inviteClose) inviteClose.addEventListener('click', hideInviteModal);
    if (inviteCancel) inviteCancel.addEventListener('click', hideInviteModal);
    if (inviteConfirm) inviteConfirm.addEventListener('click', confirmInvite);
    if (inviteModal) {
      inviteModal.addEventListener('click', function (e) {
        if (e.target === inviteModal) hideInviteModal();
      });
    }
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

    const indicator = $('jobs-active-filters');
    const tagText = $('jobs-filter-tag-text');
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
    els.clearLocation = $('jobs-clear-location');

    if (!els.tbody) return;

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

  window.addEventListener('gba:language-changed', function () {
    if (els.tbody) loadJobs();
  });
})();
