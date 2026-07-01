'use strict';

const CompanyModel = require('../models/company.model');
const CompanyOrgModel = require('../models/companyOrg.model');
const ApiError = require('../utils/ApiError');

async function ensureUserOrg(userId) {
  let orgId = await CompanyOrgModel.findOrgIdByUserId(userId);
  if (orgId) return orgId;
  const profile = await CompanyModel.findByUserId(userId);
  if (!profile) return null;
  await CompanyOrgModel.createOrgForUser(userId, profile.company_name);
  return CompanyOrgModel.findOrgIdByUserId(userId);
}

async function getProfile(req, res) {
  const profile = await CompanyModel.findByUserId(req.user.id);
  res.json({ success: true, data: { profile } });
}

async function upsertProfile(req, res) {
  const { company_name: companyName } = req.body;
  if (!companyName || !String(companyName).trim()) {
    throw ApiError.badRequest('企业名称不能为空');
  }

  const profile = await CompanyModel.upsert(req.user.id, {
    company_name: String(companyName).trim(),
    industry: req.body.industry,
    description: req.body.description,
    address: req.body.address,
    contact_email: req.body.contact_email,
    contact_phone: req.body.contact_phone,
    website: req.body.website,
    license_no: req.body.license_no,
    employee_count: req.body.employee_count,
    inclusivity_info: req.body.inclusivity_info,
  });

  res.json({ success: true, message: '企业信息已保存', data: { profile } });
}

async function listFriendly(req, res) {
  const companies = await CompanyModel.listFriendly();
  res.json({ success: true, data: { companies } });
}

async function getTeam(req, res) {
  await ensureUserOrg(req.user.id);
  const team = await CompanyOrgModel.getOrgSummary(req.user.id);
  if (!team) {
    throw ApiError.notFound('尚未加入企业组织，请重新注册或联系管理员');
  }
  res.json({ success: true, data: team });
}

module.exports = { getProfile, upsertProfile, listFriendly, getTeam };
