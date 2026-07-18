/**
 * 企业评估面试前端 — 独立于 interview-prep.js / 个人模拟面链路。
 * 仅调用 /api/interview/assessment/* 与 Node interview-invites。
 */
(function () {
  const params = new URLSearchParams(window.location.search);
  const inviteToken = params.get('invite') || '';

  const state = {
    invite: null,
    active: false,
    status: 'idle',
    turns: [],
    pollSequence: 0,
    pollTimer: null,
    phase: 'primary',
    waitingForFollowUps: false,
    currentQuestionId: '',
    debrief: null,
  };

  function $(id) { return document.getElementById(id); }

  function showError(msg) {
    const el = $('setup-error');
    if (!el) return;
    el.textContent = msg || '';
    el.classList.toggle('hidden', !msg);
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  async function loadInvite() {
    if (!inviteToken) {
      showError('Missing interview invitation token. Open this page from My Applications.');
      $('btn-start-assessment').disabled = true;
      return;
    }
    if (!PlatformAPI.getToken || !PlatformAPI.getToken()) {
      showError('Please log in first.');
      $('btn-start-assessment').disabled = true;
      return;
    }
    try {
      const res = await PlatformAPI.InterviewInvitesAPI.getByToken(inviteToken);
      state.invite = res.data.invite;
      $('invite-banner').classList.remove('hidden');
      $('invite-job-title').textContent = state.invite.job_title || 'Assessment interview';
      $('invite-company').textContent = state.invite.company_name || '';
      $('invite-status').textContent = 'Status: ' + (state.invite.status || 'invited') +
        ' · Mode: ' + (state.invite.question_mode || 'ai_only');
      if ((state.invite.custom_questions || []).length) {
        $('invite-status').textContent += ' · ' + state.invite.custom_questions.length + ' employer question(s)';
      }
      if (state.invite.status === 'completed') {
        $('btn-start-assessment').disabled = true;
        showError('This assessment is already completed.');
        if (state.invite.overall_score != null) {
          showFinalScore({
            overall_score: state.invite.overall_score,
            summary: state.invite.debrief_summary || '',
            category_scores: state.invite.category_scores || {},
          });
        }
      }
      if (state.invite.question_mode === 'human') {
        $('setup-panel').classList.add('hidden');
        $('interview-panel').classList.add('hidden');
        var human = document.createElement('div');
        human.className = 'bg-white rounded-2xl border p-5 space-y-3';
        human.innerHTML =
          '<p class="font-semibold text-slate-900">Live interview (third-party meeting)</p>' +
          (state.invite.meeting_instructions
            ? '<p class="text-sm text-slate-600 whitespace-pre-wrap">' + escapeHtml(state.invite.meeting_instructions) + '</p>'
            : '') +
          (state.invite.meeting_link
            ? '<a class="inline-flex px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium" href="' +
              escapeHtml(state.invite.meeting_link) + '" target="_blank" rel="noopener">Join meeting</a>'
            : '<p class="text-sm text-red-600">Meeting link missing.</p>') +
          '<a href="my-applications.html" class="block text-sm text-teal-700 underline">Back to my applications</a>';
        $('invite-banner').parentNode.insertBefore(human, $('setup-panel'));
      }
    } catch (err) {
      showError(err.message || 'Failed to load invitation');
      $('btn-start-assessment').disabled = true;
    }
  }

  async function ensureProfile() {
    apiClient.ensureSessionStarted();
    // 尝试从账户恢复已保存画像到当前 AI session
    if (typeof apiClient.restoreSavedProfile === 'function' || typeof apiClient.getProfileSaveHistory === 'function') {
      try {
        if (apiClient.getProfileSaveHistory) {
          const hist = await apiClient.getProfileSaveHistory(1);
          const records = (hist && hist.records) || (hist && hist.data && hist.data.records) || [];
          if (records[0] && records[0].id && apiClient.restoreSavedProfile) {
            await apiClient.restoreSavedProfile(records[0].id);
            return true;
          }
        }
      } catch (e) {
        console.warn('Profile restore skipped', e.message);
      }
    }
    // 退路：把 Node 侧 resume 注入会话（若有 chat/upload API）
    try {
      const resume = await PlatformAPI.ResumesAPI.getMine();
      const content = resume && resume.data && resume.data.resume && resume.data.resume.content_json;
      if (content && apiClient.chat) {
        await apiClient.chat(JSON.stringify(content), [], { replaceProfile: true, usePageLanguage: true });
        return true;
      }
    } catch (e) {
      console.warn('Resume bootstrap skipped', e.message);
    }
    return false;
  }

  function renderChat() {
    const chat = $('chat');
    chat.innerHTML = state.turns.map(function (turn) {
      if (turn.turn_type === 'brief_feedback') return ''; // 评估面永不展示实时点评
      const isInterviewer = turn.role === 'interviewer';
      return '<div class="flex gap-2 ' + (isInterviewer ? '' : 'flex-row-reverse') + '">' +
        '<div class="max-w-[85%] rounded-lg p-3 text-sm ' +
        (isInterviewer ? 'bg-emerald-50 border border-emerald-100' : 'bg-blue-50 border border-blue-100') + '">' +
        '<div class="text-[10px] text-slate-400 mb-1">' + (isInterviewer ? 'Interviewer' : 'You') +
        (turn.category ? ' · ' + escapeHtml(turn.category) : '') + '</div>' +
        escapeHtml(turn.content) +
        '</div></div>';
    }).join('');
    chat.scrollTop = chat.scrollHeight;
  }

  function updateInputState() {
    const waiting = state.waitingForFollowUps && !state.currentQuestionId;
    const done = state.status === 'completed';
    $('answer-input').disabled = waiting || done || !state.active;
    $('btn-submit').disabled = waiting || done || !state.active;
    if (done) {
      $('phase-hint').textContent = 'Interview completed.';
    } else if (waiting) {
      $('phase-hint').textContent = 'Generating follow-up questions, please wait…';
    } else if (state.phase === 'follow_up') {
      $('phase-hint').textContent = 'Follow-up questions — answer in order.';
    } else {
      $('phase-hint').textContent = 'Answer each question. No live feedback; follow-ups may appear later.';
    }
  }

  function syncFromSession(session) {
    const poll = session.poll_updates || {};
    state.status = session.status;
    state.active = session.status === 'active';
    state.turns = (session.turns || []).filter(function (t) { return t.turn_type !== 'brief_feedback'; });
    state.phase = session.phase || poll.phase || 'primary';
    state.pollSequence = poll.poll_sequence != null ? poll.poll_sequence : (session.poll_sequence || state.pollSequence);
    state.waitingForFollowUps = Boolean(poll.waiting_for_follow_ups || session.phase === 'follow_up_wait');
    state.currentQuestionId = session.current_question_id || (session.current_question && session.current_question.id) || '';
    state.debrief = session.debrief || state.debrief;
  }

  function startPolling() {
    stopPolling();
    state.pollTimer = setInterval(function () {
      pollOnce().catch(function (e) { console.warn(e.message); });
    }, 2500);
  }

  function stopPolling() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  async function pollOnce() {
    if (!state.active && state.status !== 'active') {
      stopPolling();
      return;
    }
    const response = await apiClient.pollAssessmentSession(state.pollSequence || 0, 'en', 'en');
    const session = response.interactive_interview;
    if (!session) return;
    syncFromSession(session);
    renderChat();
    updateInputState();
    if (session.status === 'completed') {
      stopPolling();
      state.active = false;
      $('input-section').classList.add('hidden');
      if (!state.debrief) await finishWithScore();
      else await reportScore(state.debrief);
    }
  }

  async function startAssessment() {
    showError('');
    try {
      $('btn-start-assessment').disabled = true;
      const ok = await ensureProfile();
      if (!ok) {
        showError('Please save a resume/profile first (Resume tool), then return here.');
        $('btn-start-assessment').disabled = false;
        return;
      }

      const jobTitle = (state.invite && state.invite.job_title) || '';
      const industry = (state.invite && state.invite.job_industry) || '';
      const jd = (state.invite && state.invite.job_description) || '';
      const programVersion = (state.invite && state.invite.program_version) || 'quick';

      if (typeof apiClient.syncTargetJobContext === 'function') {
        await apiClient.syncTargetJobContext({
          jobTitle: jobTitle,
          jdText: jd,
          industryLabel: industry,
        });
      }

      await PlatformAPI.InterviewInvitesAPI.start(inviteToken, {
        ai_session_id: apiClient.sessionId,
      });

      const response = await apiClient.startAssessmentInterview({
        jobTitle: jobTitle,
        industry: industry,
        programVersion: programVersion,
        inviteToken: inviteToken,
        questionSourceMode: (state.invite && state.invite.question_mode) || 'ai_only',
        customQuestions: (state.invite && state.invite.custom_questions) || [],
        questionLanguage: 'en',
        targetContext: {
          jobTitle: jobTitle,
          jdText: jd,
          industryLabel: industry,
        },
      });

      syncFromSession(response.interactive_interview);
      $('setup-panel').classList.add('hidden');
      $('interview-panel').classList.remove('hidden');
      renderChat();
      updateInputState();
      startPolling();
    } catch (err) {
      showError(err.message || 'Failed to start assessment');
      $('btn-start-assessment').disabled = false;
    }
  }

  async function submitAnswer() {
    const answer = $('answer-input').value.trim();
    if (!answer) return;
    try {
      $('btn-submit').disabled = true;
      const response = await apiClient.submitAssessmentTurn(answer, 'en', 'en');
      $('answer-input').value = '';
      syncFromSession(response.interactive_interview);
      renderChat();
      updateInputState();
      if (state.status === 'completed') {
        stopPolling();
        await finishWithScore();
      }
    } catch (err) {
      alert(err.message || 'Submit failed');
      updateInputState();
    }
  }

  async function finishWithScore() {
    try {
      const response = await apiClient.endAssessmentInterview(true, 'en');
      const session = response.interactive_interview;
      syncFromSession(session);
      renderChat();
      await reportScore(session.debrief);
    } catch (err) {
      alert(err.message || 'Failed to generate final score');
    }
  }

  async function reportScore(debrief) {
    if (!debrief) return;
    showFinalScore(debrief);
    try {
      await PlatformAPI.InterviewInvitesAPI.complete(inviteToken, {
        overall_score: debrief.overall_score,
        category_scores: debrief.category_scores || {},
        debrief_summary: debrief.summary || '',
        ai_session_id: apiClient.sessionId,
      });
    } catch (err) {
      console.warn('Score report failed', err.message);
    }
  }

  function showFinalScore(debrief) {
    $('interview-panel').classList.add('hidden');
    $('setup-panel').classList.add('hidden');
    $('score-panel').classList.remove('hidden');
    $('final-score').textContent = (debrief.overall_score != null ? debrief.overall_score : '—') + ' / 100';
    $('final-summary').textContent = debrief.summary || '';
    const cats = debrief.category_scores || {};
    $('category-scores').innerHTML = Object.keys(cats).map(function (k) {
      return '<span class="px-2 py-1 text-xs rounded-full bg-slate-100 text-slate-700">' +
        escapeHtml(k) + ': ' + escapeHtml(String(cats[k])) + '</span>';
    }).join('');
  }

  document.addEventListener('DOMContentLoaded', function () {
    loadInvite();
    $('btn-start-assessment').addEventListener('click', startAssessment);
    $('btn-submit').addEventListener('click', submitAnswer);
    $('btn-end').addEventListener('click', function () {
      if (!confirm('End the assessment and generate your final score?')) return;
      stopPolling();
      finishWithScore();
    });
  });
})();
