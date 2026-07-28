/**
 * 企业端 AI 评估面试看板 — 仅显示「当前登录企业用户」发出的邀请（按 invited_by 隔离）
 */
(function () {
  function cT(key, fallback, vars) {
    if (window.GBAI18n && window.GBAI18n.t) return window.GBAI18n.t(key, fallback, vars);
    var s = fallback;
    if (vars && s) Object.keys(vars).forEach(function (k) { s = String(s).replace('{' + k + '}', vars[k]); });
    return s;
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function card(item) {
    var isHuman = item.question_mode === 'human';
    var score = isHuman
      ? '<div class="text-xs text-emerald-700 font-medium">' + escapeHtml(cT('corporate.liveMeeting', 'Live meeting')) + '</div>'
      : (item.overall_score != null
        ? '<div class="text-2xl font-bold text-purple-700">' + item.overall_score + '</div>'
        : '<div class="text-xs text-gray-400">' + escapeHtml(cT('corporate.awaitingScore', 'Awaiting score')) + '</div>');
    var link = (isHuman && item.meeting_link)
      ? '<a class="text-[11px] text-emerald-700 underline break-all" href="' + escapeHtml(item.meeting_link) + '" target="_blank" rel="noopener">' +
        escapeHtml(cT('corporate.openMeeting', 'Open meeting')) + '</a>'
      : '';
    return '<div class="border rounded-xl p-3 bg-white shadow-sm">' +
      '<p class="font-semibold text-gray-900 text-sm">' + escapeHtml(item.applicant_name || 'Candidate') + '</p>' +
      '<p class="text-xs text-gray-500 mt-0.5">' + escapeHtml(item.job_title || '') + '</p>' +
      '<p class="text-xs text-gray-400 mt-1">' + escapeHtml(cT('corporate.matchScoreShort', 'Match')) +
      ': ' + (item.match_score != null ? item.match_score : '-') + '</p>' +
      '<div class="mt-2">' + score + '</div>' +
      (link ? '<div class="mt-1">' + link + '</div>' : '') +
      '</div>';
  }

  function renderColumn(el, items, emptyText) {
    if (!el) return;
    if (!items || !items.length) {
      el.innerHTML = '<p class="text-xs text-gray-400 py-4 text-center">' + escapeHtml(emptyText) + '</p>';
      return;
    }
    el.innerHTML = items.map(card).join('');
  }

  function showLoginPrompt() {
    var empty = cT('corporate.boardLoginRequired', 'Sign in to view your interview invitations.');
    renderColumn(document.getElementById('board-col-invited'), [], empty);
    renderColumn(document.getElementById('board-col-progress'), [], empty);
    renderColumn(document.getElementById('board-col-done'), [], empty);
  }

  async function reload() {
    var root = document.getElementById('interview-board');
    if (!root || !window.CorporateAPI || !CorporateAPI.InterviewInvitesAPI) return;
    if (!CorporateAPI.getToken || !CorporateAPI.getToken()) {
      showLoginPrompt();
      return;
    }
    try {
      var res = await CorporateAPI.InterviewInvitesAPI.board('all');
      var cols = (res.data && res.data.columns) || {};
      renderColumn(
        document.getElementById('board-col-invited'),
        cols.invited,
        cT('corporate.boardEmptyInvited', 'No pending invitations')
      );
      renderColumn(
        document.getElementById('board-col-progress'),
        cols.in_progress,
        cT('corporate.boardEmptyProgress', 'None in progress')
      );
      renderColumn(
        document.getElementById('board-col-done'),
        cols.completed,
        cT('corporate.boardEmptyDone', 'No completed assessments yet')
      );
      var note = document.getElementById('interview-board-scope');
      if (note) {
        note.textContent = cT(
          'corporate.boardScopeNote',
          'Showing only invitations you sent (separate from other HR accounts).'
        );
      }
    } catch (err) {
      console.warn('Interview board load failed', err.message);
      var failText = cT('corporate.boardLoadFailed', 'Could not load interview board. Is the API server running?');
      renderColumn(document.getElementById('board-col-invited'), [], failText);
      renderColumn(document.getElementById('board-col-progress'), [], '');
      renderColumn(document.getElementById('board-col-done'), [], '');
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (document.getElementById('interview-board')) reload();
    var btn = document.getElementById('interview-board-refresh');
    if (btn) btn.addEventListener('click', reload);
  });

  window.CorporateInterviewBoard = { reload: reload };
})();
