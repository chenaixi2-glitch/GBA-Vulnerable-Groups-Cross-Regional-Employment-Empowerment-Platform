'use strict';

/** Supported vulnerable / target group type labels (UI English) */
const GROUP_TYPES = {
  disability: 'People with disabilities',
  elderly_45plus: 'Workers aged 45+',
  career_returner: 'Career-returning women',
  youth: 'Low-income youth',
};

const VALID_GROUP_TYPES = Object.keys(GROUP_TYPES);

const VULNERABLE_GROUP_FRIENDLY_LABEL = 'Vulnerable-group friendly';

/** Auto-match thresholds */
const MATCH_THRESHOLDS = {
  ELDERLY_MIN_AGE: 45,
  YOUTH_MAX_AGE: 30,
  YOUTH_MAX_INCOME_MONTHLY: 8000,
  CAREER_RETURNER_MIN_GAP_YEARS: 1,
};

const GENDER_OPTIONS = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
  prefer_not_say: 'Prefer not to say',
};

const DISABILITY_TYPES = {
  none: 'None',
  physical: 'Physical disability',
  visual: 'Visual disability',
  hearing: 'Hearing disability',
  intellectual: 'Intellectual disability',
  mental: 'Mental disability',
  other: 'Other disability',
};

/** Corporate job post: age range options */
const AGE_RANGE_OPTIONS = {
  any: 'Any age',
  '45_plus': '45 and above',
  '30_below': '30 and below',
};

/** Corporate job post: disability policy */
const DISABILITY_POLICY_OPTIONS = {
  any: 'Any disability status',
  open: 'Open to people with disabilities',
};

/** Corporate job post: career gap */
const CAREER_GAP_OPTIONS = {
  any: 'Any career gap',
  yes: 'Welcome applicants with career gaps',
  no: 'No career gap required',
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
    .join(', ');
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
