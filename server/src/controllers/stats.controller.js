'use strict';

const StatsModel = require('../models/stats.model');
const CompanyOrgModel = require('../models/companyOrg.model');
const CompanyModel = require('../models/company.model');
const ApiError = require('../utils/ApiError');
const { getPlatformAccess } = require('../services/access.service');
async function ensureUserOrg(userId) {
  let orgId = await CompanyOrgModel.findOrgIdByUserId(userId);
  if (orgId) return orgId;
  const profile = await CompanyModel.findByUserId(userId);
  if (!profile) return null;
  await CompanyOrgModel.createOrgForUser(userId, profile.company_name);
  return CompanyOrgModel.findOrgIdByUserId(userId);
}

async function home(req, res) {
  const stats = await StatsModel.getHomeStats();
  res.json({ success: true, data: stats });
}

async function corporate(req, res) {
  if (!req.user?.id) throw ApiError.unauthorized('请先登录');
  const stats = await StatsModel.getCorporateStats(req.user.id);
  res.json({ success: true, data: stats });
}

async function corporateTeam(req, res) {
  if (!req.user?.id) throw ApiError.unauthorized('请先登录');
  const access = await getPlatformAccess(req.user.id);
  if (!access.has_premium_access) {
    throw ApiError.forbidden('HR 团队绩效统计需向捐款箱捐款后解锁（面试模拟等高级功能同理）');
  }
  const orgId = await ensureUserOrg(req.user.id);
  if (!orgId) throw ApiError.notFound('尚未加入企业组织');

  const team = await CompanyOrgModel.getOrgSummary(req.user.id);
  const stats = await StatsModel.getCorporateTeamStats(orgId);

  res.json({
    success: true,
    data: {
      org_id: orgId,
      org_name: team?.org_name,
      invite_code: team?.invite_code,
      my_role: team?.my_role,
      current_user_id: req.user.id,
      ...stats,
    },
  });
}

async function individual(req, res) {
  if (!req.user?.id) throw ApiError.unauthorized('请先登录');
  const stats = await StatsModel.getIndividualStats(req.user.id);
  res.json({ success: true, data: stats });
}

module.exports = { home, corporate, corporateTeam, individual };
