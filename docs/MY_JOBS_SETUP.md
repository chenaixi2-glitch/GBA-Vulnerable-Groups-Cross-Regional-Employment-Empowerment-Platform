# 企业端 My Jobs 模块 — 运行说明

本模块包含：**Python 爬虫**、**Node 岗位 API**、**企业端 My Jobs 前端**、**30 分钟定时同步**。

## 前置条件

- Node.js >= 18
- Python >= 3.9
- MySQL 8.0 / MariaDB 10.x（本地 XAMPP 或独立 MySQL 均可）

## 1. 初始化数据库

```bash
cd server
cp .env.example .env
# 编辑 .env，填写 DB_PASSWORD 等

npm install
npm run db:init
```

`db:init` 会创建 `gba_website` 库、`job_postings` 表，并插入 5 条演示用企业自建岗位。

## 2. 启动 Node 后端 API

```bash
cd server
npm run dev
```

- 健康检查：`http://localhost:3000/health`
- 岗位列表：`GET http://localhost:3000/api/jobs?page=1&pageSize=10`
- 返回字段 `source`：`internal`（企业自建）/ `external`（爬虫同步）

### 主要接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/jobs` | 列表（支持 `status` / `search` / `source` / 分页） |
| GET | `/api/jobs/:id` | 详情 |
| POST | `/api/jobs` | 发布岗位（需企业 JWT） |
| PUT | `/api/jobs/:id` | 编辑自建岗位 |
| PATCH | `/api/jobs/:id/status` | 关闭/变更状态 |
| POST | `/api/jobs/:id/clone` | 克隆已关闭岗位 |
| DELETE | `/api/jobs/:id` | 删除自建岗位 |

## 3. 运行 Python 爬虫

```bash
cd crawler
cp .env.example .env
# 编辑 .env，DB 配置与 server 保持一致

pip install -r requirements.txt

# 立即抓取一次
python main.py --once

# 启动定时任务（默认每 30 分钟）
python main.py --schedule
# 或
python scheduler.py
```

爬虫数据来源：[广东省残疾人就业服务网](https://www.jyfw.org.cn/) 公开 API，写入 `job_postings` 表并标记 `source='external'`。

> 首次全量抓取约需数分钟（遍历招聘单位）。建议在后台运行 `python scheduler.py`。

## 4. 启动前端

```bash
# 项目根目录
node static-server.js
```

浏览器访问：`http://localhost:8080/corporate/#jobs`

### 页面行为

- **外部岗位**（`source=external`）：仅显示绿色 **View**，跳转源站详情
- **企业自建岗位**（`source=internal`）：
  - Active / Interviewing：View、Edit、Close
  - Closed：View、Clone、Delete
- 支持搜索、All/Active/Closed 筛选、分页

### 发布/编辑岗位（可选）

需先注册企业账号并登录（将 JWT 存入 `localStorage.gba_auth_token`）：

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"corp_demo","email":"corp@demo.com","password":"demo123","role":"corporate"}'
```

## 5. 推荐启动顺序（开发）

开 3 个终端：

```bash
# 终端 1 — API
cd server && npm run dev

# 终端 2 — 爬虫定时任务
cd crawler && python scheduler.py

# 终端 3 — 静态前端
node static-server.js
```

## 目录结构

```
crawler/           # Python 爬虫 + 定时任务
server/src/        # Node 岗位 API
corporate/
  portal.html      # My Jobs 页面
  assets/js/
    api-client.js  # API 封装
    my-jobs.js     # 列表渲染与操作
```
