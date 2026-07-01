'use strict';

/** 法律服务诉求类别（与捐款箱法律服务模块一致） */
const LEGAL_AID_CATEGORIES = {
  labor_rights: '劳动权益咨询',
  cross_border: '跨境就业法律指导',
  anti_discrimination: '反就业歧视法律援助',
  disability_employment: '残疾人士就业权益',
  career_return: '职场回归女性支持',
  other: '其他法律诉求',
};

const VALID_CATEGORIES = Object.keys(LEGAL_AID_CATEGORIES);

const REQUEST_STATUS = {
  pending: '待接单',
  assigned: '已接单',
  platform_assisting: '平台协助联系中',
  in_progress: '处理中',
  resolved: '已解决',
  completed: '已完成',
  cancelled: '已取消',
};

const VALID_STATUSES = Object.keys(REQUEST_STATUS);

const HELPER_ROLES = {
  lawyer: '执业律师',
  volunteer: '法律志愿者',
  other: '其他帮助者',
};

const VALID_HELPER_ROLES = Object.keys(HELPER_ROLES);

const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 200 * 1024;

function isValidCategory(value) {
  return VALID_CATEGORIES.includes(value);
}

function parseAttachments(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

module.exports = {
  LEGAL_AID_CATEGORIES,
  VALID_CATEGORIES,
  REQUEST_STATUS,
  VALID_STATUSES,
  HELPER_ROLES,
  VALID_HELPER_ROLES,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  isValidCategory,
  parseAttachments,
};
