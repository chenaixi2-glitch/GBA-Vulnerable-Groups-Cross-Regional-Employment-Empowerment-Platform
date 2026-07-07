# GBA 平台 Node.js 后端

基于 **Node.js + Express** 的后端服务，提供用户注册/登录（JWT）接口，使用 `mysql2` 连接数据库，**同时兼容本地 XAMPP MariaDB 10.x 与阿里云 RDS MySQL 8.0**。

## 一、目录结构

```
server/
├── package.json            # 依赖与脚本
├── ecosystem.config.js     # PM2 部署配置
├── env.development.example # 本地开发模板（XAMPP MariaDB）→ 复制为 .env.development
├── env.production.example  # 线上生产模板（阿里云 RDS）→ 复制为 .env.production
├── .env.development        # 本地开发实际配置（.gitignore，勿提交）
├── .env.production         # 线上生产实际配置（.gitignore，勿提交）
├── sql/
│   └── init.sql            # 建库建表（幂等）
└── src/
    ├── server.js           # 启动入口（监听端口、优雅退出）
    ├── app.js              # Express 应用与中间件装配
    ├── config/
    │   ├── env.js          # 按 NODE_ENV 自动加载环境变量
    │   └── db.js           # 数据库连接池（兼容 MariaDB/MySQL）
    ├── routes/
    │   ├── index.js        # 路由汇总（/api）
    │   └── auth.routes.js   # 认证路由（/api/auth）
    ├── controllers/
    │   └── auth.controller.js
    ├── models/
    │   └── user.model.js
    ├── middleware/
    │   ├── auth.middleware.js   # JWT 校验、角色校验
    │   ├── validate.js          # 参数校验
    │   ├── asyncHandler.js      # 异步异常捕获
    │   └── error.middleware.js  # 404 与全局错误处理
    ├── utils/
    │   ├── jwt.js
    │   └── ApiError.js
    └── scripts/
        └── initDb.js       # 一键初始化数据库
```

## 二、环境自动切换原理

`src/config/env.js` 会读取 `NODE_ENV`：

- 不设置（默认）= `development` → 加载 `.env.development` → 连本地 XAMPP MariaDB（`127.0.0.1:3306`，用户 `root`，空密码）
- `NODE_ENV=production` → 加载 `.env.production` → 连阿里云 RDS MySQL

无需改任何代码，只靠环境变量切换。

## 三、本地开发（XAMPP MariaDB）

1. 启动 XAMPP 的 MySQL(MariaDB) 模块。
2. 复制环境配置：

```bash
cd server
cp env.development.example .env.development
# 若 XAMPP root 有密码，编辑 .env.development 中的 DB_PASSWORD
```

3. 安装依赖并初始化数据库：

```bash
npm install
npm run db:init      # 默认 development，会在本地建库建表
npm run dev          # nodemon 热重载启动
```

3. 访问 `http://localhost:3000/health` 验证。

> 若你的 XAMPP MariaDB 设置了 root 密码，改 `.env.development` 里的 `DB_PASSWORD`。

## 四、线上部署（阿里云轻量服务器 + RDS MySQL 8.0）

### 1. 准备 RDS
- 在 RDS 控制台「数据库白名单」中加入轻量服务器的**内网/公网 IP**（`120.77.249.179`）。
- 确认账号 `GBA_platform` 对库 `gba_website` 有读写权限。
- 推荐使用 **RDS 内网地址** 替换 `.env.production` 的 `DB_HOST`（更快、更安全、免公网流量费）。

### 2. 服务器上部署

```bash
# 安装 Node 18+（推荐 nvm）
node -v

# 拉取代码后
cd server
cp env.production.example .env.production
npm install --production

# 编辑 .env.production：填入 RDS 密码，JWT_SECRET 换成强随机串
#   openssl rand -hex 32
# CORS_ORIGIN 默认为 http://120.77.249.179，有域名时改成域名

# 初始化数据库（在 RDS 上建表）
npm run db:init -- 
# 等价：NODE_ENV=production node src/scripts/initDb.js

# 用 PM2 常驻
npm install -g pm2
pm2 start ecosystem.config.js --env production
pm2 save && pm2 startup
```

> Windows PowerShell 设置环境变量：`$env:NODE_ENV="production"; node src/scripts/initDb.js`

### 3. 安全组 / 防火墙
- 轻量服务器放行 `3000`（或用 Nginx 反代到 80/443）。
- 建议前面挂 Nginx：`location /api/ { proxy_pass http://127.0.0.1:3000; }`

## 五、接口说明

Base URL：`/api`

### 注册 `POST /api/auth/register`
请求体：
```json
{
  "username": "alice",
  "email": "alice@example.com",
  "password": "secret123",
  "role": "individual",
  "full_name": "Alice",
  "phone": "13800000000"
}
```
成功响应 `201`：
```json
{
  "success": true,
  "message": "注册成功",
  "data": { "token": "<JWT>", "user": { "id": 1, "username": "alice", "role": "individual" } }
}
```

### 登录 `POST /api/auth/login`
```json
{ "identifier": "alice", "password": "secret123" }
```
> `identifier` 可填用户名或邮箱。返回同样包含 `token`。

### 获取当前用户 `GET /api/auth/me`（需登录）
请求头：`Authorization: Bearer <token>`

### 健康检查 `GET /health`

## 六、快速自测（curl）

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","email":"alice@example.com","password":"secret123"}'

curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"alice","password":"secret123"}'
```

## 七、技术要点
- `mysql2` 连接池，支持 MySQL 8.0 的 `caching_sha2_password`，无需额外配置即可兼容 MariaDB。
- 密码使用 `bcryptjs` 加盐哈希存储。
- JWT 鉴权，`express-validator` 参数校验，`helmet` 安全头，`express-rate-limit` 登录限流。
- 统一响应格式 `{ success, message, data }`，统一错误中间件处理。
