'use strict';

const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate } = require('../middleware/auth.middleware');
const donationsController = require('../controllers/donations.controller');

const router = express.Router();

const donationRules = [
  body('amount').isFloat({ min: 0.01, max: 99999999 }).withMessage('捐款金额须大于 0'),
  body('message').optional().isLength({ max: 500 }),
];

router.get('/stats', asyncHandler(donationsController.getStats));
router.get('/legal-services', asyncHandler(donationsController.getLegalServices));

router.get('/access', authenticate, asyncHandler(donationsController.getAccess));
router.get('/me', authenticate, asyncHandler(donationsController.listMine));
router.post('/', authenticate, donationRules, validate, asyncHandler(donationsController.createDonation));

module.exports = router;
