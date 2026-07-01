'use strict';

const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticate } = require('../middleware/auth.middleware');
const authController = require('../controllers/auth.controller');

const router = express.Router();

const profileFieldRules = [
  body('age').optional().isInt({ min: 16, max: 100 }).withMessage('年龄需在 16-100 之间'),
  body('gender').optional().isIn(['male', 'female', 'other', 'prefer_not_say']).withMessage('性别不合法'),
  body('disability_type')
    .optional()
    .isIn(['none', 'physical', 'visual', 'hearing', 'intellectual', 'mental', 'other'])
    .withMessage('残疾类型不合法'),
  body('career_gap_years').optional().isFloat({ min: 0, max: 50 }).withMessage('职业空窗年限需在 0-50 之间'),
  body('current_income').optional().isFloat({ min: 0 }).withMessage('当前月收入不合法'),
];

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
  ...profileFieldRules,
];

const loginRules = [
  body('identifier').trim().notEmpty().withMessage('请输入用户名或邮箱'),
  body('password').notEmpty().withMessage('请输入密码'),
];

const profileRules = [
  body('full_name').optional().isLength({ max: 100 }),
  body('phone').optional().isLength({ max: 30 }),
  ...profileFieldRules,
];

const changePasswordRules = [
  body('current_password').notEmpty().withMessage('请输入当前密码'),
  body('new_password').isLength({ min: 6, max: 64 }).withMessage('新密码长度需在 6-64 位之间'),
];

router.get('/group-types', asyncHandler(authController.listGroupTypes));
router.post('/register', registerRules, validate, asyncHandler(authController.register));
router.post('/login', loginRules, validate, asyncHandler(authController.login));
router.post('/change-password', authenticate, changePasswordRules, validate, asyncHandler(authController.changePassword));
router.get('/me', authenticate, asyncHandler(authController.me));
router.patch('/profile', authenticate, profileRules, validate, asyncHandler(authController.updateProfile));

module.exports = router;
