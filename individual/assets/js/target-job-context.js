/**
 * Collect JD textarea + industry / employer type / experience level for resume, interview, learning path.
 */

function tjcT(key, fallback, vars) {
    if (typeof window !== 'undefined' && window.GBAI18n && window.GBAI18n.t) {
        return window.GBAI18n.t(key, fallback, vars);
    }
    let s = fallback;
    if (vars && s) Object.keys(vars).forEach((k) => { s = String(s).replace('{' + k + '}', vars[k]); });
    return s;
}

const TARGET_JOB_INDUSTRY_KEYS = {
    tech: 'resume.tech', finance: 'resume.finance', ecommerce: 'resume.ecommerce',
    healthcare: 'resume.healthcare', education: 'resume.education', manufacturing: 'resume.manufacturing', other: 'resume.other',
};
const TARGET_JOB_INDUSTRY_FB = {
    tech: 'Technology', finance: 'Finance', ecommerce: 'E-commerce', healthcare: 'Healthcare',
    education: 'Education', manufacturing: 'Manufacturing', other: 'Other',
};
const TARGET_JOB_EMPLOYER_KEYS = {
    soe: 'resume.soe', public: 'resume.publicSector', foreign: 'resume.foreign',
    private: 'resume.private', npo: 'resume.npo', hmt: 'resume.hmt', other: 'resume.employerOther',
};
const TARGET_JOB_EMPLOYER_FB = {
    soe: 'State-owned enterprise', public: 'Public sector', foreign: 'Foreign enterprise',
    private: 'Private enterprise', npo: 'Non-profit (NPO/NGO)', hmt: 'HK/Macau/TW-funded', other: 'Other',
};
const TARGET_JOB_EXPERIENCE_KEYS = {
    entry: 'resume.entry', mid: 'resume.mid', senior: 'resume.senior', executive: 'resume.executive',
};
const TARGET_JOB_EXPERIENCE_FB = {
    entry: 'Entry Level', mid: 'Mid Level', senior: 'Senior Level', executive: 'Executive',
};

const TARGET_JOB_FIELD_MAP = {
    jdText: ['jd-text', 'interview-jd-text'],
    industry: ['industry-select', 'job-industry', 'industry-focus'],
    employerType: ['employer-type-select', 'interview-employer-type', 'learning-employer-type'],
    experienceLevel: ['experience-level', 'interview-experience-level', 'learning-experience-level'],
};

function readFirstFieldValue(ids) {
    for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        const value = (el.value || '').trim();
        if (value) return value;
    }
    return '';
}

function getTargetIndustryLabel(value) {
    const key = TARGET_JOB_INDUSTRY_KEYS[value];
    return key ? tjcT(key, TARGET_JOB_INDUSTRY_FB[value] || value) : value;
}

function getTargetEmployerLabel(value) {
    const key = TARGET_JOB_EMPLOYER_KEYS[value];
    return key ? tjcT(key, TARGET_JOB_EMPLOYER_FB[value] || value) : value;
}

function getTargetExperienceLabel(value) {
    const key = TARGET_JOB_EXPERIENCE_KEYS[value];
    return key ? tjcT(key, TARGET_JOB_EXPERIENCE_FB[value] || value) : value;
}

/**
 * @param {object} [options]
 * @param {string} [options.jdTextOverride] - 显式传入 JD 文本
 * @param {object} [options.fields] - 自定义字段 id 映射
 */
function collectTargetJobContext(options = {}) {
    const fields = { ...TARGET_JOB_FIELD_MAP, ...(options.fields || {}) };
    const jdText = (options.jdTextOverride || readFirstFieldValue(fields.jdText)).trim();
    const industry = readFirstFieldValue(fields.industry);
    const employerType = readFirstFieldValue(fields.employerType);
    const experienceLevel = readFirstFieldValue(fields.experienceLevel);

    return {
        jd_text: jdText,
        industry,
        industryLabel: getTargetIndustryLabel(industry),
        employer_type: employerType,
        employerTypeLabel: getTargetEmployerLabel(employerType),
        experience_level: experienceLevel,
        experienceLevelLabel: getTargetExperienceLabel(experienceLevel),
    };
}

function buildTargetJobContextBlock(context) {
    if (!context) return '';
    const lines = [];
    if (context.industryLabel) lines.push(`Target industry: ${context.industryLabel}`);
    if (context.employerTypeLabel) lines.push(`Employer type: ${context.employerTypeLabel}`);
    if (context.experienceLevelLabel) lines.push(`Experience level: ${context.experienceLevelLabel}`);
    if (context.jd_text) lines.push(`Target JD:\n${context.jd_text}`);
    return lines.join('\n');
}

function buildJdSubmissionText(jdText, context) {
    const body = (jdText || context?.jd_text || '').trim();
    const meta = [];
    if (context?.industryLabel) meta.push(tjcT('resume.metaIndustry', 'Target industry: {label}', { label: context.industryLabel }));
    if (context?.employerTypeLabel) meta.push(tjcT('resume.metaEmployer', 'Employer type: {label}', { label: context.employerTypeLabel }));
    if (context?.experienceLevelLabel) meta.push(tjcT('resume.metaExperience', 'Experience level: {label}', { label: context.experienceLevelLabel }));
    if (!meta.length) return body;
    return [body, '', '--- ' + tjcT('resume.metaSection', 'Target job details') + ' ---', ...meta].filter((line, idx, arr) => !(idx === 0 && !line)).join('\n');
}

const JD_DETAIL_MARKERS = [
    '职责', '任职要求', '岗位要求', '职位要求', '工作内容', '岗位描述', '加分项',
    'qualification', 'responsibilit', 'requirement', 'job description',
    'key responsibilit', 'what you', 'benefits', 'skills required', '任职',
];

/**
 * 判断 JD 文本框内容是否仅为岗位名称（无完整 JD 详情）
 */
function isTitleOnlyJd(jdText) {
    const text = (jdText || '').trim();
    if (!text) return false;
    if (text.length > 200) return false;
    if (text.split('\n').length > 2) return false;
    const lower = text.toLowerCase();
    if (JD_DETAIL_MARKERS.some((m) => lower.includes(m.toLowerCase()))) return false;
    return true;
}

/**
 * 是否需要在进入简历优化前由用户确认 JD
 */
function needsJdUserConfirmation(jdText, { jdAutoGenerated = false, jdUserConfirmed = false } = {}) {
    if (jdUserConfirmed) return false;
    return isTitleOnlyJd(jdText) || jdAutoGenerated;
}
