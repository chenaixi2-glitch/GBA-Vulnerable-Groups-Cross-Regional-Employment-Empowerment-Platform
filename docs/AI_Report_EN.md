# 5. System Design & Technical Implementation

## 5.1 Introduction

Cross-regional human-resource mobility across the Guangdong–Hong Kong–Macao Greater Bay Area (GBA) “9+2” city cluster is a key driver of regional co-development. However, vulnerable groups—including persons with disabilities, older workers, and low-income youth—still face structural barriers in cross-regional job seeking, such as information gaps, label-based discrimination, and insufficient skill expression. The platform’s core architecture, foundational AI empowerment framework, and accessible interaction system have been built and are now in a phase of feature refinement and pilot operation. This chapter explains the system’s technical design and implementation: how website modules are organized and coordinated, and how the database and APIs support skills-first and blind-screening matching.

## 5.2 Design Goals and Business Loop

### 5.2.1 Design Goals

| Design Goal | Code Implementation |
|-------------|-------------------|
| Skills-first, competency-based matching | Four-dimensional scoring in Node `match.service.js` plus hard-criteria filtering |
| Reduce label discrimination; expand friendly job supply | `group_types` inference, friendly-job ranking, external job crawler |
| One-stop employment loop | Registration & profile → resume → match & apply → interview → learning → legal aid |
| Differentiated dual-portal services | `individual/` job-seeker portal and `corporate/` employer portal |
| Deployable and demo-ready | Docker Compose + Nginx routing + health checks |

### 5.2.2 Design Principles

**(1) Separation of business state and AI state**

User accounts, jobs, applications, donations, and legal-aid records are stored in the Node-managed `gba_website` database. AI sessions, resume drafts, and interview Q&A are stored in the Python-managed `ai_career` database. Structured resume snapshots required for matching are synchronized from the AI side to the business database via `PUT /api/resumes/me`, so the matching engine does not directly depend on the AI database, reducing coupling.

**(2) Unified identity with per-service validation**

Node issues JWTs; the Python backend reuses the same `JWT_SECRET` for verification (`backend/auth/jwt.py`), avoiding inconsistent login systems across the two stacks.

**(3) Priority access for vulnerable groups**

At registration, fields such as age, disability type, career gap, and income are used by `inferGroupTypes()` to automatically infer `group_types` (see `server/src/constants/groupTypes.js`). Individual users in vulnerable groups do not need to donate to unlock advanced features; corporate users get basic recruiting for free, while premium features such as interview suites require donation unlock (`access.service.js`).

**(4) Lightweight front-end for accessible browsing**

The platform uses a multi-page static site (HTML/CSS/vanilla JavaScript) without a React/Vue build chain, enabling page-by-page optimization for keyboard navigation and screen-reader compatibility.

**(5) Compliant aggregation of external jobs**

The crawler only fetches public APIs from the Guangdong Disabled Persons’ Employment Service Network (`jyfw.org.cn`), preserving `source_url` and `external_id`, and does not fabricate an application closed loop.

### 5.2.3 Evolution from Mid-term to Final Delivery

| Mid-term Module | Final Delivery | Representative Artifacts |
|-----------------|----------------|--------------------------|
| Platform Core Architecture and Infrastructure | Three-stack architecture, dual databases, Docker/Nginx, JWT, 13 DB migrations | `init.sql`, `docker-compose.yml`, `nginx.conf` |
| Basic AI Empowerment Framework | FastAPI API family; resume/interview/learning-path integration and result write-back | `backend/main.py`, dual-database resume sync |
| Inclusive Accessibility Interaction System | Lightweight MPA, corporate audit page, vulnerable-group inference and donation waiver | `groupTypes.js`, `access.service.js`, `audit.html` |

## 5.3 Overall Technical Architecture

### 5.3.1 Three-Stack Architecture

The platform adopts a three-stack architecture: **static multi-page front-end + Node.js business API + Python AI service**. In production, Nginx routes by path prefix. The data layer uses MySQL (dual databases) and Redis; vector retrieval uses local ChromaDB.

**Figure 1. GBA-VEEP Three-Stack Overall Architecture**

| Component | Directory | Port | Responsibility |
|-----------|-----------|------|----------------|
| Static front-end | `individual/`, `corporate/`, `assets/` | 8080 (local) / 80 (Docker) | Dual-portal UI, i18n |
| Node business API | `server/` | 3000 | Auth, jobs, matching, applications, donations, legal aid, interview invites, stats |
| Python AI backend | `backend/` | 8000 | Resume pipeline, mock/assessment interviews, learning paths, Chat, MCP |
| Job crawler | `crawler/` | Scheduled every ~30 min | Sync disability-network public jobs into `job_postings` |

### 5.3.2 Request Routing (Nginx Gateway)

Nginx in the Docker front-end container acts as a lightweight API gateway; configuration is in `docker/frontend/nginx.conf`.

In local development, the front-end uses `assets/js/node-api-base.js` to send business requests directly to `localhost:3000` and AI requests to `localhost:8000`, enabling independent service debugging.

| Path Prefix | Forward Target | Description |
|-------------|----------------|-------------|
| `/api/auth`, `/api/jobs`, `/api/company`, `/api/resumes`, `/api/donations`, `/api/legal-aid`, `/api/stats` | Node:3000 | Business and authentication |
| Remaining `/api/` | Python:8000 | AI capabilities (resume, interview, learning path, etc.) |
| `/mcp/` | Python:8000 | MCP SSE long connection (buffering disabled) |
| `/health` | Python:8000 | Health check |
| `/individual/`, `/corporate/` | Static files | Fallback to each portal’s `portal.html` |

### 5.3.3 Dual-Database Boundary

AI handles generation and assessment; Node handles permissions, persistence, and auditable business state.

| Database | Owner | Stored Content |
|----------|-------|----------------|
| `gba_website` | Node | Users, organizations, jobs, applications, donations, legal aid, interview invites, etc. |
| `ai_career_copilot` | Python | Sessions, JD cache, resume content, interview Q&A, learning-path plans, etc. |

## 5.4 Technology Choices

The platform uses three stacks rather than a monolith for three reasons. First, recruiting business rules (matching weights, donation unlock, organization permissions) differ substantially from LLM Agent lifecycles; separate stacks allow independent scaling and troubleshooting. Second, platform development and AI algorithm work can proceed in parallel within the team. Third, when AI inference times out or queues congest, job browsing, applications, and donations remain independently available.

`server/src/` follows classic MVC layering. A typical job-matching call chain is: route → `jobs.controller` → `job.model.listMatchedForUser()` → per-item calls to `userMatchesJobCriteria()` and `scoreJobResume()` → write to impression table → return scored list. This chain runs synchronously inside the Node process; at course-project scale, response time is acceptable. If user volume grows, scoring can move to async tasks or a two-stage architecture (vector recall + rule-based reranking) without replacing the three-stack design.

The two portals do not each maintain separate login/donation logic. Shared capabilities live in `assets/`. The team convention is: page changes in `individual/` or `corporate/`, business rules in `server/`, Agents in `backend/`, job supply in `crawler/`, deployment in `docker/`. This reduces merge conflicts and aligns this chapter’s architecture description with the repository layout.

| Layer | Technologies | Rationale |
|-------|--------------|-----------|
| Front-end | HTML5/CSS3/vanilla JS; Tailwind CDN; Axios; Chart.js | Multi-page static site; few dependencies; supports accessibility and rapid iteration |
| Business backend | Node.js ≥18, Express 4, mysql2, JWT, bcryptjs, helmet | Suited to JWT auth and CRUD business logic; natural JSON interaction with front-end |
| AI backend | Python, FastAPI, LangGraph, Pydantic, ChromaDB | Agent orchestration and structured output are more mature in the Python ecosystem |
| Document processing | pdfplumber, PyMuPDF, python-docx, WeasyPrint | Supports resume parsing and PDF/DOCX export |
| Data | MySQL 8 / MariaDB 10, Redis | Business persistence + session and LLM concurrency control |
| Crawler | Requests, PyMySQL, APScheduler | Scheduled fetch of disability-network public jobs |
| Deployment | Docker Compose, Nginx | Containerized front/back-end; Node can run on host against cloud RDS |

## 5.5 Deployment and Runtime Environment

For local development, static pages are served via `static-server.js` (default **8080**); `server/` runs Express on **3000**; `backend/` runs Uvicorn on **8000**, connecting to MySQL and Redis.

`docker-compose.yml` orchestrates two containers. MySQL (Alibaba Cloud RDS), Redis, and the Node API connect via environment variables and `host.docker.internal`. The database is not bundled into Compose, easing switching between local development and cloud demos.

Sensitive configuration is injected via `.env`, including `MYSQL_*`, `JWT_SECRET`, `SILICONFLOW_API_KEY`, `DASHSCOPE_API_KEY`, `REDIS_HOST`, etc.

## 5.6 Database and Core Data Model Design

### 5.6.1 Core Tables in Business Database `gba_website`

Based on `server/sql/init.sql` and subsequent migrations (v2 matching → v12 interview format), core tables are as follows.

**Table 5-1. Core Business-Database Entities**

| Table | Purpose | Key Fields / Design Notes |
|-------|---------|---------------------------|
| `users` | Accounts and profiles | `role` ∈ {individual, corporate, admin}; `age`/`gender`/`disability_type`/`career_gap_years`/`current_income`; `group_types` (JSON, system-inferred) |
| `company_orgs` / `company_org_members` | Multi-HR organizations | `invite_code`; member roles owner/recruiter/viewer |
| `company_profiles` | Employer profiles | Inclusivity statement; vulnerable-group-friendly tags |
| `job_postings` | Internal + crawled external jobs | `source`; `target_criteria`; `vulnerable_group_friendly`; `interview_format`; `skills` |
| `user_resumes` | Resume snapshot for matching | `content_json`, `skills_text`, `version` |
| `job_applications` | Applications | `match_score`, `match_reasons`, `resume_snapshot`, state machine |
| `job_match_impressions` | Match impression deduplication | Unique (job_id, user_id) |
| `job_external_interests` | External job redirect intent | Records outbound link interest |
| `donations` | Donation box | `purpose=legal_service` |
| `legal_aid_requests` / `legal_aid_responses` | Legal aid | Request → accept → platform assist; attachments as JSON (limited base64) |
| `interview_invites` | Corporate interview invitations | `invite_token`; board isolated by `invited_by_user_id`; score write-back |

### 5.6.2 Vulnerable-Group Type Inference Model

The system does not rely solely on self-selected labels. At registration or profile update, `inferGroupTypes()` automatically infers types (multiple may coexist):

| Type Key | Meaning | Inference Rule (Threshold) |
|----------|---------|----------------------------|
| `disability` | Persons with disabilities | `disability_type` exists and is not `none` |
| `elderly_45plus` | Workers aged 45+ | age ≥ 45 |
| `career_returner` | Women returning to work | female and career gap ≥ 1 year |
| `youth` | Low-income youth | age ≤ 30 and monthly income ≤ 8,000 CNY |

This design implements Proposal “tiered services for target populations” as computable rules and directly drives donation waiver, friendly-job filtering, and employer-side applicant ranking.

### 5.6.3 AI Database `ai_career_copilot` (Summary)

The AI database stores session-level objects: `sessions`, `jobs` (JD JSON), `candidate_profiles`, `resume_contents`, `render_configs`, `interview_qas`, `interactive_interview_sessions`, `learning_path_plans`, `jd_cache`, `conversation_events`, etc. Their lifecycle is bound to LLM interaction, suitable for frequent read/write and versioning. The business stack only consumes synchronized resume snapshots and interview score results.

## 5.7 Authentication, Roles, and Access Control

### 5.7.1 Registration, Login, and JWT Flow

1. Users register/login at `individual/auth.html` or `corporate/auth.html`.
2. Node `POST /api/auth/register|login` validates credentials and issues a JWT (payload includes sub/username/role).
3. Front-end `assets/js/auth-api.js` stores the token in `localStorage`.
4. Subsequent requests carry `Authorization: Bearer <token>`.
5. Node middleware `authenticate` / `requireRole` validates; Python `backend/auth/jwt.py` verifies with the same `JWT_SECRET` and enforces session ownership.

Corporate registration supports creating a new organization or joining via `org_invite_code`, enabling multi-HR collaboration.

### 5.7.2 Donation Unlock and Differentiated Permissions

`getPlatformAccess()` in `access.service.js` implements platform-level access policy:

| User Type | `has_access` | `has_premium_access` | Notes |
|-----------|--------------|----------------------|-------|
| admin | Yes | Yes | Always fully enabled |
| Vulnerable individual (`group_types` non-empty) | Yes | Yes | **Donation waiver** for core and premium features |
| Non-vulnerable individual | Requires at least one donation | Same | Donation purpose tagged as legal services |
| Corporate user | Yes (basic recruiting) | Requires donation | Interview suite and some HR premium tools need premium |

The front-end uses `platform-access.js` with `data-require-access` / `data-require-premium-access` attributes to control entry visibility, forming a sustainable “public donation → legal-services fund → feature unlock” mechanism aligned with the Proposal’s social-value narrative.

### 5.7.3 Resource-Level Permissions

- Internal corporate jobs: create/update/close requires owner or org member validation (`assertInternalJobOwner`, etc.).
- Interview board: isolated by `invited_by_user_id` to prevent cross-HR viewing within the same organization.
- Legal aid: roles split among applicant, responder, and platform assistant; attachments limited to 3 files, ≤200KB each.

Security hardening also includes helmet, login rate limiting, bcrypt password hashing, and input validation (express-validator).

## 5.8 Core Business Module Design

### 5.8.1 Job Management and External Job Aggregation

**Internal jobs:** When employers publish, records are written to `job_postings` (`source=internal`) with:

- Basic info: title, location, salary, education, experience, skills JSON;
- Hard targets `target_criteria`: age range, gender, disability openness, career-gap policy, priority for vulnerable groups;
- Interview mode `interview_format`: `ai_only` / `partial_custom` / `full_custom` / `human` (meeting link);
- System derives `target_group_types` and `vulnerable_group_friendly` tags from conditions.

**External jobs:** `crawler/` connects to the Guangdong disability employment network public API (hot jobs, employer list, jobs under employer), writes via `upsert_external_job` to the same table (`source=external`), and maintains `is_active_on_source`. The scheduler runs about every 30 minutes, so the job pool includes both employer-posted and disability-network friendly jobs, strengthening supply from “vulnerable-group-friendly employers.”

For external friendly jobs, hard matching filters may be relaxed (`userMatchesJobCriteria` passes external + friendly directly), avoiding blocking real opportunities when profile fields are incomplete. Outbound redirects record `job_external_interests`.

### 5.8.2 Skills-First Job Matching Engine (Node Deterministic Rules)

The Proposal’s Skills-First Matching Engine is implemented as an explainable scoring service `match.service.js` (not opaque vector matching—easier to defend and audit).

**(1) Hard filtering**

`userMatchesJobCriteria()` checks age/gender/disability/gap against job `target_criteria`; failures are excluded from recommendations.

**(2) Soft scoring (0–100)**

`scoreJobResume()` weighting:

| Dimension | Max Score | Logic Summary |
|-----------|-----------|---------------|
| Skill overlap | 50 | Fuzzy containment between job skills and resume skills/facts/summary |
| Education | 15 | Level mapping (PhD → high school, etc.) |
| Experience | 20 | Count of internship/project/work facts vs. job experience description |
| Description keywords | 15 | Job-description keyword hits in resume text |

Also returns `match_reasons` for front-end “why recommended,” demonstrating explainable AI/rule systems.

**(3) Impression and ranking**

Job seekers see lists sorted by score; `job_match_impressions` deduplicates and accumulates `matches_count`. On the employer side for friendly jobs, `sortApplicantsForCorporate()` ranks vulnerable-group status first, then match score—implementing “vulnerable groups prioritized for visibility.”

Note: semantic hidden-skill mining, radar visualization, and full blind-screening name hiding are enhanced capabilities coordinated with LangGraph Agents / front-end demo pages; details belong to Chapter 6. This chapter prioritizes reproducible business-rule implementation.

### 5.8.3 Applications, State Machine, and Resume Snapshots

When a job seeker applies to an internal job via `POST /api/jobs/:id/apply`, the system writes `job_applications`, freezing `resume_snapshot`, `match_score`, and `match_reasons` at that moment so employer review is unaffected by later resume edits. States: pending → reviewing → accepted/rejected. Job seekers can view “My Applications” and withdraw when rules allow.

### 5.8.4 Interview Invitations and Dual-Mode Interviews

Employers can send interview invitations for applications, creating `interview_invites` records and `invite_token`:

| Mode | Meaning | Job-Seeker Experience |
|------|---------|----------------------|
| `ai_only` | AI question-bank assessment only | Enters assessment interview page; system scores |
| `partial_custom` | AI + employer questions + follow-ups | Mixed question set |
| `full_custom` | Employer-authored questions only | Answers from job snapshot questions |
| `human` | Human meeting | Shows meeting link and join instructions |

Assessment interviews emphasize formal evaluation (no real-time coaching during the session). Completion writes back `overall_score`, `category_scores`, `debrief_summary`, etc., for the interview board. The individual portal also offers practice mock interviews for preparation, not formal employer scoring.

### 5.8.5 Donation Box and Legal-Aid Closed Loop

Donations are recorded in `donations` with default purpose `legal_service`, supporting the platform’s legal-aid funding narrative. The legal-aid module supports:

1. Applicant submits category, title, details, and attachments;
2. Lawyer/volunteer accepts (`legal_aid_responses` unique constraint prevents duplicates);
3. Applicant or admin triggers platform assistance;
4. Status flows to resolved/completed/cancelled.

This extends the “technical platform” into a “social-service collaboration entry point,” reflecting Proposal social value and compliance care—not merely job listings.

### 5.8.6 Corporate Statistics Dashboard

`/api/stats/corporate*` provides recruiting funnel, diversity, and team-related statistics for the corporate portal, visualized with Chart.js, supporting HR self-monitoring of inclusive hiring—a lightweight implementation of Diversity & Inclusion metrics from requirements.

## 5.9 AI Capability Integration Architecture (Overview)

This section describes integration boundaries only; algorithm and Agent orchestration details are in Chapter 6 (teammate responsibility).

### 5.9.1 Integration Pattern

Individual/corporate front-ends call Python FastAPI when intelligent capabilities are needed:

| Capability Domain | Typical Prefix | Platform Consumption |
|-------------------|----------------|----------------------|
| Dialogue orchestration | `/api/chat` | Portal assistant entry |
| Resume pipeline | `/api/resume/*`, `/api/export*` | Generate/polish/translate/render/PDF·DOCX |
| Interview | `/api/interview/*` | Mock practice and assessment interviews |
| Learning path | `/api/learning-path/*` | Gap diagnosis and timeline |
| Tool protocol | `/mcp/*` | Job query, document parsing, etc. |

The orchestration layer uses LangGraph + Plan-and-Execute: Planner detects intent and builds an execution plan, then dispatches specialized Agents for JD/profile/gap/content/rendering/interview/learning-path; retrieval augmentation uses ChromaDB and embeddings (DashScope or local PyTorch, switchable).

### 5.9.2 Integration Points with the Business Stack

1. Identity: shared JWT;
2. Resume write-back: AI structured output syncs to Node `user_resumes`, driving matching;
3. Interview write-back: assessment scores and summaries write back to `interview_invites`;
4. Job context: AI reads jobs and JDs via tools/clients so resume and interview align with target roles.

This “AI produces process; business persists facts” division is the clear boundary between this chapter and Chapter 6.

## 5.10 Key API Design Summary

### 5.10.1 Node Business API (Excerpt)

| Group | Method & Path | Description |
|-------|---------------|-------------|
| Auth | `POST /api/auth/register|login`, `GET /me`, `PATCH /profile` | Registration, login, profile |
| Jobs | `GET /jobs`, `GET /jobs/matched`, `POST /jobs`, `POST /jobs/:id/apply`… | Full job and application chain |
| Company | `GET/PUT /company/profile`, `GET /company/friendly|team` | Employer profile and friendly-employer features |
| Resumes | `GET|PUT /resumes/me` | Matching resume snapshot |
| Donations | `POST /donations`, `GET .../access|stats` | Donations and access status |
| Legal Aid | `POST/GET /legal-aid/requests*`, `accept`, `platform-assist` | Legal aid workflow |
| Interview Invites | `GET /interview-invites/board|me|token/:token`, `start|complete` | Invitation lifecycle |
| Stats | `GET /stats/home|corporate|individual` | Dashboard data |

### 5.10.2 API Style and Consistency

- Unified JSON responses; errors user-displayable on front-end;
- Write operations require authentication; role mismatch returns 403;
- Matching APIs return scores and reasons for UI explanation;
- Long-running AI endpoints use longer `proxy_read_timeout` in Nginx to avoid resume-generation interruption.

## 5.11 Security, Privacy, and Compliance

Aligned with Proposal “layered privacy / minimum necessary,” the final system adopts pragmatic measures:

1. Transport and sessions: HTTPS (deployment), short-lived JWT, password hashing;
2. Least privilege: role + resource-owner checks + interview-board isolation;
3. Sensitive attachment control: legal-aid size/count limits;
4. Secrets externalized: API keys and DB passwords not in repository;
5. Dual-database isolation: AI process logs separated from business master data;
6. Auditable fields: application status updater, donation records, legal-aid acceptance trail all persisted.

Full cross-border “data vault + automatic standard contracts + monthly PIA” is regulatory-integration capability; current work emphasizes architecture reservation and process design, not claiming full automated production deployment in this chapter.

## 5.12 Quality Assurance and Maintainability

To support final demo and ongoing iteration, the repository includes:

- API and unit tests: `backend/tests/` (pytest), Node scripts and matching test data;
- E2E / Selenium: smoke tests on key production paths;
- Offline evaluation directory `evaluation-results/`: Planner, RAG, chain consistency (supports Chapter 6);
- Documentation: `docs/GBA_项目完整技术介绍.md`, `server/README.md`, `backend/DEPLOYMENT.md`, `docs/MY_JOBS_SETUP.md`, etc., for handover and reproduction.

Engineering structure is clearly split across `individual` / `corporate` / `server` / `backend` / `crawler` / `docker`, supporting parallel team development and defense presentation.

## 5.13 Typical User Journeys (Implementation Level)

### 5.13.1 Vulnerable-Group Job Seeker

1. Register and fill age, disability, gap, income → system writes `group_types` and unlocks without donation;
2. Use AI resume generation and sync to `user_resumes`;
3. Browse jobs with match scores and reasons; apply to internal jobs or redirect to external friendly jobs;
4. Practice mock interviews and learning paths to close skill gaps;
5. Receive employer assessment interview invitation and complete evaluation;
6. If labor-rights issues arise, seek help via legal-aid module.

### 5.13.2 Inclusive Employer

1. Register organization and complete inclusivity profile;
2. Publish jobs with `target_criteria` and interview modes;
3. Review vulnerable-group high-match candidates first in applicant list;
4. Send AI/mixed/human interview invitations and track on board;
5. Optionally donate to unlock premium interview suite and participate in legal-aid responses.

Both journeys form the platform’s technical thread: **supply → match → assess → safeguard**.

## 5.14 Key Implementation Details: Module Collaboration and Engineering Decisions

### 5.14.1 Match–Apply–Invite Collaboration Sequence

Main-chain sequence:

1. After AI resume completion, front-end calls `PUT /api/resumes/me`, writing structured `content_json` and `skills_text` to the business database;
2. Job seeker opens matching page; front-end requests `GET /api/jobs/matched`; Node loads profile and resume, hard-filters, then scores each candidate job with `scoreJobResume`, returns list with scores and reasons, writes impression records;
3. Application creates `job_applications` snapshot; employer views applicants in My Jobs with vulnerable-group-first ranking;
4. Employer sends interview invitation, writes `interview_invites` and token; job seeker opens assessment page with token, calls Python interview API;
5. After interview, Python/front-end writes scores and summary to Node `complete` endpoint; employer board refreshes status.

This sequence shows “AI generates and assesses; Node persists facts and permissions”—a key engineering distinction from pure chatbot demos.

### 5.14.2 Front-End State and Session Management

The individual portal manages AI Sessions (create, switch, continue context), reducing repeated uploads across resume, interview, and learning paths. Auth state is unified via `auth-api.js`; page-level access checks query `/api/donations/access` (or equivalent) before render—guiding donation for locked modules, silently allowing vulnerable groups. The corporate portal organizes Jobs, Interview Board, and charts by anchor modules, reducing navigation cost for HR demos.

### 5.14.3 Product Meaning of Job Target Criteria

`target_criteria` is not a simple filter—it structures “inclusive hiring intent”: employers can declare welcome for disability, career-gap returners, 45+ or youth roles, etc. The system derives `vulnerable_group_friendly` tags and surfaces them in friendly-employer lists. Unlike traditional sites that hide disability by default yet implicitly exclude via education/age, this platform makes inclusive conditions explicit and computable, serving Proposal Blind Screening and Inclusive Flex-Hub spirit: **visibility first, then skill-based assessment**.

### 5.14.4 Crawler Engineering Constraints and Ethics

The external job crawler only accesses public disability-network APIs, preserves `source_url` and `external_id`, and marks `is_active_on_source` when source delists. External jobs are handled as “redirect intent + information aggregation,” not fabricated application loops, avoiding unauthorized proxy registration. This expands supply while clarifying data provenance and responsibility—appropriate for academic projects requiring restrained, traceable data use.

### 5.14.5 Pragmatic Performance and Concurrency

At course-project scale, synchronous matching in Node suffices for demo and small pilots; AI side uses Redis queues and timeouts to mitigate LLM concurrency jitter; Nginx uses longer read/write timeouts on AI paths. Future scale can move matching to async tasks or vector recall + rule reranking—the current architecture already supports service-level extension without rewrite.

### 5.14.6 Information Architecture and Interaction Consistency

Both portals follow “one task at a time”: home for role routing, portal for module navigation, business pages for single tasks (post job, apply, interview, donate). Shared components ensure consistency—donation box and legal aid reuse the same scripts on both portals, avoiding permission gaps from duplicate rules. Button-level permissions use `data-require-access`; backend enforces mandatory checks—“front-end guidance + back-end enforcement.” For disabled and older users, pages keep clear hierarchy, ample click targets, and predictable navigation. Corporate side adds accessibility workplace audit page, extending inclusivity from job-seeker tools to employer self-check.

### 5.14.7 Error Handling, Empty States, and Demo Readiness

Final demos require readability when data is missing: matching page prompts resume completion when absent; empty job list shows empty state not blank errors; invalid interview token returns clear message; incomplete donation guides to donation page not silent failure. Node and Python each expose health checks; front-end Axios wrapper handles 401 (redirect login) and 403 (insufficient permission). These details are not “new features” but determine whether live review runs smoothly—an indispensable part of system design.

### 5.14.8 Requirements-to-Code Traceability Example

For “employer publishes inclusive job and completes one AI assessment interview,” traceability runs: requirements doc Corporate HR Interview Tools → `post-job.html` configures `interview_format` → `POST /api/jobs` persists → after application `POST .../interview-invite` → job seeker `assessment-interview.html` → Python `/api/interview` → `POST .../complete` writes scores → corporate Interview Board display. This chain shows modules are not isolated page stacks but end-to-end verifiable business slices—engineering delivery standard.

## 5.17 Chapter Summary

This chapter systematically presents GBA-VEEP system design and technical implementation from an engineering perspective. The three-stack architecture stably supports dual-portal business and AI empowerment: Node.js handles auth, jobs, explainable matching, applications, donation/legal aid, and interview invitations as business facts; Python FastAPI + LangGraph handles resume, interview, and learning-path intelligence; static multi-page front-end ensures accessibility and demo efficiency. The data layer separates `gba_website` and `ai_career_copilot`; JWT unifies identity; donation model and `group_types` inference implement vulnerable-group priority. Job supply combines employer posts and disability-network crawler; matching uses hard criteria + skills-first scoring for Proposal competency-based philosophy, with AI result write-back closing the loop.

Further, this chapter supplements match–apply–invite sequencing, front-end session and access control, product semantics of target criteria, crawler ethics, performance extension paths, and mapping to mid-term modules—making the design–implementation–verification chain fully auditable.

Compared with the Detailed Proposal vision and mid-term foundational architecture goals, the final system is deployable, demonstrable, and explainable as a complete website feature set; AI algorithm details, evaluation metrics, and Agent implementation continue in the next chapter. Overall, the team moved beyond concept design to a structurally clear, modular, secure software system for “cross-regional vulnerable-group employment empowerment,” with a solid technical foundation for submission and sustainable iteration. Readers may treat this chapter as a **repository tour map**: understand features via dual portals, rules via Node and database, intelligence via Python interfaces—three paths converging into GBA-VEEP’s final technical picture.

---

# 11. Limitations & Future Sustainable Development

## 11.1 Project Limitations

GBA-VEEP has delivered dual entry points for individual and corporate users and connected the chain “registration → resume → matching → application → interview → legal aid.” Job seekers can complete profile setup, AI resume sync, view jobs with recommendation reasons and apply; employers can publish demand jobs, prioritize vulnerable-group applicants, send interview invitations, and track results on the dashboard. As a platform still in pilot promotion, the following limitations remain:

**First, operational data is insufficient.** The platform currently focuses on demos and small-scale trials. User scale, retention, application conversion, and employment outcomes have not formed stable statistics, insufficient to support large-scale promotion and evaluation. Skills-first matching and vulnerable-group donation waiver are live, but policy navigation, micro-credentials, etc., are not connected to real-time policy or certificate issuance services; platform capabilities need further completion.

**Second, job supply structure is uneven.** The job pool combines employer posts and Guangdong disability employment network jobs. External friendly jobs relieve supply pressure, but inclusive employers are limited and industry/geography coverage is concentrated. For cross-border credential mutual recognition and social-insurance transfer, the website can only provide information guidance, not replace offline government processing.

**Third, digital divide and outreach channels are inadequate.** Some older and disabled users are unfamiliar with purely online operation. Although the site uses lightweight structure and donation waiver to lower barriers, it lacks regular offline coaching and community outreach, affecting actual usage.

**Fourth, commercial resources need validation.** “Public donation → legal services → feature unlock” is implemented in product, but donation willingness, corporate conversion, and legal-volunteer supply sustainability lack sufficient data. The student team promotes and expands employers in spare time with limited capacity; compared with mainstream recruiting platforms, brand and job volume are weaker. Without dedicated operations and follow-on funding after the course, activity may decline.

## 11.2 Future Sustainable Development

GBA-VEEP should continue under the positioning of **competency-based hiring, vulnerable-group priority, and one-stop empowerment**, advancing in these directions:

**Users and services:** Partner with disability federations, communities, and university career offices for targeted recruitment; introduce digital-mentor volunteers; build reputation through employment cases and inclusive-employer practices; establish key metrics from registration to employment; optimize platform flows with data.

**Business and ecosystem:** Without changing vulnerable-group donation waiver, package inclusivity certification, accessibility audit, and premium interview suite as HR value-added services; expand inclusive employers and flexible employment partnerships; keep policy and incentive tools updated to increase corporate-side utility.

**Product and compliance:** Improve multilingual and accessibility details; strengthen sensitive-data protection on dual-database architecture; coordinate matching rules with AI resume and interview modules to better recognize diverse transferable skills.

**Resources and organization:** Seek social innovation, incubation, and tech grants; complete software copyright registration; explore transition from course project to social enterprise or public-interest tech team.

Through a gradual path of **pilot → feedback → iteration → expansion**, GBA-VEEP can grow into a GBA inclusive employment platform with sustained social value and commercial potential.

---

# 12. Individual Contribution Declaration

## 12.1 Hong Yangxuan — Individual Contribution

I serve as **Development Specialist** on the team and have led GBA-VEEP website construction and iteration since project start. Main contributions:

**Dual-portal and shared components.** I led building individual and corporate multi-page sites, completing home role routing, portal navigation, and shared components for login, donation, legal aid, and multilingual support—consistent interaction across portals, reduced duplicate development. Mid-term foundational architecture became, in the final phase, accessible pages covering matching, applications, interviews, legal aid, and all business scenarios.

**Core business backend.** I implemented Node business services and key modules: registration/login and JWT auth, profile and vulnerable-group type inference, corporate organization and multi-HR collaboration, job publish/match/apply, donation and access permissions, full legal-aid workflow, interview invitations and board write-back—together with multiple database schema upgrades forming the stable business foundation.

**Job supply and AI embedding.** I developed the disability-network public job crawler and scheduler, integrating external friendly jobs with employer posts into the matching pool; completed Node–Python AI interface bridging including unified JWT verification, resume sync to business database, and assessment interview score write-back—embedding AI resume, mock/assessment interview, and learning paths into the main website flow rather than isolated tools.

**Deployment and integration.** I completed Docker and Nginx configuration supporting local split-service debugging and containerized demos; participated in validating skills matching scores, donation waiver policy, and corporate applicant priority ranking; refined page flows, API details, and empty-state messaging from integration and defense feedback—ensuring stable final demo.

In summary, my contribution concentrates on **engineering the website from demonstrable prototype to a fully functional employment empowerment platform**, spanning dual front-ends, business backend, crawler, deployment, and AI integration.
