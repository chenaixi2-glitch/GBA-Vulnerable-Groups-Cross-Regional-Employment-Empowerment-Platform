'use strict';

const express = require('express');
const authRoutes = require('./auth.routes');
const jobsRoutes = require('./jobs.routes');
const companyRoutes = require('./company.routes');
const resumesRoutes = require('./resumes.routes');
const donationsRoutes = require('./donations.routes');
const legalAidRoutes = require('./legalAid.routes');
const statsRoutes = require('./stats.routes');
const interviewInvitesRoutes = require('./interviewInvites.routes');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ success: true, message: 'GBA Platform API', version: '1.0.0' });
});

router.use('/auth', authRoutes);
router.use('/jobs', jobsRoutes);
router.use('/company', companyRoutes);
router.use('/resumes', resumesRoutes);
router.use('/donations', donationsRoutes);
router.use('/legal-aid', legalAidRoutes);
router.use('/stats', statsRoutes);
router.use('/interview-invites', interviewInvitesRoutes);

module.exports = router;
