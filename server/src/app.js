'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const config = require('./config/env');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');

const app = express();

// 部署在 Nginx / 阿里云负载后面时，正确解析客户端 IP
app.set('trust proxy', 1);

app.use(helmet());

const corsOptions =
  config.corsOrigin === '*'
    ? { origin: true }
    : { origin: config.corsOrigin.split(',').map((s) => s.trim()) };
app.use(cors(corsOptions));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(config.isProd ? 'combined' : 'dev'));

// 针对认证接口的限流，缓解暴力破解
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: '请求过于频繁，请稍后再试' },
});
app.use('/api/auth', authLimiter);

// 健康检查
app.get('/health', (req, res) => {
  res.json({ success: true, status: 'ok', env: config.env, time: new Date().toISOString() });
});

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
