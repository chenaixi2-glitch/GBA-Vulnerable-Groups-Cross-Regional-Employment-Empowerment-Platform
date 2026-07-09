# GBA 跨境就业赋能平台 — 项目完整技术介绍

> 本文档为后期项目完整介绍，涵盖 AI 核心模块（意图识别、Agent 编排、工具调用、MCP）、向量库与 RAG、Embedding / PyTorch 部署选项、Docker 容器化，以及自动评测与人工评测体系。  
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
| 前端 | HTML / CSS / JavaScript | 无框架 SPA，i18n 四语 |
| 认证 | Node.js + Express + JWT | 与 Python 后端共用 JWT Secret |
| AI 编排 | **LangGraph** | Agent 有向图、条件路由 |
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

本项目建立了 **「自动 RAG 指标 + 人工盲评 + Golden Set 回归 + E2E Selenium」** 四层评测体系，用于验证简历优化质量与系统稳定性。

### 10.1 评测体系总览

```
┌─────────────────────────────────────────────────────────────┐
│                     评测体系                                 │
├──────────────┬──────────────┬──────────────┬────────────────┤
│ 自动 RAG 指标 │  人工盲评     │ Golden Set   │  Selenium E2E  │
│ (离线批量)   │ (问卷+统计)   │ (CI 回归)    │  (端到端)       │
├──────────────┼──────────────┼──────────────┼────────────────┤
│ runner.py    │ human_eval.py│ pytest       │ test_*_selenium│
│ metrics.py   │ 盲法 A/B     │ golden_cases │ 真实浏览器流程  │
└──────────────┴──────────────┴──────────────┴────────────────┘
         │              │              │
         └──────────────┴──────────────┘
                        ▼
           evaluation-results/resume-rag/
             latest/report.json
             human/latest/summary.md
```

### 10.2 自动 RAG 指标

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

### 10.3 人工评测（Human Evaluation）

**材料目录**：`evaluation-results/resume-rag/human/`  
**汇总脚本**：`backend/evaluation/resume_rag/human_eval.py`

#### 设计原则

- **盲法（Blinding）**：评估者不知道 A/B 哪份是优化前/后
- **成对比较（Pairwise）+ 李克特量表（Likert）** 双轨采集
- 样本来自 Golden Cases 的 before/after 简历 PDF

#### 文件清单

| 文件 | 用途 |
|------|------|
| `survey_questionnaire.md` | 完整问卷题本 |
| `blinding_map.csv` | A/B 映射（仅研究者持有，勿泄露） |
| `pairwise_responses_template.csv` | 成对偏好记录 |
| `likert_responses_template.csv` | 五维 Likert 评分 |
| `rater_info_template.csv` | 评估者背景信息 |

#### 评估维度（Likert 1–5）

| 维度 | 含义 |
|------|------|
| `job_fit` | 与目标岗位匹配感 |
| `credibility` | 可信度（无夸大/造假感） |
| `professionalism` | 专业度与表达质量 |
| `highlights` | 亮点是否突出 |
| `overall_recommend` | 总体推荐程度 |

#### 工作流程

```
1. 从 golden_cases 导出 before/after 为统一格式 PDF
2. 按 blinding_map.csv 随机分配 A/B 标签
3. 发放问卷（survey_questionnaire.md）
4. 收集 CSV → pairwise_responses.csv / likert_responses.csv
5. 运行 human_eval.py 汇总，与 RAG report.json 对齐分析
```

#### 汇总命令

```bash
cd backend
python -m evaluation.resume_rag.human_eval \
  --pairwise ../evaluation-results/resume-rag/human/pairwise_responses.csv \
  --likert ../evaluation-results/resume-rag/human/likert_responses.csv \
  --blinding ../evaluation-results/resume-rag/human/blinding_map.csv \
  --rag-report ../evaluation-results/resume-rag/latest/report.json
```

#### 主指标

| 指标 | 含义 |
|------|------|
| `optimized_win_rate` | 盲评中优化版被偏好的比例 |
| `likert_delta_*` | 五维及 overall 的 after−before 均值 |
| `rag_correlation` | 人工 overall Δ 与 `match_score` Δ 的 Spearman 相关 |
| Binomial p-value | 相对 50% 随机猜测的显著性 |

#### 最新人工评测结果摘要

| 指标 | 结果 |
|------|------|
| Pairwise 判断数 | 6 |
| Optimized win rate | **100%**（6W / 0L / 0T） |
| Binomial p-value | 0.0312（vs 50%） |
| job_fit Δ | +2.25 |
| highlights Δ | +2.50 |
| overall_recommend Δ | +2.25 |

### 10.4 其他评测层

| 层级 | 路径 | 说明 |
|------|------|------|
| 答案评估 Golden Set | `test-data/golden/answer_evaluation_golden.json` | 面试答案评估回归 |
| CI 工作流 | `.github/workflows/evaluation-tests.yml` | 自动跑 golden tests |
| Selenium E2E | `backend/tests/selenium/` | 真实浏览器全流程 |
| LLM-as-Judge | `answer_evaluation_agent.py` | relevance / groundedness / actionability 三维 rubric |

### 10.5 自动 vs 人工：互补关系

| 维度 | 自动 RAG 指标 | 人工盲评 |
|------|---------------|----------|
| 成本 | 低，可 CI 批量跑 | 高，需招募评估者 |
| 客观性 | 高，可复现 | 受评估者背景影响 |
| 覆盖 | 关键词、向量、规则 | 整体感知、推荐意愿 |
| 样本量 | 易扩展 | 受时间限制 |
| 论文价值 | 量化基线 | 用户Study 证据 |

**推荐做法**：论文/答辩中同时引用 `evaluation-results/resume-rag/latest/summary.md`（自动）与 `human/latest/summary.md`（人工），并报告 Spearman 相关系数验证两者一致性。

---

## 11. 可观测性与并发控制

| 能力 | 实现 |
|------|------|
| LangSmith Tracing | `config.yaml` → `langsmith.tracing_v2: true` |
| Workflow Trace | `workflow/trace.py`，用户可见 Agent 执行摘要 |
| 日志 | `backend/log/`（agent / api / error 分文件） |
| 健康检查 | `GET /health`（含 MCP 索引） |
| Session 锁 | Redis `llm_queue` 防并发 OOM |

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
| RAG 自动评测 | `evaluation-results/resume-rag/README.md` | 指标说明与运行方式 |
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
```

---

*文档版本：2026-07-08 · 随代码库演进请同步更新 embedding provider 与评测结果路径。*
