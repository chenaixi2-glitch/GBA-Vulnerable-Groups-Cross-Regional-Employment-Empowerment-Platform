'use strict';

const { verifyToken } = require('../utils/jwt');
const ApiError = require('../utils/ApiError');

/**
 * 校验请求头中的 Bearer Token，通过后把用户信息挂到 req.user。
 */
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(ApiError.unauthorized('缺少 Authorization: Bearer <token>'));
  }

  try {
    const decoded = verifyToken(token);
    req.user = { id: decoded.sub, username: decoded.username, role: decoded.role };
    return next();
  } catch (err) {
    return next(ApiError.unauthorized('Token 无效或已过期'));
  }
}

/**
 * 角色校验中间件。用法：requireRole('admin')
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(ApiError.forbidden('没有访问该资源的权限'));
    }
    return next();
  };
}

module.exports = { authenticate, requireRole };
