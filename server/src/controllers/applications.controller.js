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
    throw ApiError.forbidden('You do not have permission to view applicants for this job.');
  }
}

async function apply(req, res) {
  const jobId = parseInt(req.params.id, 10);
  const job = await JobModel.findById(jobId);
  if (!job) throw ApiError.notFound('Job not found.');
  if (job.status !== 'active') throw ApiError.badRequest('This job is no longer open for applications.');

  if (job.source === 'external') {
    throw ApiError.badRequest('Please apply for external jobs on the partner recruitment site.', {
      source: 'external',
      source_url: job.source_url || 'https://www.jyfw.org.cn/',
    });
  }

  const user = await UserModel.findById(req.user.id);
  if (!user.age || user.gender == null) {
    throw ApiError.badRequest('Please complete your profile (age, gender, income, etc.) first.');
  }

  if (!userMatchesJobCriteria(user, job.target_criteria, {
    source: job.source,
    vulnerable_group_friendly: job.vulnerable_group_friendly,
  })) {
    throw ApiError.forbidden('Your profile does not meet this job\'s required targeting criteria.');
  }

  const existing = await ApplicationModel.findByJobAndUser(jobId, req.user.id);
  if (existing) throw ApiError.conflict('You have already applied to this job.');

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
    message: 'Application submitted successfully.',
    data: { application },
  });
}

async function withdraw(req, res) {
  const applicationId = parseInt(req.params.applicationId, 10);
  const application = await ApplicationModel.deleteByIdForUser(applicationId, req.user.id);
  if (!application) {
    throw ApiError.notFound('Application not found or you cannot withdraw it.');
  }

  await JobModel.decrementApplicationsCount(application.job_id);

  res.json({ success: true, message: 'Application withdrawn.' });
}

async function listApplicants(req, res) {
  const jobId = parseInt(req.params.id, 10);
  const job = await JobModel.findById(jobId);
  if (!job) throw ApiError.notFound('Job not found.');
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
        ? 'Vulnerable-group friendly job: identified vulnerable applicants are listed first'
        : 'Sorted by match score',
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
    throw ApiError.badRequest('Invalid status value.');
  }

  const application = await ApplicationModel.findById(applicationId);
  if (!application) throw ApiError.notFound('Application not found.');

  const job = await JobModel.findById(application.job_id);
  if (!job) throw ApiError.notFound('Job not found.');
  assertJobOwner(job, req.user);

  const updated = await ApplicationModel.updateStatus(applicationId, status, req.user.id);
  res.json({ success: true, message: 'Status updated.', data: { application: updated } });
}

module.exports = {
  apply,
  withdraw,
  listApplicants,
  listMyApplications,
  updateApplicationStatus,
};
