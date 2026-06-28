'use strict';

const express = require('express');
const { body, query: queryValidator } = require('express-validator');
const validate = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const jobsController = require('../controllers/jobs.controller');

const router = express.Router();

const listRules = [
  queryValidator('page').optional().isInt({ min: 1 }),
  queryValidator('pageSize').optional().isInt({ min: 1, max: 100 }),
  queryValidator('status').optional().isIn(['all', 'active', 'interviewing', 'closed']),
  queryValidator('source').optional().isIn(['internal', 'external']),
  queryValidator('search').optional().isLength({ max: 100 }),
];

const createRules = [
  body('title').trim().notEmpty().isLength({ max: 200 }),
  body('department').optional().isLength({ max: 100 }),
  body('location').optional().isLength({ max: 100 }),
  body('post_date').optional().isISO8601(),
  body('description').optional().isLength({ max: 10000 }),
];

const statusRules = [
  body('status').isIn(['active', 'interviewing', 'closed']),
];

router.get('/', listRules, validate, asyncHandler(jobsController.list));
router.get('/:id', asyncHandler(jobsController.getOne));

router.post('/', authenticate, requireRole('corporate', 'admin'), createRules, validate, asyncHandler(jobsController.create));
router.put('/:id', authenticate, requireRole('corporate', 'admin'), asyncHandler(jobsController.update));
router.patch('/:id/status', authenticate, requireRole('corporate', 'admin'), statusRules, validate, asyncHandler(jobsController.updateStatus));
router.post('/:id/clone', authenticate, requireRole('corporate', 'admin'), asyncHandler(jobsController.clone));
router.delete('/:id', authenticate, requireRole('corporate', 'admin'), asyncHandler(jobsController.remove));

module.exports = router;
