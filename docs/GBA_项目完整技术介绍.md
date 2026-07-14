# GBA 跨境就业赋能平台 — 项目完整技术介绍

> 本文档为后期项目完整介绍，涵盖 AI 核心模块（意图识别、**Plan-and-Execute 编排**、工具调用、MCP）、向量库与 RAG、Embedding / PyTorch 部署选项、Docker 容器化，以及**六层自动评测 + 人工评测 + Bad case 复核**体系。  
> 与 [需求与技术方案](../GBA_Cross-Border_Employment_Empowerment_Platform_Requirements_and_Technical_Solution_Document.md)、[部署指南](../backend/DEPLOYMENT.md)、[测试指南](../backend/TESTING_GUIDE.md) 并列使用。  
> **English version:** [GBA_Platform_Technical_Overview.md](GBA_Platform_Technical_Overview.md)

---

## 目录

1. [项目定位与总体架构](#1-项目定位与总体架构)
2. [技术栈一览](#2-技术栈一览)
3. [Docker 容器化部署](#3-docker-容器化部署)
4. [AI 核心模块](#4-ai-核心模块)
5. [Embedding 与 PyTorch 本地推理](#5-embedding-与-pytorch-本地推理)
6. [向量库 ChromaDB](#6-向量库-chromadb)
7. [RAG 检索增强生成](#7-rag-检索增强生成)
8. [MCP 与工具层](#8-mcp-与工具层)
9. [LangGraph 工作流编排](#9-langgraph-工作流编排)
10. [评测体系（自动 + 人工）](#10-评测体系自动--人工)
11. [可观测性与并发控制](#11-可观测性与并发控制)
12. [文档索引](#12-文档索引)

---

## 1. 项目定位与总体架构

### 1.1 项目定位

GBA（Guangdong-Hong Kong-Macao Greater Bay Area）跨境就业赋能平台，面向大湾区弱势群体的跨境就业场景，提供：

- **AI 简历优化**：材料抽取 → 缺口分析 → 内容生成 → 排版渲染 → 多格式导出
- **AI 岗位匹配**：技能优先的盲筛匹配机制
- **AI 模拟面试**：结构化题集 + 交互式多轮模拟 + 答案评估
- **AI 学习路线**：基于能力缺口的资源推荐与时间线规划
- **多语言支持**：简体中文、繁体中文、英文、葡文

### 1.2 三栈架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                         用户浏览器                                   │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
┌───────────────┐     ┌─────────────────┐     ┌─────────────────────┐
│  静态前端      │     │  Node.js 认证 API │     │  Python AI 后端      │
│  individual/  │     │  server/ :3000   │     │  backend/ :8000      │
│  corporate/   │     │  JWT / 用户 / 岗位 │     │  LangGraph Agents   │
└───────────────┘     └────────┬────────┘     └──────────┬──────────┘
                               │                          │
                               │    ┌─────────────────────┤
                               │    │                     │
                               ▼    ▼                     ▼
                    ┌──────────────────┐      ┌──────────────────┐
                    │  阿里云 RDS MySQL │      │  Redis 会话缓存   │
                    │  gba_website      │      │  + LLM 并发队列   │
                    │  ai_career_copilot│      └──────────────────┘
                    └──────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │  ChromaDB 本地向量库  │
                    │  ./data/chroma       │
                    └─────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │  外部 AI API          │
                    │  SiliconFlow (LLM)    │
                    │  DashScope (Embed)    │
                    │  或本地 PyTorch 模型   │
                    └─────────────────────┘
```

| 服务 | 目录 | 端口 | 职责 |
|------|------|------|------|
| 静态前端 | `individual/`、`corporate/`、`assets/` | 8080 / Docker 3001 | 用户界面、i18n |
| Node 认证 API | `server/` | 3000 | 注册登录、JWT、岗位匹配、简历 CRUD |
| Python AI 后端 | `backend/` | 8000 | Agent 编排、RAG、MCP、简历 AI 流水线 |
| Redis | 宿主机或容器外 | 6379 | 会话状态、LLM 排队锁 |
| MySQL RDS | 阿里云 | 3306 | 持久化用户与业务数据 |
| ChromaDB | `backend/data/chroma/` | — | 向量索引（本地文件） |

---

## 2. 技术栈一览

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | HTML / CSS / JavaScript | **非 React/Vue**，多页静态站点 + i18n 四语 |
| 认证 | Node.js + Express + JWT | 与 Python 后端共用 JWT Secret |
| AI 编排 | **LangGraph** + **Plan-and-Execute** | 意图驱动静态计划 + DAG 执行（非 ReAct） |
| LLM 调用 | **LangChain** + OpenAI 兼容 API | SiliconFlow DeepSeek-R1 |
| 结构化输出 | Pydantic JSON Schema | 非 OpenAI Function Calling |
| Embedding | DashScope API **或** HuggingFace + **PyTorch** | 可配置切换 |
| Rerank | DashScope API **或** sentence-transformers CrossEncoder | 可配置切换 |
| 向量库 | **ChromaDB** PersistentClient | 本地持久化，无需单独购买 |
| 工具协议 | **MCP** (FastMCP + SSE) | 岗位查询、文档解析 |
| 容器化 | **Docker Compose** | backend + frontend nginx |
| 可观测 | LangSmith | Agent trace、评测 trace |
| 测试 | pytest + Selenium + Golden Set | 单元 / 集成 / E2E / 评测 |

---

## 3. Docker 容器化部署

### 3.1 容器组成

项目通过 `docker-compose.yml` 编排两个服务：

| 容器 | Dockerfile | 说明 |
|------|------------|------|
| `ai-career-copilot-backend` | `docker/backend/Dockerfile` | Python 3.10-slim + WeasyPrint 依赖 |
| `ai-career-copilot-frontend` | `docker/frontend/Dockerfile` | nginx:1.27-alpine 托管静态页 |

**不在 Compose 内的依赖**（通过环境变量连接外部服务）：

- MySQL：阿里云 RDS
- Redis：宿主机 `host.docker.internal:6379`
- Node 认证 API：宿主机 `:3000`（nginx 反向代理）

### 3.2 启动流程

```
docker-compose up
    │
    ├─ backend 容器
    │     ├─ entrypoint.sh → python sql/init_db.py（建表）
    │     └─ uvicorn main:app --host 0.0.0.0 --port 8000
    │
    └─ frontend 容器（依赖 backend healthy）
          └─ nginx 托管静态资源 + API 分流
```

Backend 健康检查：`GET /health`  
Frontend 健康检查：`wget http://127.0.0.1/`

### 3.3 Nginx API 路由（frontend 容器）

| 路径前缀 | 转发目标 | 说明 |
|----------|----------|------|
| `/api/auth`, `/api/jobs`, … | `host.docker.internal:3000` | Node 认证与业务 API |
| `/api/*`（其余） | `backend:8000` | Python AI 后端 |
| `/mcp/*` | `backend:8000` | MCP SSE 长连接（关闭缓冲） |
| `/health` | `backend:8000` | 健康检查 |

### 3.4 环境变量

复制 `.env.docker.example` 为 `.env.docker`，配置：

- `MYSQL_HOST` / `MYSQL_PASSWORD` — RDS 连接
- `REDIS_HOST=host.docker.internal` — 宿主机 Redis
- `SILICONFLOW_API_KEY` — LLM
- `DASHSCOPE_API_KEY` — Embedding / Rerank（云端方案）
- `LANGCHAIN_API_KEY` — LangSmith（可选）

### 3.5 ChromaDB 与 PyTorch 的 Docker 注意事项

| 场景 | 建议 |
|------|------|
| ChromaDB 数据持久化 | 挂载 volume 到 `/app/backend/data/chroma` |
| 默认云端 Embedding | 无需 PyTorch，镜像约 1.5 GB |
| 本地 PyTorch Embedding | 需在 Dockerfile 追加 `torch` + `sentence-transformers`；建议 8 GB 内存宿主机 |
| 生产 worker 数 | `FASTAPI_WORKERS=1`，避免多进程重复加载模型导致 OOM |

---

## 4. AI 核心模块

### 4.1 模块总览

```
用户消息
    │
    ▼
┌─────────────┐
│   Planner    │  ← 意图识别（LLM + 规则引擎）
│  planner.py  │
└──────┬──────┘
       │ execution_plan
       ▼
┌──────────────────────────────────────────────────┐
│  专业 Agent 节点（LangGraph）                      │
│  jd_agent / profile_agent / gap_agent /          │
│  content_agent / render_agent / interview_agent /│
│  question_agent / answer_evaluation_agent /      │
│  learning_path_agent                             │
└──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  tools/     │     │  MCP SSE    │     │  RAG 检索   │
│  辅助函数库  │     │  外部工具    │     │  ChromaDB   │
└─────────────┘     └─────────────┘     └─────────────┘
```

### 4.2 意图识别（Intent Recognition）

**实现文件**：`backend/agents/planner.py`、`backend/prompts/intent_classification.py`

意图识别采用 **「LLM 分类 + 确定性规则后处理」** 两阶段设计，而非简单的关键词匹配。

#### 阶段 A：LLM 结构化分类

- 调用主 LLM，输出约束为 Pydantic Schema `IntentClassificationOutput`
- 根据 `context_scope` 选择 Prompt：
  - **全局场景**（12 类意图）：`INTENT_CLASSIFICATION_PROMPT`
  - **简历编辑页**（5 类子意图）：`RESUME_EDIT_INTENT_CLASSIFICATION_PROMPT`
- 注入 `memory_context`（对话记忆）辅助指代消解（如「把它改短」指哪段）
- 输入状态标志：`has_job`、`has_profile`、`has_resume`

#### 全局意图列表

| 意图 | 含义 | 路由 Agent |
|------|------|------------|
| `upload_jd` | 上传/输入岗位描述 | `jd_agent` |
| `upload_profile` | 上传个人材料 | `profile_agent` |
| `profile_patch` | 增量补充材料 | `profile_agent` |
| `gap_analysis` | 能力缺口分析 | `gap_agent` |
| `learning_path` | 学习路线/资源/时间线 | `learning_path_agent` |
| `content_edit` | 修改简历文字内容 | `content_agent` → `render_agent` |
| `language_convert` | 多语言简历互转 | `content_agent` → `render_agent` |
| `render_edit` | 排版/样式调整 | `render_agent` |
| `export` | 导出简历 | 无 Agent（指引导出 API） |
| `start_interview` | 生成面试题 | `interview_agent` |
| `evaluate_answer` | 评估面试答案 | `answer_evaluation_agent` |
| `ask_question` | 基于当前状态问答 | `question_agent` |

#### 阶段 B：规则引擎 `resolve_intent()`

LLM 输出后，经确定性规则校正：

- **学习资源关键词** → 强制 `learning_path`（覆盖误分的 `gap_analysis`）
- **无 profile 的时长文本** → `gap_analysis` 降级为 `upload_profile`
- **`context_scope=resume_edit`** → 意图钳制在 5 种编辑类意图内
- **正则覆盖**：语言转换、排版调整、纯问答分别路由
- **客户端 bypass**：`forced_intent` 跳过 LLM，用于前端按钮直达

#### 设计优势

- LLM 处理自然语言歧义，规则保证关键路径稳定
- 场景钳制防止简历编辑页误触发全局流程
- 全链路 `workflow_trace` 记录意图与路由决策，用户可见

### 4.3 Agent 体系

| Agent | 文件 | 核心能力 |
|-------|------|----------|
| Planner | `planner.py` | 意图分类、执行计划 |
| JD Agent | `jd_agent.py` | JD 解析/生成、缓存复用 |
| Profile Agent | `profile_agent.py` | 材料抽取、增量 patch |
| Gap Agent | `gap_agent.py` | 岗位-能力缺口分析 |
| Content Agent | `content_agent.py` | 简历 JSON 内容生成/编辑 |
| Render Agent | `render_agent.py` | HTML 渲染、PDF 页数适配 |
| Interview Agent | `interview_agent.py` | 结构化面试题集 |
| Question Agent | `question_agent.py` | 自由问答 + **RAG 检索** + 岗位 API |
| Answer Evaluation | `answer_evaluation_agent.py` | 答案评估 + LLM-as-Judge 三维 rubric |
| Learning Path | `learning_path_agent.py` | 缺口 → 资源推荐 → timeline |

**共享模式**：

- 所有 Agent LLM 输出统一走 `ainvoke_json_with_schema` 或 `ainvoke_json_with_language_guard`
- JSON 契约定义于 `backend/agents/json_contracts.py`
- 缺口分析核心逻辑 `gap_analysis_core.py` 被 `gap_agent` 与 `learning_path_agent` 复用

**Graph 外独立 API**：

- `interactive_interview_agent.py` — 多轮模拟面试（poll/turn/debrief），不经 LangGraph

### 4.4 工具调用（Tool Calling）设计哲学

本项目 **不使用 OpenAI Function Calling 循环**，而采用：

| 模式 | 说明 | 示例 |
|------|------|------|
| **JSON Schema 结构化输出** | LLM 返回固定 Pydantic 模型 | 所有 Agent 的内容生成 |
| **Python 工具函数** | Agent 内直接调用 | `file_parser`、`resume_export` |
| **HTTP 桥接** | 调 Node API | `node_jobs_client.fetch_matched_jobs` |
| **MCP 标准协议** | 对外暴露可复用工具 | `gba-jobs`、`gba-docs` |

这样设计的理由：

- Agent 输出需严格符合简历 JSON、缺口报告等复杂结构，JSON Schema 比 tool call 更可控
- 平台内部工具以 Python 函数形式组织在 `backend/tools/`（22 个模块），延迟低、类型安全
- MCP 面向外部 Agent 或 IDE 集成，与 LangGraph 并行存在

### 4.5 编排范式：Plan-and-Execute（非 ReAct）

本项目采用 **「意图驱动的静态 Plan-and-Execute」**，而非 ReAct（Reason + Act）循环。

| 维度 | ReAct | 本项目 |
|------|-------|--------|
| 核心循环 | Think → Act → Observe → 再 Think（多轮） | Plan → Execute → Respond（单次） |
| 工具选择 | LLM 每步动态选 tool | Agent 内直接调 Python 函数 |
| 调用方式 | OpenAI Function Calling 循环 | JSON Schema 结构化输出 + 代码直调 |
| 是否重规划 | 根据 observation 反复调整 | 单次 `execution_plan`，跑完即结束 |
| 图结构 | 通常有回环 | DAG，`respond → END`，无回边 |

**Plan 阶段**（`planner.py`）：LLM 意图分类 + 规则引擎 `resolve_intent()` → 查表 `_INTENT_PLAN` 得到固定 Agent 链路。

**Execute 阶段**（`workflow/graph.py`）：LangGraph 按 `execution_plan[0]` 条件路由，节点执行后 merge 进 `CopilotState`，最终 `respond → END`。

```
用户消息 → Planner（intent + execution_plan）
              ↓
    content_agent → render_agent → respond → END   （示例：content_edit）
```

与「经典 Plan-and-Execute」的差异：计划来自 **意图 → 预定义映射表**（非 LLM 动态生成多步计划），且 **无 replan**（执行失败 fail-fast，不在同一请求内回到 Planner）。

**图外独立模块**：`interactive_interview_agent.py` 为有限状态机 + 固定题库驱动，同样不是 ReAct。

### 4.6 Agent 间依赖、消息传递与防死循环

#### 主 Agent 与子 Agent 职责

| 角色 | 命名 | 职责 |
|------|------|------|
| **主控（编排器）** | `Planner` | 意图识别、生成 `execution_plan`、路由 |
| **子 Agent** | `jd_agent` | JD 解析/生成、缓存 |
| | `profile_agent` | 简历材料抽取、增量 patch |
| | `gap_agent` | 岗位-能力缺口分析 |
| | `content_agent` | 简历 JSON 生成/编辑/翻译 |
| | `render_agent` | 排版 + HTML 渲染 + PDF 页数适配 |
| | `interview_agent` | 结构化面试题集 |
| | `question_agent` | 自由问答 + RAG + 岗位 API |
| | `answer_evaluation_agent` | 答案评估 + LLM-as-Judge |
| | `learning_path_agent` | 缺口 → 资源 → 时间线 |
| | `respond` | 汇总 trace，生成用户可见回复 |
| **图外** | `interactive_interview_agent` | 多轮模拟面试（不经 LangGraph） |

#### Agent 间依赖

- **共享模块**：`gap_analysis_core.py` 被 `gap_agent` 与 `learning_path_agent` 复用
- **回调链**：`render_agent` 页数超限时回调 `content_agent` 压缩内容
- **无循环依赖**：所有路径最终 `respond → END`，无回边到 Planner

#### 消息传递

全局状态 **`CopilotState`**（`workflow/state.py`，430+ 行 Pydantic）：

1. LangGraph **状态 merge**：各节点返回局部 `dict`，框架合并
2. **条件路由**：读 `execution_plan[0]` 决定下一节点
3. **workflow_trace**：运行时 trace，不持久化
4. **Redis**：每 chat 读写完整 state（排除 runtime 字段）
5. **入口**：`POST /api/chat` → 注入 `memory_context` → `graph.ainvoke()` → 写回 Redis

#### 防死循环 / 防无限运行

| 机制 | 位置 | 说明 |
|------|------|------|
| DAG 无环 | `workflow/graph.py` | 无回边到 Planner |
| 固定执行计划 | `planner.py` | 单次请求只跑 plan 一次 |
| Session 并发锁 | `services/llm_queue.py` | 同 session 409 `SESSION_BUSY` |
| LLM 全局并发上限 | `config.yaml` | `max_concurrent: 2` |
| JSON 修复上限 | `models/llm.py` | 最多 2 次 repair 后 fail-fast |
| 对话轮次上限 | `dialogue_memory.py` | 最近 6 轮，超 10 轮 LLM 压缩 |
| 面试轮次上限 | `tools/interview_program.py` | quick≈13 / full≈17 轮 |
| Render 页数适配 | `render_agent.py` | 最多 2 次压缩 |

### 4.7 Prompt 分层设计

```
backend/prompts/              ← 按任务域拆分（19 个模块）
backend/agents/*.py           ← Agent 组装 prompt + 注入上下文
backend/tools/output_language*.py  ← 语言指令层
backend/agents/json_contracts.py   ← 输出 JSON Schema 契约
```

以 **Question Agent** 为例，典型 **六层结构**：

| 层级 | 内容 | 来源 |
|------|------|------|
| System | 角色与回答规范 | `_QUESTION_SYSTEM_PROMPT` |
| 语言 | 输出语言约束 | `output_language_instruction()` |
| 记忆 | 对话/跨会话摘要 | `memory_context` / `dialogue_memory` |
| 检索 | RAG chunks | `rag_service.retrieve()` |
| 业务 | 岗位匹配结果 | `fetch_matched_jobs()` |
| 用户 | 当前问题 | `user_message` |

**Planner 额外注入**：`memory_context` 供指代消解（如「把它改短」指哪段）。

**Intent 双层分类**：全局 12 类 + 简历编辑页 5 类子意图 + 规则引擎 `resolve_intent()` override。

### 4.8 上下文记忆机制

| 类型 | 存储 | 配置 / 说明 |
|------|------|-------------|
| 会话热状态 | Redis | 每 chat 读写 |
| 短期对话轮次 | `meta.dialogue_turns` | 最近 6 轮，每轮 max 800 字 |
| 压缩摘要 | `meta.dialogue_summary` | 超 10 轮 LLM 压缩 |
| 跨会话摘要 | Chroma `user_memory` | embedding 存储 |
| RAG 会话索引 | Chroma `session_chunks` | 按 session 全量替换 |
| Runtime 注入 | `state.memory_context` | chat 前组装，不持久化 |

Chat 后后台任务（`api/chat.py` `_post_chat_background`）：压缩对话 → 更新 Redis → 持久化跨会话摘要 → RAG 索引。

```yaml
# backend/config.yaml
dialogue_memory:
  raw_turn_limit: 6
  compress_threshold: 10
  max_turn_chars: 800
  cross_session_enabled: true
```

### 4.9 典型工具调用场景

| 场景 | 工具模块 | 调用方 |
|------|----------|--------|
| 上传 PDF/DOCX | `file_parser.py` | `api/chat_input.py` |
| JD 解析缓存 | `jd_cache.py` | `jd_agent` |
| 画像/JD 上下文拼装 | `resume_profile_context.py`、`target_job_context.py` | 多数 Agent |
| 多语言校验修复 | `output_language_guard.py` | 几乎所有生成型 Agent |
| 简历 HTML/PDF | `template_renderer.py`、`resume_export.py` | `render_agent` |
| 岗位匹配 | `node_jobs_client.py` | `question_agent` |
| 面试程序 | `interview_program.py` | `interview_agent` |

**最高频**：`output_language_guard.py` → `target_job_context.py` / `resume_profile_context.py` → `file_parser.py` → `template_renderer.py` → `node_jobs_client.py`。

---

## 5. Embedding 与 PyTorch 本地推理

### 5.1 分层关系

```
业务代码（rag_service / dialogue_memory / evaluation）
        │
        ▼
models/embedding.py  ·  models/rerank.py     ← LangChain 统一封装
        │
   ┌────┴────┐
   ▼         ▼
DashScope   HuggingFaceEmbeddings / CrossEncoder
 API           │
                ▼
            PyTorch（本地推理引擎）
                │
                ▼
            预训练模型权重（BGE 等）
```

- **PyTorch** 是神经网络计算引擎，不是 embedding 业务包本身
- **LangChain** 在本地路径下提供 `HuggingFaceEmbeddings` 薄封装
- **ChromaDB** 只存向量，不负责生成向量

### 5.2 当前默认配置（云端 API）

```yaml
# backend/config.yaml
embedding:
  provider: dashscope
  model: text-embedding-v4

rerank:
  provider: dashscope
  model: gte-rerank-v2
```

| 方案 | 优点 | 缺点 |
|------|------|------|
| DashScope API | 不占服务器内存、中文效果好、部署简单 | 按调用量计费 |
| 本地 PyTorch | 无 API 费用、数据不出服务器 | 需 4–8 GB 内存、CPU 推理较慢 |

### 5.3 本地 PyTorch 切换方式

修改 `config.yaml`，**无需改业务代码**：

```yaml
embedding:
  provider: huggingface
  model: "BAAI/bge-small-zh-v1.5"
  model_kwargs:
    device: "cpu"

rerank:
  provider: huggingface
  model: "BAAI/bge-reranker-v2-m3"
  top_n: 5
```

额外安装：

```bash
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install sentence-transformers
```

**重要**：切换 embedding 模型后向量维度变化，需清空 ChromaDB 并重新索引：

```bash
rm -rf backend/data/chroma/*
```

### 5.4 服务器规格建议

| 规格 | 适用场景 |
|------|----------|
| 2 GB（当前轻量） | 仅云端 DashScope，不适合本地 PyTorch |
| 4 GB + Swap | 小模型 + 单 worker，勉强可用 |
| **8 GB（推荐）** | 本地 embedding + rerank + 全栈服务 |
| 16 GB + GPU | 高并发或本地大模型（本项目 LLM 仍走 API） |

### 5.5 Provider 工厂支持的完整列表

**Embedding**（`models/embedding.py`）：`dashscope`、`openai`、`azure_openai`、`ollama`、`huggingface`

**Rerank**（`models/rerank.py`）：`dashscope`、`cohere`、`huggingface`（CrossEncoder）

---

## 6. 向量库 ChromaDB

### 6.1 定位

ChromaDB 在本项目中是 **嵌入式本地向量数据库**，数据持久化到磁盘目录 `./data/chroma`，**无需像 MySQL 一样单独购买云数据库实例**。

### 6.2 实现细节

**文件**：`backend/storage/vector_client.py`

```python
# 单例 PersistentClient
_client = chromadb.PersistentClient(path="./data/chroma")

# 两个 Collection（调用方自行提供 embedding，无内置 embedder）
session_chunks   # 会话级 RAG 索引
user_memory      # 跨会话对话摘要
```

| Collection | 用途 | 主要 Metadata |
|------------|------|---------------|
| `session_chunks` | 当前会话 JD / Profile / 简历 / 缺口 RAG | `session_id`, `chunk_type` |
| `user_memory` | 登录用户跨会话对话摘要 | `user_id`, `type` |

- 距离度量：`hnsw:space: cosine`（余弦相似度）
- 优雅降级：`chromadb` 未安装或 `vector_store.enabled=false` 时，RAG 与跨会话记忆自动跳过

### 6.3 与 MySQL / Redis 的分工

| 存储 | 数据类型 | 持久化 |
|------|----------|--------|
| **Redis** | 当前会话 CopilotState（热数据） | 可丢失（LRU 淘汰） |
| **MySQL** | 用户显式保存的简历、面试记录 | 永久 |
| **ChromaDB** | 向量索引 + 对话摘要向量 | 本地文件，随部署迁移 |

### 6.4 运维要点

- 备份：复制 `data/chroma/` 目录
- 迁移：切换 embedding 模型后必须重建索引
- Docker：建议 volume 挂载防止容器重建丢数据
- 内存：ChromaDB 检索时占用与索引规模正相关，毕设规模通常 < 100 MB

---

## 7. RAG 检索增强生成

### 7.1 RAG 在本项目中的定位

本项目的 RAG 是 **会话级 artifact 索引**，而非通用文档问答：

- 索引来源：当前会话内的 JD、候选人 Profile、简历内容、缺口摘要
- 主要消费方：`question_agent`（用户问「我的目标岗位是什么」「简历有哪些项目」）
- 其他 Agent 直接读取 `CopilotState` 结构化状态，不经过向量检索

### 7.2 完整流水线

```
CopilotState（JD + Profile + Resume + Gaps）
        │
        ▼
build_chunks_from_state()          ← 业务切块，非通用 TextSplitter
        │
        ▼
aembed_documents()                 ← Embedding（DashScope 或 PyTorch）
        │
        ▼
ChromaDB session_chunks upsert     ← 按 session_id 全量替换
        │
        ╞═══ 用户提问 ═══╗
        │               ▼
        │         aembed_query()
        │               │
        │               ▼
        │         向量检索 top_k=10
        │               │
        │               ▼
        │         arerank_texts()    ← Rerank top_n=5
        │               │
        └───────────────┴──→ question_agent 注入 Prompt
```

### 7.3 切块策略（Chunking）

**文件**：`backend/services/rag_service.py`

按业务语义切块，每块最大 1200 字符：

| Chunk ID 前缀 | 内容 |
|---------------|------|
| `job:title` | 目标岗位标题 |
| `job:responsibilities` | 岗位职责列表 |
| `job:skills` | 硬技能 / 软技能 / 技术栈 / 关键词 |
| `profile:{fact_id}` | 候选人事实条目 |
| `resume:summary` | 简历摘要 |
| `resume:{section}:{item_id}` | 各板块条目 |
| `gaps:summary` | 缺口分析摘要 |

**设计理由**：简历/JD 结构化程度高，语义切块比固定窗口分词更精准，避免一条 bullet 被截断。

### 7.4 索引与检索参数

```yaml
# backend/config.yaml
rag:
  enabled: true
  search_top_k: 10      # 向量检索候选数
  rerank_top_n: 5       # 重排序后返回数
  min_score: 0.0
```

| 步骤 | 说明 |
|------|------|
| 索引触发 | 每次 chat 完成后，后台任务 `index_session_safe()` |
| 索引策略 | 按 `session_id` 先 delete 再 upsert（全量替换） |
| 检索过滤 | `where={"session_id": session_id}` 会话隔离 |
| 分数转换 | `score = 1 - distance`（cosine space） |
| Rerank 降级 | rerank 失败时 fallback 到向量序 |

### 7.5 对话记忆（与 RAG 相关但独立）

**文件**：`backend/services/dialogue_memory.py`

| 机制 | 说明 |
|------|------|
| 短期缓冲 | 最近 6 轮原始对话 |
| 压缩摘要 | 超过 10 轮时 LLM 压缩为 summary + facts |
| 跨会话记忆 | 摘要 embedding 写入 `user_memory` collection |
| Planner 消费 | `memory_context` 注入意图分类 Prompt |

### 7.6 RAG 在评测中的对应

自动评测指标直接映射 RAG 质量三要素（见第 10 节）：

| RAG 要素 | 评测指标 |
|----------|----------|
| Relevance（相关性） | `jd_keyword_coverage`、`jd_embedding_similarity` |
| Faithfulness（忠实度） | `profile_groundedness`、`unsupported_bullet_count` |
| Utility（实用性） | `match_score`、`checklist_pass_rate` |

---

## 8. MCP 与工具层

### 8.1 MCP（Model Context Protocol）

MCP 是面向 AI Agent 的 **标准工具暴露协议**。本项目基于 **FastMCP + SSE 传输**，挂载在 Python FastAPI 同一进程。

**文件**：`backend/mcp_servers/mount.py`、`jobs.py`、`docs.py`

#### 已暴露的 MCP Server

| Server | 挂载路径 | 工具 | 说明 |
|--------|----------|------|------|
| `gba-jobs` | `/mcp/jobs` | `get_matched_jobs(token, limit)` | 桥接 Node `GET /jobs/matched` |
| `gba-docs` | `/mcp/docs` | `parse_document_base64(...)` | PDF/DOCX/MD/TXT 解析 |
| | | `list_supported_document_formats()` | 列出支持格式 |

#### 传输与接入

```
外部 MCP Client（Cursor / Claude Desktop / 自定义 Agent）
        │
        │  SSE 长连接
        ▼
GET /mcp/jobs/sse
POST /mcp/jobs/messages/
        │
        ▼
FastMCP → node_jobs_client / file_parser
```

- Nginx 对 `/mcp/` 关闭 proxy buffering，read timeout 86400s
- 健康检查索引：`GET /health` 返回 MCP server 元信息

#### MCP 与 LangGraph 的关系

| 路径 | 使用场景 |
|------|----------|
| MCP SSE | 外部 Agent / IDE 集成调用平台能力 |
| 内部 HTTP | `question_agent` 直接调 `fetch_matched_jobs()` |
| Python tools | 各 Agent 内部调用 `backend/tools/` |

三者并行，MCP 不是 LangGraph 运行的前置依赖。

### 8.2 backend/tools/ 工具库

| 模块 | 功能 |
|------|------|
| `file_parser.py` | PDF/DOCX/MD/TXT 解析 |
| `resume_export.py` | PDF/DOCX/HTML 导出（WeasyPrint） |
| `template_renderer.py` | Jinja2 简历 HTML 渲染 |
| `resume_layout.py` / `resume_page_policy.py` / `typography_ladder.py` | 排版与页数策略 |
| `resume_language_checklist.py` | 多语言简历规范检查 |
| `resume_profile_context.py` | Profile JSON 构建与分批 |
| `target_job_context.py` | JD 上下文 JSON |
| `output_language.py` / `output_language_guard.py` | 输出语言控制 |
| `quantification_questions.py` | 缺口量化追问 |
| `interview_program.py` | 面试阶段程序配置 |
| `jd_cache.py` | JD 缓存 hash/title |
| `node_jobs_client.py` | Node 岗位 API 桥接 |

---

## 9. LangGraph 工作流编排

编排范式详见 [§4.5 Plan-and-Execute（非 ReAct）](#45-编排范式plan-and-execute非-react)。

### 9.1 图结构

**文件**：`backend/workflow/graph.py`

```
                    ┌─────────┐
                    │ planner │
                    └────┬────┘
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
    jd_agent      profile_agent     gap_agent
         │               │               │
         ▼               ▼               ▼
    gap_agent       content_agent   content_agent
    content_agent       │               │
         │               ▼               ▼
         ▼          render_agent     respond
    respond             │
                        ▼
                  interview_agent
                        │
                        ▼
                     respond → END
```

其他直达节点：`question_agent`、`answer_evaluation_agent`、`learning_path_agent`、`render_agent`

### 9.2 状态管理

- **CopilotState**（`workflow/state.py`）：430+ 行 Pydantic 模型，承载 JD、Profile、Resume JSON、Interview、Learning Path 等
- **Redis 持久化**：每次 chat 请求读写完整 state
- **MySQL**：仅用户显式「保存简历」时写入
- **workflow_trace**：运行时 trace，生成用户可见过程摘要，不持久化

### 9.3 并发与锁

```yaml
llm_queue:
  enabled: true
  max_concurrent: 2        # 2GB 生产环境建议 2
  session_lock_ttl_seconds: 600
```

- 同 session 并发请求返回 409 `SESSION_BUSY`
- LLM 调用排队，防止 2GB 机器 OOM

---

## 10. 评测体系（自动 + 人工）

本项目建立了 **六层评测体系**，覆盖简历 RAG 质量、Planner 路由、Agent 链路、检索指标、跨 Agent 一致性与生产 bad case 复核，用于毕设量化论证与 CI 回归。

### 10.1 评测体系总览

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           评测体系（六层）                                 │
├─────────────┬─────────────┬─────────────┬─────────────┬──────────────────┤
│ 简历 RAG    │ Planner路由 │ RAG检索     │ 链路一致性   │ Bad Case 复核    │
│ before/after│ F1+混淆矩阵 │ Recall@K/MRR│ gap→content │ LangSmith+CSV    │
├─────────────┼─────────────┼─────────────┼─────────────┼──────────────────┤
│ resume_rag/ │ planner_    │ rag_        │ chain_      │ monitoring/      │
│ runner.py   │ routing/    │ retrieval/  │ consistency/│ bad_case_sampler │
├─────────────┴─────────────┴─────────────┴─────────────┴──────────────────┤
│  人工盲评（resume-rag/human/）  │  Golden Set CI（evaluation-tests.yml）   │
│  Selenium E2E                   │  答案评估 Golden Set                      │
└──────────────────────────────────────────────────────────────────────────┘
                              ▼
                 evaluation-results/（latest/ + runs/）
```

**索引文档**：[`evaluation-results/README.md`](../evaluation-results/README.md)

| 评测层 | 代码路径 | 结果目录 | CI |
|--------|----------|----------|-----|
| 简历优化 RAG | `evaluation/resume_rag/` | `evaluation-results/resume-rag/` | pytest |
| Planner 意图 + Agent 链路 | `evaluation/planner_routing/` | `evaluation-results/planner-routing/` | pytest |
| RAG 检索质量 | `evaluation/rag_retrieval/` | `evaluation-results/rag-retrieval/` | pytest |
| 跨 Agent 链路一致性 | `evaluation/chain_consistency/` | `evaluation-results/chain-consistency/` | pytest |
| Bad case 采样 | `evaluation/monitoring/` | `evaluation-results/monitoring/` | pytest |
| 人工盲评 | `evaluation/resume_rag/human_eval.py` | `evaluation-results/resume-rag/human/` | 手动 |
| 答案评估 Golden | `test-data/golden/` | — | pytest + GitHub Actions |

### 10.2 Planner 意图路由与 Agent 链路评测

**代码**：`backend/evaluation/planner_routing/`  
**Golden Set**：`fixtures/golden_cases.json`（20 条）  
**结果**：`evaluation-results/planner-routing/latest/`

#### 评测目标

| 指标 | 含义 | 对应论证点 |
|------|------|------------|
| Intent accuracy | 意图识别准确率 | 端到端 Agent 路由准确率 |
| Macro F1 / Weighted F1 | 多类 F1 | 分类器整体质量 |
| 混淆矩阵 | 实际 vs 预测 | 误分类模式分析 |
| Agent chain accuracy | `execution_plan` 一致率 | **Tool 等价物**（虽无 function calling，等价于「是否调用正确下游节点」） |

#### 两阶段评测

| 模式 | 说明 | 依赖 |
|------|------|------|
| **rule_only**（默认 CI） | 评测 `resolve_intent()` + `_build_execution_plan()` 确定性层 | 无 API Key |
| **e2e_llm**（可扩展） | 调用完整 Planner LLM 分类 | 需 `SILICONFLOW_API_KEY` |

#### 运行方式

```bash
cd backend
python -m evaluation.planner_routing.runner
pytest tests/test_planner_routing_eval.py -v
```

#### 最新结果摘要（rule-only 层）

| 指标 | 结果 |
|------|------|
| Intent accuracy | **100%**（20/20） |
| Agent chain accuracy | **100%** |
| Macro F1 | **1.0000** |

### 10.3 RAG 检索质量评测（Recall@K / MRR）

**代码**：`backend/evaluation/rag_retrieval/`  
**Golden Set**：`fixtures/golden_queries.json`（query + 期望 relevant chunk_id）  
**结果**：`evaluation-results/rag-retrieval/latest/`

#### 指标定义

| 指标 | 含义 |
|------|------|
| **Recall@K** | top-K 结果中命中 relevant chunk 的比例 |
| **MRR** | 第一个 relevant chunk 排名的倒数均值 |
| **NDCG@K** | 归一化折损累积增益 |
| **Hit rate** | 任一 relevant 出现在 top-K 的 query 比例 |

#### 运行模式

```bash
cd backend
python -m evaluation.rag_retrieval.runner --lexical     # CI，词汇重叠 fallback
python -m evaluation.rag_retrieval.runner --embeddings # 生产级 Qwen Embedding + Rerank
pytest tests/test_rag_retrieval_metrics.py -v
```

#### 最新结果摘要（lexical 模式）

| 指标 | 结果 |
|------|------|
| MRR | **0.8889** |
| Hit rate @ top-10 | **100%** |

### 10.4 跨 Agent 链路一致性评测

**代码**：`backend/evaluation/chain_consistency/`  
**Golden Set**：`fixtures/golden_chains.json`（含故意失败负例）  
**结果**：`evaluation-results/chain-consistency/latest/`

验证 **gap → content → render** 等链路的字段传递 invariant：

| 检查项 | 含义 |
|--------|------|
| `profile_to_content` | CandidateProfile 姓名/邮箱/电话 → ResumeContent.profile |
| `job_to_content` | Job.title → ResumeContent.meta.target_role |
| `gap_to_content` | 高优 missing_skill 缺口在简历文本中体现 |
| `content_to_render` | render 成功后 HTML 非空（>100 字符） |
| `gaps_preserved` | gap_agent 成功后 gaps 列表非空 |

```bash
cd backend
python -m evaluation.chain_consistency.runner
pytest tests/test_chain_consistency_eval.py -v
```

Golden Set 含 3 条**故意失败**负例（profile 不一致、HTML 空、缺口未覆盖），用于回归检测；当前通过率 **40%（2/5，含负例设计）**。

### 10.5 生产监控与 Bad Case 人工复核

**代码**：`backend/evaluation/monitoring/`  
**配置**：`backend/config.yaml` → `monitoring` 段  
**结果**：`evaluation-results/monitoring/latest/bad_cases_review.csv`

#### 闭环流程

```
线上 /api/chat → LangSmith trace（run_name: API-Chat-Request）
       ↓
bad_case_sampler 规则采样
  · failed_agent_node（workflow_trace status=failed）
  · empty_assistant_reply
  · routing_mismatch（实际 plan ≠ 期望 plan）
  · low_answer_score（< 60）
       ↓
bad_cases_review.csv 人工标注
  · review_status: pending / reviewed / confirmed_bug / false_positive
  · root_cause / fix_priority
       ↓
回归 Golden Set / 修复 Planner 规则
```

#### 运行方式

```bash
cd backend
python -m evaluation.monitoring.runner                    # 离线 fixture
python -m evaluation.monitoring.langsmith_export          # 需 LANGCHAIN_API_KEY
pytest tests/test_bad_case_sampler.py -v
```

### 10.6 简历优化 RAG 指标（before/after）

**代码**：`backend/evaluation/resume_rag/metrics.py`、`runner.py`  
**Golden Cases**：`backend/evaluation/resume_rag/fixtures/golden_cases.json`  
**结果**：`evaluation-results/resume-rag/latest/`

#### 指标定义

| 指标 | RAG 维度 | 含义 | 计算方式 |
|------|----------|------|----------|
| `jd_keyword_coverage` | Relevance | JD 关键词在简历中的覆盖率 | 关键词集合交集 / JD 关键词总数 |
| `jd_embedding_similarity` | Relevance | 简历-JD 向量余弦相似度 | Embedding API 或本地模型 |
| `profile_groundedness` | Faithfulness | 简历 bullet 与画像事实对齐度 | 词汇/embedding 重叠均值 |
| `unsupported_bullet_count` | Hallucination | 低对齐 bullet 数量 | groundedness 低于阈值的条目数 |
| `match_score` | Utility | 岗位-简历匹配分（0–100） | Python 复刻 Node `match.service.js` |
| `checklist_pass_rate` | Compliance | 多语言简历规范通过率 | `resume_language_checklist` 规则 |

#### 改进判定逻辑

一次优化（before → after）判定为 **IMPROVED** 需满足：

- 无 regression（groundedness 降幅 ≤ 3%）
- JD 关键词覆盖率、match_score 或 checklist 至少一项提升

#### 运行方式

```bash
cd backend

# 仅词汇指标（无需 API Key，适合 CI）
python -m evaluation.resume_rag.runner --no-embeddings

# 含 embedding 指标
python -m evaluation.resume_rag.runner --embeddings

# pytest 回归
pytest tests/test_resume_rag_metrics.py -v
```

#### 最新自动评测结果摘要

| Case | JD 关键词 Δ | Groundedness Δ | Match Score Δ |
|------|-------------|----------------|---------------|
| alex_chen_cross_border_cs | +88.89% | +0.123 | +34 |
| aixi_ai_application_dev | +75.00% | +0.210 | +36 |

2/2 cases improved，平均 match_score Δ **+35**。

### 10.7 人工评测（Human Evaluation）

**材料目录**：`evaluation-results/resume-rag/human/`  
**汇总脚本**：`backend/evaluation/resume_rag/human_eval.py`

#### 设计原则

- **盲法（Blinding）**：评估者不知道 A/B 哪份是优化前/后
- **成对比较（Pairwise）+ 李克特量表（Likert）** 双轨采集
- 样本来自 Golden Cases 的 before/after 简历 PDF

#### 评估维度（Likert 1–5）

| 维度 | 含义 |
|------|------|
| `job_fit` | 与目标岗位匹配感 |
| `credibility` | 可信度（无夸大/造假感） |
| `professionalism` | 专业度与表达质量 |
| `highlights` | 亮点是否突出 |
| `overall_recommend` | 总体推荐程度 |

#### 汇总命令

```bash
cd backend
python -m evaluation.resume_rag.human_eval \
  --pairwise ../evaluation-results/resume-rag/human/pairwise_responses.csv \
  --likert ../evaluation-results/resume-rag/human/likert_responses.csv \
  --blinding ../evaluation-results/resume-rag/human/blinding_map.csv \
  --rag-report ../evaluation-results/resume-rag/latest/report.json
```

#### 最新人工评测结果摘要

| 指标 | 结果 |
|------|------|
| Pairwise 判断数 | 6 |
| Optimized win rate | **100%**（6W / 0L / 0T） |
| Binomial p-value | 0.0312（vs 50%） |
| job_fit Δ | +2.25 |
| highlights Δ | +2.50 |
| overall_recommend Δ | +2.25 |

### 10.8 工具调用准确性：评估策略与论证充分性

本项目 **不使用 OpenAI Function Calling**，工具调用准确性通过以下 **等价评估** 论证：

| 评估维度 | 机制 | 是否足以支撑 |
|----------|------|--------------|
| 结构化输出契约 | Pydantic JSON Schema + 2 次 repair | ✅ 生成型 Agent |
| 意图路由 | Golden Set + F1 + 混淆矩阵 | ✅ rule 层；LLM 层可扩展 E2E |
| Agent 链路（Tool 等价） | `execution_plan` 链准确率 | ✅ 20 条 Golden + CI |
| RAG 检索 | Recall@K / MRR / NDCG | ✅ lexical CI；embedding 定期跑 |
| 链路一致性 | gap→content→render invariant | ✅ 含负例回归 |
| 答案质量 | Golden Set + LLM-as-Judge 三维 rubric | ✅ |
| 生产 bad case | LangSmith + 人工 CSV 复核 | ✅ 闭环已建立 |

**可进一步加强的论证**（答辩可选）：

1. Planner **LLM E2E 层** F1（需 API，扩至 50+ 真实用户语料）
2. embedding 模式 RAG 检索指标定期归档与趋势对比
3. 真实 graph 执行后的 state 快照纳入 chain consistency Golden Set
4. bad case 人工标注统计（confirmed_bug 比例、修复闭环率）

### 10.9 其他评测层

| 层级 | 路径 | 说明 |
|------|------|------|
| 答案评估 Golden Set | `test-data/golden/answer_evaluation_golden.json` | 关键词覆盖率 + embedding 相似度 |
| CI 工作流 | `.github/workflows/evaluation-tests.yml` | 五类 pytest 自动回归 |
| Selenium E2E | `backend/tests/selenium/` | 真实浏览器全流程 |
| LLM-as-Judge | `answer_evaluation_agent.py` | relevance / groundedness / actionability |

### 10.10 自动 vs 人工：互补关系

| 维度 | 自动指标 | 人工盲评 |
|------|----------|----------|
| 成本 | 低，可 CI 批量跑 | 高，需招募评估者 |
| 客观性 | 高，可复现 | 受评估者背景影响 |
| 覆盖 | 关键词、向量、路由、链路 | 整体感知、推荐意愿 |
| 样本量 | 易扩展 | 受时间限制 |
| 论文价值 | 量化基线 | 用户 Study 证据 |

**推荐做法**：答辩中同时引用各 `evaluation-results/*/latest/summary.md`，并报告人工 overall Δ 与 `match_score` Δ 的 Spearman 相关系数。

---

## 11. 可观测性与并发控制

| 能力 | 实现 |
|------|------|
| LangSmith Tracing | `config.yaml` → `langsmith.tracing_v2: true`；`chat.py` 设置 `run_name: API-Chat-Request: {session_id}` |
| Workflow Trace | `workflow/trace.py`，用户可见 Agent 执行摘要 |
| Bad Case 采样 | `evaluation/monitoring/bad_case_sampler.py`；规则见 `config.yaml` → `monitoring` |
| LangSmith 导出 | `evaluation/monitoring/langsmith_export.py`；导出 CSV 供人工复核 |
| 日志 | `backend/log/`（agent / api / error 分文件） |
| 健康检查 | `GET /health`（含 MCP 索引） |
| Session 锁 | Redis `llm_queue` 防并发 OOM |

```yaml
# backend/config.yaml — monitoring 段
monitoring:
  bad_case:
    min_answer_score: 60
    flag_failed_nodes: true
    flag_empty_reply: true
    flag_routing_mismatch: true
  langsmith:
    project: "ai-career-copilot"
    export_limit: 50
    lookback_hours: 168
```

---

## 12. 文档索引

| 文档 | 路径 | 内容 |
|------|------|------|
| **本文档（中文）** | `docs/GBA_项目完整技术介绍.md` | AI / RAG / MCP / 评测完整介绍 |
| **Technical Overview (EN)** | `docs/GBA_Platform_Technical_Overview.md` | 同上（英文版） |
| 需求与技术方案 | `GBA_Cross-Border_Employment_Empowerment_Platform_Requirements_and_Technical_Solution_Document.md` | 产品需求、功能范围 |
| Python 部署指南 | `backend/DEPLOYMENT.md` | RDS / Redis / 2GB 内存约束 |
| 后端测试指南 | `backend/TESTING_GUIDE.md` | API 测试、环境配置 |
| 测试资源汇总 | `TESTING_SUMMARY.md` | 全项目测试索引 |
| RAG 自动评测 | `evaluation-results/resume-rag/README.md` | 简历优化 before/after 指标 |
| **评测结果索引** | `evaluation-results/README.md` | Planner F1、RAG Recall@K、链路一致性、Bad case |
| Planner 路由评测 | `evaluation-results/planner-routing/README.md` | 意图 F1 + Agent 链路 Golden Set |
| RAG 检索评测 | `evaluation-results/rag-retrieval/README.md` | Recall@K / MRR / NDCG |
| 链路一致性评测 | `evaluation-results/chain-consistency/README.md` | gap→content→render 字段传递 |
| Bad case 复核 | `evaluation-results/monitoring/README.md` | LangSmith + 人工 CSV 闭环 |
| 人工评测 | `evaluation-results/resume-rag/human/README.md` | 盲评流程与汇总 |
| 岗位功能配置 | `docs/MY_JOBS_SETUP.md` | Node 岗位模块 |
| i18n 覆盖率 | `docs/i18n-coverage-report.md` | 四语国际化 |
| Node 认证 API | `server/README.md` | JWT 与用户 API |
| Docker 编排 | `docker-compose.yml` | 容器定义 |
| Docker 环境模板 | `.env.docker.example` | 环境变量 |

---

## 附录：关键配置速查

```yaml
# backend/config.yaml 核心段落

llm:
  provider: openai_compatible
  model: deepseek-ai/DeepSeek-R1-0528-Qwen3-8B
  api_base: https://api.siliconflow.cn/v1

embedding:
  provider: dashscope          # 可改为 huggingface + PyTorch
  model: text-embedding-v4

rerank:
  provider: dashscope          # 可改为 huggingface + CrossEncoder
  model: gte-rerank-v2

vector_store:
  enabled: true
  provider: chromadb
  persist_directory: "./data/chroma"

rag:
  enabled: true
  search_top_k: 10
  rerank_top_n: 5

dialogue_memory:
  cross_session_enabled: true

monitoring:
  bad_case:
    min_answer_score: 60
    flag_failed_nodes: true
```

---

*文档版本：2026-07-13 · 已补充 Plan-and-Execute 编排范式、六层评测体系与 bad case 复核闭环。*
