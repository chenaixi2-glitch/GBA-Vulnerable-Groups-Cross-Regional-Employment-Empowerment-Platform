'use strict';

const DonationModel = require('../models/donation.model');
const ApiError = require('../utils/ApiError');
const {
  LEGAL_SERVICE_PURPOSE,
  getPlatformAccess,
  isVulnerableIndividual,
} = require('../services/access.service');
const UserModel = require('../models/user.model');
const { formatGroupTypesLabel } = require('../constants/groupTypes');

const LEGAL_SERVICES = [
  {
    id: 'labor_rights',
    title: '劳动权益咨询',
    description: '为弱势群体提供劳动合同、工资福利、工伤认定等基础劳动法律咨询与维权指引。',
    icon: 'balance-scale',
  },
  {
    id: 'cross_border',
    title: '跨境就业法律指导',
    description: '粤港澳大湾区跨境就业签证、工作许可、社保衔接等合规问题专项解答。',
    icon: 'globe-asia',
  },
  {
    id: 'anti_discrimination',
    title: '反就业歧视法律援助',
    description: '针对年龄、残疾、性别等就业歧视情形，提供投诉渠道与法律支持对接。',
    icon: 'shield-alt',
  },
  {
    id: 'disability_employment',
    title: '残疾人士就业权益',
    description: '合理便利申请、无障碍就业环境、残疾证相关权益等专项服务。',
    icon: 'wheelchair',
  },
  {
    id: 'career_return',
    title: '职场回归女性支持',
    description: '职业空窗期再就业相关的法律权益保护与协商指导。',
    icon: 'female',
  },
];

/**
 * GET /api/donations/stats — 公开：法律服务基金统计
 */
async function getStats(req, res) {
  const stats = await DonationModel.getStats(LEGAL_SERVICE_PURPOSE);
  res.json({
    success: true,
    data: {
      ...stats,
      purpose: LEGAL_SERVICE_PURPOSE,
      purpose_label: '弱势群体法律服务',
      fund_usage: '100%',
      fund_usage_note: '捐款箱募集到的资金将全额用于弱势群体法律服务',
    },
  });
}

/**
 * GET /api/donations/legal-services — 公开：法律服务介绍
 */
function getLegalServices(req, res) {
  res.json({
    success: true,
    data: {
      title: '弱势群体法律服务',
      subtitle: '由平台捐款箱全额资助。用户可上传法律诉求申请，律师/志愿者接单或平台协助联系',
      services: LEGAL_SERVICES,
      contact: {
        hotline: '400-888-GBA1',
        email: 'legal-aid@gba-platform.org',
        hours: '周一至周五 9:00–18:00',
      },
      fund_promise: '捐款箱募集到的资金将全额用于该服务，不收取任何管理费用。',
    },
  });
}

/**
 * GET /api/donations/access — 当前用户平台访问权限
 */
async function getAccess(req, res) {
  const access = await getPlatformAccess(req.user.id);
  const user = await UserModel.findById(req.user.id);
  res.json({
    success: true,
    data: {
      ...access,
      group_types_label: formatGroupTypesLabel(user?.group_types),
    },
  });
}

/**
 * GET /api/donations/me — 我的捐款记录
 */
async function listMine(req, res) {
  const donations = await DonationModel.listByUser(req.user.id);
  res.json({ success: true, data: { donations } });
}

/**
 * POST /api/donations — 向捐款箱捐款（模拟支付，记录即生效）
 */
async function createDonation(req, res) {
  const user = await UserModel.findById(req.user.id);
  if (!user) throw ApiError.notFound('用户不存在');

  if (isVulnerableIndividual(user)) {
    throw ApiError.badRequest('您属于弱势群体，平台各项功能免费使用，无需捐款');
  }

  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw ApiError.badRequest('请输入有效的捐款金额（大于 0，不限上限）');
  }
  if (amount > 99999999) {
    throw ApiError.badRequest('单次捐款金额超出上限');
  }

  const message = req.body.message ? String(req.body.message).trim().slice(0, 500) : null;

  const donation = await DonationModel.create({
    userId: req.user.id,
    amount,
    purpose: LEGAL_SERVICE_PURPOSE,
    message,
  });

  const access = await getPlatformAccess(req.user.id);
  const stats = await DonationModel.getStats(LEGAL_SERVICE_PURPOSE);

  res.status(201).json({
    success: true,
    message: '感谢您的爱心捐款！资金将全额用于弱势群体法律服务。',
    data: {
      donation,
      access,
      stats,
    },
  });
}

module.exports = {
  getStats,
  getLegalServices,
  getAccess,
  listMine,
  createDonation,
};
