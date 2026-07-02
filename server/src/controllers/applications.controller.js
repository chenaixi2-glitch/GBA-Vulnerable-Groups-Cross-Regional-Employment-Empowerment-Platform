'use strict';

const JobModel = require('../models/job.model');
const ApplicationModel = require('../models/application.model');
const ResumeModel = require('../models/resume.model');
const UserModel = require('../models/user.model');
const { scoreJobResume } = require('../services/match.service');
const { userMatchesJobCriteria, sortApplicantsForCorporate } = require('../constants/groupTypes');
const ApiError = require('../utils/ApiError');

function assertJobOwner(job, user) {
  if (user.role === 'admin') return;
  if (job.company_user_id !== user.id) {
    throw ApiError.forbidden('无权查看该岗位的应聘者');
  }
}

async function apply(req, res) {
  const jobId = parseInt(req.params.id, 10);
  const job = await JobModel.findById(jobId);
  if (!job) throw ApiError.notFound('岗位不存在');
  if (job.status !== 'active') throw ApiError.badRequest('该岗位已关闭招聘');

  if (job.source === 'external') {
    throw ApiError.badRequest('外部岗位请在合作招聘网站投递', {
      source: 'external',
      source_url: job.source_url || 'https://www.jyfw.org.cn/',
    });
  }

  const user = await UserModel.findById(req.user.id);
  if (!user.age || user.gender == null) {
    throw ApiError.badRequest('请先完善个人资料（年龄、性别、收入等）');
  }

  if (!userMatchesJobCriteria(user, job.target_criteria, {
    source: job.source,
    vulnerable_group_friendly: job.vulnerable_group_friendly,
  })) {
    throw ApiError.forbidden('您的画像不符合该岗位硬性匹配条件');
  }

  const existing = await ApplicationModel.findByJobAndUser(jobId, req.user.id);
  if (existing) throw ApiError.conflict('您已投递过该岗位');

  const resume = await ResumeModel.findByUserId(req.user.id);
  const { score, reasons } = scoreJobResume(job, resume);

  const application = await ApplicationModel.createApplication({
    job_id: jobId,
    user_id: req.user.id,
    resume_snapshot: resume?.content_json || req.body.resume_snapshot || null,
    match_score: score,
    match_reasons: reasons,
    cover_message: req.body.cover_message || null,
  });

  await JobModel.incrementApplicationsCount(jobId);

  res.status(201).json({
    success: true,
    message: '投递成功',
    data: { application },
  });
}

async function withdraw(req, res) {
  const applicationId = parseInt(req.params.applicationId, 10);
  const application = await ApplicationModel.deleteByIdForUser(applicationId, req.user.id);
  if (!application) {
    throw ApiError.notFound('投递记录不存在或无权撤销');
  }

  await JobModel.decrementApplicationsCount(application.job_id);

  res.json({ success: true, message: '已撤销投递' });
}

async function listApplicants(req, res) {
  const jobId = parseInt(req.params.id, 10);
  const job = await JobModel.findById(jobId);
  if (!job) throw ApiError.notFound('岗位不存在');
  assertJobOwner(job, req.user);

  const applications = sortApplicantsForCorporate(
    await ApplicationModel.listByJob(jobId),
    job
  );
  res.json({
    success: true,
    data: {
      applications,
      vulnerable_group_friendly: job.vulnerable_group_friendly,
      sort_note: job.vulnerable_group_friendly
        ? '弱势群体友好岗位：已识别弱势群体应聘者优先展示'
        : '按匹配分排序',
    },
  });
}

async function listMyApplications(req, res) {
  const applications = await ApplicationModel.listByUser(req.user.id);
  res.json({ success: true, data: { applications } });
}

async function updateApplicationStatus(req, res) {
  const applicationId = parseInt(req.params.applicationId, 10);
  const { status } = req.body;
  if (!['pending', 'reviewing', 'accepted', 'rejected'].includes(status)) {
    throw ApiError.badRequest('状态值不合法');
  }

  const application = await ApplicationModel.findById(applicationId);
  if (!application) throw ApiError.notFound('投递记录不存在');

  const job = await JobModel.findById(application.job_id);
  if (!job) throw ApiError.notFound('岗位不存在');
  assertJobOwner(job, req.user);

  const updated = await ApplicationModel.updateStatus(applicationId, status, req.user.id);
  res.json({ success: true, message: '状态已更新', data: { application: updated } });
}

module.exports = {
  apply,
  withdraw,
  listApplicants,
  listMyApplications,
  updateApplicationStatus,
};
