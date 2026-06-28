# ============================================================
# GBA 平台 — Python AI 后端部署指南
# （面向负责购买云资源与上线部署的同学）
# ============================================================

## 架构概览

本项目有 **两套数据库**，都在同一台阿里云 RDS MySQL 实例上，但库名不同：

| 服务 | 目录 | 数据库名 | 用途 |
|------|------|----------|------|
| Node.js 认证 API | `server/` | `gba_website` | 用户注册/登录（JWT） |
| Python AI 后端 | `backend/` | `ai_career_copilot` | 简历/面试/学习路线会话数据 |

Redis **不在 RDS 上**，需安装在**阿里云轻量应用服务器**本机（默认端口 6379），供 AI 后端缓存会话状态。

```
┌─────────────────────────────────────────────────────────┐
│  阿里云轻量服务器  120.77.249.179                        │
│  ├── 静态前端 (static-server / Nginx)     :8080         │
│  ├── Node 认证 API (server/)              :3000         │
│  ├── Python AI 后端 (backend/)            :8000         │
│  └── Redis                                :6379         │
└──────────────────────────┬──────────────────────────────┘
                           │ 3306
                           ▼
┌─────────────────────────────────────────────────────────┐
│  阿里云 RDS MySQL 8.0                                    │
│  rm-wz93273d48x7x6d5k5o.mysql.rds.aliyuncs.com          │
│  ├── gba_website          ← Node 用户表                  │
│  └── ai_career_copilot    ← AI 会话/简历/面试数据        │
└─────────────────────────────────────────────────────────┘
```

## 一、RDS 准备（你已购买）

连接信息：

```
host:     rm-wz93273d48x7x6d5k5o.mysql.rds.aliyuncs.com
port:     3306
user:     GBA_platform
password: （见 env.production.example，勿提交 Git）
charset:  utf8mb4
```

**必做 checklist：**

1. RDS 白名单加入轻量服务器 IP：`120.77.249.179`
2. 确认账号 `GBA_platform` 有建库权限（或 DBA 预先建好两个库）
3. 初始化 **Node 用户库**（在 `server/` 目录）：
   ```bash
   cd server
   NODE_ENV=production npm run db:init
   ```
4. 初始化 **AI 业务库**（在 `backend/` 目录）：
   ```bash
   cd backend
   cp env.production.example .env   # 填入真实密码
   python sql/init_db.py
   ```
   该脚本读取 `backend/.env` 中的 `MYSQL_*` 变量，执行 `sql/init_schema.sql` 建库建表。

## 二、轻量服务器准备

### 1. 安装 Redis

```bash
# Ubuntu/Debian
sudo apt update && sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
redis-cli ping   # 应返回 PONG
```

### 2. 安装 Node.js 18+ 与 Python 3.10+

按服务器系统安装即可（推荐 nvm + pyenv 或系统包管理器）。

### 3. 配置 Python AI 后端

```bash
cd backend
cp env.production.example .env
# 编辑 .env：填入 RDS 密码、AI API Keys
pip install -r requirements.txt   # 如有 requirements.txt
python sql/init_db.py             # 首次部署建表
python main.py                    # 或 systemd / PM2 / Docker
```

`backend/.env` 线上关键项：

```ini
MYSQL_HOST=rm-wz93273d48x7x6d5k5o.mysql.rds.aliyuncs.com
MYSQL_USER=GBA_platform
MYSQL_PASSWORD=<RDS密码>
MYSQL_DATABASE=ai_career_copilot

REDIS_HOST=127.0.0.1
REDIS_PORT=6379

FASTAPI_DEBUG=false
```

### 4. 配置 Node 认证后端

见 `server/README.md`，使用 `server/.env.production`（库名 `gba_website`）。

## 三、本地开发（XAMPP）

1. 启动 XAMPP MySQL
2. 安装并启动 Redis（Windows 可用 Memurai 或 WSL Redis）
3. 配置 `backend/.env`（已提供本地默认值）：
   ```ini
   MYSQL_HOST=127.0.0.1
   MYSQL_USER=root
   MYSQL_PASSWORD=
   MYSQL_DATABASE=ai_career_copilot
   REDIS_HOST=127.0.0.1
   ```
4. 初始化本地 AI 库：
   ```bash
   cd backend
   python sql/init_db.py
   python main.py
   ```

## 四、配置加载机制（给朋友看的代码位置）

| 文件 | 作用 |
|------|------|
| `backend/config.yaml` | 默认结构与非敏感配置 |
| `backend/.env` | **实际连接信息**（host/密码/API Key），优先级最高 |
| `backend/config_loader.py` | 读取 yaml + .env，供 storage 层使用 |
| `backend/storage/mysql_client.py` | MySQL 异步连接池 |
| `backend/storage/redis_client.py` | Redis 异步客户端 |
| `backend/sql/init_schema.sql` | AI 后端建库建表 SQL |
| `backend/sql/init_db.py` | 一键执行 init_schema.sql |

环境变量覆盖规则：`MYSQL_HOST`、`REDIS_HOST` 等会覆盖 `config.yaml` 中的默认值。

## 五、Docker 部署（可选）

根目录 `docker-compose.yml` + `.env.docker`，参考 `.env.docker.example`。
Docker 模式下 MySQL/Redis 可指向宿主机 RDS 与本机 Redis。

## 六、安全组 / 防火墙

| 端口 | 服务 | 是否对外开放 |
|------|------|-------------|
| 80/443 | Nginx 前端 | 是 |
| 3000 | Node 认证 API | 建议仅内网或 Nginx 反代 |
| 8000 | Python AI API | 建议仅内网或 Nginx 反代 |
| 6379 | Redis | **否**（仅本机） |
| 3306 | RDS | **否**（仅白名单 IP） |

## 七、验证

```bash
# AI 后端健康检查
curl http://localhost:8000/health

# Node 认证健康检查
curl http://localhost:3000/health
```

启动 `python main.py` 时应看到：

```
MySQL connectivity check passed
Redis connectivity check passed
Starting AI Career Copilot server on 0.0.0.0:8000
```
