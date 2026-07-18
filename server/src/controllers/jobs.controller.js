'use strict';

const JobModel = require('../models/job.model');
const ResumeModel = require('../models/resume.model');
const UserModel = require('../models/user.model');
const CompanyModel = require('../models/company.model');
const CompanyOrgModel = require('../models/companyOrg.model');
const { scoreJobResume } = require('../services/match.service');
const {
  buildJobTargetingFromCriteria,
} = require('../constants/groupTypes');
const ApiError = require('../utils/ApiError');

function assertInternalJobOwner(existing, user) {
  if (user.role === 'admin') return;
  if (existing.company_user_id == null) {
    throw ApiError.forbidden('无权操作该岗位');
  }
  if (existing.company_user_id !== user.id) {
    throw ApiError.forbidden('无权操作该岗位');
  }
}

async function syncCompanyFriendly(userId) {
  if (!userId) return;
  await CompanyModel.syncVulnerableFriendlyFlag(userId);
}

async function list(req, res) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 10));
  const { status, search, source, mine, friendly } = req.query;

  const opts = { status, search, source, page, pageSize };
  if (friendly === 'true' || friendly === '1') {
    opts.vulnerableGroupFriendly = true;
  }
  if (mine === 'true') {
    if (req.user?.role !== 'corporate' && req.user?.role !== 'admin') {
      throw ApiError.unauthorized('查看我的岗位需登录企业账号');
    }
    opts.companyUserId = req.user.id;
  }

  const data = await JobModel.listJobs(opts);
  res.json({ success: true, data });
}

/** 个人端：按硬性条件筛选 + 简历评分排序 */
async function listMatched(req, res) {
  const user = await UserModel.findById(req.user.id);
  if (!user) throw ApiError.notFound('用户不存在');

  const resume = await ResumeModel.findByUserId(req.user.id);
  const source = req.query.source || 'internal';
  const friendlyOnly = req.query.friendly === 'true' || req.query.friendly === '1';

  let jobs = await JobModel.listActiveForMatching({
    user,
    source: source === 'all' ? null : source,
  });

  if (friendlyOnly) {
    jobs = jobs.filter((job) => job.vulnerable_group_friendly);
  }

  const scored = jobs.map((job) => {
    const { score, reasons } = scoreJobResume(job, resume);
    return {
      ...job,
      matchScore: score,
      matchReasons: reasons,
    };
  });

  scored.sort((a, b) => b.matchScore - a.matchScore);

  try {
    await JobModel.recordMatchImpressions(scored.map((j) => j.id), req.user.id);
  } catch (err) {
    // 迁移未执行时忽略
  }

  res.json({
    success: true,
    data: {
      jobs: scored,
      user_group_types: user.group_types || [],
      has_resume: Boolean(resume),
    },
  });
}

async function getOne(req, res) {
  const job = await JobModel.findById(req.params.id);
  if (!job) throw ApiError.notFound('岗位不存在');
  res.json({ success: true, data: { job } });
}

function validateTargetCriteriaInput(criteria) {
  if (!criteria || typeof criteria !== 'object') {
    throw ApiError.badRequest('请设置岗位目标人群条件');
  }
  return buildJobTargetingFromCriteria(criteria);
}

function validateSalaryRange(body) {
  const min = body.salary_min != null ? Number(body.salary_min) : null;
  const max = body.salary_max != null ? Number(body.salary_max) : null;
  let salaryMin = min;
  let salaryMax = max;

  if ((!salaryMin || !salaryMax) && body.salary) {
    const m = String(body.salary).match(/(\d[\d,]*)\s*[–-]\s*(\d[\d,]*)/);
    if (m) {
      salaryMin = parseInt(m[1].replace(/,/g, ''), 10);
      salaryMax = parseInt(m[2].replace(/,/g, ''), 10);
    }
  }

  if (!salaryMin || !salaryMax || salaryMin <= 0 || salaryMax <= 0) {
    throw ApiError.badRequest('请填写岗位工资区间（最低与最高月薪）');
  }
  if (salaryMin > salaryMax) {
    throw ApiError.badRequest('工资区间最低值不能高于最高值');
  }

  const salary = `¥${salaryMin.toLocaleString()} – ¥${salaryMax.toLocaleString()}`;
  return { salary, salary_min: salaryMin, salary_max: salaryMax };
}

function validateInterviewConfig(body) {
  const format = body.interview_format || 'ai_only';
  if (!['ai_only', 'partial_custom', 'full_custom', 'human'].includes(format)) {
    throw ApiError.badRequest('Invalid interview_format');
  }
  const questions = Array.isArray(body.interview_custom_questions)
    ? body.interview_custom_questions.map((q) => String(q || '').trim()).filter(Boolean).slice(0, 30)
    : [];
  if ((format === 'partial_custom' || format === 'full_custom') && !questions.length) {
    throw ApiError.badRequest('Please provide custom interview questions for this interview format.');
  }
  const meetingLink = (body.meeting_link || '').trim();
  if (format === 'human' && !meetingLink) {
    throw ApiError.badRequest('Please provide a third-party meeting link for live interviews.');
  }
  return {
    interview_format: format,
    interview_custom_questions: (format === 'partial_custom' || format === 'full_custom') ? questions : [],
    meeting_link: format === 'human' ? meetingLink : null,
    meeting_instructions: format === 'human' ? (body.meeting_instructions || null) : null,
  };
}

async function create(req, res) {
  const built = validateTargetCriteriaInput(req.body.target_criteria);
  const { salary } = validateSalaryRange(req.body);
  const interview = validateInterviewConfig(req.body);

  let companyName = req.body.company_name;
  if (!companyName && req.user?.id) {
    const profile = await CompanyModel.findByUserId(req.user.id);
    companyName = profile?.company_name;
  }

  const job = await JobModel.createJob({
    ...req.body,
    ...interview,
    salary,
    target_criteria: built.target_criteria,
    target_group_types: built.target_group_types,
    vulnerable_group_friendly: built.vulnerable_group_friendly,
    company_name: companyName || req.body.company_name,
    company_user_id: req.user?.id || null,
    company_org_id: await CompanyOrgModel.findOrgIdByUserId(req.user?.id),
    post_date: req.body.post_date || new Date().toISOString().slice(0, 10),
  });

  await syncCompanyFriendly(req.user?.id);

  res.status(201).json({ success: true, message: '岗位发布成功', data: { job } });
}

async function update(req, res) {
  const existing = await JobModel.findById(req.params.id);
  if (!existing) throw ApiError.notFound('岗位不存在');
  if (existing.source !== 'internal') {
    throw ApiError.forbidden('外部岗位不可编辑');
  }
  assertInternalJobOwner(existing, req.user);

  const body = { ...req.body };
  if (body.salary_min != null || body.salary_max != null || body.salary) {
    const { salary } = validateSalaryRange(body);
    body.salary = salary;
  }
  if (body.target_criteria) {
    const built = validateTargetCriteriaInput(body.target_criteria);
    body.target_criteria = built.target_criteria;
    body.target_group_types = built.target_group_types;
    body.vulnerable_group_friendly = built.vulnerable_group_friendly;
  }
  if (body.interview_format != null || body.interview_custom_questions != null || body.meeting_link != null) {
    Object.assign(body, validateInterviewConfig({
      interview_format: body.interview_format || existing.interview_format,
      interview_custom_questions: body.interview_custom_questions != null
        ? body.interview_custom_questions
        : existing.interview_custom_questions,
      meeting_link: body.meeting_link != null ? body.meeting_link : existing.meeting_link,
      meeting_instructions: body.meeting_instructions != null
        ? body.meeting_instructions
        : existing.meeting_instructions,
    }));
  }

  const job = await JobModel.updateJob(req.params.id, body);
  await syncCompanyFriendly(req.user?.id);
  res.json({ success: true, message: '岗位已更新', data: { job } });
}

async function updateStatus(req, res) {
  const { status } = req.body;
  if (!['active', 'interviewing', 'closed'].includes(status)) {
    throw ApiError.badRequest('状态值不合法');
  }

  const existing = await JobModel.findById(req.params.id);
  if (!existing) throw ApiError.notFound('岗位不存在');
  if (existing.source !== 'internal') {
    throw ApiError.forbidden('外部岗位不可修改状态');
  }
  assertInternalJobOwner(existing, req.user);

  const job = await JobModel.updateStatus(req.params.id, status);
  await syncCompanyFriendly(req.user?.id);
  res.json({ success: true, message: '状态已更新', data: { job } });
}

async function clone(req, res) {
  const existing = await JobModel.findById(req.params.id);
  if (!existing) throw ApiError.notFound('岗位不存在');
  if (existing.source !== 'internal') {
    throw ApiError.forbidden('仅可克隆企业自建岗位');
  }
  assertInternalJobOwner(existing, req.user);

  const job = await JobModel.cloneJob(req.params.id);
  await syncCompanyFriendly(req.user?.id);
  res.status(201).json({ success: true, message: '岗位已克隆', data: { job } });
}

async function remove(req, res) {
  const existing = await JobModel.findById(req.params.id);
  if (!existing) throw ApiError.notFound('岗位不存在');
  if (existing.source !== 'internal') {
    throw ApiError.forbidden('外部岗位不可删除');
  }
  assertInternalJobOwner(existing, req.user);

  await JobModel.deleteJob(req.params.id);
  await syncCompanyFriendly(req.user?.id);
  res.json({ success: true, message: '岗位已删除' });
}

/** 记录外部岗位跳转意向 */
async function trackExternalInterest(req, res) {
  const jobId = parseInt(req.params.id, 10);
  const job = await JobModel.findById(jobId);
  if (!job) throw ApiError.notFound('岗位不存在');
  if (job.source !== 'external') {
    throw ApiError.badRequest('仅外部岗位可记录跳转意向');
  }

  let recorded = false;
  try {
    recorded = await JobModel.recordExternalInterest(jobId, req.user.id);
  } catch (err) {
    // 迁移未执行时忽略
  }

  res.json({
    success: true,
    message: recorded ? '已记录跳转意向' : '已记录',
    data: { source_url: job.source_url },
  });
}

module.exports = { list, listMatched, getOne, create, update, updateStatus, clone, remove, trackExternalInterest };
