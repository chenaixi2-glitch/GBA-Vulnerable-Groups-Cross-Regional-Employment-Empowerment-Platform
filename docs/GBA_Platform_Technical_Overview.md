# GBA Cross-Border Employment Empowerment Platform — Technical Overview

> Comprehensive project documentation covering AI core modules (intent recognition, Agent orchestration, tool calling, MCP), vector store and RAG, Embedding / PyTorch deployment options, Docker containerization, and automated plus human evaluation.  
> Use alongside the [Requirements & Technical Solution](../GBA_Cross-Border_Employment_Empowerment_Platform_Requirements_and_Technical_Solution_Document.md), [Deployment Guide](../backend/DEPLOYMENT.md), and [Testing Guide](../backend/TESTING_GUIDE.md).  
> **中文版本：** [GBA_项目完整技术介绍.md](GBA_项目完整技术介绍.md)

---

## Table of Contents

1. [Project Scope & Overall Architecture](#1-project-scope--overall-architecture)
2. [Technology Stack](#2-technology-stack)
3. [Docker Container Deployment](#3-docker-container-deployment)
4. [AI Core Modules](#4-ai-core-modules)
5. [Embedding & Local PyTorch Inference](#5-embedding--local-pytorch-inference)
6. [Vector Store — ChromaDB](#6-vector-store--chromadb)
7. [RAG — Retrieval-Augmented Generation](#7-rag--retrieval-augmented-generation)
8. [MCP & Tool Layer](#8-mcp--tool-layer)
9. [LangGraph Workflow Orchestration](#9-langgraph-workflow-orchestration)
10. [Evaluation Framework (Automated + Human)](#10-evaluation-framework-automated--human)
11. [Observability & Concurrency Control](#11-observability--concurrency-control)
12. [Documentation Index](#12-documentation-index)

---

## 1. Project Scope & Overall Architecture

### 1.1 Project Scope

The GBA (Guangdong–Hong Kong–Macao Greater Bay Area) Cross-Border Employment Empowerment Platform serves vulnerable groups seeking cross-border employment in the GBA region. Core capabilities include:

- **AI Resume Optimization**: material extraction → gap analysis → content generation → layout rendering → multi-format export
- **AI Job Matching**: skills-first blind screening mechanism
- **AI Mock Interview**: structured question sets + interactive multi-turn simulation + answer evaluation
- **AI Learning Path**: resource recommendations and timeline planning based on skill gaps
- **Multilingual Support**: Simplified Chinese, Traditional Chinese, English, Portuguese

### 1.2 Three-Tier Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         User Browser                                 │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
┌───────────────┐     ┌─────────────────┐     ┌─────────────────────┐
│ Static Frontend│     │ Node.js Auth API │     │ Python AI Backend   │
│ individual/   │     │ server/ :3000   │     │ backend/ :8000      │
│ corporate/    │     │ JWT / Users/Jobs│     │ LangGraph Agents    │
└───────────────┘     └────────┬────────┘     └──────────┬──────────┘
                               │                          │
                               │    ┌─────────────────────┤
                               │    │                     │
                               ▼    ▼                     ▼
                    ┌──────────────────┐      ┌──────────────────┐
                    │ Alibaba Cloud RDS  │      │ Redis Session    │
                    │ MySQL              │      │ Cache + LLM Queue│
                    │ gba_website        │      └──────────────────┘
                    │ ai_career_copilot  │
                    └──────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │ ChromaDB Local      │
                    │ Vector Store        │
                    │ ./data/chroma       │
                    └─────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │ External AI APIs      │
                    │ SiliconFlow (LLM)     │
                    │ DashScope (Embed)     │
                    │ or local PyTorch      │
                    └─────────────────────┘
```

| Service | Directory | Port | Responsibility |
|---------|-----------|------|----------------|
| Static frontend | `individual/`, `corporate/`, `assets/` | 8080 / Docker 3001 | UI, i18n |
| Node auth API | `server/` | 3000 | Registration, login, JWT, job matching, resume CRUD |
| Python AI backend | `backend/` | 8000 | Agent orchestration, RAG, MCP, resume AI pipeline |
| Redis | Host or external | 6379 | Session state, LLM queue lock |
| MySQL RDS | Alibaba Cloud | 3306 | Persistent user and business data |
| ChromaDB | `backend/data/chroma/` | — | Vector index (local files) |

---

## 2. Technology Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Frontend | HTML / CSS / JavaScript | Framework-free SPA, 4-language i18n |
| Auth | Node.js + Express + JWT | Shared JWT secret with Python backend |
| AI orchestration | **LangGraph** | Agent directed graph, conditional routing |
| LLM calls | **LangChain** + OpenAI-compatible API | SiliconFlow DeepSeek-R1 |
| Structured output | Pydantic JSON Schema | Not OpenAI Function Calling |
| Embedding | DashScope API **or** HuggingFace + **PyTorch** | Configurable switch |
| Rerank | DashScope API **or** sentence-transformers CrossEncoder | Configurable switch |
| Vector store | **ChromaDB** PersistentClient | Local persistence, no separate purchase |
| Tool protocol | **MCP** (FastMCP + SSE) | Job lookup, document parsing |
| Containerization | **Docker Compose** | backend + frontend nginx |
| Observability | LangSmith | Agent traces, evaluation traces |
| Testing | pytest + Selenium + Golden Set | Unit / integration / E2E / evaluation |

---

## 3. Docker Container Deployment

### 3.1 Container Composition

The project orchestrates two services via `docker-compose.yml`:

| Container | Dockerfile | Description |
|-----------|------------|-------------|
| `ai-career-copilot-backend` | `docker/backend/Dockerfile` | Python 3.10-slim + WeasyPrint dependencies |
| `ai-career-copilot-frontend` | `docker/frontend/Dockerfile` | nginx:1.27-alpine serving static pages |

**Dependencies outside Compose** (connected via environment variables):

- MySQL: Alibaba Cloud RDS
- Redis: host `host.docker.internal:6379`
- Node auth API: host `:3000` (nginx reverse proxy)

### 3.2 Startup Flow

```
docker-compose up
    │
    ├─ backend container
    │     ├─ entrypoint.sh → python sql/init_db.py (schema init)
    │     └─ uvicorn main:app --host 0.0.0.0 --port 8000
    │
    └─ frontend container (depends on backend healthy)
          └─ nginx serves static assets + API routing
```

Backend health check: `GET /health`  
Frontend health check: `wget http://127.0.0.1/`

### 3.3 Nginx API Routing (frontend container)

| Path prefix | Proxy target | Notes |
|-------------|--------------|-------|
| `/api/auth`, `/api/jobs`, … | `host.docker.internal:3000` | Node auth and business APIs |
| `/api/*` (remaining) | `backend:8000` | Python AI backend |
| `/mcp/*` | `backend:8000` | MCP SSE long connection (buffering off) |
| `/health` | `backend:8000` | Health check |

### 3.4 Environment Variables

Copy `.env.docker.example` to `.env.docker` and configure:

- `MYSQL_HOST` / `MYSQL_PASSWORD` — RDS connection
- `REDIS_HOST=host.docker.internal` — host Redis
- `SILICONFLOW_API_KEY` — LLM
- `DASHSCOPE_API_KEY` — Embedding / Rerank (cloud option)
- `LANGCHAIN_API_KEY` — LangSmith (optional)

### 3.5 Docker Notes for ChromaDB & PyTorch

| Scenario | Recommendation |
|----------|----------------|
| ChromaDB persistence | Mount volume to `/app/backend/data/chroma` |
| Default cloud embedding | No PyTorch needed; image ~1.5 GB |
| Local PyTorch embedding | Add `torch` + `sentence-transformers` to Dockerfile; 8 GB host RAM recommended |
| Production workers | `FASTAPI_WORKERS=1` to avoid OOM from multi-process model loading |

---

## 4. AI Core Modules

### 4.1 Module Overview

```
User message
    │
    ▼
┌─────────────┐
│   Planner    │  ← Intent recognition (LLM + rule engine)
│  planner.py  │
└──────┬──────┘
       │ execution_plan
       ▼
┌──────────────────────────────────────────────────┐
│  Specialist Agent nodes (LangGraph)               │
│  jd_agent / profile_agent / gap_agent /          │
│  content_agent / render_agent / interview_agent /│
│  question_agent / answer_evaluation_agent /      │
│  learning_path_agent                             │
└──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  tools/     │     │  MCP SSE    │     │  RAG search │
│  helpers    │     │  external   │     │  ChromaDB   │
└─────────────┘     └─────────────┘     └─────────────┘
```

### 4.2 Intent Recognition

**Implementation files**: `backend/agents/planner.py`, `backend/prompts/intent_classification.py`

Intent recognition uses a **two-stage design: LLM classification + deterministic rule post-processing**, not simple keyword matching.

#### Stage A: LLM Structured Classification

- Calls the primary LLM with output constrained to Pydantic schema `IntentClassificationOutput`
- Prompt selection by `context_scope`:
  - **Global scope** (12 intents): `INTENT_CLASSIFICATION_PROMPT`
  - **Resume edit page** (5 sub-intents): `RESUME_EDIT_INTENT_CLASSIFICATION_PROMPT`
- Injects `memory_context` (dialogue memory) for coreference resolution (e.g. “make it shorter” — which section?)
- Input state flags: `has_job`, `has_profile`, `has_resume`

#### Global Intent List

| Intent | Meaning | Routed Agent |
|--------|---------|--------------|
| `upload_jd` | Upload or paste job description | `jd_agent` |
| `upload_profile` | Upload personal materials | `profile_agent` |
| `profile_patch` | Incremental material update | `profile_agent` |
| `gap_analysis` | Skill gap analysis | `gap_agent` |
| `learning_path` | Learning path / resources / timeline | `learning_path_agent` |
| `content_edit` | Edit resume text content | `content_agent` → `render_agent` |
| `language_convert` | Multilingual resume conversion | `content_agent` → `render_agent` |
| `render_edit` | Layout / styling adjustments | `render_agent` |
| `export` | Export resume | No agent (points to export API) |
| `start_interview` | Generate interview questions | `interview_agent` |
| `evaluate_answer` | Evaluate interview answer | `answer_evaluation_agent` |
| `ask_question` | Q&A based on current state | `question_agent` |

#### Stage B: Rule Engine `resolve_intent()`

After LLM output, deterministic rules apply corrections:

- **Learning resource keywords** → force `learning_path` (overrides misclassified `gap_analysis`)
- **Duration text without profile** → downgrade `gap_analysis` to `upload_profile`
- **`context_scope=resume_edit`** → clamp intent to 5 edit-class intents
- **Regex overrides**: language conversion, layout edits, pure Q&A routed separately
- **Client bypass**: `forced_intent` skips LLM for frontend button shortcuts

#### Design Benefits

- LLM handles natural language ambiguity; rules stabilize critical paths
- Scope clamping prevents resume edit page from triggering global flows
- Full-chain `workflow_trace` records intent and routing decisions for user visibility

### 4.3 Agent System

| Agent | File | Core Capability |
|-------|------|-----------------|
| Planner | `planner.py` | Intent classification, execution plan |
| JD Agent | `jd_agent.py` | JD parsing/generation, cache reuse |
| Profile Agent | `profile_agent.py` | Material extraction, incremental patch |
| Gap Agent | `gap_agent.py` | Job–skill gap analysis |
| Content Agent | `content_agent.py` | Resume JSON content generation/editing |
| Render Agent | `render_agent.py` | HTML rendering, PDF page adaptation |
| Interview Agent | `interview_agent.py` | Structured interview question sets |
| Question Agent | `question_agent.py` | Free-form Q&A + **RAG retrieval** + jobs API |
| Answer Evaluation | `answer_evaluation_agent.py` | Answer scoring + LLM-as-Judge 3D rubric |
| Learning Path | `learning_path_agent.py` | Gaps → resource recommendations → timeline |

**Shared patterns**:

- All Agent LLM outputs go through `ainvoke_json_with_schema` or `ainvoke_json_with_language_guard`
- JSON contracts defined in `backend/agents/json_contracts.py`
- Gap analysis core logic in `gap_analysis_core.py` shared by `gap_agent` and `learning_path_agent`

**Independent API outside the graph**:

- `interactive_interview_agent.py` — multi-turn mock interview (poll/turn/debrief), not via LangGraph

### 4.4 Tool Calling Design Philosophy

This project **does not use OpenAI Function Calling loops**. Instead:

| Pattern | Description | Example |
|---------|-------------|---------|
| **JSON Schema structured output** | LLM returns fixed Pydantic models | All Agent content generation |
| **Python tool functions** | Direct calls inside Agents | `file_parser`, `resume_export` |
| **HTTP bridge** | Call Node API | `node_jobs_client.fetch_matched_jobs` |
| **MCP standard protocol** | Expose reusable tools externally | `gba-jobs`, `gba-docs` |

Rationale:

- Agent outputs must strictly match resume JSON, gap reports, etc.; JSON Schema is more controllable than tool calls
- Internal tools live as Python functions in `backend/tools/` (22 modules) — low latency, type-safe
- MCP targets external Agents or IDE integration, coexisting with LangGraph

---

## 5. Embedding & Local PyTorch Inference

### 5.1 Layered Architecture

```
Business code (rag_service / dialogue_memory / evaluation)
        │
        ▼
models/embedding.py  ·  models/rerank.py     ← LangChain unified wrapper
        │
   ┌────┴────┐
   ▼         ▼
DashScope   HuggingFaceEmbeddings / CrossEncoder
 API           │
                ▼
            PyTorch (local inference engine)
                │
                ▼
            Pre-trained model weights (BGE, etc.)
```

- **PyTorch** is the neural network compute engine, not the embedding package itself
- **LangChain** provides a thin `HuggingFaceEmbeddings` wrapper on the local path
- **ChromaDB** stores vectors only; it does not generate them

### 5.2 Current Default (Cloud API)

```yaml
# backend/config.yaml
embedding:
  provider: dashscope
  model: text-embedding-v4

rerank:
  provider: dashscope
  model: gte-rerank-v2
```

| Option | Pros | Cons |
|--------|------|------|
| DashScope API | No server RAM, strong Chinese/multilingual, simple deploy | Pay per call |
| Local PyTorch | No API cost, data stays on server | 4–8 GB RAM, slower CPU inference |

### 5.3 Switching to Local PyTorch

Edit `config.yaml` — **no business code changes required**:

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

Additional install:

```bash
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install sentence-transformers
```

**Important**: switching embedding models changes vector dimensions — clear ChromaDB and re-index:

```bash
rm -rf backend/data/chroma/*
```

### 5.4 Server Sizing Recommendations

| Spec | Use Case |
|------|----------|
| 2 GB (current lightweight) | Cloud DashScope only; not suitable for local PyTorch |
| 4 GB + Swap | Small models + single worker; barely workable |
| **8 GB (recommended)** | Local embedding + rerank + full stack |
| 16 GB + GPU | High concurrency or local LLM (this project still uses LLM API) |

### 5.5 Supported Provider List

**Embedding** (`models/embedding.py`): `dashscope`, `openai`, `azure_openai`, `ollama`, `huggingface`

**Rerank** (`models/rerank.py`): `dashscope`, `cohere`, `huggingface` (CrossEncoder)

---

## 6. Vector Store — ChromaDB

### 6.1 Role

ChromaDB in this project is an **embedded local vector database**. Data persists to disk at `./data/chroma`. **No separate cloud database purchase** (unlike MySQL RDS).

### 6.2 Implementation Details

**File**: `backend/storage/vector_client.py`

```python
# Singleton PersistentClient
_client = chromadb.PersistentClient(path="./data/chroma")

# Two collections (caller supplies embeddings; no built-in embedder)
session_chunks   # Session-level RAG index
user_memory      # Cross-session dialogue summaries
```

| Collection | Purpose | Key Metadata |
|------------|---------|--------------|
| `session_chunks` | Current session JD / Profile / Resume / Gaps for RAG | `session_id`, `chunk_type` |
| `user_memory` | Logged-in user cross-session dialogue summaries | `user_id`, `type` |

- Distance metric: `hnsw:space: cosine`
- Graceful degradation: if `chromadb` is not installed or `vector_store.enabled=false`, RAG and cross-session memory are skipped

### 6.3 Division of Labor vs MySQL / Redis

| Store | Data Type | Persistence |
|-------|-----------|-------------|
| **Redis** | Current session CopilotState (hot data) | Evictable (LRU) |
| **MySQL** | User-saved resumes, interview records | Permanent |
| **ChromaDB** | Vector index + dialogue summary vectors | Local files, migrates with deployment |

### 6.4 Operations

- Backup: copy the `data/chroma/` directory
- Migration: must rebuild index after switching embedding models
- Docker: recommend volume mount to survive container rebuilds
- Memory: retrieval usage scales with index size; thesis-scale typically < 100 MB

---

## 7. RAG — Retrieval-Augmented Generation

### 7.1 RAG Scope in This Project

RAG here is **session-level artifact indexing**, not general document Q&A:

- Index sources: JD, candidate Profile, resume content, gap summary within the current session
- Primary consumer: `question_agent` (e.g. “What is my target job?”, “What projects are on my resume?”)
- Other Agents read structured `CopilotState` directly, without vector search

### 7.2 Full Pipeline

```
CopilotState (JD + Profile + Resume + Gaps)
        │
        ▼
build_chunks_from_state()          ← Business chunking, not generic TextSplitter
        │
        ▼
aembed_documents()                 ← Embedding (DashScope or PyTorch)
        │
        ▼
ChromaDB session_chunks upsert     ← Full replace by session_id
        │
        ╞═══ User question ═══╗
        │                    ▼
        │              aembed_query()
        │                    │
        │                    ▼
        │              Vector search top_k=10
        │                    │
        │                    ▼
        │              arerank_texts()    ← Rerank top_n=5
        │                    │
        └────────────────────┴──→ question_agent injects into prompt
```

### 7.3 Chunking Strategy

**File**: `backend/services/rag_service.py`

Semantic business chunks, max 1200 characters each:

| Chunk ID prefix | Content |
|-----------------|---------|
| `job:title` | Target job title |
| `job:responsibilities` | Job responsibility list |
| `job:skills` | Hard/soft skills, tech stack, keywords |
| `profile:{fact_id}` | Candidate fact entries |
| `resume:summary` | Resume summary |
| `resume:{section}:{item_id}` | Section items |
| `gaps:summary` | Gap analysis summary |

**Rationale**: resumes and JDs are highly structured; semantic chunking is more precise than fixed-window splitting and avoids truncating individual bullets.

### 7.4 Indexing & Retrieval Parameters

```yaml
# backend/config.yaml
rag:
  enabled: true
  search_top_k: 10      # Vector search candidates
  rerank_top_n: 5       # Results after reranking
  min_score: 0.0
```

| Step | Description |
|------|-------------|
| Index trigger | After each chat, background task `index_session_safe()` |
| Index strategy | Delete then upsert by `session_id` (full replace) |
| Retrieval filter | `where={"session_id": session_id}` for session isolation |
| Score conversion | `score = 1 - distance` (cosine space) |
| Rerank fallback | On rerank failure, fall back to vector order |

### 7.5 Dialogue Memory (Related but Separate)

**File**: `backend/services/dialogue_memory.py`

| Mechanism | Description |
|-----------|-------------|
| Short-term buffer | Last 6 raw dialogue turns |
| Compression | After 10 turns, LLM compresses to summary + facts |
| Cross-session memory | Summary embeddings written to `user_memory` collection |
| Planner consumption | `memory_context` injected into intent classification prompt |

### 7.6 RAG Mapping in Evaluation

Automated metrics map directly to RAG quality dimensions (see Section 10):

| RAG Dimension | Evaluation Metrics |
|---------------|-------------------|
| Relevance | `jd_keyword_coverage`, `jd_embedding_similarity` |
| Faithfulness | `profile_groundedness`, `unsupported_bullet_count` |
| Utility | `match_score`, `checklist_pass_rate` |

---

## 8. MCP & Tool Layer

### 8.1 MCP (Model Context Protocol)

MCP is a **standard tool exposure protocol** for AI Agents. This project uses **FastMCP + SSE transport**, mounted on the same Python FastAPI process.

**Files**: `backend/mcp_servers/mount.py`, `jobs.py`, `docs.py`

#### Exposed MCP Servers

| Server | Mount Path | Tools | Description |
|--------|------------|-------|-------------|
| `gba-jobs` | `/mcp/jobs` | `get_matched_jobs(token, limit)` | Bridges Node `GET /jobs/matched` |
| `gba-docs` | `/mcp/docs` | `parse_document_base64(...)` | PDF/DOCX/MD/TXT parsing |
| | | `list_supported_document_formats()` | List supported formats |

#### Transport & Access

```
External MCP Client (Cursor / Claude Desktop / custom Agent)
        │
        │  SSE long connection
        ▼
GET /mcp/jobs/sse
POST /mcp/jobs/messages/
        │
        ▼
FastMCP → node_jobs_client / file_parser
```

- Nginx disables proxy buffering for `/mcp/`; read timeout 86400s
- Health check index: `GET /health` returns MCP server metadata

#### MCP vs LangGraph

| Path | Use Case |
|------|----------|
| MCP SSE | External Agent / IDE integration calling platform capabilities |
| Internal HTTP | `question_agent` calls `fetch_matched_jobs()` directly |
| Python tools | Agents call `backend/tools/` internally |

All three coexist; MCP is not a prerequisite for LangGraph execution.

### 8.2 `backend/tools/` Library

| Module | Function |
|--------|----------|
| `file_parser.py` | PDF/DOCX/MD/TXT parsing |
| `resume_export.py` | PDF/DOCX/HTML export (WeasyPrint) |
| `template_renderer.py` | Jinja2 resume HTML rendering |
| `resume_layout.py` / `resume_page_policy.py` / `typography_ladder.py` | Layout and page policy |
| `resume_language_checklist.py` | Multilingual resume compliance checks |
| `resume_profile_context.py` | Profile JSON building and batching |
| `target_job_context.py` | JD context JSON |
| `output_language.py` / `output_language_guard.py` | Output language control |
| `quantification_questions.py` | Gap quantification follow-ups |
| `interview_program.py` | Interview stage program config |
| `jd_cache.py` | JD cache hash/title |
| `node_jobs_client.py` | Node jobs API bridge |

---

## 9. LangGraph Workflow Orchestration

### 9.1 Graph Structure

**File**: `backend/workflow/graph.py`

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

Other direct nodes: `question_agent`, `answer_evaluation_agent`, `learning_path_agent`, `render_agent`

### 9.2 State Management

- **CopilotState** (`workflow/state.py`): 430+ line Pydantic model holding JD, Profile, Resume JSON, Interview, Learning Path, etc.
- **Redis persistence**: read/write full state on each chat request
- **MySQL**: written only when user explicitly saves resume
- **workflow_trace**: runtime trace generating user-visible process summary; not persisted

### 9.3 Concurrency & Locking

```yaml
llm_queue:
  enabled: true
  max_concurrent: 2        # Recommended for 2 GB production
  session_lock_ttl_seconds: 600
```

- Concurrent requests on same session return 409 `SESSION_BUSY`
- LLM calls queued to prevent OOM on 2 GB machines

---

## 10. Evaluation Framework (Automated + Human)

The project implements a **four-layer evaluation framework**: automated RAG metrics + human blind evaluation + Golden Set regression + E2E Selenium, to validate resume optimization quality and system stability.

### 10.1 Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  Evaluation Framework                        │
├──────────────┬──────────────┬──────────────┬────────────────┤
│ Auto RAG     │ Human blind  │ Golden Set   │ Selenium E2E   │
│ metrics      │ evaluation   │ (CI regress) │ (end-to-end)   │
├──────────────┼──────────────┼──────────────┼────────────────┤
│ runner.py    │ human_eval.py│ pytest       │ test_*_selenium│
│ metrics.py   │ blind A/B    │ golden_cases │ real browser   │
└──────────────┴──────────────┴──────────────┴────────────────┘
         │              │              │
         └──────────────┴──────────────┘
                        ▼
           evaluation-results/resume-rag/
             latest/report.json
             human/latest/summary.md
```

### 10.2 Automated RAG Metrics

**Code**: `backend/evaluation/resume_rag/metrics.py`, `runner.py`  
**Golden cases**: `backend/evaluation/resume_rag/fixtures/golden_cases.json`  
**Results**: `evaluation-results/resume-rag/latest/`

#### Metric Definitions

| Metric | RAG Dimension | Meaning | Computation |
|--------|---------------|---------|-------------|
| `jd_keyword_coverage` | Relevance | JD keyword coverage in resume text | Intersection / total JD keywords |
| `jd_embedding_similarity` | Relevance | Resume–JD vector cosine similarity | Embedding API or local model |
| `profile_groundedness` | Faithfulness | Resume bullet alignment with profile facts | Lexical/embedding overlap mean |
| `unsupported_bullet_count` | Hallucination | Count of low-alignment bullets | Bullets below groundedness threshold |
| `match_score` | Utility | Job–resume match score (0–100) | Python port of Node `match.service.js` |
| `checklist_pass_rate` | Compliance | Multilingual resume rule pass rate | `resume_language_checklist` rules |

#### Improvement Criteria

A before → after optimization is marked **IMPROVED** when:

- No regression (groundedness drop ≤ 3%)
- At least one of JD keyword coverage, match_score, or checklist improves

#### How to Run

```bash
cd backend

# Lexical metrics only (no API key, CI-friendly)
python -m evaluation.resume_rag.runner --no-embeddings

# Include embedding metrics
python -m evaluation.resume_rag.runner --embeddings

# pytest regression
pytest tests/test_resume_rag_metrics.py -v
```

#### Latest Automated Results Summary

| Case | JD Keyword Δ | Groundedness Δ | Match Score Δ |
|------|--------------|----------------|---------------|
| alex_chen_cross_border_cs | +88.89% | +0.123 | +34 |
| aixi_ai_application_dev | +75.00% | +0.210 | +36 |

2/2 cases improved; average match_score Δ **+35**.

### 10.3 Human Evaluation

**Materials**: `evaluation-results/resume-rag/human/`  
**Aggregation script**: `backend/evaluation/resume_rag/human_eval.py`

#### Design Principles

- **Blinding**: raters do not know which of A/B is before/after
- **Pairwise comparison + Likert scale** dual-track collection
- Samples from Golden Cases before/after resume PDFs

#### File List

| File | Purpose |
|------|---------|
| `survey_questionnaire.md` | Full questionnaire |
| `blinding_map.csv` | A/B mapping (researchers only — do not disclose) |
| `pairwise_responses_template.csv` | Pairwise preference records |
| `likert_responses_template.csv` | Five-dimension Likert scores |
| `rater_info_template.csv` | Rater background metadata |

#### Evaluation Dimensions (Likert 1–5)

| Dimension | Meaning |
|-----------|---------|
| `job_fit` | Perceived fit with target job |
| `credibility` | Trustworthiness (no exaggeration/fabrication) |
| `professionalism` | Professional tone and expression quality |
| `highlights` | Whether strengths stand out |
| `overall_recommend` | Overall recommendation level |

#### Workflow

```
1. Export before/after from golden_cases as uniform PDFs
2. Randomly assign A/B labels per blinding_map.csv
3. Distribute questionnaire (survey_questionnaire.md)
4. Collect CSV → pairwise_responses.csv / likert_responses.csv
5. Run human_eval.py; align with RAG report.json
```

#### Aggregation Command

```bash
cd backend
python -m evaluation.resume_rag.human_eval \
  --pairwise ../evaluation-results/resume-rag/human/pairwise_responses.csv \
  --likert ../evaluation-results/resume-rag/human/likert_responses.csv \
  --blinding ../evaluation-results/resume-rag/human/blinding_map.csv \
  --rag-report ../evaluation-results/resume-rag/latest/report.json
```

#### Primary Metrics

| Metric | Meaning |
|--------|---------|
| `optimized_win_rate` | Share of blind judgments preferring the optimized version |
| `likert_delta_*` | Mean after−before on five dimensions and overall |
| `rag_correlation` | Spearman correlation between human overall Δ and `match_score` Δ |
| Binomial p-value | Significance vs 50% random guessing |

#### Latest Human Evaluation Summary

| Metric | Result |
|--------|--------|
| Pairwise judgments | 6 |
| Optimized win rate | **100%** (6W / 0L / 0T) |
| Binomial p-value | 0.0312 (vs 50%) |
| job_fit Δ | +2.25 |
| highlights Δ | +2.50 |
| overall_recommend Δ | +2.25 |

### 10.4 Other Evaluation Layers

| Layer | Path | Description |
|-------|------|-------------|
| Answer evaluation Golden Set | `test-data/golden/answer_evaluation_golden.json` | Interview answer evaluation regression |
| CI workflow | `.github/workflows/evaluation-tests.yml` | Automated golden tests |
| Selenium E2E | `backend/tests/selenium/` | Full browser flows |
| LLM-as-Judge | `answer_evaluation_agent.py` | relevance / groundedness / actionability rubric |

### 10.5 Automated vs Human: Complementary Roles

| Dimension | Automated RAG Metrics | Human Blind Evaluation |
|-----------|----------------------|------------------------|
| Cost | Low; CI batch runs | High; requires recruiting raters |
| Objectivity | High; reproducible | Influenced by rater background |
| Coverage | Keywords, vectors, rules | Holistic perception, recommendation intent |
| Sample size | Easy to scale | Time-limited |
| Thesis value | Quantitative baseline | User study evidence |

**Recommended practice**: cite both `evaluation-results/resume-rag/latest/summary.md` (automated) and `human/latest/summary.md` (human) in thesis/defense, and report Spearman correlation to validate consistency.

---

## 11. Observability & Concurrency Control

| Capability | Implementation |
|------------|----------------|
| LangSmith Tracing | `config.yaml` → `langsmith.tracing_v2: true` |
| Workflow Trace | `workflow/trace.py` — user-visible Agent execution summary |
| Logging | `backend/log/` (agent / api / error split files) |
| Health check | `GET /health` (includes MCP index) |
| Session lock | Redis `llm_queue` prevents concurrent OOM |

---

## 12. Documentation Index

| Document | Path | Content |
|----------|------|---------|
| **This document (EN)** | `docs/GBA_Platform_Technical_Overview.md` | Full AI / RAG / MCP / evaluation overview |
| **中文完整介绍** | `docs/GBA_项目完整技术介绍.md` | Same content in Simplified Chinese |
| Requirements & solution | `GBA_Cross-Border_Employment_Empowerment_Platform_Requirements_and_Technical_Solution_Document.md` | Product requirements, scope |
| Python deployment | `backend/DEPLOYMENT.md` | RDS / Redis / 2 GB memory constraints |
| Backend testing | `backend/TESTING_GUIDE.md` | API testing, environment setup |
| Testing summary | `TESTING_SUMMARY.md` | Project-wide test index |
| RAG automated eval | `evaluation-results/resume-rag/README.md` | Metrics and run instructions |
| Human evaluation | `evaluation-results/resume-rag/human/README.md` | Blind eval workflow and aggregation |
| Jobs setup | `docs/MY_JOBS_SETUP.md` | Node jobs module |
| i18n coverage | `docs/i18n-coverage-report.md` | Four-language i18n |
| Node auth API | `server/README.md` | JWT and user API |
| Docker compose | `docker-compose.yml` | Container definitions |
| Docker env template | `.env.docker.example` | Environment variables |

---

## Appendix: Key Configuration Reference

```yaml
# backend/config.yaml — core sections

llm:
  provider: openai_compatible
  model: deepseek-ai/DeepSeek-R1-0528-Qwen3-8B
  api_base: https://api.siliconflow.cn/v1

embedding:
  provider: dashscope          # Switch to huggingface + PyTorch
  model: text-embedding-v4

rerank:
  provider: dashscope          # Switch to huggingface + CrossEncoder
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

*Document version: 2026-07-08 · Keep embedding provider and evaluation result paths in sync as the codebase evolves.*
