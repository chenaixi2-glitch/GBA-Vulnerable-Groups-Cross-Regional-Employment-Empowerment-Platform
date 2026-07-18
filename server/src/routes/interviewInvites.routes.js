'use strict';

const express = require('express');
const { body, query: queryValidator } = require('express-validator');
const validate = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const interviewInvitesController = require('../controllers/interviewInvites.controller');

const router = express.Router();

const boardRules = [
  queryValidator('status').optional().isIn(['all', 'invited', 'in_progress', 'completed', 'cancelled']),
];

const completeRules = [
  body('overall_score').isFloat({ min: 0, max: 100 }),
  body('category_scores').optional({ nullable: true }),
  body('debrief_summary').optional({ nullable: true }).isLength({ max: 4000 }),
  body('ai_session_id').optional({ nullable: true }).isLength({ max: 80 }),
  body('ai_record_id').optional({ nullable: true }).isLength({ max: 80 }),
];

router.get(
  '/board',
  authenticate,
  requireRole('corporate', 'admin'),
  boardRules,
  validate,
  asyncHandler(interviewInvitesController.listMyBoard)
);

router.get(
  '/me',
  authenticate,
  requireRole('individual', 'admin'),
  asyncHandler(interviewInvitesController.listMyInvites)
);

router.get(
  '/token/:token',
  authenticate,
  requireRole('individual', 'corporate', 'admin'),
  asyncHandler(interviewInvitesController.getByToken)
);

router.post(
  '/token/:token/start',
  authenticate,
  requireRole('individual', 'admin'),
  asyncHandler(interviewInvitesController.startInvite)
);

router.post(
  '/token/:token/complete',
  authenticate,
  requireRole('individual', 'admin'),
  completeRules,
  validate,
  asyncHandler(interviewInvitesController.completeInvite)
);

module.exports = router;
