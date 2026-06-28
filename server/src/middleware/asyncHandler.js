'use strict';

// 包裹异步控制器，自动把 Promise 异常转交给错误中间件，避免重复 try/catch。
module.exports = function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
};
