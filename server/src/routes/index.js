'use strict';

const express = require('express');
const authRoutes = require('./auth.routes');
const jobsRoutes = require('./jobs.routes');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ success: true, message: 'GBA Platform API', version: '1.0.0' });
});

router.use('/auth', authRoutes);
router.use('/jobs', jobsRoutes);

module.exports = router;
