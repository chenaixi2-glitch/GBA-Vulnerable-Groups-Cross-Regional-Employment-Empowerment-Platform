'use strict';

const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const statsController = require('../controllers/stats.controller');

const router = express.Router();

router.get('/home', asyncHandler(statsController.home));
router.get('/corporate', authenticate, requireRole('corporate', 'admin'), asyncHandler(statsController.corporate));
router.get('/corporate/team', authenticate, requireRole('corporate', 'admin'), asyncHandler(statsController.corporateTeam));
router.get('/individual', authenticate, requireRole('individual', 'admin'), asyncHandler(statsController.individual));

module.exports = router;
