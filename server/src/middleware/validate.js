'use strict';

const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

// 汇总 express-validator 的校验结果，有错则抛出 400。
module.exports = function validate(req, res, next) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    const details = result.array().map((e) => ({ field: e.path, message: e.msg }));
    return next(ApiError.badRequest('请求参数校验失败', details));
  }
  return next();
};
