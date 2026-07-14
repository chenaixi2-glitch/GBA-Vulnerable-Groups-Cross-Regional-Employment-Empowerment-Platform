'use strict';

/** Legal aid request categories (aligned with donation-box legal services) */
const LEGAL_AID_CATEGORIES = {
  labor_rights: 'Labor rights consultation',
  cross_border: 'Cross-border employment guidance',
  anti_discrimination: 'Anti-discrimination legal aid',
  disability_employment: 'Disability employment rights',
  career_return: 'Career-returning women support',
  other: 'Other legal request',
};

const VALID_CATEGORIES = Object.keys(LEGAL_AID_CATEGORIES);

const REQUEST_STATUS = {
  pending: 'Pending',
  assigned: 'Assigned',
  platform_assisting: 'Platform assisting',
  in_progress: 'In progress',
  resolved: 'Resolved',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const VALID_STATUSES = Object.keys(REQUEST_STATUS);

const HELPER_ROLES = {
  lawyer: 'Licensed lawyer',
  volunteer: 'Legal volunteer',
  other: 'Other helper',
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
