'use strict';

/** 平台支持的弱势群体 / 目标人群类型 */
const GROUP_TYPES = {
  disability: '残疾人士',
  elderly_45plus: '45岁以上劳动者',
  career_returner: '职场回归女性',
  youth: '低收入青年',
};

const VALID_GROUP_TYPES = Object.keys(GROUP_TYPES);

const VULNERABLE_GROUP_FRIENDLY_LABEL = '弱势群体友好';

/** 自动匹配阈值（可按业务调整） */
const MATCH_THRESHOLDS = {
  ELDERLY_MIN_AGE: 45,
  YOUTH_MAX_AGE: 30,
  YOUTH_MAX_INCOME_MONTHLY: 8000,
  CAREER_RETURNER_MIN_GAP_YEARS: 1,
};

const GENDER_OPTIONS = {
  male: '男',
  female: '女',
  other: '其他',
  prefer_not_say: '不愿透露',
};

const DISABILITY_TYPES = {
  none: '无',
  physical: '肢体残疾',
  visual: '视力残疾',
  hearing: '听力残疾',
  intellectual: '智力残疾',
  mental: '精神残疾',
  other: '其他残疾',
};

/** 企业发岗：年龄范围下拉 */
const AGE_RANGE_OPTIONS = {
  any: '不限年龄',
  '45_plus': '45岁及以上',
  '30_below': '30岁及以下',
};

/** 企业发岗：残疾接纳政策 */
const DISABILITY_POLICY_OPTIONS = {
  any: '不限残疾状况',
  open: '接纳残疾人士',
};

/** 企业发岗：职业空窗 */
const CAREER_GAP_OPTIONS = {
  any: '不限空窗',
  yes: '欢迎有空窗经历者',
  no: '要求无职业空窗',
};

function isValidGroupType(value) {
  return VALID_GROUP_TYPES.includes(value);
}

function parseGroupTypesJson(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(isValidGroupType);
  if (typeof raw === 'string') {
    if (isValidGroupType(raw)) return [raw];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isValidGroupType) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseTargetCriteria(raw) {
  if (!raw) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * 规范化企业提交的岗位目标条件
 */
function normalizeTargetCriteria(input = {}) {
  const ageRange = AGE_RANGE_OPTIONS[input.age_range] ? input.age_range : 'any';
  const gender = input.gender && GENDER_OPTIONS[input.gender] ? input.gender : 'any';
  const disability = DISABILITY_POLICY_OPTIONS[input.disability] ? input.disability : 'any';
  const careerGap = CAREER_GAP_OPTIONS[input.career_gap] ? input.career_gap : 'any';

  let minAge = null;
  let maxAge = null;
  if (ageRange === '45_plus') minAge = MATCH_THRESHOLDS.ELDERLY_MIN_AGE;
  if (ageRange === '30_below') maxAge = MATCH_THRESHOLDS.YOUTH_MAX_AGE;

  let acceptedDisabilityTypes = [];
  if (disability === 'open' && Array.isArray(input.disability_types)) {
    acceptedDisabilityTypes = input.disability_types.filter(
      (t) => t && t !== 'none' && DISABILITY_TYPES[t]
    );
  }

  return {
    age_range: ageRange,
    min_age: minAge,
    max_age: maxAge,
    gender,
    disability,
    disability_types: acceptedDisabilityTypes,
    career_gap: careerGap,
    prioritize_vulnerable: Boolean(input.prioritize_vulnerable),
  };
}

/** 是否设置了任一硬性筛选条件 */
function hasTargetRestrictions(criteria) {
  if (!criteria) return false;
  return (
    criteria.age_range !== 'any' ||
    criteria.gender !== 'any' ||
    criteria.disability !== 'any' ||
    criteria.career_gap !== 'any'
  );
}

/**
 * 由岗位条件推导弱势群体类型标签
 */
function deriveJobGroupTypes(criteria) {
  if (!criteria || !hasTargetRestrictions(criteria)) return [];

  const types = [];
  if (criteria.disability === 'open') types.push('disability');
  if (criteria.min_age != null && criteria.min_age >= MATCH_THRESHOLDS.ELDERLY_MIN_AGE) {
    types.push('elderly_45plus');
  }
  if (criteria.max_age != null && criteria.max_age <= MATCH_THRESHOLDS.YOUTH_MAX_AGE) {
    types.push('youth');
  }
  if (criteria.gender === 'female' && criteria.career_gap === 'yes') {
    types.push('career_returner');
  }
  return types;
}

/**
 * 根据用户画像自动推断所属人群类型（可多项）
 */
function inferGroupTypes(profile = {}) {
  const age = Number(profile.age);
  const gapYears = Number(profile.career_gap_years);
  const income = Number(profile.current_income);
  const disabilityType = profile.disability_type;
  const gender = profile.gender;

  const types = [];

  if (disabilityType && disabilityType !== 'none') {
    types.push('disability');
  }
  if (!Number.isNaN(age) && age >= MATCH_THRESHOLDS.ELDERLY_MIN_AGE) {
    types.push('elderly_45plus');
  }
  if (
    gender === 'female' &&
    !Number.isNaN(gapYears) &&
    gapYears >= MATCH_THRESHOLDS.CAREER_RETURNER_MIN_GAP_YEARS
  ) {
    types.push('career_returner');
  }
  if (
    !Number.isNaN(age) &&
    age <= MATCH_THRESHOLDS.YOUTH_MAX_AGE &&
    !Number.isNaN(income) &&
    income <= MATCH_THRESHOLDS.YOUTH_MAX_INCOME_MONTHLY
  ) {
    types.push('youth');
  }

  return types;
}

function userHasCareerGap(user) {
  const gapYears = Number(user.career_gap_years);
  return !Number.isNaN(gapYears) && gapYears >= MATCH_THRESHOLDS.CAREER_RETURNER_MIN_GAP_YEARS;
}

/**
 * 用户画像与岗位硬性条件匹配
 * @param {object} meta - { source, vulnerable_group_friendly }
 */
function userMatchesJobCriteria(user, criteria, meta = {}) {
  if (meta.source === 'external' && meta.vulnerable_group_friendly) {
    return true;
  }

  const parsed = parseTargetCriteria(criteria);
  if (!parsed || !hasTargetRestrictions(parsed)) {
    return true;
  }

  const age = Number(user?.age);
  const gender = user?.gender;
  const disabilityType = user?.disability_type || 'none';

  if (parsed.min_age != null && (Number.isNaN(age) || age < parsed.min_age)) return false;
  if (parsed.max_age != null && (Number.isNaN(age) || age > parsed.max_age)) return false;

  if (parsed.gender !== 'any' && gender !== parsed.gender) return false;

  if (parsed.disability === 'open') {
    if (disabilityType === 'none') return false;
    if (parsed.disability_types?.length && !parsed.disability_types.includes(disabilityType)) {
      return false;
    }
  }

  const hasGap = userHasCareerGap(user);
  if (parsed.career_gap === 'yes' && !hasGap) return false;
  if (parsed.career_gap === 'no' && hasGap) return false;

  return true;
}

/** @deprecated 保留兼容；请使用 userMatchesJobCriteria */
function jobMatchesUserGroup(jobTargetTypes, userGroupTypes) {
  const targets = parseGroupTypesJson(jobTargetTypes);
  if (!targets.length) return true;
  const userTypes = parseGroupTypesJson(userGroupTypes);
  if (!userTypes.length) return false;
  return userTypes.some((t) => targets.includes(t));
}

function isVulnerableUser(userOrGroupTypes) {
  const types = Array.isArray(userOrGroupTypes)
    ? userOrGroupTypes
    : parseGroupTypesJson(userOrGroupTypes?.group_types);
  return types.length > 0;
}

/** 企业端应聘者排序：友好岗位下弱势群体优先，同组内按匹配分 */
function sortApplicantsForCorporate(applications, job) {
  const list = [...applications];
  if (!job?.vulnerable_group_friendly) {
    return list.sort((a, b) => (b.match_score || 0) - (a.match_score || 0));
  }
  return list.sort((a, b) => {
    const aV = isVulnerableUser(a.applicant_group_types) ? 1 : 0;
    const bV = isVulnerableUser(b.applicant_group_types) ? 1 : 0;
    if (bV !== aV) return bV - aV;
    return (b.match_score || 0) - (a.match_score || 0);
  });
}
function formatGroupTypesLabel(types) {
  return parseGroupTypesJson(types)
    .map((t) => GROUP_TYPES[t] || t)
    .join('、');
}

function computeVulnerableFriendly(criteria, targetGroupTypes) {
  if (targetGroupTypes.length > 0) return 1;
  if (criteria && !hasTargetRestrictions(criteria) && criteria.prioritize_vulnerable) return 1;
  return 0;
}

function buildJobTargetingFromCriteria(criteriaInput) {
  const target_criteria = normalizeTargetCriteria(criteriaInput);
  const target_group_types = deriveJobGroupTypes(target_criteria);
  const vulnerable_group_friendly = computeVulnerableFriendly(target_criteria, target_group_types);
  return { target_criteria, target_group_types, vulnerable_group_friendly };
}

module.exports = {
  GROUP_TYPES,
  VALID_GROUP_TYPES,
  VULNERABLE_GROUP_FRIENDLY_LABEL,
  MATCH_THRESHOLDS,
  GENDER_OPTIONS,
  DISABILITY_TYPES,
  AGE_RANGE_OPTIONS,
  DISABILITY_POLICY_OPTIONS,
  CAREER_GAP_OPTIONS,
  isValidGroupType,
  parseGroupTypesJson,
  parseTargetCriteria,
  normalizeTargetCriteria,
  hasTargetRestrictions,
  deriveJobGroupTypes,
  inferGroupTypes,
  userMatchesJobCriteria,
  jobMatchesUserGroup,
  formatGroupTypesLabel,
  computeVulnerableFriendly,
  isVulnerableUser,
  sortApplicantsForCorporate,
  buildJobTargetingFromCriteria,
};
