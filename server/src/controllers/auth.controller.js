'use strict';

const bcrypt = require('bcryptjs');
const UserModel = require('../models/user.model');
const CompanyModel = require('../models/company.model');
const CompanyOrgModel = require('../models/companyOrg.model');
const { signToken } = require('../utils/jwt');
const ApiError = require('../utils/ApiError');
const {
  GROUP_TYPES,
  GENDER_OPTIONS,
  DISABILITY_TYPES,
  MATCH_THRESHOLDS,
  inferGroupTypes,
} = require('../constants/groupTypes');

const SALT_ROUNDS = 10;

function toAuthResponse(user) {
  const token = signToken({ sub: String(user.id), username: user.username, role: user.role });
  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      full_name: user.full_name,
      phone: user.phone,
      age: user.age,
      gender: user.gender,
      disability_type: user.disability_type,
      career_gap_years: user.career_gap_years,
      current_income: user.current_income,
      group_types: user.group_types || [],
    },
  };
}

function normalizeIndividualProfile(body) {
  return {
    age: body.age != null ? parseInt(body.age, 10) : null,
    gender: body.gender || null,
    disability_type: body.disability_type || 'none',
    career_gap_years: body.career_gap_years != null ? Number(body.career_gap_years) : 0,
    current_income: body.current_income != null ? Number(body.current_income) : null,
  };
}

function assertIndividualProfileComplete(profile) {
  if (!profile.age || profile.age < 16 || profile.age > 100) {
    throw ApiError.badRequest('请填写有效年龄（16-100）');
  }
  if (!profile.gender || !GENDER_OPTIONS[profile.gender]) {
    throw ApiError.badRequest('请选择性别');
  }
  if (!DISABILITY_TYPES[profile.disability_type]) {
    throw ApiError.badRequest('残疾类型不合法');
  }
  if (profile.career_gap_years < 0 || profile.career_gap_years > 50) {
    throw ApiError.badRequest('职业空窗年限需在 0-50 年之间');
  }
  if (profile.current_income == null || profile.current_income < 0) {
    throw ApiError.badRequest('请填写当前月收入');
  }
}

/**
 * POST /api/auth/register
 */
async function register(req, res) {
  const {
    username,
    email,
    password,
    role,
    full_name: fullName,
    phone,
    age,
    gender,
    disability_type: disabilityType,
    career_gap_years: careerGapYears,
    current_income: currentIncome,
    org_invite_code: orgInviteCode,
    hr_title: hrTitle,
  } = req.body;

  const existing = await UserModel.existsByUsernameOrEmail(username, email);
  if (existing) {
    const field = existing.username === username ? '用户名' : '邮箱';
    throw ApiError.conflict(`${field}已被注册`);
  }

  const userRole = role || 'individual';
  let profile = null;
  let groupTypes = [];

  if (userRole === 'individual') {
    profile = normalizeIndividualProfile({
      age,
      gender,
      disability_type: disabilityType,
      career_gap_years: careerGapYears,
      current_income: currentIncome,
    });
    assertIndividualProfileComplete(profile);
    groupTypes = inferGroupTypes(profile);
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await UserModel.create({
    username,
    email,
    passwordHash,
    role: userRole,
    fullName: fullName || null,
    phone: phone || null,
    age: userRole === 'individual' ? profile.age : null,
    gender: userRole === 'individual' ? profile.gender : null,
    disabilityType: userRole === 'individual' ? profile.disability_type : null,
    careerGapYears: userRole === 'individual' ? profile.career_gap_years : null,
    currentIncome: userRole === 'individual' ? profile.current_income : null,
    groupTypes: userRole === 'individual' ? groupTypes : null,
  });

  if (userRole === 'corporate') {
    const stubName = (fullName && String(fullName).trim()) || username || String(email).split('@')[0];
    await CompanyModel.upsert(user.id, {
      company_name: stubName,
      contact_email: email,
    });

    if (orgInviteCode && String(orgInviteCode).trim()) {
      const joined = await CompanyOrgModel.joinOrgByInviteCode(
        user.id,
        orgInviteCode,
        hrTitle || 'Recruiter'
      );
      if (!joined) {
        throw ApiError.badRequest('企业邀请码无效，请向 HR 负责人索取');
      }
      if (joined.error === 'already_in_other_org') {
        throw ApiError.conflict('该账号已加入其他企业组织');
      }
    } else {
      await CompanyOrgModel.createOrgForUser(user.id, stubName);
    }
  }

  res.status(201).json({ success: true, message: '注册成功', data: toAuthResponse(user) });
}

/**
 * POST /api/auth/login
 */
function normalizeExpectedRole(value) {
  if (!value) return null;
  if (value === 'corporate' || value === 'company') return 'corporate';
  if (value === 'individual' || value === 'person') return 'individual';
  return null;
}

async function login(req, res) {
  const { identifier, password, expected_role: expectedRoleRaw } = req.body;
  const expectedRole = normalizeExpectedRole(expectedRoleRaw);

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

  if (expectedRole && user.role !== 'admin' && user.role !== expectedRole) {
    const message =
      expectedRole === 'corporate'
        ? '该账号为个人账号，请前往个人端登录'
        : '该账号为企业账号，请前往企业端登录';
    throw ApiError.forbidden(message);
  }

  await UserModel.updateLastLogin(user.id);
  const safeUser = await UserModel.findById(user.id);

  res.json({ success: true, message: '登录成功', data: toAuthResponse(safeUser) });
}

/**
 * GET /api/auth/me
 */
async function me(req, res) {
  const user = await UserModel.findById(req.user.id);
  if (!user) {
    throw ApiError.notFound('用户不存在');
  }
  res.json({ success: true, data: { user } });
}

/**
 * PATCH /api/auth/profile
 */
async function updateProfile(req, res) {
  const user = await UserModel.findById(req.user.id);
  if (!user) throw ApiError.notFound('用户不存在');

  const {
    full_name: fullName,
    phone,
    age,
    gender,
    disability_type: disabilityType,
    career_gap_years: careerGapYears,
    current_income: currentIncome,
  } = req.body;

  const updates = { fullName, phone };

  if (user.role === 'individual') {
    const profile = normalizeIndividualProfile({
      age: age !== undefined ? age : user.age,
      gender: gender !== undefined ? gender : user.gender,
      disability_type: disabilityType !== undefined ? disabilityType : user.disability_type,
      career_gap_years: careerGapYears !== undefined ? careerGapYears : user.career_gap_years,
      current_income: currentIncome !== undefined ? currentIncome : user.current_income,
    });

    if (
      age !== undefined ||
      gender !== undefined ||
      disabilityType !== undefined ||
      careerGapYears !== undefined ||
      currentIncome !== undefined
    ) {
      assertIndividualProfileComplete(profile);
      updates.age = profile.age;
      updates.gender = profile.gender;
      updates.disabilityType = profile.disability_type;
      updates.careerGapYears = profile.career_gap_years;
      updates.currentIncome = profile.current_income;
      updates.groupTypes = inferGroupTypes(profile);
    }
  }

  const updated = await UserModel.updateProfile(req.user.id, updates);

  res.json({ success: true, message: '资料已更新', data: { user: updated } });
}

/**
 * POST /api/auth/change-password
 */
async function changePassword(req, res) {
  const { current_password: currentPassword, new_password: newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    throw ApiError.badRequest('请填写当前密码和新密码');
  }
  if (String(newPassword).length < 6) {
    throw ApiError.badRequest('新密码长度需在 6-64 位之间');
  }
  if (currentPassword === newPassword) {
    throw ApiError.badRequest('新密码不能与当前密码相同');
  }

  const user = await UserModel.findPasswordHashById(req.user.id);
  if (!user) {
    throw ApiError.notFound('用户不存在');
  }

  const ok = await bcrypt.compare(currentPassword, user.password_hash);
  if (!ok) {
    throw ApiError.unauthorized('当前密码不正确');
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await UserModel.updatePassword(user.id, passwordHash);

  res.json({ success: true, message: '密码已修改' });
}

/**
 * GET /api/auth/group-types
 */
function listGroupTypes(req, res) {
  res.json({
    success: true,
    data: {
      group_types: GROUP_TYPES,
      gender_options: GENDER_OPTIONS,
      disability_types: DISABILITY_TYPES,
      match_thresholds: MATCH_THRESHOLDS,
    },
  });
}

module.exports = {
  register,
  login,
  me,
  updateProfile,
  changePassword,
  listGroupTypes,
};
