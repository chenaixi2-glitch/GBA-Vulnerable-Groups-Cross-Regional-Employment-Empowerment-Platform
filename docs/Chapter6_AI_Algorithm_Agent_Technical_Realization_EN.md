# Chapter 6 AI Algorithm & Agent Technical Realization

This chapter documents the **production-deployed** AI capabilities of the Greater Bay Area (GBA) Vulnerable Groups Cross-Regional Employment Empowerment Platform. In one sentence: the live AI stack delivers a LangGraph multi-agent Career Copilot covering multilingual smart resume generation, interactive mock interview, and skill-gap learning-path planning, with shared candidate–job context across tools, while Node.js business rules provide skill-first job matching and donation-gated Premium access for corporate users. Features are classified into three examiner-facing buckets—(A) **fully launched**, (B) **config-reserved but currently disabled** (OCR / embedding / RAG switches in `config.yaml`), and (C) **planned / not wired** (e.g., end-to-end anonymised blind screening)—so real e-commerce operational delivery is not confused with roadmap items. Quantitative pilot metrics in Section 6.6 live under `evaluation-results/chapter6-pilot/` and reuse planner / chain-consistency offline reports. The narrative below expands requirements, architecture, the three personal AI subsystems, business-layer matching, corporate differentiation, testing evidence, and innovation claims to approximately five thousand five hundred English words.

---

## 6.1 AI Module Requirements and Business Scenarios

### Platform-wide AI positioning

Cross-border job search in the GBA is heterogeneous: candidates differ in language preference, education continuity, disability-related workplace needs, and familiarity with digital forms. Mainstream recruiting products typically assume a “standard résumé + keyword search + high-intensity interview drill” path. That assumption systematically disadvantages silver-generation workers, persons with disabilities, and applicants with career breaks. This platform therefore positions AI as an **employment empowerment middleware** rather than an opaque hiring oracle. Generative components help users structure experience, align to a target role, practise verbal answers, and schedule lightweight upskilling; transactional components (authentication, donations, job posting, match scores, access flags) remain rule-based and auditable. The split mirrors digital-commerce practice in ECOM7001-style projects: AI improves conversion along a user journey, while business rules govern fairness, payments (here: donations), and merchant (employer) tooling.

Operationally, Python FastAPI hosts the Career Copilot; Node Express hosts platform APIs; static portals under `individual/` and `corporate/` expose journeys examiners can click through. Success is defined as a completable loop—register or donate as required, upload a profile, generate artefacts, apply to inclusive jobs—not as a brochure of unfinished vector demos.

### Individual-side three AI core journeys

Three journeys form the personal product core.

**(1) Smart Resume Generator.** Users upload PDF/DOCX/TXT/Markdown or paste text; the system extracts a structured `CandidateProfile`; users confirm or generate a JD; gap analysis produces clarification questions emphasising transferable and quantifiable evidence; a modular resume is streamed; modules can be polished or translated into Simplified Chinese (zh), Traditional Chinese (zh-TW), English (en), or Portuguese (pt); exports include PDF, DOCX, and HTML; constrained chat supports iterative edits without accidentally re-running unrelated agents.

**(2) AI Mock Interview.** Modes include question-bank generation, custom questions with reference answers, and programmatic interactive mock interviews (Quick / Full / Specialized). Turns yield feedback; sessions end with a debrief; logged-in users may save and reload banks or full mocks.

**(3) Skill Learning Path.** The same profile and JD drive gap diagnosis, resource suggestions, and an editable timeline derived from daily available study hours, with account-level save/load.

Shared bootstrap components (`candidate-jd-setup`, target-job context, saved-profile restore) ensure the three tools read one life story, which is both a usability requirement for vulnerable users and a technical innovation claim developed in Section 6.3.

### Corporate AI permission differentiation

Corporate accounts receive **free baseline tools**: job posting and editing, embedded My Jobs management, company profile maintenance, plus the same smart resume and learning-path pages used by individuals. **Premium** capabilities—primarily interactive mock interview practice for HR rehearsal—require `has_premium_access`, granted after a donation-box contribution. Vulnerable individuals receive free full access; non-vulnerable individuals unlock platform features by any donation amount. Permissioning is enforced in `access.service.js` and front-end guards (`data-require-access`, `data-require-premium-access`), not by swapping model weights. This design turns AI feature tiers into levers of a social-enterprise business model (expanded in Section 6.5).

From a requirements-engineering view, the corporate split also prevents a common failure of social platforms: giving employers unlimited free AI screening that extracts value while leaving legal-aid underfunded. By tying Premium interview rehearsal to donation, the requirement set encodes reciprocity into the product backlog rather than treating ethics as a separate PDF.

### Cross-cutting requirements

**Multilingual content output** supports zh / zh-TW / en / pt so a single profile can be rendered for Mainland, Hong Kong, and Macao application norms. UI chrome is currently English-first (`SUPPORTED = ['en']`) and deliberately decoupled from content language—examiners should not confuse “English UI” with “English-only AI.” **Cross-module context reuse** is mandatory: Redis session state plus MySQL archives prevent triple data entry. **Fair matching** requires skill-first soft scores and inclusive hard filters when employers declare target-group openness. Full anonymised blind screening is Class C (Section 6.1.1); soft scoring already avoids demographic soft penalties.

### Vulnerable-group AI adaptation (expanded)

**Silver-generation users** often face long-form writing fatigue, unfamiliarity with multi-panel dashboards, and anxiety about silent loading. The product therefore: (i) breaks gap clarification into short answer boxes; (ii) streams resume generation progress via SSE; (iii) offers a Quick interview programme of roughly thirty minutes; (iv) presents learning plans as week-by-week checklists rather than academic essays; (v) keeps navigation to a small set of portal cards. **Jobseekers with disabilities** may use assistive technologies, need more time, or prefer fewer free-form prompts. The system: (i) replaces unconstrained multi-turn “chat everything” with guided clarification; (ii) allows title-only JD bootstrap so users are not blocked waiting for a perfect description; (iii) enables module-level polish instead of full-document rewrite; (iv) phrases feedback as concrete actions (“add a quantified result,” “use STAR”) rather than abstract critique. These choices encode **humanistic AI design**—a scoring differentiator versus commercial recruiting AIs optimised for high-literacy, high-volume funnels. Requirement writers should also note what was **explicitly not** required of vulnerable users: voice-only Olivia assistants (Class C mock), mandatory community posting, or micro-credential grinding before job browse. The AI requirements therefore stay close to employment outcomes—document, interview, learn, match—rather than expanding into adjacent social products that dilute engineering focus and viva clarity.

### 6.1.1 Feature boundary statement (authoritative list)

Later sections **only briefly cite** this list; they do not re-explain disabled OCR/RAG/blind-screening paragraphs.

| Class | Scope |
|-------|--------|
| **A. Fully launched** | LangGraph Career Copilot (planner + JD / profile / gap / content / render / interview / learning-path agents); resume SSE generation, polish, Hunyuan translation, WeasyPrint/DOCX export; interactive interview + debrief + persistence; learning-path timeline edit/save; Redis session + MySQL archives; Node skill-first match scoring + inclusive hard filters; donation/Premium access; corporate reuse of individual AI pages |
| **B. Config-reserved, currently disabled** | DeepSeek-OCR (`resume_parse.enabled=false`; PDF uses pdfplumber); Embedding / Rerank / Chroma / RAG (`enabled=false`; online paths no-op) |
| **C. Planned / not production-wired** | End-to-end anonymised blind screening (UI copy/checkbox exist; APIs still return full application snapshots); Olivia / mock-only demos; community, micro-credentials, course-centre shells; Admin/NGO consoles |

---

## 6.2 Overall AI Architecture and Model Selection

### Layered architecture (textual blueprint)

The stack is three layers thick.

**Layer 1 — LLM foundation.** SiliconFlow OpenAI-compatible endpoints are wrapped by LangChain `ChatOpenAI` in `models/llm.py`. Helpers enforce JSON-schema responses, detect degenerate repetitions, apply language guards, and optionally enqueue calls through Redis `llm_queue` (recommended concurrency two on small production hosts). Dialogue memory keeps a bounded raw-turn window and compresses older turns into summaries—textual memory, not vector memory (Class B).

**Layer 2 — Business plugin / agent middle layer.** LangGraph `StateGraph` shares `CopilotState` across nodes: `planner`, `jd_agent`, `profile_agent`, `gap_agent`, `content_agent`, `render_agent`, `interview_agent`, `question_agent`, `answer_evaluation_agent`, `learning_path_agent`, then `respond`. The planner combines LLM intent hints with **deterministic clamps** (`forced_intent`, keyword overrides, `context_scope=resume_edit`) and expands a fixed execution plan. Resume long-running work also uses dedicated REST/SSE routes so the UI can show progress without waiting for a single monolithic chat completion.

**Layer 3 — Platform business interface.** FastAPI exposes `/api/chat`, `/api/resume/*`, `/api/interview/*`, `/api/learning-path/*`, `/api/export/*`. Node exposes auth, donations, access flags, jobs, applications, and `scoreJobResume`. Frontends call both; interview question agents may fetch matched jobs from Node for natural-language explanation.

**End-to-end data flow (textual diagram):**

```
[Portal pages: resume | interview | learning-path | jobs]
        │  session_id, profile_record, language, daily hours
        ▼
[FastAPI Career Copilot]
        │
        ├─ Planner → ordered Agent chain → respond   (LangGraph + CopilotState in Redis)
        ├─ Resume SSE: skeleton → parallel module polish → render/export
        ├─ Interview REST: start / turn / poll / end / save
        └─ Learning-path REST: timeline put / save / history
        │
[MySQL] profile, interview, plan archives
        │
[Node Platform API] access + jobs + match score + applications
```

### Model selection and API configuration

Task-specialised models avoid “one temperature for everything.”

| Config block | Model | Primary use | Approx. settings |
|--------------|-------|-------------|------------------|
| `llm` | `deepseek-ai/DeepSeek-R1-0528-Qwen3-8B` | Planner & most agents | temp 0.3, max_tokens 8192, timeout 180s |
| `resume_generation` | same family | Resume skeleton & polish | temp 0.2, 8192, 180s |
| `translation` | `tencent/Hunyuan-MT-7B` | Module/page translation | temp 0.1, 4096, 120s |
| `judge` | DeepSeek-R1 family | Interview rubric scores | temp 0.1, 2048, 180s |

API base is SiliconFlow (`SILICONFLOW_API_KEY`). Context windows are managed by compressing profile JSON, target-job meta, and recent dialogue—not by online RAG retrieval (Class B citation only). In practice, résumé generation further splits work across multiple calls (skeleton, then per-module polish) so that a single 8192-token ceiling does not have to hold an entire bilingual career history plus JD plus rendering instructions. Interview turns similarly isolate evaluation prompts from bank-generation prompts, preventing earlier stage text from crowding out rubric instructions. These decomposition patterns are part of the team’s systems contribution: they treat the hosted LLM as a scarce, high-latency microservice rather than an infinite oracle.

### Multilingual translation and polish logic

Three cooperating mechanisms: (1) generation-time `output_language` instructions plus language guard repairs; (2) Hunyuan translation for module or full-page conversion; (3) layout/checklist rules that switch section order/fonts and flag language mixing. The four-language set matches GBA application practice; UI i18n assets for other locales exist as files but are not user-switchable in the current English-only UI shell.

### Shared profile store and cross-module scheduling

The launched “unified profile” is **structured state**, not a vector database: `CandidateProfile` and target-job meta live in Redis `CopilotState`; login enables MySQL save/history/restore. Frontend deep links with `profile_record` rehydrate the session for any of the three tools. Backend `resume_profile_context` and `target_job_context` keep serialisation consistent; `PUT /api/resume/target-context` synchronises employer type, industry, and experience level. Embedding-backed unified memory remains Class B.

Fairness preprocessing at AI/product level emphasises skill-first articulation and optional blind-screening **wording tips** in checklists; recruitment-side anonymisation APIs remain Class C (see 6.1.1).

### Team-built logic versus third-party frameworks

**Third-party / open infrastructure:** LangGraph and LangChain primitives; SiliconFlow-hosted DeepSeek and Hunyuan APIs; WeasyPrint; Redis; MySQL; Express. **Project-team intellectual contribution:** intent clamp maps and agent execution plans; modular resume generation and incremental clarification-polish targeting; interview programme stage machines; learning-path week arithmetic and resource prompts; shared profile/JD contracts; Node match weighting and inclusive criteria; donation↔Premium policy. Originality for grading should be located in **domain orchestration and inclusive product rules**, not in training foundation models from scratch.

### Reliability, observability, and operational constraints

Production hosts are assumed to be modest (the configuration comments recommend limiting concurrent LLM calls). Degenerate JSON detection and schema-constrained invocation reduce cascading parse failures when a model returns truncated or repetitive text. LangSmith tracing can be enabled for agent debugging without exposing traces to end users. Session ownership binding prevents anonymous clients from overwriting another user’s Redis state after login. Export failures (font missing, HTML too tall) are handled in render/export paths with typography compression rather than silent empty files. These operational choices matter for e-commerce-style marking: a demo that only works on a developer laptop with unlimited GPU quota is weaker than a queue-limited, schema-guarded service that survives concurrent portal use.

### Why the architecture deliberately avoids “always-on RAG” in the launched cut

Examiners familiar with contemporary LLM apps may ask why retrieval-augmented generation is not the headline. The honest answer is product prioritisation under Class B switches: the primary failure mode for vulnerable jobseekers is not “missing a passage from a policy corpus,” but “cannot produce a coherent, language-appropriate, JD-aligned self-presentation.” Prompted agents over structured profile/JD state address that failure directly. Vector retrieval remains a reserved enhancement for future policy Q&A or experience–JD semantic pre-ranking once embedding budgets and evaluation gates are restored. Keeping RAG off in production is therefore a **delivery decision**, not an admission that the team cannot call an embedding API.

---

## 6.3 Individual Core AI Subsystems — Design and Implementation

Before the three subsections, it is useful to state the **closed-loop thesis** they jointly implement. A candidate arrives with messy documents; the resume agent creates structured truth; the interview agent stress-tests verbal articulation of that truth; the learning-path agent schedules repair of remaining gaps; matching consumes the structured snapshot to surface inclusive roles. Each subsection below ends by naming how its outputs re-enter the shared state consumed by the other two tools.

### 6.3.1 Multilingual Smart Resume Generation Agent

The resume subsystem is the densest agent pipeline and the usual entry point for shared context.

**Input parsing.** Uploaded bytes pass through `file_parser`. With OCR disabled (Class B), PDFs use pdfplumber text extraction; DOCX/TXT/Markdown are decoded directly. `/api/chat` with `forced_intent=upload_profile` invokes `profile_agent`, which emits `profile_basic` (identity/contact fields) and typed `facts` (education, internship, work, project, skill, etc.). Subsequent clarification uses `profile_patch` for incremental fact merges, reducing field jitter from full re-extraction.

**JD alignment and interactive completion.** Users paste a JD, generate one from title/industry/experience/employer type, or let `jd_agent` parse free text into skills, responsibilities, and requirements (with optional JD cache hits). Front-end optimisation flow then runs gap analysis: `gap_analysis_core` asks the LLM to compare enriched JD JSON with profile JSON, emitting gaps, follow-up questions, and cautious experience-removal suggestions. Rule layers add quantification questions and sanitize unsafe removals (for example, blocking education deletion justified only by page length). Users answer in a modal; `resume_clarification_targets` selects affected modules for **incremental polish** instead of full regeneration—critical for older users and for latency.

**Generation, polish, translation, export.** `content_agent` builds a skeleton under soft layout constraints, then polishes experience modules in parallel. `/api/resume/generate-stream` pushes SSE progress events. Language is stored in `render_config.language ∈ {zh, zh-TW, en, pt}`. Module polish and Hunyuan translation endpoints support local edits. `render_agent` applies HTML templates and typography compression guided by page budgets; `api/export.py` emits PDF (WeasyPrint), DOCX, HTML, and related formats. Constrained chat (`context_scope=resume_edit`) limits planner routing to content, language, render, ask, and export intents.

**Vulnerable-group output rules.** Prompts and checklists push transferable skills and verifiable achievements; they discourage inventing experience and unnecessary sensitive disclosures. Streaming and stepwise clarification specifically reduce cognitive load for silver-generation and disability-inclusive journeys described in 6.1. In practical terms, a silver-generation user can answer three short quantification prompts instead of rewriting a two-page narrative; a user relying on assistive input devices can polish a single internship module without risking a full-document regeneration that scrambles previously accepted wording. Language checklists further warn when English fragments leak into a Chinese résumé (or the reverse), which is a frequent failure mode when family members help draft bilingual materials.

**Quality controls inside the resume path.** Normalisation utilities coerce model output into stable section identifiers; incremental polish only touches facts referenced by clarification answers; page-policy heuristics attempt to keep PDF exports within readable page counts for private-sector versus public-sector employer norms. Account save/history/restore turns ephemeral chat into durable artefacts a volunteer advisor can reopen later—important in NGO-assisted employment scenarios even though a full NGO console remains Class C.

**Cross-module context reuse (closing bridge).** Once profile extraction and target-context confirmation succeed, Redis holds the canonical candidate and JD objects. Interview and Learning Path pages restore the same objects via shared bootstrap or `profile_record`, so gap themes discovered while building a resume become the default diagnosis for practice and study. Concretely, a missing “Excel reconciliation example” gap raised during résumé clarification will later appear as an interview follow-up theme and as a learning-path resource hour—three surfaces, one underlying fact list. This hand-off is the first concrete realisation of the platform’s cross-tool innovation and should be emphasised in viva as the systemic (not single-model) contribution.

### 6.3.2 AI Interactive Mock Interview Agent

**Programme layering.** `interview_program.py` defines Quick (combined screening/final rhythm), Full (screening → professional/technical → final), and Specialized tracks (technical deep-dive, final negotiation, resume deep-dive) with configured turn caps. Question banks always include a self-introduction item and add role-informed categories using keyword track hints.

**Interaction modes.** Question-bank mode generates a structured set consumable offline. Custom mode accepts employer-specific questions and returns reference answers. Interactive mode pre-builds a bank queue, accepts turns through `/interactive/start|turn|poll|end`, and produces asynchronous feedback plus optional follow-ups. `answer_evaluation_agent` combines narrative critique with judge-model scores for relevance, groundedness, and actionability. Debrief aggregates strengths, improvements, and next drills. Persistence endpoints store banks and full sessions for logged-in reload.

**Inclusive interaction.** Quick mode shortens sessions; one-question-at-a-time UI reduces working-memory load; feedback prefers imperative, numbered suggestions; users may skip re-upload by restoring a résumé session. These patterns operationalise the silver/disability requirements of Section 6.1 inside the interview agent rather than as external documentation. Custom-question mode additionally helps candidates who receive employer take-home lists from job fairs—common in GBA retail and customer-service hiring—without forcing them to invent a full interactive stage plan.

**Evaluation semantics.** The dual-model pattern (primary coach + judge rubric) exists to reduce single-sample flattery: a fluent but ungrounded answer can still receive a middling groundedness score, while a terse but specific answer can score well on actionability. Pilot fixture analysis in Section 6.6 found all six improvement/suggestion strings in a fund-operations evaluate run to contain concrete cues (quantify, STAR, Excel example, etc.), i.e., feedback that a low-literacy user can attempt to enact rather than merely admire.

**Cross-module context reuse (closing bridge).** Interview reads the same `CopilotState` profile and JD shaped by the resume tool. Debrief themes such as “add quantification” echo gap questions from résumé clarification and feed the learning-path resource list. Users can return to module polish with the identical `session_id`, forming a prepare → practise → rewrite loop without duplicate data entry. Saved interview records remain separately archived so a coach can compare attempt one versus attempt two while the live session continues to drive résumé edits—state separation that prevents history bloat from blocking active generation.

### 6.3.3 Skill-Gap Diagnosis and Personalised Learning-Path Engine

**Diagnosis.** `learning_path_agent` reuses session gaps when present; otherwise it calls the same `run_gap_analysis` as résumé optimisation. Under Class B embedding-off, no cosine similarity pre-match runs; diagnosis is LLM structured comparison plus quantification rules—deployable and consistent across tools.

**Resources and timeline.** Analysis prompts recommend lightweight courses, drills, or projects with hour estimates. When the user supplies daily hours and a timeline intent, the system computes total weeks with transparent arithmetic (`ceil(total_hours / (daily_hours × 7))`), then asks the LLM to allocate phases. Front-end editors mutate phase fields; `PUT /timeline` and `POST /save` persist plans with history reload. Recommendations favour short, practical units aligned with flexible roles (customer service, remote operations, annotation-style work) rather than multi-year credentials.

**Inclusive scheduling.** Daily-hour inputs respect caregiving or health constraints; editable phases prevent “AI locked plans”; checklist presentation aids older users who prefer visible progress ticks. A user who can study only thirty minutes per day still receives a coherent multi-week plan instead of an aspirational “bootcamp” calendar that assumes full-time study—an important dignity-preserving design choice for caregivers and persons managing medical appointments.

**Why not a separate recommender model?** Training a collaborative-filtering course recommender would require large interaction logs the pilot platform does not yet possess. Conditioning an LLM on explicit gaps plus hour budgets yields immediately inspectable plans that advisors can edit. When embedding retrieval (Class B) returns later, it can rank passages inside an already structured timeline rather than replacing the user-visible planning metaphor.

**Cross-module context reuse (closing bridge).** Learning path is explicitly a **downstream consumer** of shared profile, JD, and gaps. It does not invent a second identity store. Completing phases encourages users to jump back to résumé generation to reflect newly practised skills—closing the empowerment loop and reinforcing the dissertation’s differentiation claim: one context graph, three tools. From an examiner’s perspective, this subsection should be read together with 6.3.1–6.3.2 as a single system narrative, not as three unrelated demos that happen to share a repository.

---

## 6.4 Business-Layer Job Matching Algorithm (AI Structured Profile as Upstream Support)

**Layer boundary for examiners.** Match scores are produced by **Node business rules** in `match.service.js`, not by LangGraph agents. This section belongs in the AI chapter because AI-extracted structured profiles and résumé snapshots are the **upstream feature suppliers** that make symbolic matching meaningful, and because question agents may narrate Node-matched jobs. Treating match scoring as “another LangGraph vector ranker” would misrepresent Class A delivery.

**Textual process split:**

1. List active jobs for matching.  
2. Apply **inclusive hard filters** from `groupTypes` / target criteria (age ranges, gender openness, disability openness, career-break friendliness) when employers configure them—jobs opt *in* to inclusive criteria rather than soft-penalising demographics globally.  
3. Extract job skills from explicit JSON skills plus capped description tokens.  
4. Extract résumé skills from `skills_text`, `content_json.skills`, typed facts, and summary tokens—features often originating from the AI profile pipeline.  
5. Compute `scoreJobResume` on a 0–100 scale: skill overlap ≤50, education band ≤15, experience heuristic ≤20, JD keyword hits ≤15.  
6. Sort listings, attach `match_reasons`, and persist scores on apply. Friendly-employer views and vulnerable-applicant priority are additional business policies.

Soft scoring is skill-first and does not add age/gender/disability soft penalties. Class C blind screening (hide identity fields in employer review) is intentionally out of scope for “launched algorithm” claims; see 6.1.1.

**Worked scoring intuition.** Consider a remote customer-service résumé rich in Excel, chat, and Cantonese tokens against a CS job listing: skill overlap dominates, pushing the score into the high band. The same résumé against a registered-nurse listing yields low overlap and low keyword hits, correctly falling into the low band. A finance graduate with Excel but without settlement vocabulary against a fund-operations JD lands mid-band—partial fit that still surfaces the role without pretending perfect readiness. These qualitative patterns match the pilot table in Section 6.6 and are easy to defend in viva because every point traces to an additive, inspectable term.

**Relationship to AI agents.** When `question_agent` recommends jobs, it does not re-implement ranking; it calls the Node matched-job list and verbalises reasons already attached by `match_reasons`. That keeps “AI explanation” honest: the model narrates a rule score rather than inventing a second ranking. Upstream, richer AI profiles (more skill facts, clearer summaries) mechanically improve overlap features—another reason résumé quality work in 6.3.1 improves matching without merging the two codebases.

Pilot evidence (Section 6.6) on six hand-labelled pairs—high-fit flexible roles versus mid-partial and low-mismatch roles—shows **100% ranking-check agreement** and **83.3% score-band agreement**, supporting operational usefulness for inclusive job browsing without claiming neural retrieval.

---

## 6.5 Corporate AI Differentiation and Commercial Logic

Corporates do not receive a separate model cluster; they reuse individual Copilot pages under portal navigation. Free baseline tooling covers posting inclusive jobs, managing My Jobs, editing company profiles, and opening resume/learning-path HR aids. Premium interview anchors use `data-require-premium-access`; `platform-access.js` intercepts and routes undonated corporates to the donation page until `DonationModel` counts unlock `has_premium_access`.

**Commercial interpretation linked to Chapter 4.** In an ECOM7001 social-commerce framing, the donation box is the sustainability hinge. Non-vulnerable individuals and corporates seeking Premium interview rehearsal contribute to a **legal-aid funding pool** while unlocking AI productivity features that are expensive to build once and cheap to serve marginally on shared infrastructure. AI Premium tools therefore function as **incentive-compatible digital goods**: clear HR value, low marginal cost, and a measurable public-benefit externality. Access booleans in `access.service.js` are the technical embodiment of that business plan—every Premium unlock is simultaneously a donation event and an entitlement flip. Dashboard messaging and i18n copy explain the bargain; the system does not call an LLM to invent promotional slogans. This closes the loop between commercial design and AI engineering: Chapter 4 states why donations sustain the platform; Chapter 6 shows how AI feature gates enforce the bargain without fracturing the model stack.

**Employer-side value proposition beyond “another chatbot.”** Free résumé and learning-path tools help HR teams prototype inclusive JDs and sample candidate documents before spending money on agencies. Premium mock interview lets HR staff rehearse screening questions against AI-generated candidate answers, improving interview consistency for vulnerable applicants who may need clearer questioning. Because the underlying Copilot is identical to the candidate tool, employers and candidates share a vocabulary of gaps and skills—reducing the classic asymmetry where employers use opaque ATS filters candidates never see. The donation requirement for Premium is not merely a paywall aesthetic; it publicly signals that advanced AI HR capability is contingent on contributing to legal-aid capacity in the same ecosystem, aligning brand, ethics, and feature access.

**Implementation footprint.** No duplicate prompt libraries were maintained for corporate users. Portal cards deep-link to `../individual/demo-*.html` with premium guards. That engineering thrift is itself a commercial virtue: one AI cost centre, two market faces, donation-modulated price discrimination without training separate models.

---

## 6.6 Testing, Iteration, and Performance Optimisation

### Quantitative evidence (pilot + offline)

| Evaluation | Sample | Result | Artefact |
|------------|--------|--------|----------|
| Multilingual mixing detector zh/zh-TW/en/pt (clean vs mixed) | 4×2 = **8** | **100%** language-pair pass | `evaluation-results/chapter6-pilot/` |
| Structured profile/job field coverage on MySQL dump fixture | **6** checks | **100%** | `resume_gen_ready.json` + pilot script |
| Interview feedback actionability (concrete cue heuristics) | **6** items | **100%** actionable; judge relevance 80 / groundedness 70 / actionability 75 | `e2e_evaluate_answer_last_run.json` |
| Fund-ops question bank e2e health | **13** questions | ok, 0 missing answers, self-intro present | `e2e_fund_ops_interview_last_run.json` |
| Job–resume match bands & ranking | **6** labelled pairs | **83.3%** band / **100%** ranking checks | `run_match_pilot.js` |
| Planner intent & agent chain (rule_only) | **20** | **100%** accuracy, macro-F1 1.00 | `planner-routing/latest` |
| Cross-agent chain consistency | **5** | **40%** (2/5)—failure modes documented | `chain-consistency/latest` |
| Pytest core AI subset (checklist, planner, interview stages/program, profile context, normalize) | — | **55 passed** | local run |

These are dissertation-scale pilots, not million-row production A/B logs, yet they replace pure architecture prose with numbers examiners can re-run (`node …/run_match_pilot.js`, `python …/run_pilot_metrics.py`). Chain consistency below 100% is reported candidly as a contract-hardening backlog rather than hidden.

### Functional test design notes

Multilingual tests assert instruction strings and mixing detection. Multi-turn interview tests cover programme stage maps and interactive queue behaviour. Match pilots encode expected high/mid/low bands for customer-service, annotation, operations-adjacent, and clearly mismatched clinical/engineering roles. Planner rule-only evaluation isolates the deterministic routing layer from LLM classification noise.

### Vulnerable-user pilot iteration (engineering record)

Iterations prioritised incremental polish after clarification, title-only JD start, SSE progress, Quick interview, editable timelines, and free access for vulnerable accounts—usability outcomes more than BLEU chasing.

### Latency and reuse optimisation

Parallel module polish, dialogue compression, Redis sessions, and LLM queue limits reduce timeout tails. Shared context reuse eliminates repeated parse cost when users traverse resume → interview → learning path.

### Multilingual consistency iteration

Generation guards, mixing detectors, and Hunyuan translation form defence in depth; the eight-case pilot confirms detector behaviour across all four GBA content languages.

### How to read the numbers without over-claiming

The multilingual pilot validates **detector and instruction plumbing**, not that every live generation is perfectly monolingual—live LLM drift remains possible and is why guards exist. Profile field coverage validates that a real MySQL-dumped session contains the structural fields agents need, which is a prerequisite for extraction quality claims even when live OCR is off. Interview actionability is a content analysis of one stored evaluate-answer fixture plus bank health from a fund-operations e2e run; it supports the claim that feedback is concrete, not that every user subjectively “felt improved.” Match pilots show rule ranking behaves as labelled on six inclusive-employment scenarios; they do not replace online A/B tests. Planner 100% accuracy is **rule_only** mode. Chain consistency 40% deliberately includes adversarial fail cases to document breakage when render HTML is empty or profile fields are sabotaged—useful for engineering honesty. Together, the portfolio of metrics is sufficient for a dissertation chapter demanding evidence, while remaining transparent about scale.

### Performance observations from e2e fixtures

Stored runs show interview bank generation on the order of minutes under remote LLM latency (e.g., ~169s for a thirteen-question fund-ops bank) and evaluate-answer calls around ~100s including judge scoring. These figures motivate SSE progress, polling endpoints, and queue limits more than they invite micro-benchmark bragging. Optimisation therefore targets **perceived latency** (progress events, incremental polish) and **failure isolation** (schema guards) rather than claiming sub-second LLM magic.

---

## 6.7 Innovation and Inclusive Design Summary

### 6.7.1 Technical innovation points

1. **Cross-module unified context reuse.** One structured profile and target JD session powers resume, interview, and learning path, with MySQL restore—reducing re-entry and aligning gap narratives.  
2. **Skill-first fair matching with AI upstream features.** Auditable Node weights consume AI-structured snapshots; demographics are excluded from soft penalties.  
3. **GBA four-language content engine.** DeepSeek generation, Hunyuan translation, and layout/checklist rules support zh / zh-TW / en / pt cross-border applications.  
4. **Deterministic-clamped multi-agent orchestration.** Team-authored intent plans yield 100% rule-routing accuracy on twenty offline cases, improving operational predictability versus unconstrained agent freestyle.  
5. **Honest capability boundary engineering.** Class A/B/C labelling and disabled-switch discipline demonstrate production maturity expected in real digital-commerce deployments.

### 6.7.2 Vulnerable-group inclusive AI design highlights

1. **Low-threshold interaction.** Stepwise clarification, Quick interview, hour-based editable timelines, streaming progress.  
2. **Simplified, actionable language.** Short imperative feedback and checklist learning phases for silver-generation and assistive-tech users.  
3. **Access justice.** Vulnerable users free; corporate Premium AI tied to legal-aid donations—technical enforcement of social-enterprise ethics.  
4. **Differentiation from mainstream recruiting AI.** Commercial tools optimise high-volume funnels; this system optimises assisted self-presentation, inclusive matching, and cross-border language support for users with career breaks or accessibility needs. Where mainstream products may hide ranking features inside proprietary ATS scores, this platform exposes match reasons and editable learning plans so candidates and advisors can contest or improve outcomes. Where mainstream interview bots often assume fluent typing and long sessions, this platform offers Quick programmes and stepwise clarification. Where mainstream résumé writers optimise keyword stuffing for a single market language, this platform treats four GBA languages as first-class generation targets with mixing detection.

Collectively, the launched system is a **demonstrable empowerment loop**—shared context, three AI tools, skill-first matching, donation-gated Premium sustainability—not a catalogue of Class B vector switches or Class C anonymisation mock-ups.

For viva defence, a concise claim hierarchy is recommended. First, show the portal journeys (Class A). Second, cite the pilot table (multilingual 100%, match ranking 100%, planner routing 100%, interview actionability 100%, match bands 83.3%). Third, explain architecture with the textual flow in 6.2 and the business/AI boundary in 6.4. Fourth, when asked about OCR, embeddings, or blind screening, answer with the Class B/C table in 6.1.1 rather than apologising—disciplined scope control is itself evidence of engineering judgement expected in real digital platforms. Fifth, connect Premium donation gating back to Chapter 4 so commercial and technical chapters reinforce each other. This hierarchy keeps the discussion centred on shipped value while remaining academically honest about reserved and planned work. Word-count discipline in this English chapter deliberately spends space on Class A mechanisms, pilot numbers, inclusive interaction detail, and corporate donation logic, while relegating Class B/C items to the single boundary table—matching the revision brief to compress redundancy and raise evidence density.

In sum, Chapter 6 argues that the platform’s AI value is an operable Career Copilot plus inclusive business rules, evidenced by runnable pilots and portal journeys, with reserved OCR/RAG and planned blind-screening clearly ring-fenced so operational delivery can be graded on its own merits.

---

## Appendix A — Outline phrase → implemented wording

| Outline phrase | Implemented wording |
|----------------|---------------------|
| Unified profile vector store | Redis/MySQL structured share (vectors Class B) |
| Skill vector similarity | LLM gap reasoning; Node symbol overlap scoring |
| Privacy blind-screening pipeline | Skill-first soft score + inclusive hard filter (A); full anonymisation (C) |
| Corporate donation AI copywriter | Access policy + i18n entitlement messaging |
| E-commerce marketplace AI | GBA empowerment platform with flexible/remote roles in matching pilots |

## Appendix B — Pilot reproduction

```bash
node evaluation-results/chapter6-pilot/run_match_pilot.js
python evaluation-results/chapter6-pilot/run_pilot_metrics.py
```

## Appendix C — Word-budget note

The main narrative (opening through Section 6.7) is sized for an English dissertation chapter of about 5,500 words. Slight variation is expected after citation formatting in Word. Appendices A–C are examiner aids and may be excluded from institutional word caps. Pilot scripts under evaluation-results/chapter6-pilot/ should be archived with the thesis USB/repository snapshot so markers can reproduce the match-band and multilingual tables without re-deriving fixtures by hand.

