'use strict';

const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate } = require('../middleware/auth.middleware');
const authController = require('../controllers/auth.controller');

const router = express.Router();

const registerRules = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('用户名长度需在 3-50 个字符之间')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('用户名只能包含字母、数字、下划线'),
  body('email').trim().isEmail().withMessage('邮箱格式不正确').normalizeEmail(),
  body('password').isLength({ min: 6, max: 64 }).withMessage('密码长度需在 6-64 位之间'),
  body('role').optional().isIn(['individual', 'corporate', 'admin']).withMessage('角色不合法'),
  body('full_name').optional().isLength({ max: 100 }),
  body('phone').optional().isLength({ max: 30 }),
];

const loginRules = [
  body('identifier').trim().notEmpty().withMessage('请输入用户名或邮箱'),
  body('password').notEmpty().withMessage('请输入密码'),
];

router.post('/register', registerRules, validate, asyncHandler(authController.register));
router.post('/login', loginRules, validate, asyncHandler(authController.login));
router.get('/me', authenticate, asyncHandler(authController.me));

module.exports = router;
