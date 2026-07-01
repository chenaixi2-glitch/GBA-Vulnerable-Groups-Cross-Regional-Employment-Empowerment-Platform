'use strict';

const { query } = require('../config/db');

function monthLabels(count = 6) {
  const labels = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return labels;
}

async function getHomeStats() {
  const [
    usersRows,
    companiesRows,
    jobsRows,
    appsRows,
    strongMatchRows,
  ] = await Promise.all([
    query(
      "SELECT COUNT(*) AS cnt FROM users WHERE status = 1 AND role = 'individual'"
    ),
    query('SELECT COUNT(*) AS cnt FROM company_profiles'),
    query(
      "SELECT COUNT(*) AS cnt FROM job_postings WHERE status = 'active'"
    ),
    query('SELECT COUNT(*) AS cnt FROM job_applications'),
    query(
      'SELECT COUNT(*) AS cnt FROM job_applications WHERE match_score >= 50'
    ),
  ]);

  const individualUsers = Number(usersRows[0]?.cnt || 0);
  const companies = Number(companiesRows[0]?.cnt || 0);
  const activeJobs = Number(jobsRows[0]?.cnt || 0);
  const totalApplications = Number(appsRows[0]?.cnt || 0);
  const strongMatches = Number(strongMatchRows[0]?.cnt || 0);

  const matchSuccessRate =
    totalApplications > 0
      ? Math.round((strongMatches / totalApplications) * 100)
      : null;

  return {
    individual_users: individualUsers,
    companies,
    active_jobs: activeJobs,
    total_applications: totalApplications,
    match_success_rate: matchSuccessRate,
  };
}

/** 企业端招聘统计 */
async function getCorporateStats(companyUserId) {
  const jobFilter = 'j.company_user_id = ? AND j.source = \'internal\'';
  const jobParams = [companyUserId];

  const [
    jobStatusRows,
    appStatusRows,
    trendRows,
    diversityRows,
    avgScoreRows,
    weeklyJobsRows,
    todayAppsRows,
    hiresRows,
  ] = await Promise.all([
    query(
      `SELECT status, COUNT(*) AS cnt FROM job_postings
       WHERE company_user_id = ? AND source = 'internal'
       GROUP BY status`,
      [companyUserId]
    ),
    query(
      `SELECT a.status, COUNT(*) AS cnt
       FROM job_applications a
       JOIN job_postings j ON j.id = a.job_id
       WHERE ${jobFilter}
       GROUP BY a.status`,
      jobParams
    ),
    query(
      `SELECT DATE_FORMAT(a.created_at, '%Y-%m') AS month, COUNT(*) AS cnt
       FROM job_applications a
       JOIN job_postings j ON j.id = a.job_id
       WHERE ${jobFilter}
         AND a.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
       GROUP BY month
       ORDER BY month`,
      jobParams
    ),
    query(
      `SELECT u.group_types
       FROM job_applications a
       JOIN job_postings j ON j.id = a.job_id
       JOIN users u ON u.id = a.user_id
       WHERE ${jobFilter}`,
      jobParams
    ),
    query(
      `SELECT AVG(a.match_score) AS avg_score
       FROM job_applications a
       JOIN job_postings j ON j.id = a.job_id
       WHERE ${jobFilter}`,
      jobParams
    ),
    query(
      `SELECT COUNT(*) AS cnt FROM job_postings
       WHERE company_user_id = ? AND source = 'internal'
         AND created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`,
      [companyUserId]
    ),
    query(
      `SELECT COUNT(*) AS cnt
       FROM job_applications a
       JOIN job_postings j ON j.id = a.job_id
       WHERE ${jobFilter} AND DATE(a.created_at) = CURDATE()`,
      jobParams
    ),
    query(
      `SELECT COUNT(*) AS cnt
       FROM job_applications a
       JOIN job_postings j ON j.id = a.job_id
       WHERE ${jobFilter} AND a.status = 'accepted'
         AND a.updated_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
      jobParams
    ),
  ]);

  const jobsByStatus = { active: 0, interviewing: 0, closed: 0 };
  jobStatusRows.forEach((row) => {
    jobsByStatus[row.status] = Number(row.cnt);
  });

  const appsByStatus = { pending: 0, reviewing: 0, accepted: 0, rejected: 0 };
  appStatusRows.forEach((row) => {
    appsByStatus[row.status] = Number(row.cnt);
  });

  const totalApplications = Object.values(appsByStatus).reduce((a, b) => a + b, 0);
  const labels = monthLabels(6);
  const trendMap = Object.fromEntries(trendRows.map((r) => [r.month, Number(r.cnt)]));
  const applicationTrend = labels.map((m) => trendMap[m] || 0);

  const groupCounts = {};
  diversityRows.forEach((row) => {
    let types = row.group_types;
    if (typeof types === 'string') {
      try { types = JSON.parse(types); } catch { types = []; }
    }
    (types || []).forEach((t) => {
      groupCounts[t] = (groupCounts[t] || 0) + 1;
    });
  });
  const diversityTotal = Object.values(groupCounts).reduce((a, b) => a + b, 0);
  const diversityBreakdown = Object.entries(groupCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => ({
      label,
      count,
      percent: diversityTotal ? Math.round((count / diversityTotal) * 100) : 0,
    }));

  const diversityRate = totalApplications > 0 && diversityTotal > 0
    ? Math.min(100, Math.round((diversityTotal / totalApplications) * 100))
    : 0;

  const pending = appsByStatus.pending;
  const reviewing = appsByStatus.reviewing;
  const accepted = appsByStatus.accepted;

  return {
    active_jobs: jobsByStatus.active,
    interviewing_jobs: jobsByStatus.interviewing,
    closed_jobs: jobsByStatus.closed,
    total_applications: totalApplications,
    applications_today: Number(todayAppsRows[0]?.cnt || 0),
    jobs_this_week: Number(weeklyJobsRows[0]?.cnt || 0),
    hires_this_month: Number(hiresRows[0]?.cnt || 0),
    interviews: reviewing + accepted,
    avg_match_score: avgScoreRows[0]?.avg_score
      ? Math.round(Number(avgScoreRows[0].avg_score))
      : null,
    diversity_rate: diversityRate,
    diversity_breakdown: diversityBreakdown,
    application_trend: {
      labels: labels.map((m) => {
        const [y, mo] = m.split('-');
        return `${mo}/${y.slice(2)}`;
      }),
      applications: applicationTrend,
    },
    funnel: {
      applications: totalApplications,
      screening: pending + reviewing,
      interviews: reviewing + accepted,
      offers: accepted,
      hires: accepted,
    },
    applications_by_status: appsByStatus,
  };
}

/** 企业组织内各 HR 绩效统计 */
async function getCorporateTeamStats(orgId) {
  if (!orgId) {
    return { hr_performance: [], org_totals: { jobs_posted: 0, applications: 0, hires: 0, hr_count: 0 } };
  }

  let hrRows = [];
  let reviewMap = {};
  try {
    hrRows = await query(
      `SELECT
         u.id AS user_id,
         COALESCE(NULLIF(u.full_name, ''), u.username) AS hr_name,
         m.member_role,
         m.hr_title,
         COUNT(DISTINCT j.id) AS jobs_posted,
         SUM(CASE WHEN j.status = 'active' THEN 1 ELSE 0 END) AS active_jobs,
         SUM(CASE WHEN j.status = 'closed' THEN 1 ELSE 0 END) AS closed_jobs,
         COUNT(DISTINCT a.id) AS applications_received,
         SUM(CASE WHEN a.status = 'accepted' THEN 1 ELSE 0 END) AS hires,
         SUM(CASE WHEN a.status = 'reviewing' THEN 1 ELSE 0 END) AS in_review,
         AVG(a.match_score) AS avg_match_score
       FROM company_org_members m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN job_postings j ON j.company_user_id = u.id AND j.source = 'internal'
       LEFT JOIN job_applications a ON a.job_id = j.id
       WHERE m.org_id = ?
       GROUP BY u.id, u.full_name, u.username, m.member_role, m.hr_title
       ORDER BY hires DESC, applications_received DESC`,
      [orgId]
    );

    const reviewRows = await query(
      `SELECT a.status_updated_by AS user_id, COUNT(*) AS cnt
       FROM job_applications a
       JOIN job_postings j ON j.id = a.job_id
       WHERE j.company_org_id = ? AND a.status_updated_by IS NOT NULL
       GROUP BY a.status_updated_by`,
      [orgId]
    );
    reviewMap = Object.fromEntries(reviewRows.map((r) => [r.user_id, Number(r.cnt)]));
  } catch (err) {
    return { hr_performance: [], org_totals: { jobs_posted: 0, applications: 0, hires: 0, hr_count: 0 } };
  }

  const hrPerformance = hrRows.map((row) => {
    const apps = Number(row.applications_received);
    const hires = Number(row.hires);
    return {
      user_id: row.user_id,
      hr_name: row.hr_name,
      member_role: row.member_role,
      hr_title: row.hr_title,
      jobs_posted: Number(row.jobs_posted),
      active_jobs: Number(row.active_jobs),
      closed_jobs: Number(row.closed_jobs),
      applications_received: apps,
      hires,
      in_review: Number(row.in_review),
      avg_match_score: row.avg_match_score ? Math.round(Number(row.avg_match_score)) : null,
      reviews_handled: reviewMap[row.user_id] || 0,
      hire_rate: apps > 0 ? Math.round((hires / apps) * 100) : 0,
    };
  });

  return {
    hr_performance: hrPerformance,
    org_totals: {
      jobs_posted: hrPerformance.reduce((s, h) => s + h.jobs_posted, 0),
      applications: hrPerformance.reduce((s, h) => s + h.applications_received, 0),
      hires: hrPerformance.reduce((s, h) => s + h.hires, 0),
      hr_count: hrPerformance.length,
    },
  };
}

/** 个人端投递统计 */
async function getIndividualStats(userId) {
  const [
    statusRows,
    sourceRows,
    avgScoreRows,
    trendRows,
  ] = await Promise.all([
    query(
      `SELECT status, COUNT(*) AS cnt FROM job_applications
       WHERE user_id = ? GROUP BY status`,
      [userId]
    ),
    query(
      `SELECT j.source, COUNT(*) AS cnt
       FROM job_applications a
       JOIN job_postings j ON j.id = a.job_id
       WHERE a.user_id = ?
       GROUP BY j.source`,
      [userId]
    ),
    query(
      'SELECT AVG(match_score) AS avg_score FROM job_applications WHERE user_id = ?',
      [userId]
    ),
    query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS cnt
       FROM job_applications
       WHERE user_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
       GROUP BY month ORDER BY month`,
      [userId]
    ),
  ]);

  let externalInterests = 0;
  let matchedViewed = 0;
  try {
    const [externalRows, matchedRows] = await Promise.all([
      query('SELECT COUNT(*) AS cnt FROM job_external_interests WHERE user_id = ?', [userId]),
      query('SELECT COUNT(*) AS cnt FROM job_match_impressions WHERE user_id = ?', [userId]),
    ]);
    externalInterests = Number(externalRows[0]?.cnt || 0);
    matchedViewed = Number(matchedRows[0]?.cnt || 0);
  } catch (err) {
    // 迁移未执行时忽略
  }

  const byStatus = { pending: 0, reviewing: 0, accepted: 0, rejected: 0 };
  statusRows.forEach((row) => {
    byStatus[row.status] = Number(row.cnt);
  });

  const bySource = { internal: 0, external: 0 };
  sourceRows.forEach((row) => {
    bySource[row.source] = Number(row.cnt);
  });

  const totalApplications = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const labels = monthLabels(6);
  const trendMap = Object.fromEntries(trendRows.map((r) => [r.month, Number(r.cnt)]));
  const applicationTrend = labels.map((m) => trendMap[m] || 0);

  return {
    total_applications: totalApplications,
    internal_applications: bySource.internal,
    external_applications: bySource.external,
    external_interests: externalInterests,
    matched_jobs_viewed: matchedViewed,
    avg_match_score: avgScoreRows[0]?.avg_score
      ? Math.round(Number(avgScoreRows[0].avg_score))
      : null,
    applications_by_status: byStatus,
    application_trend: {
      labels: labels.map((m) => {
        const [y, mo] = m.split('-');
        return `${mo}/${y.slice(2)}`;
      }),
      applications: applicationTrend,
    },
  };
}

module.exports = { getHomeStats, getCorporateStats, getIndividualStats, getCorporateTeamStats };
