'use strict';

const config = require('../config/env');

// 404 处理
function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    message: `接口不存在: ${req.method} ${req.originalUrl}`,
  });
}

// 全局错误处理
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // 业务错误
  if (err && err.isApiError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  // MySQL 唯一键冲突
  if (err && err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ success: false, message: '用户名或邮箱已被注册' });
  }

  // 数据库连接类错误
  if (err && ['ECONNREFUSED', 'ER_ACCESS_DENIED_ERROR', 'ENOTFOUND', 'ETIMEDOUT'].includes(err.code)) {
    return res.status(503).json({ success: false, message: '数据库暂不可用，请稍后再试' });
  }

  // 表结构未迁移（常见于旧库只执行过 init.sql）
  if (err && (err.code === 'ER_BAD_FIELD_ERROR' || err.code === 'ER_NO_SUCH_TABLE')) {
    return res.status(503).json({
      success: false,
      message: '数据库表结构需要更新，请在 server 目录执行 npm run db:migrate',
    });
  }

  console.error('[UnhandledError]', err);
  return res.status(500).json({
    success: false,
    message: '服务器内部错误',
    ...(config.isProd ? {} : { error: err.message, stack: err.stack }),
  });
}

module.exports = { notFoundHandler, errorHandler };
