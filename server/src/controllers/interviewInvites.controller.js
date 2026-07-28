'use strict';

const JobModel = require('../models/job.model');
const ApplicationModel = require('../models/application.model');
const InterviewInviteModel = require('../models/interviewInvite.model');
const CompanyOrgModel = require('../models/companyOrg.model');
const ApiError = require('../utils/ApiError');

function assertJobOwner(job, user) {
  if (user.role === 'admin') return;
  if (Number(job.company_user_id) !== Number(user.id)) {
    throw ApiError.forbidden('You do not have permission for this job.');
  }
}

function normalizeCustomQuestions(raw) {
  if (Array.isArray(raw)) {
    return raw.map((q) => String(q || '').trim()).filter(Boolean).slice(0, 30);
  }
  if (typeof raw === 'string') {
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 30);
  }
  return [];
}

/** 邀约配置一律继承岗位，不再按人单独选模式 */
function snapshotInterviewConfigFromJob(job) {
  const mode = job.interview_format || 'ai_only';
  if (!['ai_only', 'partial_custom', 'full_custom', 'human'].includes(mode)) {
    throw ApiError.badRequest('Invalid job interview_format. Please edit the job posting.');
  }
  const customQuestions = normalizeCustomQuestions(job.interview_custom_questions);
  if ((mode === 'partial_custom' || mode === 'full_custom') && !customQuestions.length) {
    throw ApiError.badRequest('This job uses custom questions, but none are configured. Edit the job posting first.');
  }
  if (mode === 'human') {
    const link = (job.meeting_link || '').trim();
    if (!link) {
      throw ApiError.badRequest('This job uses live interviews, but no meeting link is set. Edit the job posting first.');
    }
  }
  return {
    question_mode: mode,
    custom_questions: mode === 'ai_only' || mode === 'human' ? [] : customQuestions,
    meeting_link: mode === 'human' ? (job.meeting_link || '').trim() : null,
    meeting_instructions: mode === 'human' ? (job.meeting_instructions || null) : null,
    program_version: 'quick',
  };
}

async function createInvite(req, res) {
  const applicationId = parseInt(req.params.applicationId, 10);
  const application = await ApplicationModel.findById(applicationId);
  if (!application) throw ApiError.notFound('Application not found.');

  const job = await JobModel.findById(application.job_id);
  if (!job) throw ApiError.notFound('Job not found.');
  assertJobOwner(job, req.user);

  const existing = await InterviewInviteModel.findActiveByApplication(applicationId, req.user.id);
  if (existing) {
    return res.json({
      success: true,
      message: 'Interview invitation already active.',
      data: { invite: existing, reused: true },
    });
  }

  const orgId = job.company_org_id || (await CompanyOrgModel.findOrgIdByUserId(req.user.id));
  const qcfg = snapshotInterviewConfigFromJob(job);

  const invite = await InterviewInviteModel.createInvite({
    application_id: applicationId,
    job_id: application.job_id,
    candidate_user_id: application.user_id,
    invited_by_user_id: req.user.id,
    company_org_id: orgId,
    program_version: qcfg.program_version,
    question_mode: qcfg.question_mode,
    custom_questions: qcfg.custom_questions,
    meeting_link: qcfg.meeting_link,
    meeting_instructions: qcfg.meeting_instructions,
  });

  if (application.status === 'pending') {
    await ApplicationModel.updateStatus(applicationId, 'reviewing', req.user.id);
  }

  if (job.status === 'active') {
    await JobModel.updateStatus(job.id, 'interviewing');
  }

  res.status(201).json({
    success: true,
    message: qcfg.question_mode === 'human'
      ? 'Live interview invitation sent (meeting link).'
      : 'AI assessment interview invitation sent.',
    data: { invite, reused: false },
  });
}

async function createBatchInvites(req, res) {
  const jobId = parseInt(req.params.id, 10);
  const job = await JobModel.findById(jobId);
  if (!job) throw ApiError.notFound('Job not found.');
  assertJobOwner(job, req.user);

  const ids = Array.isArray(req.body.application_ids) ? req.body.application_ids : [];
  if (!ids.length) throw ApiError.badRequest('Please provide application_ids.');

  const qcfg = snapshotInterviewConfigFromJob(job);
  const orgId = job.company_org_id || (await CompanyOrgModel.findOrgIdByUserId(req.user.id));
  const created = [];
  const reused = [];

  for (const rawId of ids) {
    const applicationId = parseInt(rawId, 10);
    const application = await ApplicationModel.findById(applicationId);
    if (!application || application.job_id !== jobId) continue;

    const existing = await InterviewInviteModel.findActiveByApplication(applicationId, req.user.id);
    if (existing) {
      reused.push(existing);
      continue;
    }

    const invite = await InterviewInviteModel.createInvite({
      application_id: applicationId,
      job_id: jobId,
      candidate_user_id: application.user_id,
      invited_by_user_id: req.user.id,
      company_org_id: orgId,
      program_version: qcfg.program_version,
      question_mode: qcfg.question_mode,
      custom_questions: qcfg.custom_questions,
      meeting_link: qcfg.meeting_link,
      meeting_instructions: qcfg.meeting_instructions,
    });
    created.push(invite);

    if (application.status === 'pending') {
      await ApplicationModel.updateStatus(applicationId, 'reviewing', req.user.id);
    }
  }

  if ((created.length || reused.length) && job.status === 'active') {
    await JobModel.updateStatus(job.id, 'interviewing');
  }

  res.status(201).json({
    success: true,
    message: `Sent ${created.length} invitation(s).`,
    data: { created, reused },
  });
}

/** 当前登录企业用户自己的看板（与同事隔离） */
async function listMyBoard(req, res) {
  const status = req.query.status || 'all';
  const invites = await InterviewInviteModel.listBoardForInviter(req.user.id, { status });
  const columns = {
    invited: invites.filter((i) => i.status === 'invited'),
    in_progress: invites.filter((i) => i.status === 'in_progress'),
    completed: invites.filter((i) => i.status === 'completed'),
  };
  res.json({
    success: true,
    data: {
      invites,
      columns,
      scope: 'invited_by_me',
      inviter_user_id: req.user.id,
    },
  });
}

async function listMyInvites(req, res) {
  const invites = await InterviewInviteModel.listForCandidate(req.user.id);
  res.json({ success: true, data: { invites } });
}

async function getByToken(req, res) {
  const invite = await InterviewInviteModel.findByToken(req.params.token);
  if (!invite) throw ApiError.notFound('Interview invitation not found.');
  if (req.user.role === 'individual' || req.user.role === 'admin') {
    if (Number(invite.candidate_user_id) !== Number(req.user.id) && req.user.role !== 'admin') {
      throw ApiError.forbidden('This interview invitation is not for your account.');
    }
  } else if (req.user.role === 'corporate') {
    if (Number(invite.invited_by_user_id) !== Number(req.user.id)) {
      throw ApiError.forbidden('You can only view invitations you sent.');
    }
  }
  res.json({ success: true, data: { invite } });
}

async function startInvite(req, res) {
  const invite = await InterviewInviteModel.findByToken(req.params.token);
  if (!invite) throw ApiError.notFound('Interview invitation not found.');
  if (Number(invite.candidate_user_id) !== Number(req.user.id) && req.user.role !== 'admin') {
    throw ApiError.forbidden('This interview invitation is not for your account.');
  }
  if (invite.status === 'cancelled') {
    throw ApiError.badRequest('This invitation was cancelled.');
  }
  if (invite.status === 'completed') {
    throw ApiError.badRequest('This assessment interview is already completed.');
  }

  const updated = await InterviewInviteModel.markInProgress(
    invite.id,
    req.body && req.body.ai_session_id
  );
  res.json({ success: true, message: 'Interview started.', data: { invite: updated } });
}

async function completeInvite(req, res) {
  const invite = await InterviewInviteModel.findByToken(req.params.token);
  if (!invite) throw ApiError.notFound('Interview invitation not found.');
  if (Number(invite.candidate_user_id) !== Number(req.user.id) && req.user.role !== 'admin') {
    throw ApiError.forbidden('This interview invitation is not for your account.');
  }
  if (invite.status === 'cancelled') {
    throw ApiError.badRequest('This invitation was cancelled.');
  }

  const overall = req.body && req.body.overall_score;
  if (overall == null || Number.isNaN(Number(overall))) {
    throw ApiError.badRequest('overall_score is required.');
  }

  const updated = await InterviewInviteModel.markCompleted(invite.id, {
    overall_score: Math.max(0, Math.min(100, Math.round(Number(overall)))),
    category_scores: (req.body && req.body.category_scores) || null,
    debrief_summary: (req.body && req.body.debrief_summary) || null,
    ai_session_id: (req.body && req.body.ai_session_id) || null,
    ai_record_id: (req.body && req.body.ai_record_id) || null,
  });

  res.json({ success: true, message: 'Assessment score recorded.', data: { invite: updated } });
}

module.exports = {
  createInvite,
  createBatchInvites,
  listMyBoard,
  listMyInvites,
  getByToken,
  startInvite,
  completeInvite,
};
