'use strict';

// 统一的业务错误类型，便于在控制器中 throw，由错误中间件兜底处理。
class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isApiError = true;
  }

  static badRequest(msg, details) {
    return new ApiError(400, msg || '请求参数有误', details);
  }

  static unauthorized(msg) {
    return new ApiError(401, msg || '未认证或登录已过期');
  }

  static forbidden(msg) {
    return new ApiError(403, msg || '没有访问权限');
  }

  static notFound(msg) {
    return new ApiError(404, msg || '资源不存在');
  }

  static conflict(msg) {
    return new ApiError(409, msg || '资源冲突');
  }
}

module.exports = ApiError;
