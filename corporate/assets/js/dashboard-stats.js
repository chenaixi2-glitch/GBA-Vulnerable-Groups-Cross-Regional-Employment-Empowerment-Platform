/**
 * 企业端 Dashboard 实时统计 + HR 团队绩效
 */
(function () {
  function dT(key, fallback, vars) {
    if (window.GBAI18n && window.GBAI18n.t) return window.GBAI18n.t(key, fallback, vars);
    var s = fallback;
    if (vars && s) Object.keys(vars).forEach(function (k) { s = String(s).replace('{' + k + '}', vars[k]); });
    return s;
  }

  function setSubtext(el, text) {
    if (!el) return;
    el.textContent = text;
  }

  function animateCounter(el, target) {
    if (!el) return;
    const duration = 800;
    const start = performance.now();
    const from = 0;
    function frame(now) {
      const progress = Math.min(1, (now - start) / duration);
      el.textContent = String(Math.round(from + (target - from) * progress));
      if (progress < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function showHrPremiumPaywall() {
    const tbody = document.getElementById('hr-team-table-body');
    if (tbody) {
      tbody.innerHTML =
        '<tr><td colspan="8" class="py-8 text-center">' +
        '<p class="text-amber-800 font-medium mb-2"><i class="fas fa-lock mr-1"></i> ' + escapeHtml(dT('corporate.hrPremiumLocked', 'HR team analytics require a donation to unlock')) + '</p>' +
        '<p class="text-sm text-gray-500 mb-3">' + escapeHtml(dT('corporate.hrPremiumFreeHint', 'Job posting, matching and legal aid are free')) + '</p>' +
        '<a href="donation-legal.html" class="inline-flex px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600">' + escapeHtml(dT('corporate.goDonation', 'Go to donation box')) + '</a>' +
        '</td></tr>';
    }
    const canvas = document.getElementById('hrTeamChart');
    if (canvas && window.hrTeamChart) {
      window.hrTeamChart.destroy();
      window.hrTeamChart = null;
    }
  }

  async function loadCorporateStats() {
    if (typeof CorporateAPI === 'undefined' || !CorporateAPI.getToken()) return;
    try {
      const res = await CorporateAPI.StatsAPI.corporate();
      const s = res.data || {};

      const cards = document.querySelectorAll('#dashboard .stat-card');
      if (cards[0]) {
        animateCounter(cards[0].querySelector('.counter'), s.active_jobs || 0);
        setSubtext(cards[0].querySelector('.text-xs'), dT('corporate.thisWeek', '↑ {count} this week', { count: s.jobs_this_week || 0 }));
      }
      if (cards[1]) {
        animateCounter(cards[1].querySelector('.counter'), s.total_applications || 0);
        setSubtext(cards[1].querySelector('.text-xs'), dT('corporate.today', '↑ {count} today', { count: s.applications_today || 0 }));
      }
      if (cards[2]) {
        animateCounter(cards[2].querySelector('.counter'), s.interviews || 0);
        setSubtext(cards[2].querySelector('.text-xs'), dT('corporate.reviewingCount', '{count} reviewing', { count: s.applications_by_status?.reviewing || 0 }));
      }
      if (cards[3]) {
        animateCounter(cards[3].querySelector('.counter'), s.hires_this_month || 0);
        setSubtext(cards[3].querySelector('.text-xs'), dT('corporate.acceptedTotal', '{count} accepted total', { count: s.applications_by_status?.accepted || 0 }));
      }
      if (cards[4]) {
        const rateEl = cards[4].querySelector('.text-3xl');
        const rate = s.diversity_rate || 0;
        if (rateEl) rateEl.textContent = rate + '%';
        const bar = cards[4].querySelector('.progress-fill');
        if (bar) bar.style.width = rate + '%';
      }
      if (cards[5]) {
        const daysEl = cards[5].querySelector('.counter');
        if (daysEl) {
          daysEl.textContent = s.avg_match_score != null ? String(s.avg_match_score) : '-';
        }
        setSubtext(cards[5].querySelector('.text-xs'), dT('corporate.avgMatchScore', 'Avg match score'));
        const label = cards[5].querySelector('.text-gray-500');
        if (label) label.textContent = dT('corporate.matchScore', 'Match Score');
      }

      if (window.recruitmentChart && s.application_trend) {
        window.recruitmentChart.data.labels = s.application_trend.labels;
        window.recruitmentChart.data.datasets[0].data = s.application_trend.applications;
        if (window.recruitmentChart.data.datasets[1]) {
          window.recruitmentChart.data.datasets[1].data = s.application_trend.applications.map(function (v) {
            return Math.round(v * 0.35);
          });
        }
        if (window.recruitmentChart.data.datasets[2]) {
          window.recruitmentChart.data.datasets[2].data = s.application_trend.applications.map(function (v) {
            return Math.max(0, Math.round(v * 0.08));
          });
        }
        window.recruitmentChart.update();
      }

      if (window.funnelChart && s.funnel) {
        const f = s.funnel;
        window.funnelChart.data.datasets[0].data = [
          f.applications,
          f.screening,
          f.interviews,
          f.offers,
          f.hires,
        ];
        window.funnelChart.update();
      }

      if (window.diversityChart && s.diversity_breakdown?.length) {
        window.diversityChart.data.labels = s.diversity_breakdown.map(function (d) { return d.label; });
        window.diversityChart.data.datasets[0].data = s.diversity_breakdown.map(function (d) { return d.percent; });
        window.diversityChart.update();
      }
    } catch (err) {
      console.warn('Failed to load corporate stats:', err.message);
    }
  }

  function renderHrTeamTable(data) {
    const tbody = document.getElementById('hr-team-table-body');
    if (!tbody) return;

    const rows = data.hr_performance || [];
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="py-6 text-center text-gray-400">' + escapeHtml(dT('corporate.hrNoData', 'No HR performance data yet. Invite more HR members to compare.')) + '</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(function (hr) {
      const isMe = hr.user_id === data.current_user_id;
      return '<tr class="border-b border-gray-50' + (isMe ? ' bg-green-50/50' : '') + '">' +
        '<td class="py-3 pr-4 font-medium text-gray-900">' + escapeHtml(hr.hr_name) +
        (isMe ? ' <span class="text-xs text-green-700">' + escapeHtml(dT('corporate.hrMe', '(me)')) + '</span>' : '') +
        '<div class="text-xs text-gray-400">' + escapeHtml(hr.hr_title || '') + '</div></td>' +
        '<td class="py-3 pr-4 text-gray-600">' + escapeHtml(hr.member_role) + '</td>' +
        '<td class="py-3 pr-4">' + hr.jobs_posted + ' <span class="text-xs text-gray-400">' + escapeHtml(dT('corporate.activeJobsSuffix', '({count} active)', { count: hr.active_jobs })) + '</span></td>' +
        '<td class="py-3 pr-4">' + hr.applications_received + '</td>' +
        '<td class="py-3 pr-4">' + hr.reviews_handled + '</td>' +
        '<td class="py-3 pr-4 font-semibold text-green-700">' + hr.hires + '</td>' +
        '<td class="py-3 pr-4">' + hr.hire_rate + '%</td>' +
        '<td class="py-3">' + (hr.avg_match_score != null ? hr.avg_match_score : '-') + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderHrTeamChart(data) {
    const canvas = document.getElementById('hrTeamChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const rows = data.hr_performance || [];
    const labels = rows.map(function (r) { return r.hr_name; });
    const hires = rows.map(function (r) { return r.hires; });
    const apps = rows.map(function (r) { return r.applications_received; });

    if (window.hrTeamChart) {
      window.hrTeamChart.destroy();
    }

    window.hrTeamChart = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: dT('corporate.chartApplications', 'Applications'),
            data: apps,
            backgroundColor: 'rgba(37, 99, 235, 0.7)',
            borderRadius: 6,
          },
          {
            label: dT('corporate.chartHires', 'Hires'),
            data: hires,
            backgroundColor: 'rgba(16, 185, 129, 0.85)',
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' } },
        },
      },
    });
  }

  async function loadHrTeamStats() {
    if (typeof CorporateAPI === 'undefined' || !CorporateAPI.getToken()) return;

    if (typeof PlatformAccess !== 'undefined') {
      const access = await PlatformAccess.fetchAccess();
      if (!access.has_premium_access) {
        showHrPremiumPaywall();
        return;
      }
    }

    try {
      const res = await CorporateAPI.StatsAPI.team();
      const data = res.data || {};

      const meta = document.getElementById('hr-team-meta');
      if (meta) {
        meta.classList.remove('hidden');
        const orgName = document.getElementById('hr-org-name');
        if (orgName) orgName.textContent = data.org_name || dT('corpPortal.companyProfile', 'Company');
        const inviteWrap = document.getElementById('hr-invite-wrap');
        const inviteCode = document.getElementById('hr-invite-code');
        if (data.invite_code && inviteWrap && inviteCode) {
          inviteWrap.classList.remove('hidden');
          inviteCode.textContent = data.invite_code;
        }
      }

      renderHrTeamTable(data);
      renderHrTeamChart(data);
    } catch (err) {
      if (err && err.status === 403) {
        showHrPremiumPaywall();
        return;
      }
      const tbody = document.getElementById('hr-team-table-body');
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="8" class="py-6 text-center text-gray-400">' + escapeHtml(dT('corporate.hrUnavailable', 'HR performance unavailable (run migrate_v8)')) + '</td></tr>';
      }
    }
  }

  async function loadAll() {
    await loadCorporateStats();
    await loadHrTeamStats();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(loadAll, 500);
    });
  } else {
    setTimeout(loadAll, 500);
  }

  window.loadCorporateStats = loadAll;

  window.addEventListener('gba:language-changed', function () {
    loadAll();
  });
})();
