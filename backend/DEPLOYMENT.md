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

> **服务器规格：2GB 内存** — 同机运行 Nginx、Node、Python、Redis，需严格限制各组件内存占用（见下文「2GB 内存约束」）。

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

## 二、轻量服务器准备（2GB 内存）

### 0. 2GB 内存约束（必读）

同机需运行 **Nginx + Node + Python + Redis**，建议内存预算如下：

| 组件 | 建议上限 | 配置位置 |
|------|----------|----------|
| 系统 + 缓冲 | ~400 MB | — |
| Nginx / 静态前端 | ~80 MB | — |
| Node 认证 API | ≤ 300 MB | `server/ecosystem.config.js` → `max_memory_restart: '300M'` |
| Python AI 后端 | **1 worker** | `backend/.env` → `FASTAPI_WORKERS=1` |
| Redis 会话缓存 | **128 MB** | `scripts/install-redis.sh` 默认 `maxmemory 128mb` |

**必做：**

1. `FASTAPI_WORKERS=1`（**不要**设为 2，否则易 OOM）
2. Redis `maxmemory 128mb` + `allkeys-lru`（脚本已默认）
3. Redis 关闭 RDB/AOF（会话可丢，降低 fork 峰值；脚本已默认）
4. 建议添加 **1–2GB Swap** 作为兜底：
   ```bash
   sudo fallocate -l 2G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```
5. **不推荐**在 2GB 机器上同时跑 Docker 全栈 + 本机 Redis（Docker 额外占用 ~200MB+）

**监控：**

```bash
free -h
redis-cli info memory | grep -E 'used_memory_human|maxmemory_human'
pm2 monit   # Node 进程
```

Redis 内存打满时会按 LRU 淘汰旧会话，属正常行为；若整机频繁 swap，需排查 Python/Node 泄漏或降低并发。

### 1. 安装 Redis

**推荐：一键脚本**（2GB 优化：128MB 上限、关闭持久化、LRU 淘汰）

```bash
# 在服务器上，进入项目根目录后执行
sudo bash scripts/install-redis.sh

# 可选：自定义上限（2GB 机器不建议超过 192mb）
sudo REDIS_MAXMEMORY=128mb bash scripts/install-redis.sh

# 可选：设置访问密码
sudo REDIS_PASSWORD='your_strong_password' bash scripts/install-redis.sh
```

**或手动安装（Ubuntu/Debian，2GB 需额外改 redis.conf）：**

```bash
sudo apt update && sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
redis-cli ping   # 应返回 PONG
# 手动安装时请在 /etc/redis/redis.conf 中设置：
#   maxmemory 128mb
#   maxmemory-policy allkeys-lru
#   save ""
#   appendonly no
```

安装后确认 `bind 127.0.0.1`（`/etc/redis/redis.conf`），**不要**在安全组开放 6379。

### 2. 安装 Node.js 18+ 与 Python 3.10+

按服务器系统安装即可（推荐 nvm + pyenv 或系统包管理器）。

### 3. 配置 Python AI 后端

```bash
cd backend
cp env.production.example .env
# 编辑 .env：填入 RDS 密码、AI API Keys
pip install -r requirements.txt   # 如有 requirements.txt
sudo bash ../scripts/install-weasyprint-linux.sh   # PDF 导出依赖（Pango/Cairo/中文字体）
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
FASTAPI_WORKERS=1
```

### 4. 配置 Node 认证后端

见 `server/README.md`：
```bash
cd server
cp env.production.example .env.production
# 库名 gba_website，RDS 与 Python 后端同实例
pm2 start ecosystem.config.js --env production
```

## 三、本地开发（XAMPP）

1. 启动 XAMPP MySQL
2. 安装并启动 Redis（Windows 可用 Memurai 或 WSL Redis）
3. 配置 `backend/.env`：
   ```bash
   cp env.development.example .env
   # 填入 AI API Keys；XAMPP root 有密码时改 MYSQL_PASSWORD
   ```
4. 初始化本地 AI 库：
   ```bash
   cd backend
   python sql/init_db.py
   python main.py
   ```

### PDF 导出（WeasyPrint）

简历 **PDF 导出** 依赖 WeasyPrint 及其系统库（Pango/Cairo）。`pip install -r requirements.txt` 只安装 Python 包，**还必须安装系统依赖**。

#### 云服务器（Ubuntu/Debian，推荐）

在项目根目录执行（需 root）：

```bash
sudo bash scripts/install-weasyprint-linux.sh
```

脚本会安装 Pango/Cairo/GDK 与中文字体（`fonts-noto-cjk`），并运行一次 PDF 自检。

#### 本地 Windows

1. Python 包（已完成可跳过）：
   ```powershell
   python -m pip install weasyprint==63.1
   ```
2. 系统库（MSYS2 + Pango）— 在项目根目录 PowerShell 执行：
   ```powershell
   .\scripts\install-weasyprint-windows.ps1
   ```
   若 MSYS2 未安装，脚本会通过 winget 安装；完成后将 `WEASYPRINT_DLL_DIRECTORIES=C:\msys64\mingw64\bin` 写入用户环境变量（或每次启动后端前 `$env:WEASYPRINT_DLL_DIRECTORIES='C:\msys64\mingw64\bin'`）。

3. 验证：
   ```powershell
   cd backend
   python scripts/verify_weasyprint.py
   ```

也可使用 **WSL**，按 Linux 步骤安装。

#### Docker

`docker/backend/Dockerfile` 已包含 WeasyPrint 系统依赖与中文字体，重建镜像即可：

```bash
docker compose build backend
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

> **2GB 服务器**：Docker 会额外占用内存，优先使用本机直跑（非 Docker）；若必须用 Docker，请设 `FASTAPI_WORKERS=1` 并监控 `docker stats`。

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
