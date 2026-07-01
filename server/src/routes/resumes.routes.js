'use strict';

const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const resumesController = require('../controllers/resumes.controller');

const router = express.Router();

router.get('/me', authenticate, requireRole('individual', 'admin'), asyncHandler(resumesController.getMyResume));
router.put('/me', authenticate, requireRole('individual', 'admin'), asyncHandler(resumesController.saveMyResume));

module.exports = router;
