'use strict';

const bcrypt = require('bcryptjs');
const UserModel = require('../models/user.model');
const { signToken } = require('../utils/jwt');
const ApiError = require('../utils/ApiError');

const SALT_ROUNDS = 10;

function toAuthResponse(user) {
  const token = signToken({ sub: user.id, username: user.username, role: user.role });
  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      full_name: user.full_name,
      phone: user.phone,
    },
  };
}

/**
 * POST /api/auth/register
 */
async function register(req, res) {
  const { username, email, password, role, full_name: fullName, phone } = req.body;

  const existing = await UserModel.existsByUsernameOrEmail(username, email);
  if (existing) {
    const field = existing.username === username ? '用户名' : '邮箱';
    throw ApiError.conflict(`${field}已被注册`);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await UserModel.create({
    username,
    email,
    passwordHash,
    role: role || 'individual',
    fullName: fullName || null,
    phone: phone || null,
  });

  res.status(201).json({ success: true, message: '注册成功', data: toAuthResponse(user) });
}

/**
 * POST /api/auth/login
 * 支持用 username 或 email 登录（字段名 identifier）
 */
async function login(req, res) {
  const { identifier, password } = req.body;

  const user = await UserModel.findByIdentifier(identifier);
  if (!user) {
    throw ApiError.unauthorized('账号或密码错误');
  }
  if (user.status !== 1) {
    throw ApiError.forbidden('账号已被禁用');
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    throw ApiError.unauthorized('账号或密码错误');
  }

  await UserModel.updateLastLogin(user.id);

  res.json({ success: true, message: '登录成功', data: toAuthResponse(user) });
}

/**
 * GET /api/auth/me  （需要登录）
 */
async function me(req, res) {
  const user = await UserModel.findById(req.user.id);
  if (!user) {
    throw ApiError.notFound('用户不存在');
  }
  res.json({ success: true, data: { user } });
}

module.exports = { register, login, me };
