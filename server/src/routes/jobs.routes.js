'use strict';

const express = require('express');
const { body, query: queryValidator } = require('express-validator');
const validate = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const jobsController = require('../controllers/jobs.controller');
const applicationsController = require('../controllers/applications.controller');
const interviewInvitesController = require('../controllers/interviewInvites.controller');

const router = express.Router();

const listRules = [
  queryValidator('page').optional().isInt({ min: 1 }),
  queryValidator('pageSize').optional().isInt({ min: 1, max: 100 }),
  queryValidator('status').optional().isIn(['all', 'active', 'interviewing', 'closed']),
  queryValidator('source').optional().isIn(['internal', 'external']),
  queryValidator('search').optional().isLength({ max: 100 }),
  queryValidator('mine').optional().isIn(['true', 'false']),
  queryValidator('friendly').optional().isIn(['true', 'false', '1', '0']),
];

const targetCriteriaRules = [
  body('target_criteria').isObject().withMessage('请提供岗位目标条件'),
  body('target_criteria.age_range').optional().isIn(['any', '45_plus', '30_below']),
  body('target_criteria.gender').optional().isIn(['any', 'male', 'female', 'other']),
  body('target_criteria.disability').optional().isIn(['any', 'open']),
  body('target_criteria.disability_types').optional().isArray(),
  body('target_criteria.disability_types.*')
    .optional()
    .isIn(['physical', 'visual', 'hearing', 'intellectual', 'mental', 'other']),
  body('target_criteria.career_gap').optional().isIn(['any', 'yes', 'no']),
  body('target_criteria.prioritize_vulnerable').optional({ nullable: true }),
];

const createRules = [
  body('title').trim().notEmpty().isLength({ max: 200 }),
  body('department').optional().isLength({ max: 100 }),
  body('location').optional().isLength({ max: 100 }),
  body('post_date').optional().isISO8601(),
  body('salary_min').notEmpty().withMessage('请填写最低月薪').isFloat({ min: 1 }),
  body('salary_max').notEmpty().withMessage('请填写最高月薪').isFloat({ min: 1 }),
  ...targetCriteriaRules,
  body('skills').optional().isArray(),
];

const statusRules = [
  body('status').isIn(['active', 'interviewing', 'closed']),
];

const applicationStatusRules = [
  body('status').isIn(['pending', 'reviewing', 'accepted', 'rejected']),
];

const batchInviteRules = [
  body('application_ids').isArray({ min: 1 }),
  body('application_ids.*').isInt({ min: 1 }),
  body('program_version').optional().isIn(['quick', 'full', 'specialized']),
];

const inviteRules = [
  body('program_version').optional().isIn(['quick', 'full', 'specialized']),
];

const optionalAuth = (req, res, next) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    return authenticate(req, res, next);
  }
  return next();
};

router.get('/matched', authenticate, requireRole('individual', 'admin'), asyncHandler(jobsController.listMatched));
router.get('/applications/me', authenticate, requireRole('individual', 'admin'), asyncHandler(applicationsController.listMyApplications));
router.delete('/applications/:applicationId', authenticate, requireRole('individual', 'admin'), asyncHandler(applicationsController.withdraw));
router.patch('/applications/:applicationId/status', authenticate, requireRole('corporate', 'admin'), applicationStatusRules, validate, asyncHandler(applicationsController.updateApplicationStatus));
router.post(
  '/applications/:applicationId/interview-invite',
  authenticate,
  requireRole('corporate', 'admin'),
  inviteRules,
  validate,
  asyncHandler(interviewInvitesController.createInvite)
);

router.get('/', optionalAuth, listRules, validate, asyncHandler(jobsController.list));
router.get('/:id/applications', authenticate, requireRole('corporate', 'admin'), asyncHandler(applicationsController.listApplicants));
router.post(
  '/:id/interview-invites',
  authenticate,
  requireRole('corporate', 'admin'),
  batchInviteRules,
  validate,
  asyncHandler(interviewInvitesController.createBatchInvites)
);
router.post('/:id/external-interest', authenticate, requireRole('individual', 'admin'), asyncHandler(jobsController.trackExternalInterest));
router.post('/:id/apply', authenticate, requireRole('individual', 'admin'), asyncHandler(applicationsController.apply));
router.get('/:id', asyncHandler(jobsController.getOne));

router.post('/', authenticate, requireRole('corporate', 'admin'), createRules, validate, asyncHandler(jobsController.create));
router.put('/:id', authenticate, requireRole('corporate', 'admin'), asyncHandler(jobsController.update));
router.patch('/:id/status', authenticate, requireRole('corporate', 'admin'), statusRules, validate, asyncHandler(jobsController.updateStatus));
router.post('/:id/clone', authenticate, requireRole('corporate', 'admin'), asyncHandler(jobsController.clone));
router.delete('/:id', authenticate, requireRole('corporate', 'admin'), asyncHandler(jobsController.remove));

module.exports = router;
