'use strict';

const UserModel = require('../models/user.model');
const DonationModel = require('../models/donation.model');
const { parseGroupTypesJson } = require('../constants/groupTypes');

const LEGAL_SERVICE_PURPOSE = 'legal_service';

/** 个人用户是否属于弱势群体（系统推断 group_types 非空） */
function isVulnerableIndividual(user) {
  if (!user || user.role !== 'individual') return false;
  return parseGroupTypesJson(user.group_types).length > 0;
}

/** 管理员始终免捐 */
function isAdmin(user) {
  return user && user.role === 'admin';
}

function isCorporateUser(user) {
  return user && user.role === 'corporate';
}

/**
 * 是否需通过捐款箱解锁平台功能
 * - 弱势群体个人：免捐
 * - 非弱势群体个人：需至少捐款一次（金额不限）
 * - 企业用户：招聘、岗位匹配、法律帮助等基础功能免费；面试模拟与 HR 绩效等高级功能需捐款
 */
async function getPlatformAccess(userId) {
  const user = await UserModel.findById(userId);
  if (!user) {
    return { has_access: false, reason: 'user_not_found', user: null };
  }

  if (isAdmin(user)) {
    return buildAccessResult(user, true, 'admin', { has_premium_access: true });
  }

  if (isVulnerableIndividual(user)) {
    return buildAccessResult(user, true, 'vulnerable_group', { has_premium_access: true });
  }

  const donationCount = await DonationModel.countByUser(userId);
  const hasDonated = donationCount > 0;

  if (isCorporateUser(user)) {
    return buildAccessResult(user, true, hasDonated ? 'donated' : 'corporate_basic', {
      has_premium_access: hasDonated,
      donation_count: donationCount,
    });
  }

  if (hasDonated) {
    return buildAccessResult(user, true, 'donated', {
      has_premium_access: true,
      donation_count: donationCount,
    });
  }

  return buildAccessResult(user, false, 'donation_required', { has_premium_access: false });
}

function buildAccessResult(user, hasAccess, reason, extra = {}) {
  const isVulnerable = isVulnerableIndividual(user);
  const isCorp = isCorporateUser(user);
  const hasPremium = extra.has_premium_access != null ? extra.has_premium_access : hasAccess;

  return {
    has_access: hasAccess,
    has_premium_access: hasPremium,
    reason,
    is_vulnerable: isVulnerable,
    role: user.role,
    group_types: user.group_types || [],
    requires_donation: !hasAccess && !isVulnerable && !isAdmin(user),
    requires_premium_donation: isCorp && !hasPremium && !isAdmin(user),
    ...extra,
  };
}

module.exports = {
  LEGAL_SERVICE_PURPOSE,
  isVulnerableIndividual,
  isAdmin,
  isCorporateUser,
  getPlatformAccess,
};
