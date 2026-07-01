'use strict';

const express = require('express');
const { body, param } = require('express-validator');
const validate = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate } = require('../middleware/auth.middleware');
const legalAidController = require('../controllers/legalAid.controller');

const router = express.Router();

const createRules = [
  body('category').trim().notEmpty(),
  body('title').trim().isLength({ min: 1, max: 200 }),
  body('description').trim().isLength({ min: 10, max: 10000 }),
  body('contact_phone').optional().isLength({ max: 30 }),
  body('contact_email').optional().isEmail(),
  body('prefer_platform').optional().isBoolean(),
  body('attachments').optional().isArray(),
];

const acceptRules = [
  param('id').isInt({ min: 1 }),
  body('helper_role').optional().isIn(['lawyer', 'volunteer', 'other']),
  body('note').optional().isLength({ max: 500 }),
  body('contact').optional().isLength({ max: 120 }),
];

router.get('/meta', asyncHandler(legalAidController.getMeta));

router.post(
  '/requests',
  authenticate,
  createRules,
  validate,
  asyncHandler(legalAidController.createRequest)
);
router.get('/requests/mine', authenticate, asyncHandler(legalAidController.listMine));
router.get('/requests/mine/completed', authenticate, asyncHandler(legalAidController.listMineCompleted));
router.get('/requests/assigned', authenticate, asyncHandler(legalAidController.listAssigned));
router.get('/requests/open', authenticate, asyncHandler(legalAidController.listOpen));
router.get('/requests/:id', authenticate, asyncHandler(legalAidController.getOne));
router.post(
  '/requests/:id/accept',
  authenticate,
  acceptRules,
  validate,
  asyncHandler(legalAidController.acceptRequest)
);
router.post(
  '/requests/:id/platform-assist',
  authenticate,
  asyncHandler(legalAidController.platformAssist)
);
router.patch(
  '/requests/:id/status',
  authenticate,
  asyncHandler(legalAidController.updateStatus)
);

module.exports = router;
