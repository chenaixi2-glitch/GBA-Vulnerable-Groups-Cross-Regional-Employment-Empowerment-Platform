'use strict';

const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const companyController = require('../controllers/company.controller');

const router = express.Router();

const profileRules = [
  body('company_name').trim().notEmpty().isLength({ max: 200 }),
  body('industry').optional().isLength({ max: 100 }),
  body('description').optional().isLength({ max: 5000 }),
  body('address').optional().isLength({ max: 300 }),
  body('contact_email').optional().isEmail(),
  body('contact_phone').optional().isLength({ max: 30 }),
  body('website').optional().isLength({ max: 300 }),
  body('license_no').optional().isLength({ max: 100 }),
  body('employee_count').optional().isLength({ max: 50 }),
  body('inclusivity_info').optional().isLength({ max: 3000 }),
];

router.get('/friendly', asyncHandler(companyController.listFriendly));
router.get('/team', authenticate, requireRole('corporate', 'admin'), asyncHandler(companyController.getTeam));
router.get('/profile', authenticate, requireRole('corporate', 'admin'), asyncHandler(companyController.getProfile));
router.put('/profile', authenticate, requireRole('corporate', 'admin'), profileRules, validate, asyncHandler(companyController.upsertProfile));

module.exports = router;
