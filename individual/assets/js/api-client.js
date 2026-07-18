/**
 * GBA Platform - API Client
 * Handles all backend communication with automatic demo/mock fallback
 */

const API_CONFIG = {
    BASE_URL: (function resolveApiBaseUrl() {
        if (typeof window !== 'undefined' && window.GBA_API_BASE_URL) {
            return window.GBA_API_BASE_URL;
        }
        const loc = typeof window !== 'undefined' ? window.location : null;
        if (!loc || !loc.hostname) {
            return 'http://localhost:8000/api';
        }
        const host = loc.hostname;
        if (host === 'localhost' || host === '127.0.0.1') {
            return `http://${host}:8000/api`;
        }
        return `${loc.origin}/api`;
    })(),
    // SiliconFlow DeepSeek: single LLM call ~60–90s; multi-agent workflows may take 2–3 min
    TIMEOUT: 300000,
    HEALTH_TIMEOUT: 12000,
    MOCK_MODE_KEY: 'gba_api_mock_mode',
};

function apiT(key, fallback, vars) {
    if (typeof window !== 'undefined' && window.GBAI18n && window.GBAI18n.t) {
        return window.GBAI18n.t(key, fallback, vars);
    }
    let s = fallback || key;
    if (vars && s) {
        Object.keys(vars).forEach((k) => {
            s = String(s).replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
        });
    }
    return s;
}

function apiCode(code, i18nKey, fallbackEn) {
    if (typeof window !== 'undefined' && window.GBAI18n && window.GBAI18n.tApiCode) {
        return window.GBAI18n.tApiCode(code, i18nKey, fallbackEn);
    }
    return fallbackEn || String(code || '');
}

/** Machine-readable API error codes returned in HTTP detail fields */
const API_ERROR = {
    SESSION_BUSY: 'SESSION_BUSY',
    REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
};

const AI_TASK_PENDING_TOAST_MS = 8000;

function isRequestTimeoutError(error) {
    if (!error) return false;
    if (error.code === API_ERROR.REQUEST_TIMEOUT) return true;
    const code = String(error.code || '').toUpperCase();
    if (code === 'ECONNABORTED') return true;
    const msg = String(error.message || '').toLowerCase();
    return msg.includes('timeout') || msg.includes('timed out');
}

function isAiTaskPendingError(error) {
    if (!error) return false;
    return error.code === API_ERROR.SESSION_BUSY || error.code === API_ERROR.REQUEST_TIMEOUT;
}

/** English labels for backend LLM task codes (e.g. resume_generate). */
const AI_TASK_LABELS_EN = {
    chat: 'AI chat',
    profile_parse: 'profile parsing',
    profile_update: 'profile update',
    jd_parse: 'job description parsing',
    jd_generate: 'job description generation',
    gap_analysis: 'skill gap analysis',
    learning_path: 'learning path generation',
    resume_generate: 'resume generation',
    resume_edit: 'resume editing',
    resume_translate: 'resume translation',
    resume_render: 'resume rendering',
    resume_optimize_a4: 'A4 resume optimization',
    resume_module_translate: 'resume module translation',
    resume_module_polish: 'resume module polishing',
    interview_custom: 'custom interview answer generation',
    interview_start: 'mock interview setup',
    interview_evaluate: 'interview answer evaluation',
    interview_debrief: 'interview debrief generation',
    interview_feedback: 'interview feedback generation',
    export_render: 'export rendering',
};

/** Human-readable label for a backend LLM task code (e.g. resume_generate). */
function formatAiTaskLabel(taskType) {
    const code = String(taskType || '').trim();
    if (!code) return '';
    const en = AI_TASK_LABELS_EN[code] || code.replace(/_/g, ' ');
    return apiT(`errors.aiTasks.${code}`, en);
}

/** SESSION_BUSY toast — names the running task when the API returns it. */
function formatSessionBusyMessage(taskType) {
    const label = formatAiTaskLabel(taskType);
    if (label) {
        return apiT(
            'errors.sessionBusyWithTask',
            'Another AI task is already running for this session ({task}). Please wait for it to finish, then try again.',
            { task: label }
        );
    }
    return apiT(
        'errors.sessionBusy',
        'Another AI task is already running for this session. Please wait for it to finish, then try again.'
    );
}

/**
 * User-facing message for AI task failures (timeout / session busy vs generic).
 */
function getAiTaskErrorMessage(error, fallbackKey, fallbackEn, vars) {
    if (error && error.code === API_ERROR.SESSION_BUSY) {
        return formatSessionBusyMessage(error.task || '');
    }
    if (error && error.code === API_ERROR.REQUEST_TIMEOUT) {
        return apiT(
            'errors.aiTaskStillProcessing',
            'The request timed out, but the server may still be processing your AI task in the background. Please wait before trying again.'
        );
    }
    const msg = (error && error.message) ? error.message : '';
    return apiT(fallbackKey, fallbackEn, { ...(vars || {}), msg });
}

function formatRetryDuration(totalSeconds) {
    const s = Math.max(0, Math.ceil(Number(totalSeconds) || 0));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    if (mins > 0) {
        return apiT('errors.retryDurationMinSec', '{minutes} min {seconds} sec', {
            minutes: mins,
            seconds: String(secs).padStart(2, '0'),
        });
    }
    return apiT('errors.retryDurationSec', '{seconds} sec', { seconds: s });
}

function buildAiTaskRetryBannerMessage(state) {
    const time = formatRetryDuration(state.retryAfter);
    const taskLabel = formatAiTaskLabel(state.taskType);
    if (state.queueStatus === 'queued' && state.queuePosition > 0) {
        if (taskLabel) {
            return apiT(
                'errors.aiTaskRetryQueuedWithTask',
                '“{task}” is queued (position {position}). You can retry in about {time}.',
                { task: taskLabel, position: state.queuePosition, time }
            );
        }
        return apiT(
            'errors.aiTaskRetryQueued',
            'Queued (position {position}). You can retry in about {time}.',
            { position: state.queuePosition, time }
        );
    }
    if (state.errorKind === API_ERROR.REQUEST_TIMEOUT) {
        if (taskLabel) {
            return apiT(
                'errors.aiTaskRetryCountdownTimeoutWithTask',
                'The request timed out, but “{task}” may still be running. You can retry in about {time}.',
                { task: taskLabel, time }
            );
        }
        return apiT(
            'errors.aiTaskRetryCountdownTimeout',
            'The request timed out, but processing may continue in the background. You can retry in about {time}.',
            { time }
        );
    }
    if (taskLabel) {
        return apiT(
            'errors.aiTaskRetryCountdownWithTask',
            '“{task}” is still running. You can retry in about {time}.',
            { task: taskLabel, time }
        );
    }
    return apiT(
        'errors.aiTaskRetryCountdown',
        'An AI task is still running. You can retry in about {time}.',
        { time }
    );
}

function apiMsg(message) {
    if (message == null) return '';
    if (typeof window !== 'undefined' && window.GBAI18n && window.GBAI18n.tApiCode) {
        const code = String(message).trim();
        const translated = window.GBAI18n.tApiCode(code, 'apiMessages.' + code, '');
        if (translated && translated !== code) return translated;
    }
    if (typeof window !== 'undefined' && window.GBAI18n && window.GBAI18n.tApiMessage) {
        return window.GBAI18n.tApiMessage(String(message));
    }
    return String(message);
}

/** Canonical mock fixtures live in test-data/ (loaded via browser-bundle.js). */
function alexChenFixtures() {
    const td = (typeof window !== 'undefined' && window.GBA_TEST_DATA)
        || (typeof globalThis !== 'undefined' && globalThis.GBA_TEST_DATA);
    if (!td || !td.alexChen) {
        throw new Error(apiT('errors.loadTestDataFirst', 'Load test-data/browser-bundle.js before api-client.js'));
    }
    return td.alexChen;
}

function mockResumeEnHtml() {
    return alexChenFixtures().resumeEnHtml;
}

function mockResumeZhHtml() {
    return alexChenFixtures().resumeZhHtml;
}

function alexChenMock() {
    return alexChenFixtures().mock;
}

class MockAPIService {
    constructor() {
        this.state = {
            hasProfile: false,
            hasJob: false,
            hasResume: false,
            jobTitle: '',
            tone: 'professional',
        };
        this.interactiveSessions = {};
    }

    delay(ms = 900) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    baseResponse(sessionId) {
        return {
            session_id: sessionId,
            reply_message: '',
            job: null,
            gaps: [],
            questions_to_ask: [],
            experiences_to_remove: [],
            resume_content_json: null,
            render_config: null,
            resume_html: null,
            interview_qa: [],
            triggered_agents: [],
        };
    }

    candidateProfilePayload() {
        return alexChenMock().candidateProfile;
    }

    _draftKey(sessionId) {
        return `gba_mock_draft_${sessionId}`;
    }

    _userDraftKey() {
        return 'gba_mock_user_draft';
    }

    async getResumeDraft(sessionId) {
        await this.delay(200);
        const mysqlDraft = localStorage.getItem(`${this._userDraftKey()}_mysql`);
        if (mysqlDraft) {
            const parsed = JSON.parse(mysqlDraft);
            return { session_id: parsed.session_id || sessionId, draft: parsed.draft, source: 'mysql', restored: true };
        }
        const userDraft = localStorage.getItem(this._userDraftKey());
        if (userDraft) {
            const parsed = JSON.parse(userDraft);
            return { session_id: parsed.session_id || sessionId, draft: parsed.draft, source: 'mock_user', restored: true };
        }
        const raw = localStorage.getItem(this._draftKey(sessionId));
        if (raw) {
            return { session_id: sessionId, draft: JSON.parse(raw), source: 'mock_session', restored: true };
        }
        if (!this.state.hasProfile) {
            throw new Error(apiT('errors.notFound', 'Resource not found. Please check your session ID.'));
        }
        const draft = {
            profile_basic: this.candidateProfilePayload().profile_basic,
            education: [{
                id: 'fact_edu_1',
                school: 'City University of Hong Kong',
                major: 'Business Administration',
                degree: 'Bachelor',
                start_date: '2017-09',
                end_date: '2021-06',
                is_custom: false,
            }],
            modules: [
                { id: 'fact_skill_1', type: 'skill', title: 'Customer Service', content: 'Customer Service', is_custom: false },
                { id: 'fact_skill_2', type: 'skill', title: 'English', content: 'English', is_custom: false },
                { id: 'fact_skill_3', type: 'skill', title: 'Cantonese', content: 'Cantonese', is_custom: false },
                { id: 'fact_intern_1', type: 'internship', title: 'Global E-Trade Co.', content: 'Customer Service Specialist (2021–Present)', is_custom: false },
                { id: 'fact_project_1', type: 'project', title: 'Knowledge Base Refresh', content: 'Updated CS FAQ for cross-border orders.', is_custom: false },
            ],
            updated_at: new Date().toISOString(),
        };
        return { session_id: sessionId, draft, source: 'profile', restored: false };
    }

    async saveResumeDraft(sessionId, draft, loggedIn) {
        await this.delay(150);
        localStorage.setItem(this._draftKey(sessionId), JSON.stringify(draft));
        if (loggedIn) {
            localStorage.setItem(this._userDraftKey(), JSON.stringify({ session_id: sessionId, draft }));
        }
        return { ok: true, updated_at: draft.updated_at || new Date().toISOString() };
    }

    async saveResumeToAccount(sessionId) {
        await this.delay(400);
        return { ok: true, message: apiT('mock.resumeSavedDemo', 'Resume saved securely to your account (demo mode).'), session_id: sessionId };
    }

    async getSessionResumeStatus(sessionId) {
        await this.delay(120);
        const sessionDraft = sessionId ? localStorage.getItem(this._draftKey(sessionId)) : null;
        const userDraft = localStorage.getItem(this._userDraftKey());
        const mysqlDraft = localStorage.getItem(`${this._userDraftKey()}_mysql`);
        return {
            session_id: sessionId,
            has_working_profile: Boolean(sessionDraft || userDraft) || this.state.hasProfile,
            has_generated_resume: this.state.hasResume,
            has_session_persisted: Boolean(mysqlDraft),
        };
    }

    _profileRecordsKey() {
        return 'gba_mock_profile_save_records';
    }

    _loadProfileRecords() {
        try {
            const raw = localStorage.getItem(this._profileRecordsKey());
            return raw ? JSON.parse(raw) : [];
        } catch (_e) {
            return [];
        }
    }

    _saveProfileRecords(records) {
        localStorage.setItem(this._profileRecordsKey(), JSON.stringify(records));
    }

    async saveProfileToAccount(sessionId, draft, recordName = '') {
        await this.delay(400);
        const payload = { ...draft, updated_at: draft.updated_at || new Date().toISOString() };
        localStorage.setItem(this._draftKey(sessionId), JSON.stringify(payload));
        localStorage.setItem(this._userDraftKey(), JSON.stringify({ session_id: sessionId, draft: payload }));
        const candidateName = (payload.profile_basic && payload.profile_basic.name) || '';
        const name = String(recordName || '').trim() || candidateName || 'Resume profile';
        const recordId = `spr_mock_${Date.now()}`;
        const savedAt = payload.updated_at;
        const records = this._loadProfileRecords();
        records.unshift({
            id: recordId,
            session_id: sessionId,
            record_name: name,
            candidate_name: candidateName,
            saved_at: savedAt,
            data: { draft: payload, candidate_profile: this.candidateProfilePayload() },
        });
        this._saveProfileRecords(records.slice(0, 50));
        return {
            ok: true,
            message: apiT('mock.profileSavedDemo', 'Profile saved to your account (demo mode).'),
            session_id: sessionId,
            record_id: recordId,
            record_name: name,
            saved_at: savedAt,
            updated_at: savedAt,
        };
    }

    async getProfileSaveHistory(limit = 20) {
        await this.delay(300);
        return { records: this._loadProfileRecords().slice(0, limit) };
    }

    async restoreSavedProfile(recordId, sessionId) {
        await this.delay(400);
        const record = this._loadProfileRecords().find((r) => r.id === recordId);
        if (!record) {
            throw new Error(apiT('errors.notFound', 'Resource not found. Please check your session ID.'));
        }
        const draft = record.data?.draft;
        if (!draft) {
            throw new Error(apiT('errors.notFound', 'Resource not found. Please check your session ID.'));
        }
        await this.saveResumeDraft(sessionId, draft, true);
        this.state.hasProfile = true;
        return {
            ok: true,
            session_id: sessionId,
            record_id: recordId,
            record_name: record.record_name || '',
            draft,
        };
    }

    async saveInteractiveInterview(sessionId, recordId = '') {
        await this.delay(500);
        const id = recordId || `iis_mock_${Date.now()}`;
        return {
            ok: true,
            message: apiT('mock.interviewSavedDemo', 'Mock interview saved to your account (demo mode).'),
            session_id: sessionId,
            record_id: id,
        };
    }

    async saveQuestionBank(sessionId, payload = {}) {
        await this.delay(400);
        const now = new Date();
        const savedAt = now.toISOString();
        const recordName = (payload.record_name || '').trim()
            || now.toLocaleString(undefined, {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit',
            });
        const id = `qbs_mock_${Date.now()}`;
        return {
            ok: true,
            message: apiT('mock.questionBankSavedDemo', 'Question bank saved to your account (demo mode).'),
            session_id: sessionId,
            record_id: id,
            record_name: recordName,
            saved_at: savedAt,
        };
    }

    async getQuestionBankHistory(limit = 20) {
        await this.delay(300);
        const now = new Date();
        return {
            records: [{
                id: 'qbs_mock_demo',
                record_name: now.toLocaleString(undefined, {
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit',
                }),
                job_title: 'Software Engineer',
                industry: 'tech',
                tone: 'professional',
                mode: 'question_bank',
                program_version: 'quick',
                question_count: 13,
                saved_at: now.toISOString(),
            }].slice(0, limit),
        };
    }

    async getSavedQuestionBank(recordId) {
        await this.delay(300);
        const now = new Date();
        return {
            id: recordId,
            record_name: now.toLocaleString(undefined, {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit',
            }),
            job_title: 'Software Engineer',
            industry: 'tech',
            tone: 'professional',
            mode: 'question_bank',
            program_version: 'quick',
            question_count: 2,
            saved_at: now.toISOString(),
            data: {
                interview_qa: [
                    { id: 'q1', question: 'Please introduce yourself.', category: 'Behavioral', answer: 'Sample answer.' },
                    { id: 'q2', question: 'Why this role?', category: 'Motivation', answer: 'Sample answer.' },
                ],
                user_answers: ['My intro...', ''],
                program_label: 'Quick (~30 min)',
                stages: [],
            },
        };
    }

    async getInteractiveInterviewHistory(limit = 20) {
        await this.delay(300);
        return { records: alexChenMock().interactiveInterviewHistory.slice(0, limit) };
    }

    async updateLearningPathTimeline(sessionId, timeline) {
        await this.delay(300);
        const lastPeriod = timeline.length
            ? (timeline[timeline.length - 1].period || timeline[timeline.length - 1].weeks || timeline[timeline.length - 1].days || '0')
            : '0';
        const match = String(lastPeriod).match(/(\d+)$/);
        const unit = timeline[0]?.unit || 'week';
        return {
            ok: true,
            message: apiT('mock.timelineUpdatedDemo', 'Timeline updated (demo mode).'),
            session_id: sessionId,
            timeline,
            timeline_unit: unit,
            estimated_span: match ? parseInt(match[1], 10) : timeline.length * 4,
            estimated_weeks: match ? parseInt(match[1], 10) : timeline.length * 4,
        };
    }

    async saveLearningPathToAccount(sessionId, recordId = '') {
        await this.delay(400);
        const id = recordId || `lpp_mock_${Date.now()}`;
        return {
            ok: true,
            message: apiT('mock.learningPathSavedDemo', 'Learning path saved to your account (demo mode).'),
            session_id: sessionId,
            record_id: id,
        };
    }

    async getLearningPathHistory(limit = 20) {
        await this.delay(300);
        return { records: alexChenMock().learningPathHistory.slice(0, limit) };
    }

    profilePayload() {
        return alexChenMock().profilePayload;
    }

    gapPayload(language = 'zh') {
        return this.buildMockGaps(language);
    }

    buildMockGaps(language = 'zh') {
        const lang = this.normalizeResumeLanguage(language);
        const tables = {
            zh: [
                {
                    type: 'missing_skill',
                    description: '高级 Excel / 数据报表能力',
                    severity: 'medium',
                    suggestion: '建议完成一门 Excel 商务应用短课',
                },
                {
                    type: 'missing_skill',
                    description: '跨境支付与结算流程经验',
                    severity: 'high',
                    suggestion: '了解主流跨境电商平台的结算与退款政策',
                },
                {
                    type: 'experience_gap',
                    description: '在线客服 SLA 指标管理经验',
                    severity: 'low',
                    suggestion: '练习限时响应场景并记录处理时效',
                },
            ],
            'zh-TW': [
                {
                    type: 'missing_skill',
                    description: '進階 Excel / 數據報表能力',
                    severity: 'medium',
                    suggestion: '建議完成一門 Excel 商務應用短課',
                },
                {
                    type: 'missing_skill',
                    description: '跨境支付與結算流程經驗',
                    severity: 'high',
                    suggestion: '了解主流跨境電商平台的結算與退款政策',
                },
                {
                    type: 'experience_gap',
                    description: '線上客服 SLA 指標管理經驗',
                    severity: 'low',
                    suggestion: '練習限時回應場景並記錄處理時效',
                },
            ],
            en: [
                {
                    type: 'missing_skill',
                    description: 'Advanced Excel / data reporting',
                    severity: 'medium',
                    suggestion: 'Complete a short Excel for business course',
                },
                {
                    type: 'missing_skill',
                    description: 'Cross-border payment workflows',
                    severity: 'high',
                    suggestion: 'Study marketplace settlement and refund policies',
                },
                {
                    type: 'experience_gap',
                    description: 'Live chat SLA metrics',
                    severity: 'low',
                    suggestion: 'Practice timed response drills',
                },
            ],
            pt: [
                {
                    type: 'missing_skill',
                    description: 'Excel avançado / relatórios de dados',
                    severity: 'medium',
                    suggestion: 'Conclua um curso curto de Excel para negócios',
                },
                {
                    type: 'missing_skill',
                    description: 'Fluxos de pagamento transfronteiriços',
                    severity: 'high',
                    suggestion: 'Estude políticas de liquidação e reembolso de marketplaces',
                },
                {
                    type: 'experience_gap',
                    description: 'Métricas SLA de chat ao vivo',
                    severity: 'low',
                    suggestion: 'Pratique respostas cronometradas e registe tempos de resolução',
                },
            ],
        };
        return (tables[lang] || tables.en).map((gap) => ({ ...gap }));
    }

    buildMockAnswerEvaluation(language = 'zh') {
        const lang = this.normalizeResumeLanguage(language);
        const tables = {
            zh: {
                reply_message: '您的回答结构清晰。建议补充具体量化成果以增强说服力。',
                strengths: ['表达清楚', '案例选择贴合'],
                improvements: ['尽量量化结果', '可补充跨境业务背景'],
                suggestions: ['尝试用 STAR 结构并给出可衡量结果', '提及使用的工具或制度流程'],
                judge_scores: { relevance: 82, groundedness: 74, actionability: 79, rationale: '演示评分标准。' },
            },
            'zh-TW': {
                reply_message: '您的回答結構清晰。建議補充具體量化成果以增強說服力。',
                strengths: ['表達清楚', '案例選擇貼合'],
                improvements: ['盡量量化結果', '可補充跨境業務背景'],
                suggestions: ['嘗試用 STAR 結構並給出可衡量結果', '提及使用的工具或制度流程'],
                judge_scores: { relevance: 82, groundedness: 74, actionability: 79, rationale: '演示評分標準。' },
            },
            en: {
                reply_message: 'Your answer shows good structure. Add a concrete metric or outcome to strengthen impact.',
                strengths: ['Clear communication', 'Relevant example chosen'],
                improvements: ['Quantify results where possible', 'Mention cross-border context explicitly'],
                suggestions: ['Try the STAR format with a measurable result', 'Reference tools or policies you used'],
                judge_scores: { relevance: 82, groundedness: 74, actionability: 79, rationale: 'Demo rubric scores.' },
            },
            pt: {
                reply_message: 'A sua resposta tem boa estrutura. Acrescente uma métrica ou resultado concreto para reforçar o impacto.',
                strengths: ['Comunicação clara', 'Exemplo relevante escolhido'],
                improvements: ['Quantifique resultados quando possível', 'Mencione explicitamente o contexto transfronteiriço'],
                suggestions: ['Use o formato STAR com um resultado mensurável', 'Referencie ferramentas ou políticas utilizadas'],
                judge_scores: { relevance: 82, groundedness: 74, actionability: 79, rationale: 'Pontuação de rubrica de demonstração.' },
            },
        };
        const payload = tables[lang] || tables.en;
        return {
            triggered_agents: ['answer_evaluation_agent'],
            score: 78,
            ...payload,
        };
    }

    buildMockGapQuestions(language = 'zh') {
        const lang = this.normalizeResumeLanguage(language);
        const tables = {
            zh: [
                {
                    id: 'q_1',
                    question: '您是否有跨境电商平台卖家后台的操作经验？',
                    reason: '跨境电商客服岗位常见要求，需确认实操细节',
                    priority: 'high',
                },
                {
                    id: 'q_2',
                    question: '您是否处理过跨区域的退款或纠纷案例？',
                    reason: '用于验证跨境运营与合规处理经验',
                    priority: 'medium',
                },
            ],
            'zh-TW': [
                {
                    id: 'q_1',
                    question: '您是否有跨境電商平台賣家後台的操作經驗？',
                    reason: '跨境電商客服崗位常見要求，需確認實操細節',
                    priority: 'high',
                },
                {
                    id: 'q_2',
                    question: '您是否處理過跨區域的退款或糾紛案例？',
                    reason: '用於驗證跨境運營與合規處理經驗',
                    priority: 'medium',
                },
            ],
            en: [
                {
                    id: 'q_1',
                    question: 'Do you have experience with marketplace seller dashboards?',
                    reason: 'Common requirement for cross-border customer service roles',
                    priority: 'high',
                },
                {
                    id: 'q_2',
                    question: 'Have you handled refund disputes across regions?',
                    reason: 'Validates cross-border operational knowledge',
                    priority: 'medium',
                },
            ],
            pt: [
                {
                    id: 'q_1',
                    question: 'Tem experiência com painéis de vendedores em marketplaces?',
                    reason: 'Requisito frequente em funções de apoio ao cliente transfronteiriço',
                    priority: 'high',
                },
                {
                    id: 'q_2',
                    question: 'Já tratou de disputas de reembolso entre regiões?',
                    reason: 'Valida conhecimento operacional transfronteiriço',
                    priority: 'medium',
                },
            ],
        };
        return (tables[lang] || tables.en).map((q) => ({ ...q }));
    }

    buildMockExperienceRemovals(language = 'zh') {
        const lang = this.normalizeResumeLanguage(language);
        const tables = {
            zh: [{
                id: 'rem_1',
                fact_id: 'fact_project_1',
                section_type: 'project',
                title: 'Knowledge Base Refresh',
                reason: '与目标岗位关联度较低，且为节省 A4 单页篇幅建议精简',
                priority: 'recommended',
            }],
            'zh-TW': [{
                id: 'rem_1',
                fact_id: 'fact_project_1',
                section_type: 'project',
                title: 'Knowledge Base Refresh',
                reason: '與目標崗位關聯度較低，且為節省 A4 單頁篇幅建議精簡',
                priority: 'recommended',
            }],
            en: [{
                id: 'rem_1',
                fact_id: 'fact_project_1',
                section_type: 'project',
                title: 'Knowledge Base Refresh',
                reason: 'Low relevance to the target role; suggested to omit for a one-page A4 layout',
                priority: 'recommended',
            }],
            pt: [{
                id: 'rem_1',
                fact_id: 'fact_project_1',
                section_type: 'project',
                title: 'Knowledge Base Refresh',
                reason: 'Baixa relevância para a vaga; sugerido omitir para caber numa página A4',
                priority: 'recommended',
            }],
        };
        return (tables[lang] || tables.en).map((r) => ({ ...r }));
    }

    mockResumeHtmlForLanguage(language = 'zh') {
        const lang = this.normalizeResumeLanguage(language);
        if (lang === 'en' || lang === 'pt') {
            return mockResumeEnHtml();
        }
        return mockResumeZhHtml();
    }

    mockJobTitleForLanguage(language = 'zh') {
        const lang = this.normalizeResumeLanguage(language);
        const titles = {
            zh: '跨境客户服务专员',
            'zh-TW': '跨境客戶服務專員',
            en: 'Cross-border Customer Service Specialist',
            pt: 'Especialista de Apoio ao Cliente Transfronteiriço',
        };
        return titles[lang] || titles.en;
    }

    interviewPayload(tone = 'professional', programVersion = 'quick', specializedFocus = '') {
        const base = alexChenMock().interviewSets[tone] || alexChenMock().interviewSets.professional;
        const stagePlans = {
            quick: [
                { stage_id: 'screening_final', name: apiT('mock.stageScreeningFinal', 'Screening + final combined'), count: 5 },
                { stage_id: 'professional', name: apiT('mock.stageProfessional', 'Round 2 — professional / technical'), count: 8 },
            ],
            full: [
                { stage_id: 'screening', name: apiT('mock.stageScreening', 'Round 1 — screening'), count: 5 },
                { stage_id: 'professional', name: apiT('mock.stageProfessional', 'Round 2 — professional / technical'), count: 8 },
                { stage_id: 'final', name: apiT('mock.stageFinal', 'Round 3 — director / HR final'), count: 4 },
            ],
        };
        const specializedPlans = {
            technical: [{ stage_id: 'specialized_technical', name: apiT('mock.stageSpecializedTechnical', 'Specialized — technical'), count: 10 }],
            final_negotiation: [{ stage_id: 'specialized_final_negotiation', name: apiT('mock.stageSpecializedNegotiation', 'Specialized — final negotiation'), count: 6 }],
            resume_deep_dive: [{ stage_id: 'specialized_resume_deep_dive', name: apiT('mock.stageSpecializedResume', 'Specialized — resume deep dive'), count: 8 }],
        };

        const plans = programVersion === 'specialized'
            ? (specializedPlans[specializedFocus] || specializedPlans.technical)
            : (stagePlans[programVersion] || stagePlans.quick);

        const demoQuestions = [
            { question: apiT('mock.qSelfIntro', 'Tell me about yourself'), category: apiT('mock.catResumeDeep', 'Resume deep dive & experience'), answer: apiT('mock.aSelfIntro', 'Structured intro: background, experience, role fit, and career goal.') },
            { question: apiT('mock.qWhyLeave', 'Why did you leave your last employer?'), category: apiT('mock.catMotivation', 'Role understanding & motivation'), answer: apiT('mock.aWhyLeave', 'Emphasize growth and stability; avoid negative comments about the former employer.') },
            { question: apiT('mock.qRoleKnowledge', 'What do you know about our role and business?'), category: apiT('mock.catMotivation', 'Role understanding & motivation'), answer: apiT('mock.aRoleKnowledge', 'Summarize understanding based on the JD and company context.') },
            ...base.map(q => ({ question: q.question, category: q.category, answer: q.answer })),
            { question: apiT('mock.qPressure', 'Describe a time you handled an urgent issue under pressure'), category: apiT('mock.catPressure', 'Pressure & weakness review'), answer: apiT('mock.aPressure', 'Use STAR; highlight calm execution and outcomes.') },
            { question: apiT('mock.qSalary', 'What are your salary expectations?'), category: apiT('mock.catCareer', 'Career planning & stability'), answer: apiT('mock.aSalary', 'Give a reasonable range and show flexibility.') },
            { question: apiT('mock.qReverse', 'What questions do you have for us?'), category: apiT('mock.catReverse', 'Reverse questions'), answer: apiT('mock.aReverse', 'Ask about team, growth, and business direction.') },
        ];

        const result = [];
        let qIndex = 0;
        plans.forEach((plan, stageIndex) => {
            for (let i = 0; i < plan.count; i += 1) {
                const template = demoQuestions[qIndex % demoQuestions.length];
                result.push({
                    id: `qa_${stageIndex}_${i + 1}`,
                    stage_id: plan.stage_id,
                    stage_name: plan.name,
                    stage_index: stageIndex,
                    category: template.category,
                    question: i === 0 && stageIndex === 0 ? apiT('mock.qSelfIntro', 'Tell me about yourself') : template.question,
                    answer: template.answer,
                    source_refs: [],
                    version: 1,
                });
                qIndex += 1;
            }
        });
        return result;
    }

    customInterviewAnswersPayload(questions) {
        return questions.map((question, index) => ({
            id: `qa_custom_${index + 1}`,
            stage_id: 'custom',
            stage_name: 'Custom Questions',
            stage_index: 0,
            category: 'Custom',
            question,
            answer: `Based on your profile and the target JD, here is a tailored reference answer for: "${question}". `
                + 'Use STAR structure, cite a concrete project from your resume, and link outcomes to the role requirements.',
            source_refs: ['Demo resume project', 'Target JD keywords'],
            version: 1,
        }));
    }

    _mockInteractiveFollowUps() {
        return alexChenMock().interactiveFollowUps;
    }

    async startInteractiveInterview(sessionId, tone, jobTitle, industry, maxRounds, programVersion = 'quick', specializedFocus = '') {
        await this.delay(1200);

        const programLabels = {
            quick: apiT('mock.programQuick', 'Quick (~30 min)'),
            full: apiT('mock.programFull', 'Full (~60 min)'),
            specialized: apiT('mock.programSpecialized', 'Specialized'),
        };
        const stageSets = {
            quick: [
                { stage_id: 'screening_final', name: apiT('mock.stageScreeningFinal', 'Screening + final combined'), subtitle: '15 min · HR + assessment', max_turns: 5, turn_count: 1, status: 'active' },
                { stage_id: 'professional', name: apiT('mock.stageProfessional', 'Round 2 — professional / technical'), subtitle: '20-30 min · department lead', max_turns: 8, turn_count: 0, status: 'pending' },
            ],
            full: [
                { stage_id: 'screening', name: apiT('mock.stageScreening', 'Round 1 — screening'), subtitle: '10-15 min · HR', max_turns: 5, turn_count: 1, status: 'active' },
                { stage_id: 'professional', name: apiT('mock.stageProfessional', 'Round 2 — professional / technical'), subtitle: '20-30 min · manager', max_turns: 8, turn_count: 0, status: 'pending' },
                { stage_id: 'final', name: apiT('mock.stageFinal', 'Round 3 — director / HR final'), subtitle: '10-15 min · director / HRD', max_turns: 4, turn_count: 0, status: 'pending' },
            ],
            specialized: [{
                stage_id: `specialized_${specializedFocus || 'technical'}`,
                name: {
                    technical: apiT('mock.stageSpecializedTechnical', 'Specialized — technical'),
                    final_negotiation: apiT('mock.stageSpecializedNegotiation', 'Specialized — final negotiation'),
                    resume_deep_dive: apiT('mock.stageSpecializedResume', 'Specialized — resume deep dive'),
                }[specializedFocus || 'technical'],
                subtitle: apiT('mock.specializedPractice', 'Specialized practice'),
                max_turns: 8,
                turn_count: 1,
                status: 'active',
            }],
        };

        const stages = stageSets[programVersion] || stageSets.quick;
        const totalRounds = maxRounds || stages.reduce((sum, s) => sum + s.max_turns, 0);

        const opening = tone === 'pressure'
            ? apiT('mock.interviewOpeningQuick', 'Hello, I am your interviewer today. We use a structured process with limited time — please give a two-minute structured self-introduction (background, experience, role fit, and career goal).')
            : tone === 'friendly'
                ? apiT('mock.interviewOpeningFriendly', 'Hello! Glad to meet you today. Let us start with a relaxed self-introduction — your background, experience, and why this role interests you.')
                : apiT('mock.interviewOpeningDefault', 'Hello, welcome to this structured mock interview. Please introduce yourself: background, core experience, strengths for this role, and your career goal.');

        const session = {
            status: 'active',
            tone,
            job_title: jobTitle,
            industry,
            program_version: programVersion,
            specialized_focus: specializedFocus || '',
            job_track: 'general',
            current_stage_index: 0,
            stages,
            max_rounds: totalRounds,
            round_count: 1,
            program_label: programLabels[programVersion] || programVersion,
            turns: [{
                id: 'turn_open',
                role: 'interviewer',
                content: opening,
                turn_type: 'opening',
                category: apiT('mock.catResumeDeep', 'Resume deep dive & experience'),
                round: 1,
                stage_index: 0,
                stage_name: stages[0].name,
                created_at: new Date().toISOString(),
            }],
            debrief: null,
            started_at: new Date().toISOString(),
            ended_at: '',
            latest_interviewer_message: opening,
            latest_brief_feedback: '',
            current_stage: stages[0],
        };
        this.interactiveSessions[sessionId] = { session, followUpIndex: 0 };
        return {
            session_id: sessionId,
            interactive_interview: session,
            message: apiT('apiMessages.模拟面试已开始（demo mode）', 'Mock interview started (demo mode)'),
        };
    }

    async submitInteractiveTurn(sessionId, answer) {
        await this.delay(1000);
        const stored = this.interactiveSessions[sessionId];
        if (!stored || stored.session.status !== 'active') {
            throw new Error(apiT('errors.noActiveInterview', 'No active interactive interview'));
        }
        const { session } = stored;
        session.turns.push({
            id: `turn_${Date.now()}`,
            role: 'candidate',
            content: answer,
            turn_type: 'answer',
            round: session.round_count,
            created_at: new Date().toISOString(),
        });

        const followUps = this._mockInteractiveFollowUps();
        const followUp = followUps[stored.followUpIndex % followUps.length];
        stored.followUpIndex += 1;

        session.turns.push({
            id: `turn_fb_${Date.now()}`,
            role: 'interviewer',
            content: followUp.brief_feedback,
            turn_type: 'brief_feedback',
            category: followUp.category,
            round: session.round_count,
            created_at: new Date().toISOString(),
        });

        const shouldEnd = session.round_count >= session.max_rounds || stored.followUpIndex >= followUps.length;

        if (shouldEnd) {
            session.turns.push({
                id: `turn_end_${Date.now()}`,
                role: 'interviewer',
                content: apiT('mock.interviewClosing', 'Thank you for your answers. This mock interview is complete. You can view the debrief report.'),
                turn_type: 'end',
                category: followUp.category,
                round: session.round_count,
                created_at: new Date().toISOString(),
            });
            session.status = 'completed';
            session.ended_at = new Date().toISOString();
            session.latest_interviewer_message = apiT('mock.interviewClosing', 'Thank you for your answers. This mock interview is complete. You can view the debrief report.');
            session.latest_brief_feedback = followUp.brief_feedback;
        } else {
            session.round_count += 1;
            session.turns.push({
                id: `turn_q_${Date.now()}`,
                role: 'interviewer',
                content: followUp.interviewer_message,
                turn_type: followUp.follow_up_type === 'follow_up' ? 'follow_up' : 'question',
                category: followUp.category,
                round: session.round_count,
                created_at: new Date().toISOString(),
            });
            session.latest_interviewer_message = followUp.interviewer_message;
            session.latest_brief_feedback = followUp.brief_feedback;
        }

        return {
            session_id: sessionId,
            interactive_interview: session,
            message: shouldEnd ? apiT('mock.interviewEnded', 'Interview ended') : apiT('mock.continueAnswer', 'Please continue your answer'),
        };
    }

    async pollInteractiveSession(sessionId, sinceSequence = 0) {
        await this.delay(300);
        const stored = this.interactiveSessions[sessionId];
        if (!stored) {
            throw new Error(apiT('errors.noInterviewSession', 'No interview session found'));
        }
        const session = stored.session;
        session.poll_sequence = (session.poll_sequence || 0) + 1;
        session.poll_updates = {
            poll_sequence: session.poll_sequence,
            has_updates: session.poll_sequence > sinceSequence,
            phase: session.phase || 'primary',
            status: session.status,
            pending_feedback_count: 0,
            waiting_for_follow_ups: false,
        };
        return {
            session_id: sessionId,
            interactive_interview: session,
            message: apiT('apiMessages.INTERVIEW_POLL_SYNCED', 'Status synced (demo mode)'),
        };
    }

    async endInteractiveInterview(sessionId, generateDebrief) {
        await this.delay(1500);
        const stored = this.interactiveSessions[sessionId];
        if (!stored) {
            throw new Error(apiT('errors.noInterviewSession', 'No interview session found'));
        }
        const session = stored.session;
        session.status = 'completed';
        session.ended_at = new Date().toISOString();

        if (generateDebrief) {
            session.debrief = {
                overall_score: 76,
                summary: apiT('mock.debriefSummary', 'Solid overall performance with clear communication and relevant examples. Add quantified outcomes and stronger links to the role and company.'),
                strengths: [
                    apiT('mock.debriefStrength1', 'Fluent delivery with good structure'),
                    apiT('mock.debriefStrength2', 'Answers grounded in real experience'),
                    apiT('mock.debriefStrength3', 'Positive attitude and clear motivation'),
                ],
                weaknesses: [
                    apiT('mock.debriefWeakness1', 'Some answers lack quantified metrics'),
                    apiT('mock.debriefWeakness2', 'Role and business details could be deeper'),
                    apiT('mock.debriefWeakness3', 'Pressure answers could be more concise'),
                ],
                key_moments: [
                    {
                        question: apiT('mock.debriefMoment1Q', 'Please introduce yourself'),
                        your_answer_summary: apiT('mock.debriefMoment1Summary', 'Covered education and customer-service internship'),
                        analysis: apiT('mock.debriefMoment1Analysis', 'Structure is complete; lead with role-fit highlights'),
                        improved_answer: apiT('mock.debriefMoment1Improved', 'Open with 1–2 quantified outcomes tied to the target role, then expand relevant experience'),
                        score: 72,
                    },
                    {
                        question: apiT('mock.debriefMoment2Q', 'Describe handling a customer complaint'),
                        your_answer_summary: apiT('mock.debriefMoment2Summary', 'Explained a delayed cross-border order case'),
                        analysis: apiT('mock.debriefMoment2Analysis', 'Good STAR structure; missing satisfaction or business metrics'),
                        improved_answer: apiT('mock.debriefMoment2Improved', 'Add resolution time, customer feedback, and process improvements'),
                        score: 78,
                    },
                ],
                recommendations: [
                    apiT('mock.debriefRec1', 'Include at least one quantified result per answer'),
                    apiT('mock.debriefRec2', 'Research the target company and role requirements'),
                    apiT('mock.debriefRec3', 'Practice behavioral questions with STAR'),
                    apiT('mock.debriefRec4', 'Prepare 2–3 core cases across different dimensions'),
                ],
                category_scores: {
                    [apiT('mock.catResumeDeep', 'Resume deep dive & experience')]: 75,
                    [apiT('mock.catMotivation', 'Role understanding & motivation')]: 80,
                    [apiT('mock.catProject', 'Project execution & problem solving')]: 72,
                    [apiT('mock.catPressure', 'Pressure & weakness review')]: 70,
                },
                generated_at: new Date().toISOString(),
            };
        }

        return {
            session_id: sessionId,
            interactive_interview: session,
            message: apiT('mock.debriefGenerated', 'Debrief report generated (demo mode)'),
        };
    }

    async chat(sessionId, message, attachments = [], options = {}) {
        await this.delay();
        const response = this.baseResponse(sessionId);
        const msg = (message || '').toLowerCase();
        const lang = this.normalizeResumeLanguage(options.language || 'zh');

        if (attachments.length > 0 || (!this.state.hasProfile && message.trim().length > 20 && !msg.includes('job title'))) {
            this.state.hasProfile = true;
            response.triggered_agents = ['profile_agent'];
            response.candidate_profile = this.candidateProfilePayload();
            response.resume_content_json = this.profilePayload();
            response.reply_message = apiT('mock.profileExtractedDemo', 'Profile extracted successfully (demo mode).');
            return response;
        }

        if (msg.includes('skill gaps') || msg.includes('missing competencies')) {
            this.state.hasJob = true;
            response.triggered_agents = ['gap_agent'];
            response.gaps = this.buildMockGaps(lang);
            response.questions_to_ask = this.buildMockGapQuestions(lang);
            response.experiences_to_remove = this.buildMockExperienceRemovals(lang);
            response.reply_message = apiT('mock.gapAnalysisDone', 'Skill gap analysis completed (demo mode).');
            return response;
        }

        if (msg.includes('generate interview questions')) {
            const toneMatch = message.match(/interview tone:\s*(\w+)/i);
            const tone = toneMatch ? toneMatch[1].toLowerCase() : this.state.tone;
            const versionMatch = message.match(/program version:\s*(quick|full|specialized)/i);
            const programVersion = versionMatch ? versionMatch[1].toLowerCase() : 'quick';
            const focusMatch = message.match(/specialized focus:\s*(technical|final_negotiation|resume_deep_dive)/i);
            const specializedFocus = focusMatch ? focusMatch[1].toLowerCase() : '';
            this.state.tone = tone;
            response.triggered_agents = ['interview_agent'];
            response.interview_qa = this.interviewPayload(tone, programVersion, specializedFocus);
            response.reply_message = apiT(
                'mock.interviewQuestionsGenerated',
                'Generated {count} staged interview questions (demo mode).',
                { count: response.interview_qa.length }
            );
            return response;
        }

        if (msg.includes('evaluate my answer')) {
            const evalPayload = this.buildMockAnswerEvaluation(lang);
            Object.assign(response, evalPayload);
            return response;
        }

        if (msg.includes('generate a customized resume') || msg.includes('generate resume')) {
            this.state.hasResume = true;
            response.triggered_agents = ['content_agent', 'render_agent'];
            response.resume_content_json = this.profilePayload();
            response.resume_html = { html: this.mockResumeHtmlForLanguage(lang), version: 1 };
            response.reply_message = apiT('mock.resumeGeneratedDemo', 'Customized resume generated (demo mode).');
            return response;
        }

        if (msg.includes('profile only') || msg.includes('without job description')) {
            this.state.hasResume = true;
            response.triggered_agents = ['content_agent', 'render_agent'];
            response.resume_content_json = this.profilePayload();
            response.resume_html = { html: this.mockResumeHtmlForLanguage(lang), version: 1 };
            response.reply_message = apiT('mock.profileResumeGenerated', 'Resume generated from profile (demo mode).');
            response.from_profile_only = true;
            return response;
        }

        if (msg.includes('optimize') && (msg.includes('a4') || msg.includes('one a4'))) {
            this.state.hasResume = true;
            response.triggered_agents = ['content_agent', 'render_agent'];
            response.resume_content_json = this.profilePayload();
            response.resume_html = { html: this.mockResumeHtmlForLanguage(lang), version: 2 };
            response.reply_message = apiT('mock.optimizedA4Demo', 'Resume optimized for one A4 page (demo mode).');
            return response;
        }

        if (this.state.hasResume && message.trim().length > 2) {
            response.triggered_agents = ['content_agent', 'render_agent'];
            response.resume_content_json = this.profilePayload();
            response.resume_html = { html: this.mockResumeHtmlForLanguage(lang), version: (Date.now() % 9) + 2 };
            response.reply_message = apiT('mock.resumeEditedDemo', 'Resume updated based on your edit request (demo mode).');
            return response;
        }

        if (msg.includes('translate') || msg.includes('convert to chinese') || msg.includes('convert to english') || msg.includes('中文') || msg.includes('英文')) {
            this.state.hasResume = true;
            const targetLang = /english|英文|en/i.test(message) ? 'en'
                : (/portugu|葡/i.test(message) ? 'pt' : (/traditional|繁體|zh-tw/i.test(message) ? 'zh-TW' : 'zh'));
            const html = this.mockResumeHtmlForLanguage(targetLang);
            response.triggered_agents = ['content_agent', 'render_agent'];
            response.resume_content_json = this.profilePayload();
            response.resume_html = { html, version: 2 };
            response.language = targetLang;
            response.reply_message = apiT('mock.resumeTranslatedDemo', 'Resume converted (demo mode, A4 single page).');
            return response;
        }

        if (!this.state.hasJob && message.trim().length > 30) {
            this.state.hasJob = true;
            response.triggered_agents = ['jd_agent', 'gap_agent'];
            response.job = {
                id: 'job_mock_1',
                title: this.mockJobTitleForLanguage(lang),
                company: 'GBA Employer',
            };
            response.gaps = this.buildMockGaps(lang);
            response.questions_to_ask = this.buildMockGapQuestions(lang);
            response.reply_message = apiT('mock.jdAnalyzedDemo', 'Job description analyzed and gaps identified (demo mode).');
            return response;
        }

        response.reply_message = 'Request processed (demo mode).';
        response.triggered_agents = ['planner'];
        return response;
    }

    async getResumeHtml(sessionId, language = 'zh') {
        await this.delay(300);
        return { resume_html: { html: this.mockResumeHtmlForLanguage(language), version: 1 } };
    }

    _resumeContentToMarkdown(content, language = 'zh') {
        const profile = content.profile || {};
        const L = (key, fb) => apiT('resume.' + key, fb);
        const lines = [
            '# ' + L('parsedResumeTitle', 'Resume content'),
            '',
            '## ' + L('parsedBasicInfo', 'Basic information'),
            '- ' + L('parsedName', 'Name') + ': ' + (profile.name || '-'),
            '- ' + L('parsedEmail', 'Email') + ': ' + (profile.email || '-'),
            '- ' + L('parsedPhone', 'Phone') + ': ' + (profile.phone || '-'),
            '- ' + L('parsedCity', 'City') + ': ' + (profile.city || '-'),
            '- GitHub: ' + (profile.github || '-'),
            '',
            '## ' + L('parsedSummary', 'Summary'),
            content.summary || '-',
        ];
        const sections = [
            [L('factTypeSkill', 'Skills'), content.skills],
            [L('factTypeWork', 'Work Experience'), content.works],
            [L('factTypeInternship', 'Internships'), content.internships],
            [L('factTypeProject', 'Projects'), content.projects],
            [L('factTypeAward', 'Awards'), content.awards],
            [L('factTypePaper', 'Publications'), content.papers],
        ];
        for (const [title, items] of sections) {
            lines.push('', `## ${title}`);
            if (!items || !items.length) {
                lines.push('- -');
                continue;
            }
            for (const item of items) {
                lines.push(`- ${item.title}`, `  ${item.content || ''}`);
            }
        }
        return lines.join('\n');
    }

    async exportResume(sessionId, format) {
        await this.delay(400);
        const normalized = String(format || 'pdf').toLowerCase();
        const content = this.profilePayload();

        if (normalized === 'json') {
            return new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' });
        }
        if (normalized === 'markdown' || normalized === 'md') {
            const lang = this.getPageLanguage ? this.getPageLanguage() : 'en';
            return new Blob([this._resumeContentToMarkdown(content, lang)], { type: 'text/markdown' });
        }
        if (normalized === 'pdf' || normalized === 'docx') {
            const err = new Error(apiT('resume.toast.demoExportUnavailable', 'Demo mode does not support server PDF/DOCX. Connect the backend or use browser print.'));
            err.code = 'EXPORT_FALLBACK';
            throw err;
        }
        throw new Error(apiT('errors.unsupportedExportFormat', 'Unsupported export format: {format}', { format }));
    }

    normalizeResumeLanguage(targetLanguage) {
        const raw = String(targetLanguage || 'zh').trim().toLowerCase().replace('_', '-');
        if (raw === 'en' || raw === 'english') return 'en';
        if (raw === 'zh-tw' || raw === 'zh-hant') return 'zh-TW';
        if (raw === 'pt' || raw === 'pt-pt' || raw === 'pt-mo') return 'pt';
        return 'zh';
    }

    buildMockChecklist(language) {
        const lang = this.normalizeResumeLanguage(language);
        const key = lang === 'en' || lang === 'pt' ? 'en' : 'zh';
        const checklist = alexChenMock().languageChecklists[key];
        return { ...checklist, language: lang };
    }

    async translateResume(sessionId, targetLanguage) {
        await this.delay(1200);
        const lang = this.normalizeResumeLanguage(targetLanguage);
        const messageMap = {
            en: 'translate resume to english',
            pt: 'translate resume to portuguese',
            'zh-TW': 'convert to traditional chinese resume',
            zh: 'convert to chinese resume',
        };
        const response = await this.chat(sessionId, messageMap[lang] || messageMap.zh, [], { language: lang });
        response.language = lang;
        response.language_checklist = this.buildMockChecklist(lang);
        return response;
    }

    async generateResumeFromProfile(sessionId, targetLanguage) {
        await this.delay(1200);
        const lang = this.normalizeResumeLanguage(targetLanguage);
        const response = await this.chat(
            sessionId,
            'Generate resume from candidate profile only without job description',
            [],
            { language: lang }
        );
        response.language = lang;
        response.language_checklist = this.buildMockChecklist(lang);
        response.from_profile_only = true;
        return response;
    }

    async getLanguageChecklist(sessionId, language) {
        await this.delay(400);
        const lang = this.normalizeResumeLanguage(language);

        let draft = null;
        try {
            const sessionRaw = localStorage.getItem(this._draftKey(sessionId));
            if (sessionRaw) draft = JSON.parse(sessionRaw);
            if (!draft) {
                const userRaw = localStorage.getItem(this._userDraftKey());
                if (userRaw) draft = JSON.parse(userRaw).draft;
            }
        } catch (_) { /* ignore */ }

        if (draft && typeof getRequiredMissingFromDraft === 'function') {
            const required = getRequiredMissingFromDraft(draft, lang);
            const items = required.map((item) => ({
                id: `mock_${item.field}`,
                category: 'content',
                field: item.field,
                label: item.label,
                severity: 'required',
                message: '',
                suggestion: '',
                missing: true,
                present: false,
            }));
            return {
                language: lang,
                language_label: (window.GBAI18n && GBAI18n.resumeLangLabel)
                    ? GBAI18n.resumeLangLabel(lang)
                    : (lang === 'en' ? 'English Resume' : lang === 'pt' ? 'Portuguese Resume' : 'Chinese Resume'),
                items,
                missing_items: items,
                missing_count: items.length,
                required_missing_count: items.length,
                recommended_missing_count: 0,
                warning_count: 0,
                total_checks: items.length,
                summary: items.length
                    ? `${items.length} required field(s) remaining`
                    : 'Core sections look complete.',
            };
        }

        return this.buildMockChecklist(language);
    }

    buildMockJd(industry, experienceLevel, employerType = 'private', jdDraft = '', language = 'zh') {
        const lang = this.normalizeResumeLanguage(language);
        const industryLabels = {
            zh: { tech: '科技', finance: '金融', ecommerce: '电商', healthcare: '医疗', education: '教育', other: '综合' },
            'zh-TW': { tech: '科技', finance: '金融', ecommerce: '電商', healthcare: '醫療', education: '教育', other: '綜合' },
            en: { tech: 'Technology', finance: 'Finance', ecommerce: 'E-commerce', healthcare: 'Healthcare', education: 'Education', other: 'General' },
            pt: { tech: 'Tecnologia', finance: 'Finanças', ecommerce: 'Comércio eletrónico', healthcare: 'Saúde', education: 'Educação', other: 'Geral' },
        };
        const employerLabels = {
            zh: { soe: '国央企', public: '体制内', foreign: '外企', private: '民企', npo: '非营利组织', hmt: '港澳台资企业', other: '其他' },
            'zh-TW': { soe: '國央企', public: '體制內', foreign: '外企', private: '民企', npo: '非營利組織', hmt: '港澳台資企業', other: '其他' },
            en: { soe: 'State-owned Enterprise', public: 'Public Sector', foreign: 'Foreign Enterprise', private: 'Private Enterprise', npo: 'Non-profit Organization', hmt: 'HK/Macau/TW-funded Enterprise', other: 'Other' },
            pt: { soe: 'Empresa estatal', public: 'Setor público', foreign: 'Empresa estrangeira', private: 'Empresa privada', npo: 'Organização sem fins lucrativos', hmt: 'Empresa HK/Macau/TW', other: 'Outro' },
        };
        const levelLabels = {
            zh: { entry: '初级（0-2年）', mid: '中级（3-5年）', senior: '高级（5年以上）', executive: '管理层' },
            'zh-TW': { entry: '初級（0-2年）', mid: '中級（3-5年）', senior: '高級（5年以上）', executive: '管理層' },
            en: { entry: 'Entry Level (0-2 years)', mid: 'Mid Level (3-5 years)', senior: 'Senior Level (5+ years)', executive: 'Executive / Leadership' },
            pt: { entry: 'Júnior (0-2 anos)', mid: 'Intermédio (3-5 anos)', senior: 'Sénior (5+ anos)', executive: 'Executivo / Liderança' },
        };

        const labels = industryLabels[lang] || industryLabels.en;
        const employerMap = employerLabels[lang] || employerLabels.en;
        const levelMap = levelLabels[lang] || levelLabels.en;
        const industryLabel = labels[industry] || industry || labels.other;
        const employerLabel = employerMap[employerType] || employerType || employerMap.private;
        const levelLabel = levelMap[experienceLevel] || experienceLevel || levelMap.mid;

        const draftTitle = (jdDraft || '').split('\n')[0].trim();
        const defaultTitles = {
            zh: `${industryLabel}相关岗位`,
            'zh-TW': `${industryLabel}相關崗位`,
            en: `${industryLabel} Professional`,
            pt: `Profissional de ${industryLabel}`,
        };
        const jobTitle = draftTitle || defaultTitles[lang] || defaultTitles.en;

        let jd_text;
        if (lang === 'zh') {
            jd_text = [
                `岗位名称：${jobTitle}`,
                '',
                '岗位职责：',
                `- 承担${industryLabel}领域${levelLabel}岗位的核心工作`,
                '- 与跨部门、跨境团队协作，推进项目落地',
                '- 持续学习行业知识，优化工作流程与成果交付',
                '',
                '任职要求：',
                `- ${levelLabel}相关经验，熟悉${industryLabel}行业常见业务场景`,
                `- 符合${employerLabel}用人特点，具备良好沟通与执行力`,
                '- 适应粤港澳大湾区跨境就业与多语言协作环境',
                '',
                '加分项：',
                '- 双语或多语种沟通能力',
                '- 数字化工具与远程协作经验',
            ].join('\n');
        } else if (lang === 'zh-TW') {
            jd_text = [
                `崗位名稱：${jobTitle}`,
                '',
                '崗位職責：',
                `- 承擔${industryLabel}領域${levelLabel}崗位的核心工作`,
                '- 與跨部門、跨境團隊協作，推進項目落地',
                '- 持續學習行業知識，優化工作流程與成果交付',
                '',
                '任職要求：',
                `- ${levelLabel}相關經驗，熟悉${industryLabel}行業常見業務場景`,
                `- 符合${employerLabel}用人特點，具備良好溝通與執行力`,
                '- 適應粵港澳大灣區跨境就業與多語言協作環境',
                '',
                '加分項：',
                '- 雙語或多語種溝通能力',
                '- 數位化工具與遠程協作經驗',
            ].join('\n');
        } else if (lang === 'pt') {
            jd_text = [
                `Cargo: ${jobTitle}`,
                '',
                'Responsabilidades:',
                `- Executar funções centrais de nível ${levelLabel.toLowerCase()} no setor ${industryLabel.toLowerCase()}`,
                '- Colaborar com equipas transfronteiriças e interdepartamentais',
                '- Comunicar claramente com stakeholders',
                '- Melhorar processos e entregas continuamente',
                '',
                'Requisitos:',
                `- Experiência ${levelLabel.toLowerCase()} em ${industryLabel.toLowerCase()} ou áreas relacionadas`,
                `- Perfil alinhado com ${employerLabel}`,
                '- Forte comunicação, trabalho em equipa e capacidade de aprendizagem',
                '- Adaptação ao emprego transfronteiriço na GBA',
                '',
                'Preferencial:',
                '- Competências bilingues ou multilingues',
                '- Experiência com ferramentas digitais e trabalho remoto',
            ].join('\n');
        } else {
            jd_text = [
                `Job Title: ${jobTitle}`,
                '',
                'Key Responsibilities:',
                `- Perform core duties for ${levelLabel.toLowerCase()} roles in the ${industryLabel.toLowerCase()} sector`,
                '- Collaborate with cross-functional and cross-border teams',
                '- Communicate clearly with stakeholders',
                '- Solve problems independently and improve processes continuously',
                '',
                'Requirements:',
                `- ${levelLabel} experience in ${industryLabel.toLowerCase()} or related fields`,
                `- Experience aligned with ${employerLabel} workplace expectations`,
                '- Strong communication, teamwork, and learning agility',
                '- Ability to adapt to cross-regional employment in the GBA',
                '',
                'Preferred Qualifications:',
                '- Bilingual or multilingual communication skills',
                '- Experience with digital tools and remote collaboration',
            ].join('\n');
        }

        const meta = this.buildMockJdMeta(lang, jobTitle, industryLabel);
        return {
            title: jobTitle,
            jd_text,
            primary_tech_stack: meta.primary_tech_stack,
            alignment_note: meta.alignment_note,
            needs_clarification: meta.needs_clarification,
            clarification_hint: meta.clarification_hint,
            requires_user_confirmation: true,
        };
    }

    buildMockJdMeta(language, jobTitle, industryLabel = '') {
        const lang = this.normalizeResumeLanguage(language);
        const tables = {
            zh: {
                primary_tech_stack: ['客户服务', 'CRM', '跨境电商'],
                alignment_note: `已根据 Alex Chen 的${industryLabel || '目标行业'}客服与跨境协作经历生成定向岗位描述「${jobTitle}」，职责与技能要求与其简历背景对齐。`,
                needs_clarification: false,
                clarification_hint: '',
            },
            'zh-TW': {
                primary_tech_stack: ['客戶服務', 'CRM', '跨境電商'],
                alignment_note: `已根據 Alex Chen 的${industryLabel || '目標行業'}客服與跨境協作經歷生成定向崗位描述「${jobTitle}」，職責與技能要求與其履歷背景對齊。`,
                needs_clarification: false,
                clarification_hint: '',
            },
            en: {
                primary_tech_stack: ['Customer Service', 'CRM', 'Cross-border E-commerce'],
                alignment_note: `Generated a targeted JD for "${jobTitle}" from Alex Chen's cross-border customer service background in ${industryLabel || 'the target industry'}. Responsibilities and requirements align with the uploaded profile.`,
                needs_clarification: false,
                clarification_hint: '',
            },
            pt: {
                primary_tech_stack: ['Apoio ao cliente', 'CRM', 'Comércio eletrónico transfronteiriço'],
                alignment_note: `JD orientada para «${jobTitle}» com base na experiência de Alex Chen em apoio ao cliente transfronteiriço (${industryLabel || 'setor alvo'}). Responsabilidades alinhadas com o perfil carregado.`,
                needs_clarification: false,
                clarification_hint: '',
            },
        };
        return tables[lang] || tables.en;
    }

    async generateJobDescription(sessionId, industry, experienceLevel, employerType = 'private', jdDraft = '', language = 'zh') {
        await this.delay(1200);
        return this.buildMockJd(industry, experienceLevel, employerType, jdDraft, language);
    }
}

class APIClient {
    constructor() {
        this.client = axios.create({
            baseURL: API_CONFIG.BASE_URL,
            timeout: API_CONFIG.TIMEOUT,
            headers: {
                'Content-Type': 'application/json',
            },
        });

        this.sessionId = this.loadSessionId();
        this.mockService = new MockAPIService();
        this.useMockMode = false;
        this.backendChecked = false;
        this.backendAvailable = false;
        this._backendProbePromise = null;
        this.lastBackendError = null;
        localStorage.removeItem(API_CONFIG.MOCK_MODE_KEY);

        this.client.interceptors.request.use((config) => {
            const token = this.getAuthToken();
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
            return config;
        });
    }

    _formatRequestUrl(error) {
        const cfg = (error && error.config) || {};
        const base = String(cfg.baseURL || API_CONFIG.BASE_URL || '').replace(/\/$/, '');
        const path = String(cfg.url || '');
        if (!path) return base || API_CONFIG.BASE_URL;
        return base + (path.startsWith('/') ? path : '/' + path);
    }

    _bindBackendStatusBannerActions() {
        const btn = document.getElementById('gba-backend-reconnect-btn');
        if (!btn || btn.dataset.bound) return;
        btn.dataset.bound = '1';
        btn.addEventListener('click', () => {
            this.reconnectBackend({ showToast: true });
        });
    }

    _syncBackendStatusBanner(info) {
        if (typeof document === 'undefined') return;
        const bannerId = 'gba-backend-status-banner';
        let banner = document.getElementById(bannerId);
        if (!info) {
            banner?.remove();
            return;
        }
        if (!banner) {
            banner = document.createElement('div');
            banner.id = bannerId;
            banner.className = 'fixed top-0 inset-x-0 z-[9998] bg-red-600 text-white text-center text-sm py-2 px-4 shadow-md';
            document.body.prepend(banner);
        }
        const title = apiT('errors.backendUnavailableTitle', 'Backend unavailable');
        const retryLabel = apiT('errors.backendRetry', 'Retry connection');
        const message = info.message || '';
        banner.innerHTML = (
            '<strong>' + title + '</strong> '
            + message + ' '
            + '<button type="button" id="gba-backend-reconnect-btn" class="ml-2 underline font-semibold hover:text-red-100">'
            + retryLabel + '</button>'
        );
        this._bindBackendStatusBannerActions();
    }

    /** @deprecated Mock demo banner removed — kept as no-op for callers */
    _syncMockModeIndicator() {
        if (!this.backendAvailable && this.lastBackendError) {
            this._syncBackendStatusBanner({ message: this.lastBackendError });
        } else {
            this._syncBackendStatusBanner(null);
        }
    }

    _healthUrl() {
        return `${API_CONFIG.BASE_URL.replace('/api', '')}/health`;
    }

    async _probeBackendHealth() {
        for (const url of this._healthUrls()) {
            try {
                const res = await axios.get(url, { timeout: API_CONFIG.HEALTH_TIMEOUT });
                const data = res.data;
                if (data && typeof data === 'object' && String(data.status || '').toLowerCase() === 'ok') {
                    return true;
                }
            } catch (_) {
                /* try next host variant */
            }
        }
        return false;
    }

    _healthUrls() {
        const primary = this._healthUrl();
        const urls = [primary];
        const alt = primary.includes('//localhost')
            ? primary.replace('//localhost', '//127.0.0.1')
            : primary.includes('//127.0.0.1')
                ? primary.replace('//127.0.0.1', '//localhost')
                : null;
        if (alt && !urls.includes(alt)) {
            urls.push(alt);
        }
        return urls;
    }

    async ensureBackendAvailable(options = {}) {
        const { silent = false } = options;
        if (this.backendAvailable) {
            return true;
        }

        if (!this._backendProbePromise) {
            this._backendProbePromise = (async () => {
                this.backendChecked = true;
                this.backendAvailable = await this._probeBackendHealth();
                if (this.backendAvailable) {
                    this.useMockMode = false;
                    localStorage.removeItem(API_CONFIG.MOCK_MODE_KEY);
                    this.lastBackendError = null;
                    this._syncBackendStatusBanner(null);
                    return true;
                }

                this.useMockMode = false;
                localStorage.removeItem(API_CONFIG.MOCK_MODE_KEY);
                const healthUrl = this._healthUrls()[0] || this._healthUrl();
                this.lastBackendError = apiT(
                    'errors.backendHealthCheckFailed',
                    'Cannot reach backend (health check failed). URL: {url}. Start: cd backend && python main.py',
                    { url: healthUrl }
                );
                this._syncBackendStatusBanner({ message: this.lastBackendError });
                console.warn('[API] Backend unavailable:', healthUrl);
                // Allow a later caller / reconnect to probe again.
                this._backendProbePromise = null;
                throw new Error(this.lastBackendError);
            })();
        }

        try {
            await this._backendProbePromise;
        } catch (error) {
            if (!silent && typeof Utils !== 'undefined') {
                Utils.showToast(this.lastBackendError || error.message);
            }
            throw error instanceof Error
                ? error
                : new Error(this.lastBackendError || apiT('errors.backendUnavailable', 'Backend is unavailable.'));
        }

        if (!this.backendAvailable) {
            if (!silent && typeof Utils !== 'undefined') {
                Utils.showToast(this.lastBackendError);
            }
            throw new Error(this.lastBackendError || apiT('errors.backendUnavailable', 'Backend is unavailable.'));
        }
        return true;
    }

    /**
     * Re-probe backend availability (e.g. after a network error invalidated the cached result).
     */
    invalidateBackendProbe() {
        this.backendChecked = false;
        this.backendAvailable = false;
        this._backendProbePromise = null;
    }

    async reconnectBackend(options = {}) {
        const { showToast = true } = options;
        this.invalidateBackendProbe();
        try {
            await this.ensureBackendAvailable({ silent: !showToast });
            if (showToast && typeof Utils !== 'undefined') {
                Utils.showToast(apiT('errors.backendRestored', 'Backend connected — you can retry your request'));
            }
            return true;
        } catch (error) {
            if (showToast && typeof Utils !== 'undefined') {
                Utils.showToast(error.message || this.lastBackendError);
            }
            return false;
        }
    }

    /**
     * Map site UI language (GBAI18n) to backend API language code.
     */
    getApiLanguage() {
        if (typeof window !== 'undefined' && window.GBAI18n && typeof GBAI18n.uiLangToApiLang === 'function') {
            return GBAI18n.uiLangToApiLang(GBAI18n.getLang());
        }
        // Keep in sync with assets/i18n/i18n.js default UI locale (en)
        return 'en';
    }

    normalizeResumeLanguage(targetLanguage) {
        return this.mockService.normalizeResumeLanguage(targetLanguage);
    }

    /**
     * Language for optimization Q&A (gap analysis, JD confirmation hints): follow page UI locale.
     */
    getPageLanguage() {
        return this.normalizeResumeLanguage(this.getApiLanguage());
    }

    /** Explicit override or current page UI locale — for AI agent output language. */
    resolvePageLanguage(explicit) {
        if (explicit != null && String(explicit).trim() !== '') {
            return this.normalizeResumeLanguage(explicit);
        }
        return this.getPageLanguage();
    }

    /**
     * Output language for JD generation — follows interface locale, not resume target language.
     */
    getJdLanguage() {
        return this.getPageLanguage();
    }

    /**
     * Page UI locale is passed per chat request only (gap/JD hints).
     * Do not overwrite the user-selected resume target language in session.
     */
    async syncPageLanguageToSession() {
        return null;
    }

    /**
     * Language for resume/chat agents: prefer selected resume language over UI language.
     */
    getChatLanguage() {
        if (typeof window !== 'undefined' && typeof currentResumeLanguage !== 'undefined' && currentResumeLanguage) {
            if (typeof normalizeResumeLang === 'function') {
                return normalizeResumeLang(currentResumeLanguage);
            }
            return String(currentResumeLanguage);
        }
        return this.getApiLanguage();
    }

    /**
     * Load JWT from localStorage (Node auth service)
     */
    getAuthToken() {
        try {
            const raw = localStorage.getItem('gba_auth_token');
            if (raw) return raw;
            const user = JSON.parse(localStorage.getItem('gba_auth_user') || 'null');
            return user && user.token ? user.token : null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Load session ID from localStorage
     */
    loadSessionId() {
        return localStorage.getItem('gba_session_id') || '';
    }

    /**
     * Save session ID to localStorage
     */
    saveSessionId(sessionId) {
        this.sessionId = sessionId;
        localStorage.setItem('gba_session_id', sessionId);
    }

    /**
     * Clear session data
     */
    clearSession() {
        this.sessionId = '';
        localStorage.removeItem('gba_session_id');
    }

    /**
     * Generate a new session ID
     */
    generateSessionId() {
        const newSessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.saveSessionId(newSessionId);
        return newSessionId;
    }

    /**
     * Ensure a session exists and refresh the header badge.
     */
    ensureSessionStarted() {
        if (!this.sessionId) {
            this.generateSessionId();
        }
        if (typeof Utils !== 'undefined') {
            Utils.updateSessionDisplay(this.sessionId);
        }
        return this.sessionId;
    }

    _applyChatResponseSession(data) {
        if (data && data.session_id && data.session_id !== this.sessionId) {
            this.saveSessionId(data.session_id);
        }
        if (typeof Utils !== 'undefined') {
            Utils.updateSessionDisplay(this.sessionId);
        }
        return data;
    }

    _isSessionAccessError(error) {
        const status = error && error.response && error.response.status;
        return status === 401 || status === 403;
    }

    _isBoundSessionAccessError(error) {
        if (!this._isSessionAccessError(error)) return false;
        const detail = String((error.response && error.response.data && error.response.data.detail) || '');
        return detail.includes('访问该会话') || detail.includes('无权访问');
    }

    _isAuthLoginRequiredError(error) {
        if (!error || !error.response || error.response.status !== 401) return false;
        const detail = String((error.response.data && error.response.data.detail) || '');
        if (detail.includes('访问该会话') || detail.includes('无权访问')) return false;
        return detail.includes('请先登录') || detail.includes('无效的用户');
    }

    async _resumeCallWithSessionRetry(requestFn, options = {}) {
        const { draft = null, retryOnAccessDenied = true } = options;
        try {
            return await requestFn();
        } catch (error) {
            if (!retryOnAccessDenied || !this._isBoundSessionAccessError(error)) {
                throw error;
            }
            this.clearSession();
            this.generateSessionId();
            if (draft) {
                await this.ensureSessionFromDraft(draft);
            }
            return await requestFn();
        }
    }

    /**
     * Main chat endpoint - unified entry point for all agents
     */
    async chat(message, attachments = [], options = {}) {
        const retryOnAccessDenied = options.retryOnAccessDenied !== false;
        const chatLanguage = this.normalizeResumeLanguage(
            options.language || (options.usePageLanguage ? this.getPageLanguage() : this.getChatLanguage())
        );
        try {
            this.ensureSessionStarted();
            await this.ensureBackendAvailable();

            const response = await this.client.post('/chat', {
                session_id: this.sessionId,
                message: message,
                attachments: attachments,
                language: chatLanguage,
                replace_profile: Boolean(options.replaceProfile),
                forced_intent: options.forcedIntent || '',
                context_scope: options.contextScope || '',
                skip_render: Boolean(options.skipRender),
                clear_generated_resume: Boolean(options.clearGeneratedResume),
                language_scope: options.languageScope === 'interview_question' ? 'interview_question'
                    : options.languageScope === 'interview_feedback' ? 'interview_feedback'
                    : 'page',
            });

            return this._applyChatResponseSession(response.data);
        } catch (error) {
            console.error('Chat API error:', error);
            if (this._isSessionAccessError(error) && retryOnAccessDenied) {
                this.clearSession();
                this.generateSessionId();
                return this.chat(message, attachments, {
                    retryOnAccessDenied: false,
                    language: chatLanguage,
                    languageScope: options.languageScope,
                    contextScope: options.contextScope,
                });
            }
            throw this.handleError(error);
        }
    }

    /**
     * Upload resume and trigger profile_agent
     */
    async uploadResume(file) {
        try {
            const base64Content = await this.fileToBase64(file);

            const response = await this.chat('', [
                {
                    filename: file.name,
                    content: base64Content,
                    content_encoding: 'base64',
                },
            ], { replaceProfile: true, usePageLanguage: true, forcedIntent: 'upload_profile' });

            return response;
        } catch (error) {
            console.error('Resume upload error:', error);
            throw error;
        }
    }

    /**
     * Resolve target job context from explicit object or page form fields.
     */
    _resolveTargetJobContext(context, jdTextOverride = '') {
        if (context) return context;
        if (typeof collectTargetJobContext === 'function') {
            return collectTargetJobContext({ jdTextOverride });
        }
        return null;
    }

    /**
     * Sync JD textarea + industry / employer type / experience level to session.
     */
    async syncTargetJobContext(context = null, jdTextOverride = '') {
        const ctx = this._resolveTargetJobContext(context, jdTextOverride);
        if (!ctx || !this.sessionId) return null;

        await this.ensureBackendAvailable();

        try {
            const response = await this.client.put('/resume/target-context', {
                session_id: this.sessionId,
                jd_text: ctx.jd_text || '',
                industry: ctx.industryLabel || ctx.industry || '',
                employer_type: ctx.employer_type || '',
                experience_level: ctx.experienceLevelLabel || ctx.experience_level || '',
                typography_fit_mode: ctx.typography_fit_mode || 'auto',
            });
            return response.data;
        } catch (error) {
            console.warn('[API] Target context sync skipped:', error.message);
            // Non-fatal: JD and context are still included in the chat message body.
            return { ok: false, target_context: ctx, skipped: true, error: this.handleError(error).message };
        }
    }

    _appendTargetContextToInstruction(instruction, context) {
        const ctx = context || (typeof collectTargetJobContext === 'function' ? collectTargetJobContext() : null);
        const block = typeof buildTargetJobContextBlock === 'function' ? buildTargetJobContextBlock(ctx) : '';
        if (!block) return instruction;
        return `${instruction}\n\nTarget job context:\n${block}`;
    }

    /**
     * Submit job description and trigger jd_agent
     */
    async submitJobDescription(jdText, targetContext = null) {
        try {
            const pageLang = this.getPageLanguage();
            await this.syncPageLanguageToSession();
            const ctx = this._resolveTargetJobContext(targetContext, jdText);
            await this.syncTargetJobContext(ctx, jdText);
            const message = typeof buildJdSubmissionText === 'function'
                ? buildJdSubmissionText(jdText, ctx)
                : jdText;
            const response = await this.chat(message, [], {
                language: pageLang,
                usePageLanguage: true,
                forcedIntent: 'upload_jd',
            });
            return response;
        } catch (error) {
            console.error('JD submission error:', error);
            throw error;
        }
    }

    /**
     * Generate a suggested target JD from JD draft text, industry, employer type, and experience level
     */
    async generateJobDescription(industry, experienceLevel, employerType = '', jdDraft = '', language = '') {
        try {
            if (!this.sessionId) {
                throw new Error(apiT('errors.noActiveSession', 'No active session'));
            }
            if (!industry || !experienceLevel) {
                throw new Error(apiT('errors.selectIndustryLevel', 'Please select industry and experience level'));
            }

            const outputLanguage = language || this.getJdLanguage();

            await this.ensureBackendAvailable();

            const response = await this.client.post('/resume/generate-jd', {
                session_id: this.sessionId,
                industry: industry,
                experience_level: experienceLevel,
                employer_type: employerType,
                jd_draft: jdDraft || '',
                language: outputLanguage,
            });

            return response.data;
        } catch (error) {
            console.error('JD generation error:', error);
            throw this.handleError(error);
        }
    }

    /**
     * Set target employer type and refresh format checklist
     */
    async setEmployerType(employerType) {
        try {
            if (!this.sessionId) {
                this.generateSessionId();
            }

            await this.ensureBackendAvailable();
            if (this.useMockMode) {
                const checklist = this.mockService.buildMockChecklist('zh');
                checklist.employer_type = employerType;
                return { employer_type: employerType, language_checklist: checklist };
            }

            const response = await this.client.put('/resume/employer-type', {
                session_id: this.sessionId,
                employer_type: employerType,
            });

            return response.data;
        } catch (error) {
            console.error('Set employer type error:', error);
            throw this.handleError(error);
        }
    }

    /**
     * Whether user is logged in (JWT present)
     */
    isLoggedIn() {
        return Boolean(this.getAuthToken());
    }

    /**
     * Load resume edit draft (Redis / restored user draft)
     */
    async getResumeDraft() {
        try {
            if (!this.sessionId && !this.isLoggedIn()) {
                this.generateSessionId();
            }

            await this.ensureBackendAvailable({ silent: true });

            const params = {};
            if (this.sessionId) {
                params.session_id = this.sessionId;
            }

            const response = await this.client.get('/resume/draft', { params });
            return response.data;
        } catch (error) {
            if (error.response && error.response.status === 404) {
                throw new Error(apiT('errors.draftNotFound', 'Draft not found'));
            }
            if (error.response || error.request) {
                throw this.handleError(error);
            }
            throw error;
        }
    }

    /**
     * Whether the current session has working resume data and/or persisted MySQL rows.
     */
    async getSessionResumeStatus() {
        try {
            if (!this.sessionId) {
                this.ensureSessionStarted();
            }
            await this.ensureBackendAvailable({ silent: true });
            if (this.useMockMode) {
                return this.mockService.getSessionResumeStatus(this.sessionId);
            }
            const response = await this.client.get('/resume/session/status', {
                params: { session_id: this.sessionId },
            });
            return response.data;
        } catch (error) {
            if (error.response || error.request) {
                throw this.handleError(error);
            }
            throw error;
        }
    }

    /**
     * Persist resume edit draft to Redis (12h for logged-in users)
     */
    async saveResumeDraft(draft) {
        try {
            if (!this.sessionId) {
                throw new Error(apiT('errors.noActiveSession', 'No active session'));
            }

            const payload = {
                ...draft,
                updated_at: new Date().toISOString(),
            };

            await this.ensureBackendAvailable();

            return await this._resumeCallWithSessionRetry(async () => {
                const response = await this.client.put('/resume/draft', {
                    session_id: this.sessionId,
                    draft: payload,
                });
                return response.data;
            }, { draft: payload });
        } catch (error) {
            console.error('Save draft error:', error);
            throw this.handleError(error);
        }
    }

    /**
     * Save resume to user account (MySQL) after explicit confirmation
     */
    async saveResumeToAccount() {
        try {
            if (!this.sessionId) {
                throw new Error(apiT('errors.noActiveSession', 'No active session'));
            }
            if (!this.isLoggedIn()) {
                throw new Error(apiT('errors.loginToSaveResume', 'Please log in to save your resume to the website'));
            }

            await this.ensureBackendAvailable();
            if (this.useMockMode) {
                return this.mockService.saveResumeToAccount(this.sessionId);
            }

            const response = await this.client.post('/resume/save', {
                session_id: this.sessionId,
            });
            return response.data;
        } catch (error) {
            console.error('Save resume error:', error);
            throw this.handleError(error);
        }
    }

    /**
     * Save parsed/edited profile draft to user account (MySQL) — survives page refresh
     */
    async saveProfileToAccount(draft, recordName = '', recordId = '') {
        try {
            if (!this.sessionId) {
                throw new Error(apiT('errors.noActiveSession', 'No active session'));
            }
            if (!this.isLoggedIn()) {
                throw new Error(apiT('errors.loginToSaveProfile', 'Please log in to save your profile to the website'));
            }

            const payload = {
                ...draft,
                updated_at: new Date().toISOString(),
            };

            await this.ensureBackendAvailable();
            if (this.useMockMode) {
                await this.mockService.saveResumeDraft(this.sessionId, payload, true);
                return this.mockService.saveProfileToAccount(this.sessionId, payload, recordName);
            }

            const response = await this.client.post('/resume/profile/save', {
                session_id: this.sessionId,
                draft: payload,
                record_name: String(recordName || '').trim(),
                record_id: String(recordId || '').trim(),
            });
            return response.data;
        } catch (error) {
            console.error('Save profile error:', error);
            throw this.handleError(error);
        }
    }

    /**
     * List saved profile records for the logged-in user
     */
    async getProfileSaveHistory(limit = 20) {
        try {
            if (!this.isLoggedIn()) {
                return { records: [] };
            }
            await this.ensureBackendAvailable();
            if (this.useMockMode) {
                return this.mockService.getProfileSaveHistory(limit);
            }
            const response = await this.client.get('/resume/profile/history', {
                params: { limit },
            });
            return response.data;
        } catch (error) {
            console.error('Get profile save history error:', error);
            throw this.handleError(error);
        }
    }

    /**
     * Load a saved profile record into the current Redis session
     */
    async restoreSavedProfile(recordId) {
        try {
            if (!this.sessionId) {
                throw new Error(apiT('errors.noActiveSession', 'No active session'));
            }
            if (!this.isLoggedIn()) {
                throw new Error(apiT('errors.loginToSaveProfile', 'Please log in to save your profile to the website'));
            }
            await this.ensureBackendAvailable();
            if (this.useMockMode) {
                return this.mockService.restoreSavedProfile(recordId, this.sessionId);
            }
            const response = await this.client.post(`/resume/profile/saved/${encodeURIComponent(recordId)}/restore`, {
                session_id: this.sessionId,
            });
            return response.data;
        } catch (error) {
            console.error('Restore saved profile error:', error);
            throw this.handleError(error);
        }
    }

    /**
     * Generate profile-aware JD from job title only (user must confirm before optimize)
     */
    async generateJdFromTitle(jobTitle, targetContext = null) {
        try {
            if (!this.sessionId) {
                throw new Error(apiT('errors.noActiveSession', 'No active session'));
            }
            const ctx = this._resolveTargetJobContext(targetContext, jobTitle);
            await this.ensureBackendAvailable();
            const outputLanguage = this.getJdLanguage();
            const response = await this.client.post('/resume/generate-jd-from-title', {
                session_id: this.sessionId,
                job_title: jobTitle,
                industry: ctx.industryLabel || ctx.industry || '',
                employer_type: ctx.employer_type || '',
                experience_level: ctx.experienceLevelLabel || ctx.experience_level || '',
                language: outputLanguage,
            });
            return response.data;
        } catch (error) {
            console.error('Generate JD from title error:', error);
            throw this.handleError(error);
        }
    }

    /**
     * Submit optimization dialog feedback: supplemental answers + user-confirmed removals
     */
    async submitOptimizationFeedback({ answers = [], removals = [] } = {}) {
        const hasAnswers = answers && answers.length;
        const hasRemovals = removals && removals.length;
        if (!hasAnswers && !hasRemovals) return null;

        const sections = [
            'Please update my candidate profile for resume optimization based on the feedback below.',
            'Use only the facts I provide — do not invent numbers or achievements.',
        ];

        if (hasRemovals) {
            sections.push('', 'CONFIRMED_REMOVALS (remove these from profile facts — do not include in resume):');
            removals.forEach((r) => {
                sections.push(`- id=${r.id || ''}|fact_id=${r.fact_id || ''}|title=${r.title || ''}|reason=${r.reason || ''}`);
            });
        }

        if (hasAnswers) {
            const lines = answers.map((a) => {
                const meta = [];
                if (a.target_field) meta.push(`target_field=${a.target_field}`);
                const related = a.related_fact_ids || a.related_section_ids || [];
                if (related.length) meta.push(`related_fact_ids=${related.join(',')}`);
                const header = meta.length ? ` [${meta.join('|')}]` : '';
                return `Q${header}: ${a.question}\nA: ${a.answer}`;
            }).join('\n\n');
            sections.push('', 'CLARIFICATIONS (add or update profile facts from my answers):', lines);
        }

        return this.chat(sections.join('\n'), [], {
            language: this.getPageLanguage(),
            usePageLanguage: true,
            forcedIntent: 'profile_patch',
        });
    }

    /**
     * Submit user answers from optimization dialog to enrich candidate profile
     */
    async submitOptimizationClarifications(answers) {
        return this.submitOptimizationFeedback({ answers, removals: [] });
    }

    /**
     * Submit candidate profile text — triggers profile_agent
     */
    async submitProfileText(profileText, options = {}) {
        try {
            const response = await this.chat(profileText, [], {
                language: this.getPageLanguage(),
                usePageLanguage: true,
                forcedIntent: 'upload_profile',
                replaceProfile: Boolean(options.replaceProfile),
            });
            return response;
        } catch (error) {
            console.error('Profile submission error:', error);
            throw error;
        }
    }

    /**
     * Run gap analysis — triggers gap_agent (requires job + profile in session)
     */
    async runGapAnalysis() {
        try {
            const pageLang = this.getPageLanguage();
            await this.syncPageLanguageToSession();
            const response = await this.chat(
                'Please analyze skill gaps and missing competencies between my profile and the target job.',
                [],
                { language: pageLang, usePageLanguage: true, forcedIntent: 'gap_analysis' }
            );
            return response;
        } catch (error) {
            console.error('Gap analysis error:', error);
            throw error;
        }
    }

    /**
     * Persist user-selected resume target language to session (render_config.language).
     */
    async syncResumeLanguageToSession() {
        if (!this.sessionId || this.useMockMode) {
            return null;
        }
        try {
            await this.ensureBackendAvailable();
            const lang = typeof currentResumeLanguage !== 'undefined' && currentResumeLanguage
                ? this.normalizeResumeLanguage(currentResumeLanguage)
                : this.getApiLanguage();
            return await this.setResumeLanguage(lang);
        } catch (error) {
            console.warn('Resume language session sync skipped:', error.message);
            return null;
        }
    }

    /** @deprecated Use syncResumeLanguageToSession — page UI locale must not change resume target. */
    async syncSessionLanguageFromUi() {
        return this.syncResumeLanguageToSession();
    }

    /**
     * Generate customized resume with SSE progress (skeleton + per-batch module polish).
     */
    async generateResumeStream(
        instruction = 'Please generate a customized resume based on my experience and target position. Polish each experience entry to align with the target job, add quantified results only when supported by my profile facts, follow industry-standard resume conventions, and never fabricate numbers or achievements. Keep all content within one A4 page.',
        targetContext = null,
        options = {}
    ) {
        try {
            if (!this.sessionId) {
                throw new Error(apiT('errors.noActiveSession', 'No active session'));
            }
            await this.syncTargetJobContext(targetContext);
            await this.syncResumeLanguageToSession();
            await this.ensureBackendAvailable();

            const lang = typeof currentResumeLanguage !== 'undefined' && currentResumeLanguage
                ? this.normalizeResumeLanguage(currentResumeLanguage)
                : this.getApiLanguage();
            const body = {
                session_id: this.sessionId,
                instruction: this._appendTargetContextToInstruction(instruction, targetContext),
                language: lang,
                jd_text: (targetContext && targetContext.jd_text) || '',
                industry: (targetContext && targetContext.industry) || '',
                employer_type: (targetContext && targetContext.employer_type) || '',
                experience_level: (targetContext && targetContext.experience_level) || '',
                typography_fit_mode: (targetContext && targetContext.typography_fit_mode) || '',
                clear_generated_resume: options.clearGeneratedResume !== false && !options.incremental,
                incremental: Boolean(options.incremental),
                affected_fact_ids: Array.isArray(options.affectedFactIds) ? options.affectedFactIds : [],
                affected_sections: Array.isArray(options.affectedSections) ? options.affectedSections : [],
                clarifications: options.clarifications || '',
            };

            const base = String(API_CONFIG.BASE_URL || '').replace(/\/$/, '');
            const headers = { 'Content-Type': 'application/json', Accept: 'text/event-stream' };
            const token = this.getAuthToken();
            if (token) headers.Authorization = `Bearer ${token}`;

            const response = await fetch(`${base}/resume/generate-stream`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });
            if (!response.ok) {
                let detail = '';
                try {
                    const errJson = await response.json();
                    detail = errJson.detail || JSON.stringify(errJson);
                } catch (_) {
                    detail = await response.text();
                }
                throw new Error(detail || `HTTP ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let finalPayload = null;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const chunks = buffer.split('\n\n');
                buffer = chunks.pop() || '';
                for (const chunk of chunks) {
                    const line = chunk.split('\n').find((entry) => entry.startsWith('data: '));
                    if (!line) continue;
                    const payload = JSON.parse(line.slice(6));
                    if (payload.type === 'error') {
                        const detail = payload.detail;
                        if (detail && typeof detail === 'object' && detail.code === API_ERROR.SESSION_BUSY) {
                            const err = new Error(formatSessionBusyMessage(detail.task));
                            err.code = API_ERROR.SESSION_BUSY;
                            if (detail.task) err.task = String(detail.task);
                            throw err;
                        }
                        if (detail === API_ERROR.SESSION_BUSY) {
                            const err = new Error(formatSessionBusyMessage(''));
                            err.code = API_ERROR.SESSION_BUSY;
                            throw err;
                        }
                        const detailText = typeof detail === 'string' ? detail : (detail ? JSON.stringify(detail) : '');
                        throw new Error(detailText || apiT('errors.resumeStreamFailed', 'Resume stream failed'));
                    }
                    if (typeof options.onProgress === 'function') {
                        options.onProgress(payload);
                    }
                    if (payload.type === 'complete') {
                        finalPayload = payload;
                    }
                }
            }

            if (!finalPayload) {
                throw new Error(apiT('errors.resumeStreamIncomplete', 'Resume generation stream ended unexpectedly'));
            }
            return finalPayload;
        } catch (error) {
            console.error('Resume stream generation error:', error);
            throw error;
        }
    }

    /**
     * Generate customized resume - triggers content_agent (+ render_agent unless skipRender)
     */
    async generateResume(
        instruction = 'Please generate a customized resume based on my experience and target position. Polish each experience entry to align with the target job, add quantified results only when supported by my profile facts, follow industry-standard resume conventions, and never fabricate numbers or achievements. Keep all content within one A4 page.',
        targetContext = null,
        options = {}
    ) {
        if (options.useStream !== false && !this.useMockMode) {
            try {
                await this.ensureBackendAvailable();
                return await this.generateResumeStream(instruction, targetContext, options);
            } catch (streamErr) {
                if (options.streamOnly) throw streamErr;
                console.warn('Resume stream failed, falling back to chat:', streamErr.message);
            }
        }
        try {
            await this.syncTargetJobContext(targetContext);
            await this.syncResumeLanguageToSession();
            const fullInstruction = this._appendTargetContextToInstruction(instruction, targetContext);
            const response = await this.chat(fullInstruction, [], {
                language: this.getPageLanguage(),
                usePageLanguage: true,
                forcedIntent: options.forcedIntent || 'content_edit',
                skipRender: Boolean(options.skipRender),
                clearGeneratedResume: Boolean(options.clearGeneratedResume),
            });
            return response;
        } catch (error) {
            console.error('Resume generation error:', error);
            throw error;
        }
    }

    /**
     * Render HTML preview when resume_content_json exists but resume_html is empty.
     */
    async ensureResumeRendered() {
        try {
            if (!this.sessionId) {
                throw new Error(apiT('errors.noActiveSession', 'No active session'));
            }
            await this.ensureBackendAvailable();
            const response = await this.client.post('/resume/ensure-render', {
                session_id: this.sessionId,
            });
            return response.data;
        } catch (error) {
            console.error('Ensure resume render error:', error);
            throw this.handleError(error);
        }
    }

    /**
     * Get current resume HTML
     */
    async getResumeHtml() {
        try {
            if (!this.sessionId) {
                throw new Error(apiT('errors.noActiveSession', 'No active session'));
            }

            await this.ensureBackendAvailable();

            const response = await this.client.get('/resume/html', {
                params: { session_id: this.sessionId },
            });

            return response.data;
        } catch (error) {
            console.error('Get resume HTML error:', error);
            throw this.handleError(error);
        }
    }

    /**
     * Get Markdown preview text (same source as Markdown export).
     */
    async getResumeMarkdownPreview() {
        try {
            if (!this.sessionId) {
                throw new Error(apiT('errors.noActiveSession', 'No active session'));
            }

            await this.ensureBackendAvailable();

            const response = await this.client.get('/resume/preview-markdown', {
                params: { session_id: this.sessionId },
            });

            return response.data;
        } catch (error) {
            console.error('Get resume Markdown preview error:', error);
            throw this.handleError(error);
        }
    }

    /**
     * Restore resume session to a prior snapshot (undo/redo)
     */
    async restoreResumeSnapshot(snapshot) {
        try {
            if (!this.sessionId) {
                throw new Error(apiT('errors.noActiveSession', 'No active session'));
            }
            if (!snapshot) {
                throw new Error(apiT('errors.invalidSnapshot', 'Invalid resume snapshot'));
            }

            await this.ensureBackendAvailable();

            const response = await this.client.post('/resume/restore-snapshot', {
                session_id: this.sessionId,
                resume_content_json: snapshot.resume_content_json || null,
                render_config: snapshot.render_config || null,
                resume_html: snapshot.resume_html || (snapshot.html ? { html: snapshot.html, version: 1 } : null),
            });
            return response.data;
        } catch (error) {
            console.error('Restore resume snapshot error:', error);
            throw this.handleError(error);
        }
    }

    /**
     * Get current resume content JSON
     */
    async getResumeContent() {
        try {
            if (!this.sessionId) {
                throw new Error(apiT('errors.noActiveSession', 'No active session'));
            }

            await this.ensureBackendAvailable();
            if (this.useMockMode) {
                return { resume_content_json: this.mockService.profilePayload() };
            }

            const response = await this.client.get('/resume/content', {
                params: { session_id: this.sessionId },
            });
            return response.data;
        } catch (error) {
            console.error('Get resume content error:', error);
            throw this.handleError(error);
        }
    }

    /**
     * Preview resume HTML directly
     */
    getResumePreviewUrl() {
        if (!this.sessionId) {
            return null;
        }
        return `${API_CONFIG.BASE_URL}/resume/preview?session_id=${this.sessionId}`;
    }

    /**
     * Set target resume language and get format checklist
     */
    async setResumeLanguage(targetLanguage) {
        try {
            if (!this.sessionId) {
                this.generateSessionId();
            }

            await this.ensureBackendAvailable();

            const response = await this.client.put('/resume/language', {
                session_id: this.sessionId,
                target_language: targetLanguage,
            });

            return response.data;
        } catch (error) {
            console.error('Set resume language error:', error);
            const status = error.response?.status;
            if (status === 404 && typeof ProfileEditor !== 'undefined' && ProfileEditor.collectDraftFromForm) {
                try {
                    const draft = ProfileEditor.collectDraftFromForm();
                    const empty = typeof ProfileEditor.isDraftEmpty === 'function'
                        ? ProfileEditor.isDraftEmpty(draft)
                        : false;
                    if (draft && !empty) {
                        await this.saveResumeDraft(draft);
                        const retry = await this.client.put('/resume/language', {
                            session_id: this.sessionId,
                            target_language: targetLanguage,
                        });
                        return retry.data;
                    }
                } catch (retryErr) {
                    console.warn('[API] Set resume language retry failed:', retryErr.message);
                }
            }
            throw this.handleError(error);
        }
    }

    /**
     * Get language format checklist for current session
     */
    async getLanguageChecklist(language = 'zh', employerType = '') {
        try {
            if (!this.sessionId) {
                throw new Error(apiT('errors.noActiveSession', 'No active session'));
            }

            await this.ensureBackendAvailable({ silent: true });

            const response = await this.client.get('/resume/language-checklist', {
                params: {
                    session_id: this.sessionId,
                    language,
                    employer_type: employerType,
                },
            });

            return response.data;
        } catch (error) {
            console.error('Language checklist error:', error);
            throw this.handleError(error);
        }
    }

    async ensureSessionFromDraft(draft) {
        if (!this.sessionId) {
            this.generateSessionId();
        }
        if (!draft) {
            return;
        }
        try {
            await this.ensureBackendAvailable();
            await this.saveResumeDraft(draft);
        } catch (error) {
            console.warn('[API] Session bootstrap from draft failed:', error.message);
        }
    }

    /**
     * Generate resume from parsed profile only (no JD / gap optimization).
     */
    async generateResumeFromProfile(targetLanguage, draft = null) {
        const run = async () => {
            if (!this.sessionId) {
                this.generateSessionId();
            }

            const lang = this.normalizeResumeLanguage(targetLanguage || this.getChatLanguage());
            if (draft) {
                await this.ensureSessionFromDraft(draft);
            }
            await this.setResumeLanguage(lang);
            await this.ensureBackendAvailable();

            const response = await this.client.post('/resume/generate-from-profile', {
                session_id: this.sessionId,
                language: lang,
                draft: draft || undefined,
            });
            return response.data;
        };

        try {
            return await this._resumeCallWithSessionRetry(run, { draft });
        } catch (error) {
            console.error('Generate resume from profile error:', error);
            const status = error.response?.status;
            if (status === 404 && draft) {
                try {
                    await this.ensureSessionFromDraft(draft);
                    return await run();
                } catch (retryErr) {
                    console.error('Generate resume from profile retry failed:', retryErr);
                }
            }
            throw this.handleError(error);
        }
    }

    /**
     * Convert resume between Chinese and English
     */
    async translateResume(targetLanguage, draft = null) {
        const run = async () => {
            if (!this.sessionId) {
                throw new Error(apiT('errors.noActiveSession', 'No active session'));
            }

            const lang = this.normalizeResumeLanguage(targetLanguage || this.getChatLanguage());
            if (draft) {
                await this.ensureSessionFromDraft(draft);
            }
            await this.setResumeLanguage(lang);
            await this.ensureBackendAvailable();

            const response = await this.client.post('/resume/translate', {
                session_id: this.sessionId,
                target_language: lang,
                draft: draft || undefined,
            });

            return response.data;
        };

        try {
            return await this._resumeCallWithSessionRetry(run, { draft });
        } catch (error) {
            console.error('Resume translation error:', error);
            const status = error.response?.status;
            if (status === 404 && draft) {
                try {
                    await this.ensureSessionFromDraft(draft);
                    return await run();
                } catch (retryErr) {
                    console.error('Resume translation retry failed:', retryErr);
                }
            }
            throw this.handleError(error);
        }
    }

    /**
     * Translate a single resume module (re-translate after bulk conversion).
     */
    async translateResumeModule(payload) {
        try {
            if (!this.sessionId) {
                throw new Error(apiT('errors.noActiveSession', 'No active session'));
            }
            await this.ensureBackendAvailable();
            const lang = this.normalizeResumeLanguage(
                payload.target_language
                || (typeof currentResumeLanguage !== 'undefined' ? currentResumeLanguage : this.getApiLanguage())
            );
            const response = await this.client.post('/resume/translate-module', {
                session_id: this.sessionId,
                module_id: payload.module_id,
                module_type: payload.module_type,
                title: payload.title || '',
                content: payload.content || '',
                school: payload.school || '',
                major: payload.major || '',
                degree: payload.degree || '',
                fields: payload.fields || {},
                target_language: lang,
            });
            return response.data;
        } catch (error) {
            console.error('Module translation error:', error);
            throw this.handleError(error);
        }
    }

    /**
     * Polish a single experience/project module again.
     */
    async polishResumeModule(payload) {
        try {
            if (!this.sessionId) {
                throw new Error(apiT('errors.noActiveSession', 'No active session'));
            }
            await this.ensureBackendAvailable();
            const response = await this.client.post('/resume/polish-module', {
                session_id: this.sessionId,
                module_id: payload.module_id,
                module_type: payload.module_type,
                title: payload.title || '',
                content: payload.content || '',
                fields: payload.fields || {},
            });
            return response.data;
        } catch (error) {
            console.error('Module polish error:', error);
            throw this.handleError(error);
        }
    }

    /**
     * Optimize resume for one A4 page via dedicated pipeline
     * (Skills compact → page check → typography → experience compress).
     * Does not go through chat / content_agent.
     */
    async optimizeResume(targetContext = null) {
        try {
            if (!this.sessionId) {
                throw new Error(apiT('errors.noActiveSession', 'No active session'));
            }
            await this.syncTargetJobContext(targetContext);
            await this.ensureBackendAvailable();
            if (this.useMockMode) {
                this.state.hasResume = true;
                return {
                    reply_message: apiT('mock.optimizedA4Demo', 'Resume optimized for one A4 page (demo mode).'),
                    triggered_agents: ['a4_optimize'],
                    resume_content_json: this.mockService.profilePayload(),
                    resume_html: { html: this.mockService.mockResumeHtmlForLanguage(this.getChatLanguage()), version: 2 },
                    language: this.getChatLanguage(),
                };
            }
            const response = await this.client.post('/resume/optimize-a4', {
                session_id: this.sessionId,
            });
            return response.data;
        } catch (error) {
            console.error('Resume optimization error:', error);
            throw this.handleError(error);
        }
    }

    /**
     * Render resume with custom instruction
     */
    async renderResume(renderInstruction) {
        try {
            if (!this.sessionId) {
                throw new Error(apiT('errors.noActiveSession', 'No active session'));
            }

            const response = await this.client.post('/resume/render', {
                session_id: this.sessionId,
                render_instruction: renderInstruction,
            });

            return response.data;
        } catch (error) {
            console.error('Render resume error:', error);
            throw error;
        }
    }

    /**
     * Query backend export capabilities (PDF requires WeasyPrint).
     */
    async getExportCapabilities() {
        try {
            await this.ensureBackendAvailable();
            if (this.useMockMode) {
                return { pdf: false, docx: false };
            }
            const response = await this.client.get('/export/capabilities', { timeout: 5000 });
            return response.data;
        } catch (error) {
            console.warn('Export capabilities check failed:', error);
            return { pdf: false, docx: true };
        }
    }

    /**
     * Parse FastAPI error body when responseType is blob.
     */
    async parseExportError(error) {
        const data = error?.response?.data;
        if (data instanceof Blob) {
            try {
                const text = await data.text();
                const parsed = JSON.parse(text);
                if (parsed.detail) {
                    const detail = typeof parsed.detail === 'string' ? parsed.detail : JSON.stringify(parsed.detail);
                    return this.handleError({ ...error, response: { ...error.response, data: { detail } } });
                }
                return new Error(text);
            } catch (_) {
                return new Error(apiT('errors.exportFailedRetry', 'Export failed. Please try again later.'));
            }
        }
        if (error?.response?.status === 503) {
            const detail = error.response.data?.detail;
            return new Error(apiMsg(detail) || apiT('errors.exportFallbackUnavailable', 'PDF export service unavailable. Use browser print instead.'));
        }
        return this.handleError(error);
    }

    /**
     * Ensure blob response is a real export file, not a JSON error payload.
     */
    async validateExportBlob(blob, format) {
        if (!(blob instanceof Blob)) {
            throw new Error(apiT('errors.exportInvalidResponse', '导出响应无效'));
        }
        const normalized = String(format || '').toLowerCase();
        if (normalized === 'pdf' && blob.type === 'application/json') {
            const text = await blob.text();
            try {
                const parsed = JSON.parse(text);
                throw new Error(apiMsg(parsed.detail) || apiT('errors.exportPdfFailed', 'PDF 导出失败'));
            } catch (err) {
                if (err instanceof Error && err.message !== text) throw err;
                throw new Error(apiT('errors.exportPdfFailed', 'PDF 导出失败'));
            }
        }
        if (blob.size === 0) {
            throw new Error(apiT('errors.exportEmptyFile', '导出文件为空'));
        }
        return blob;
    }

    /**
     * Browser print fallback — user saves as PDF from the print dialog.
     */
    printResumeAsPdf(html) {
        return new Promise((resolve, reject) => {
            const win = window.open('', '_blank', 'noopener,noreferrer');
            if (!win) {
                reject(new Error(apiT('errors.popupBlocked', '请允许弹出窗口，以使用浏览器打印导出 PDF')));
                return;
            }
            win.document.open();
            win.document.write(html);
            win.document.close();
            const trigger = () => {
                win.focus();
                win.print();
                setTimeout(() => {
                    try { win.close(); } catch (_) { /* ignore */ }
                    resolve();
                }, 300);
            };
            if (win.document.readyState === 'complete') {
                trigger();
            } else {
                win.onload = trigger;
            }
        });
    }

    /**
     * Export resume in PDF / DOCX / JSON / Markdown
     */
    async exportResumeFormat(format = 'pdf') {
        try {
            if (!this.sessionId) {
                throw new Error(apiT('errors.noActiveSession', 'No active session'));
            }

            await this.ensureBackendAvailable();
            const normalized = String(format || 'pdf').toLowerCase();

            let response;
            if (normalized === 'pdf') {
                response = await this.client.post('/export/pdf', {
                    session_id: this.sessionId,
                }, { responseType: 'blob' });
            } else if (normalized === 'docx') {
                response = await this.client.post('/export/docx', {
                    session_id: this.sessionId,
                }, { responseType: 'blob' });
            } else {
                const exportFormat = normalized === 'md' ? 'markdown' : normalized;
                response = await this.client.post('/export', {
                    session_id: this.sessionId,
                    format: exportFormat,
                    target: 'resume',
                }, { responseType: 'blob' });
            }

            return await this.validateExportBlob(response.data, normalized);
        } catch (error) {
            console.error('Export resume error:', error);
            if (error.response) {
                throw await this.parseExportError(error);
            }
            throw this.handleError(error);
        }
    }

    /**
     * Export resume as PDF
     */
    async exportResumePDF() {
        return this.exportResumeFormat('pdf');
    }

    /**
     * Export resume as DOCX
     */
    async exportResumeDOCX() {
        return this.exportResumeFormat('docx');
    }

    /**
     * Start interview session - triggers interview_agent (requires candidate profile in session)
     */
    async startInterviewSession(jobTitle, industry = '', tone = 'professional', targetContext = null, programVersion = 'quick', specializedFocus = '', questionLanguage = null) {
        try {
            const ctx = targetContext || (typeof collectTargetJobContext === 'function' ? collectTargetJobContext() : null);
            await this.syncTargetJobContext(ctx);
            const qLang = this.resolvePageLanguage(questionLanguage);
            const message = [
                'Please generate interview questions based on my candidate profile and optional job description.',
                `Target role: ${jobTitle || ctx?.jd_text?.split('\n')[0] || 'target position'}.`,
                (ctx?.industryLabel || industry) ? `Industry: ${ctx?.industryLabel || industry}.` : '',
                ctx?.employerTypeLabel ? `Employer type: ${ctx.employerTypeLabel}.` : '',
                ctx?.experienceLevelLabel ? `Experience level: ${ctx.experienceLevelLabel}.` : '',
                `Interview tone: ${tone}.`,
                `Program version: ${programVersion}.`,
                specializedFocus ? `Specialized focus: ${specializedFocus}.` : '',
            ].filter(Boolean).join(' ');
            const response = await this.chat(message, [], { language: qLang, languageScope: 'interview_question' });
            return response;
        } catch (error) {
            console.error('Interview session error:', error);
            throw error;
        }
    }

    /**
     * Generate reference answers for user-uploaded custom interview questions
     */
    async generateCustomInterviewAnswers(questions, targetContext = null, questionLanguage = null) {
        try {
            if (!this.sessionId) {
                this.generateSessionId();
            }
            const ctx = targetContext || (typeof collectTargetJobContext === 'function' ? collectTargetJobContext() : null);
            await this.syncTargetJobContext(ctx);
            await this.ensureBackendAvailable();
            const qLang = this.resolvePageLanguage(questionLanguage);
            if (this.useMockMode) {
                await this.mockService.delay(1200);
                return {
                    session_id: this.sessionId,
                    interview_qa: this.mockService.customInterviewAnswersPayload(questions),
                    message: apiT('mock.customAnswersDemo', 'Generated reference answers for {count} custom questions (demo mode).', { count: questions.length }),
                };
            }
            const response = await this.client.post('/interview/custom/generate-answers', {
                session_id: this.sessionId,
                questions,
                question_language: qLang,
            });
            if (response.data.session_id) {
                this.saveSessionId(response.data.session_id);
            }
            return response.data;
        } catch (error) {
            console.error('Custom interview answers error:', error);
            throw error;
        }
    }

    /**
     * Submit answer and get feedback - triggers question_agent
     */
    async submitAnswer(questionId, answer, feedbackLanguage = null) {
        try {
            const fLang = this.resolvePageLanguage(feedbackLanguage);
            const message = `Evaluate my answer to question ${questionId}: ${answer}`;
            const response = await this.chat(message, [], {
                language: fLang,
                languageScope: 'interview_feedback',
                forcedIntent: 'evaluate_answer',
            });
            return response;
        } catch (error) {
            console.error('Submit answer error:', error);
            throw error;
        }
    }

    /**
     * Persist interview question / feedback language before question generation.
     */
    async syncInterviewLanguagesToSession(questionLanguage = null, feedbackLanguage = null) {
        if (!this.sessionId) {
            this.ensureSessionStarted();
        }
        if (this.useMockMode) {
            return {
                question_language: this.resolvePageLanguage(questionLanguage),
                feedback_language: this.resolvePageLanguage(feedbackLanguage),
            };
        }
        try {
            await this.ensureBackendAvailable();
            const response = await this.client.put('/interview/language', {
                session_id: this.sessionId,
                question_language: this.resolvePageLanguage(questionLanguage),
                feedback_language: this.resolvePageLanguage(feedbackLanguage),
            });
            return response.data;
        } catch (error) {
            console.warn('Interview language session sync skipped:', error.message);
            return null;
        }
    }

    /**
     * Start interactive multi-turn mock interview
     */
    async startInteractiveInterview({ tone = 'professional', jobTitle = '', industry = '', maxRounds = 0, programVersion = 'quick', specializedFocus = '', targetContext = null, questionLanguage = null } = {}) {
        try {
            if (!this.sessionId) {
                this.generateSessionId();
            }
            const ctx = targetContext || (typeof collectTargetJobContext === 'function' ? collectTargetJobContext() : null);
            await this.syncTargetJobContext(ctx);
            await this.ensureBackendAvailable();
            const qLang = this.resolvePageLanguage(questionLanguage);
            if (this.useMockMode) {
                return await this.mockService.startInteractiveInterview(
                    this.sessionId, tone, jobTitle, industry, maxRounds, programVersion, specializedFocus
                );
            }
            const response = await this.client.post('/interview/interactive/start', {
                session_id: this.sessionId,
                tone,
                job_title: jobTitle,
                industry: ctx?.industryLabel || industry,
                max_rounds: maxRounds,
                program_version: programVersion,
                specialized_focus: specializedFocus,
                question_language: qLang,
            });
            if (response.data.session_id) {
                this.saveSessionId(response.data.session_id);
            }
            return response.data;
        } catch (error) {
            console.error('Start interactive interview error:', error);
            throw error;
        }
    }

    /**
     * Submit answer in interactive interview (non-blocking; poll for async feedback)
     */
    async submitInteractiveTurn(answer, questionLanguage = null, feedbackLanguage = null) {
        try {
            if (!this.sessionId) {
                throw new Error(apiT('errors.noActiveSession', 'No active session'));
            }
            await this.ensureBackendAvailable();
            const qLang = this.resolvePageLanguage(questionLanguage);
            const fLang = this.resolvePageLanguage(feedbackLanguage);
            if (this.useMockMode) {
                return await this.mockService.submitInteractiveTurn(this.sessionId, answer);
            }
            const response = await this.client.post('/interview/interactive/turn', {
                session_id: this.sessionId,
                answer,
                question_language: qLang,
                feedback_language: fLang,
            });
            return response.data;
        } catch (error) {
            console.error('Submit interactive turn error:', error);
            throw error;
        }
    }

    /**
     * Poll async feedback / follow-up generation for interactive interview
     */
    async pollInteractiveSession(sinceSequence = 0, questionLanguage = null, feedbackLanguage = null) {
        try {
            if (!this.sessionId) {
                throw new Error(apiT('errors.noActiveSession', 'No active session'));
            }
            await this.ensureBackendAvailable();
            if (this.useMockMode) {
                return await this.mockService.pollInteractiveSession(this.sessionId, sinceSequence);
            }
            const qLang = this.resolvePageLanguage(questionLanguage);
            const fLang = this.resolvePageLanguage(feedbackLanguage);
            const response = await this.client.post('/interview/interactive/poll', {
                session_id: this.sessionId,
                since_sequence: sinceSequence,
                question_language: qLang,
                feedback_language: fLang,
            });
            return response.data;
        } catch (error) {
            console.error('Poll interactive session error:', error);
            throw error;
        }
    }

    /**
     * End interactive interview and generate debrief
     */
    async endInteractiveInterview(generateDebrief = true, feedbackLanguage = null) {
        try {
            if (!this.sessionId) {
                throw new Error(apiT('errors.noActiveSession', 'No active session'));
            }
            await this.ensureBackendAvailable();
            const fLang = this.resolvePageLanguage(feedbackLanguage);
            if (this.useMockMode) {
                return await this.mockService.endInteractiveInterview(this.sessionId, generateDebrief);
            }
            const response = await this.client.post('/interview/interactive/end', {
                session_id: this.sessionId,
                generate_debrief: generateDebrief,
                feedback_language: fLang,
            });
            return response.data;
        } catch (error) {
            console.error('End interactive interview error:', error);
            throw error;
        }
    }

    /**
     * Save interactive mock interview result to user account (MySQL)
     */
    async saveInteractiveInterview(recordId = '') {
        try {
            if (!this.sessionId) {
                throw new Error(apiT('errors.noActiveSession', 'No active session'));
            }
            if (!this.isLoggedIn()) {
                throw new Error(apiT('errors.loginToSaveInterview', 'Please log in to save your mock interview to the website'));
            }

            await this.ensureBackendAvailable();
            if (this.useMockMode) {
                return this.mockService.saveInteractiveInterview(this.sessionId, recordId);
            }

            const response = await this.client.post('/interview/interactive/save', {
                session_id: this.sessionId,
                record_id: recordId || '',
            });
            return response.data;
        } catch (error) {
            console.error('Save interactive interview error:', error);
            throw this.handleError(error);
        }
    }

    /**
     * List saved interactive mock interviews for logged-in user
     */
    async getInteractiveInterviewHistory(limit = 20) {
        try {
            if (!this.isLoggedIn()) {
                throw new Error(apiT('errors.loginToViewInterviews', 'Please log in to view saved mock interviews'));
            }

            await this.ensureBackendAvailable();
            if (this.useMockMode) {
                return this.mockService.getInteractiveInterviewHistory(limit);
            }

            const response = await this.client.get('/interview/interactive/history', {
                params: { limit },
            });
            return response.data;
        } catch (error) {
            console.error('Get interactive interview history error:', error);
            throw this.handleError(error);
        }
    }

    /**
     * Save question bank session to user account (MySQL)
     */
    async saveQuestionBank(payload = {}) {
        try {
            if (!this.sessionId) {
                throw new Error(apiT('errors.noActiveSession', 'No active session'));
            }
            if (!this.isLoggedIn()) {
                throw new Error(apiT('errors.loginToSaveQuestionBank', 'Please log in to save your question bank'));
            }

            await this.ensureBackendAvailable();
            if (this.useMockMode) {
                return this.mockService.saveQuestionBank(this.sessionId, payload);
            }

            const response = await this.client.post('/interview/question-bank/save', {
                session_id: this.sessionId,
                ...payload,
            });
            return response.data;
        } catch (error) {
            console.error('Save question bank error:', error);
            throw this.handleError(error);
        }
    }

    /**
     * List saved question bank records for logged-in user
     */
    async getQuestionBankHistory(limit = 20) {
        try {
            if (!this.isLoggedIn()) {
                throw new Error(apiT('errors.loginToViewQuestionBank', 'Please log in to view saved question banks'));
            }

            await this.ensureBackendAvailable();
            if (this.useMockMode) {
                return this.mockService.getQuestionBankHistory(limit);
            }

            const response = await this.client.get('/interview/question-bank/history', {
                params: { limit },
            });
            return response.data;
        } catch (error) {
            console.error('Get question bank history error:', error);
            throw this.handleError(error);
        }
    }

    /**
     * Get a single saved question bank record
     */
    async getSavedQuestionBank(recordId) {
        try {
            if (!this.isLoggedIn()) {
                throw new Error(apiT('errors.loginToViewQuestionBank', 'Please log in to view saved question banks'));
            }

            await this.ensureBackendAvailable();
            if (this.useMockMode) {
                return this.mockService.getSavedQuestionBank(recordId);
            }

            const response = await this.client.get(`/interview/question-bank/saved/${encodeURIComponent(recordId)}`);
            return response.data;
        } catch (error) {
            console.error('Get saved question bank error:', error);
            throw this.handleError(error);
        }
    }

    /**
     * Step 1: Analyze skill gaps and recommend resources (no timeline yet).
     */
    async generateLearningPathAnalysis({
        targetJob,
        currentRole = '',
        industry = '',
        employerType = '',
        experienceLevel = '',
        currentSkills = [],
        profileText = '',
        jdText = '',
        targetContext = null,
        sessionReady = false,
        language = null,
    }) {
        await this.ensureBackendAvailable();
        if (this.useMockMode) {
            throw new Error(apiT('errors.learningPathRequiresBackend', 'Learning path requires a connected backend. Demo mode is not supported for this feature.'));
        }

        try {
            const ctx = targetContext || (typeof collectTargetJobContext === 'function'
                ? collectTargetJobContext({ jdTextOverride: jdText })
                : {
                    jd_text: jdText,
                    industry,
                    industryLabel: industry,
                    employer_type: employerType,
                    experienceLevelLabel: experienceLevel,
                });
            if (targetJob && !ctx.jd_text) {
                ctx.jd_text = ctx.jd_text || targetJob;
            }
            await this.syncTargetJobContext(ctx, jdText);

            if (!sessionReady) {
                const skillsLine = currentSkills.length ? currentSkills.join(', ') : 'Not specified';
                const profileMessage = profileText || [
                    'Here is my candidate profile.',
                    currentRole ? `Current role: ${currentRole}.` : '',
                    `Current skills: ${skillsLine}.`,
                    `Career goal: ${targetJob}.`,
                ].filter(Boolean).join(' ');

                await this.submitProfileText(profileMessage);

                const jobMessage = jdText || ctx.jd_text || [
                    `Job Title: ${targetJob}`,
                    ctx.industryLabel ? `Industry: ${ctx.industryLabel}` : (industry ? `Industry: ${industry}` : ''),
                    ctx.employerTypeLabel ? `Employer type: ${ctx.employerTypeLabel}` : '',
                    ctx.experienceLevelLabel ? `Experience level: ${ctx.experienceLevelLabel}` : '',
                    '',
                    'Requirements:',
                    '- Relevant technical and soft skills for this role',
                    '- Industry experience and domain knowledge',
                    '- Problem-solving and communication abilities',
                ].filter(Boolean).join('\n');

                await this.submitJobDescription(jobMessage, ctx);
            }

            const lang = this.resolvePageLanguage(language);
            const response = await this.chat(
                'Please analyze my skill gaps against the target job and recommend learning resources with estimated study hours. Do not generate a timeline yet.',
                [],
                { language: lang, usePageLanguage: false, forcedIntent: 'learning_path' }
            );
            return response;
        } catch (error) {
            console.error('Learning path analysis error:', error);
            throw error;
        }
    }

    /**
     * Step 2: Generate timeline after user selects daily study hours.
     */
    async generateLearningPathTimeline(dailyHours, targetContext = null, language = null, planUnit = 'week') {
        await this.ensureBackendAvailable();
        if (this.useMockMode) {
            throw new Error(apiT('errors.learningPathRequiresBackend', 'Learning path requires a connected backend. Demo mode is not supported for this feature.'));
        }

        try {
            await this.syncTargetJobContext(targetContext);
            const lang = this.resolvePageLanguage(language);
            const unit = ['month', 'week', 'day'].includes(planUnit) ? planUnit : 'week';
            const unitWord = unit === 'day' ? 'daily' : unit === 'month' ? 'monthly' : 'weekly';
            const response = await this.chat(
                `Generate my learning timeline with ${dailyHours} hours per day as a ${unitWord} plan (timeline_unit=${unit}) based on the analyzed gaps and resources.`,
                [],
                { language: lang, usePageLanguage: false, forcedIntent: 'learning_path' }
            );
            return response;
        } catch (error) {
            console.error('Learning path timeline error:', error);
            throw error;
        }
    }

    /** @deprecated Use generateLearningPathAnalysis + generateLearningPathTimeline */
    async generateLearningPath({ targetJob, currentRole = '', industry = '', employerType = '', experienceLevel = '', currentSkills = [], profileText = '', jdText = '' }) {
        return this.generateLearningPathAnalysis({ targetJob, currentRole, industry, employerType, experienceLevel, currentSkills, profileText, jdText });
    }

    /**
     * Update edited learning timeline in session (Redis)
     */
    async updateLearningPathTimeline(timeline) {
        try {
            if (!this.sessionId) {
                throw new Error(apiT('errors.noActiveSession', 'No active session'));
            }

            await this.ensureBackendAvailable();
            if (this.useMockMode) {
                return this.mockService.updateLearningPathTimeline(this.sessionId, timeline);
            }

            const response = await this.client.put('/learning-path/timeline', {
                session_id: this.sessionId,
                timeline,
            });
            return response.data;
        } catch (error) {
            console.error('Update learning path timeline error:', error);
            throw this.handleError(error);
        }
    }

    /**
     * Expand one timeline phase into a finer plan (month→week, week→day).
     */
    async expandLearningPathTimeline(phaseIndex, targetUnit = 'day') {
        try {
            if (!this.sessionId) {
                throw new Error(apiT('errors.noActiveSession', 'No active session'));
            }

            await this.ensureBackendAvailable();
            if (this.useMockMode) {
                throw new Error(apiT('errors.learningPathRequiresBackend', 'Learning path requires a connected backend. Demo mode is not supported for this feature.'));
            }

            const response = await this.client.post('/learning-path/timeline/expand', {
                session_id: this.sessionId,
                phase_index: phaseIndex,
                target_unit: targetUnit,
            });
            return response.data;
        } catch (error) {
            console.error('Expand learning path timeline error:', error);
            throw this.handleError(error);
        }
    }

    /**
     * Save learning path plan to user account (MySQL)
     */
    async saveLearningPathToAccount(recordId = '') {
        try {
            if (!this.sessionId) {
                throw new Error(apiT('errors.noActiveSession', 'No active session'));
            }
            if (!this.isLoggedIn()) {
                throw new Error(apiT('errors.loginToSaveLearningPath', 'Please log in to save your learning path to the website'));
            }

            await this.ensureBackendAvailable();
            if (this.useMockMode) {
                return this.mockService.saveLearningPathToAccount(this.sessionId, recordId);
            }

            const response = await this.client.post('/learning-path/save', {
                session_id: this.sessionId,
                record_id: recordId || '',
            });
            return response.data;
        } catch (error) {
            console.error('Save learning path error:', error);
            throw this.handleError(error);
        }
    }

    /**
     * List saved learning path plans for logged-in user
     */
    async getLearningPathHistory(limit = 20) {
        try {
            if (!this.isLoggedIn()) {
                throw new Error(apiT('errors.loginToViewLearningPaths', 'Please log in to view saved learning paths'));
            }

            await this.ensureBackendAvailable();
            if (this.useMockMode) {
                return this.mockService.getLearningPathHistory(limit);
            }

            const response = await this.client.get('/learning-path/history', {
                params: { limit },
            });
            return response.data;
        } catch (error) {
            console.error('Get learning path history error:', error);
            throw this.handleError(error);
        }
    }

    /**
     * Health check
     */
    async healthCheck() {
        try {
            const response = await axios.get(`${API_CONFIG.BASE_URL.replace('/api', '')}/health`, { timeout: API_CONFIG.HEALTH_TIMEOUT });
            return response.data;
        } catch (error) {
            console.error('Health check error:', error);
            throw error;
        }
    }

    /**
     * Poll LLM queue / session lock status for retry countdown UI.
     */
    async getQueueStatus() {
        if (!this.sessionId) {
            return {
                enabled: false,
                status: 'idle',
                retry_after_seconds: 0,
                position: 0,
            };
        }
        try {
            await this.ensureBackendAvailable({ silent: true });
            if (this.useMockMode) {
                return {
                    enabled: false,
                    status: 'idle',
                    retry_after_seconds: 0,
                    position: 0,
                };
            }
            const response = await this.client.get('/queue/status', {
                params: { session_id: this.sessionId },
                timeout: API_CONFIG.HEALTH_TIMEOUT,
            });
            return response.data;
        } catch (error) {
            console.warn('Queue status poll failed:', error);
            return null;
        }
    }

    /**
     * Convert file to base64
     */
    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64String = reader.result.split(',')[1];
                resolve(base64String);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    /**
     * Handle API errors
     */
    handleError(error) {
        if (error.response) {
            const status = error.response.status;
            const detail = error.response.data?.detail || error.response.statusText;
            const mappedDetail = apiMsg(typeof detail === 'string' ? detail : JSON.stringify(detail));
            const url = this._formatRequestUrl(error);

            switch (status) {
                case 401:
                    return new Error(apiT('errors.http401', 'HTTP 401 Unauthorized — {detail} [{url}]', { detail: mappedDetail, url }));
                case 403:
                    return new Error(apiT('errors.http403', 'HTTP 403 Forbidden — {detail} [{url}]', { detail: mappedDetail, url }));
                case 404: {
                    const data = error.response.data || {};
                    const rawDetail = typeof data.detail === 'string' ? data.detail : '';
                    if (/会话不存在/.test(rawDetail)) {
                        const err = new Error(apiT(
                            'errors.sessionLost',
                            'Session expired or was reset (e.g. server restart without Redis). Please re-upload or regenerate the resume, then export again.'
                        ));
                        err.code = 'SESSION_LOST';
                        return err;
                    }
                    if (/简历 HTML 尚未生成/.test(rawDetail)) {
                        return new Error(apiT(
                            'errors.resumeHtmlNotReady',
                            'Resume preview HTML is not ready yet. Wait for generation to finish, then try export again.'
                        ));
                    }
                    if (rawDetail && !/^not found$/i.test(rawDetail)) {
                        return new Error(apiT('errors.http404', 'HTTP 404 Not Found — {detail} [{url}]', { detail: apiMsg(rawDetail), url }));
                    }
                    return new Error(apiT('errors.http404', 'HTTP 404 Not Found — {detail} [{url}]', {
                        detail: apiT('errors.notFound', 'Resource not found. Please check your session ID.'),
                        url,
                    }));
                }
                case 409: {
                    let code = '';
                    let task = '';
                    if (detail && typeof detail === 'object') {
                        code = String(detail.code || '').trim();
                        task = String(detail.task || '').trim();
                    } else if (typeof detail === 'string') {
                        code = detail.trim();
                    }
                    const err = new Error(formatSessionBusyMessage(task));
                    if (code) err.code = code;
                    if (task) err.task = task;
                    return err;
                }
                case 422:
                    return new Error(apiT('errors.http422', 'HTTP 422 Unprocessable Entity — {detail} [{url}]', { detail: mappedDetail, url }));
                case 500:
                    return new Error(apiT('errors.http500', 'HTTP 500 Internal Server Error — {detail} [{url}]', { detail: mappedDetail, url }));
                case 503:
                    return new Error(apiT('errors.http503', 'HTTP 503 Service Unavailable — {detail} [{url}]', { detail: mappedDetail, url }));
                default:
                    return new Error(apiT('errors.apiErrorWithStatus', 'HTTP {status} — {detail} [{url}]', { status, detail: mappedDetail, url }));
            }
        } else if (error.request) {
            const url = this._formatRequestUrl(error);
            const timeoutMs = Number(error.config?.timeout) || API_CONFIG.TIMEOUT;
            const isLongRunningAiRequest = timeoutMs >= API_CONFIG.TIMEOUT;
            if (isLongRunningAiRequest && isRequestTimeoutError(error)) {
                const err = new Error(apiT(
                    'errors.aiTaskStillProcessing',
                    'The request timed out, but the server may still be processing your AI task in the background. Please wait before trying again.'
                ));
                err.code = API_ERROR.REQUEST_TIMEOUT;
                return err;
            }
            return new Error(apiT('errors.networkErrorWithUrl', 'Network error — no response from {url}. Ensure the backend is running (cd backend && python main.py).', { url }));
        } else {
            return new Error(apiMsg(error.message) || apiT('errors.unexpected', 'An unexpected error occurred.'));
        }
    }
}

// Create global API client instance
const apiClient = new APIClient();

if (typeof window !== 'undefined') {
    window.addEventListener('gba:language-changed', () => {
        if (typeof Utils !== 'undefined') {
            Utils.updateSessionDisplay(apiClient.sessionId);
            if (Utils._aiTaskRetryState?.active) {
                Utils._updateAiTaskRetryBanner();
            }
        }
        if (apiClient.useMockMode) {
            apiClient._syncMockModeIndicator();
        }
    });

    const probeBackendOnLoad = () => {
        apiClient.reconnectBackend({ showToast: false }).catch(() => {});
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', probeBackendOnLoad);
    } else {
        probeBackendOnLoad();
    }
}

// Utility functions
const Utils = {
    _loadingProgressTimer: null,
    _loadingProgressState: null,
    _aiTaskRetryState: {
        active: false,
        errorKind: null,
        taskType: '',
        retryAfter: 0,
        queueStatus: 'idle',
        queuePosition: 0,
        tickTimer: null,
        pollTimer: null,
        guardedElements: [],
    },

    _aiTaskRetryGuardSelector() {
        return [
            '[data-ai-retry-guard]',
            '#btn-generate',
            '#btn-generate-jd',
            '#btn-generate-profile-resume',
            '#btn-upload-resume',
            '[data-resume-translate]',
            'button[onclick*="optimizeResume"]',
        ].join(',');
    },

    isAiTaskRetryBlocked() {
        const state = this._aiTaskRetryState;
        return Boolean(state?.active);
    },

    showAiTaskRetryBlockedHint() {
        const state = this._aiTaskRetryState;
        if (!state?.active) return;
        const msg = state.retryAfter > 0
            ? buildAiTaskRetryBannerMessage(state)
            : apiT('errors.aiTaskRetryChecking', 'Checking whether the AI task has finished…');
        this.showToast(msg, 4000);
        this._updateAiTaskRetryBanner();
    },

    stopAiTaskRetryWait() {
        const state = this._aiTaskRetryState;
        if (!state) return;
        if (state.tickTimer) clearInterval(state.tickTimer);
        if (state.pollTimer) clearInterval(state.pollTimer);
        state.active = false;
        state.errorKind = null;
        state.taskType = '';
        state.retryAfter = 0;
        state.queueStatus = 'idle';
        state.queuePosition = 0;
        state.tickTimer = null;
        state.pollTimer = null;
        this._restoreAiTaskRetryButtonGuards();
        document.getElementById('gba-ai-retry-banner')?.remove();
    },

    startAiTaskRetryWait(error) {
        if (!isAiTaskPendingError(error)) return;
        this.stopAiTaskRetryWait();
        const state = this._aiTaskRetryState;
        state.active = true;
        state.errorKind = error.code;
        state.taskType = String(error.task || '').trim();
        state.retryAfter = error.code === API_ERROR.REQUEST_TIMEOUT ? 90 : 30;
        this._applyAiTaskRetryButtonGuards();
        this._ensureAiTaskRetryBanner();
        this._updateAiTaskRetryBanner();
        this._pollAiTaskRetryStatus();
        state.pollTimer = setInterval(() => this._pollAiTaskRetryStatus(), 2000);
        state.tickTimer = setInterval(() => this._tickAiTaskRetryCountdown(), 1000);
    },

    async _pollAiTaskRetryStatus() {
        const state = this._aiTaskRetryState;
        if (!state?.active) return;
        const status = await apiClient.getQueueStatus();
        if (!status) {
            if (state.retryAfter > 0) {
                state.retryAfter = Math.max(0, state.retryAfter - 1);
                this._updateAiTaskRetryBanner();
            }
            return;
        }

        state.queueStatus = status.status || 'idle';
        state.queuePosition = Number(status.position) || 0;
        if (status.task_type) {
            state.taskType = String(status.task_type).trim();
        }
        const retryAfter = Number(status.retry_after_seconds) || 0;

        if (status.status === 'idle' && retryAfter <= 0) {
            this._finishAiTaskRetryWait(true);
            return;
        }

        if (retryAfter > 0) {
            state.retryAfter = retryAfter;
        } else if (status.status === 'running' || status.status === 'queued') {
            state.retryAfter = Math.max(state.retryAfter, 15);
        } else {
            this._finishAiTaskRetryWait(true);
            return;
        }
        this._updateAiTaskRetryBanner();
    },

    _tickAiTaskRetryCountdown() {
        const state = this._aiTaskRetryState;
        if (!state?.active) return;
        if (state.retryAfter > 0) {
            state.retryAfter -= 1;
            this._updateAiTaskRetryBanner();
        }
        if (state.retryAfter <= 0) {
            this._pollAiTaskRetryStatus();
        }
    },

    _finishAiTaskRetryWait(ready) {
        this.stopAiTaskRetryWait();
        if (ready) {
            this.showToast(apiT('errors.aiTaskRetryReady', 'You can retry now.'), 4000);
        }
    },

    _ensureAiTaskRetryBanner() {
        if (typeof document === 'undefined') return;
        let banner = document.getElementById('gba-ai-retry-banner');
        if (banner) return;
        banner = document.createElement('div');
        banner.id = 'gba-ai-retry-banner';
        banner.className = 'fixed bottom-20 right-4 z-[9997] max-w-md bg-amber-600 text-white text-sm px-4 py-3 rounded-lg shadow-lg border border-amber-500';
        banner.innerHTML = '<div id="gba-ai-retry-message" class="leading-relaxed"></div>';
        document.body.appendChild(banner);
    },

    _updateAiTaskRetryBanner() {
        const state = this._aiTaskRetryState;
        if (!state?.active) return;
        this._ensureAiTaskRetryBanner();
        const messageEl = document.getElementById('gba-ai-retry-message');
        if (!messageEl) return;
        if (state.retryAfter > 0) {
            messageEl.textContent = buildAiTaskRetryBannerMessage(state);
            return;
        }
        messageEl.textContent = apiT('errors.aiTaskRetryChecking', 'Checking whether the AI task has finished…');
    },

    _applyAiTaskRetryButtonGuards() {
        this._restoreAiTaskRetryButtonGuards();
        const state = this._aiTaskRetryState;
        state.guardedElements = [];
        document.querySelectorAll(this._aiTaskRetryGuardSelector()).forEach((el) => {
            if (!(el instanceof HTMLElement)) return;
            state.guardedElements.push({ el, wasDisabled: el.disabled });
            el.disabled = true;
            el.setAttribute('aria-disabled', 'true');
            el.classList.add('opacity-50', 'cursor-not-allowed');
        });
    },

    _restoreAiTaskRetryButtonGuards() {
        const state = this._aiTaskRetryState;
        (state.guardedElements || []).forEach(({ el, wasDisabled }) => {
            if (!el || !el.isConnected) return;
            el.disabled = wasDisabled;
            if (wasDisabled) {
                el.setAttribute('aria-disabled', 'true');
            } else {
                el.removeAttribute('aria-disabled');
            }
            el.classList.remove('opacity-50', 'cursor-not-allowed');
        });
        state.guardedElements = [];
    },

    refreshAiTaskRetryButtonGuards() {
        if (!this.isAiTaskRetryBlocked()) return;
        this._applyAiTaskRetryButtonGuards();
    },

    /**
     * Show toast notification
     */
    showToast(message, duration = 3000) {
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toast-message');
        const text = apiMsg(message);

        if (toast && toastMessage) {
            toastMessage.textContent = text;
            toast.classList.remove('translate-y-20', 'opacity-0');
            toast.classList.add('translate-y-0', 'opacity-100');

            setTimeout(() => {
                toast.classList.remove('translate-y-0', 'opacity-100');
                toast.classList.add('translate-y-20', 'opacity-0');
            }, duration);
        }
    },

    /**
     * Toast for AI task errors — longer duration when backend may still be working.
     */
    showAiTaskErrorToast(error, fallbackKey, fallbackEn, vars) {
        const pending = isAiTaskPendingError(error);
        const msg = getAiTaskErrorMessage(error, fallbackKey, fallbackEn, vars);
        this.showToast(msg, pending ? AI_TASK_PENDING_TOAST_MS : 3000);
        if (pending) {
            this.startAiTaskRetryWait(error);
        }
    },

    /**
     * Show loading overlay
     */
    showLoading(message, options = {}) {
        const overlay = document.getElementById('loading-overlay');
        const messageEl = document.getElementById('loading-message');
        const titleEl = document.getElementById('loading-title');
        const text = apiMsg(message || apiT('common.processing', 'Processing...'));

        if (overlay) {
            if (messageEl) {
                messageEl.textContent = text;
            }
            if (titleEl && options.title) {
                titleEl.textContent = apiMsg(options.title);
            }
            if (options.showProgress) {
                this._resetLoadingProgressUi();
                const progressWrap = document.getElementById('loading-progress-wrap');
                if (progressWrap) {
                    progressWrap.classList.remove('hidden');
                }
                if (typeof options.percent === 'number') {
                    this.updateLoadingProgress({ percent: options.percent, message: text, stepLabel: options.stepLabel });
                }
            } else {
                this._hideLoadingProgressUi();
            }
            overlay.classList.remove('hidden');
        }
    },

    _resetLoadingProgressUi() {
        const fill = document.getElementById('loading-progress-fill');
        const text = document.getElementById('loading-progress-text');
        const step = document.getElementById('loading-progress-step');
        if (fill) fill.style.width = '0%';
        if (text) text.textContent = '0%';
        if (step) step.textContent = '';
    },

    _hideLoadingProgressUi() {
        const progressWrap = document.getElementById('loading-progress-wrap');
        if (progressWrap) {
            progressWrap.classList.add('hidden');
        }
    },

    /**
     * Update loading overlay progress bar (0–100)
     */
    updateLoadingProgress({ message, percent, stepLabel } = {}) {
        const fill = document.getElementById('loading-progress-fill');
        const text = document.getElementById('loading-progress-text');
        const step = document.getElementById('loading-progress-step');
        const messageEl = document.getElementById('loading-message');
        const clamped = Math.min(100, Math.max(0, Number(percent) || 0));

        if (fill) fill.style.width = `${clamped}%`;
        if (text) text.textContent = `${Math.round(clamped)}%`;
        if (step && stepLabel !== undefined) step.textContent = stepLabel;
        if (messageEl && message) {
            messageEl.textContent = apiMsg(message);
        }
    },

    /**
     * Simulate staged progress while waiting for a long-running API call.
     * Returns { stop, complete } — call complete() before hideLoading on success.
     */
    startLoadingProgressSimulation({ title, steps = [], capPercent = 95, tickMs = 400 } = {}) {
        this.stopLoadingProgressSimulation();

        const normalizedSteps = (steps.length ? steps : [
            { message: apiT('common.processing', 'Processing...'), percent: capPercent },
        ]).map((step, index) => ({
            message: step.message || '',
            stepLabel: step.stepLabel || step.label || '',
            percent: Math.min(capPercent, Number(step.percent) || Math.round(((index + 1) / steps.length) * capPercent)),
            durationMs: step.durationMs || 0,
        }));

        this._loadingProgressState = {
            currentPercent: 0,
            stepIndex: 0,
            capPercent,
            normalizedSteps,
        };

        this.showLoading(normalizedSteps[0].message, {
            title,
            showProgress: true,
            percent: 0,
            stepLabel: normalizedSteps[0].stepLabel,
        });

        const advance = () => {
            const state = this._loadingProgressState;
            if (!state) return;

            const step = state.normalizedSteps[state.stepIndex];
            if (!step) return;

            const target = step.percent;
            const increment = Math.max(0.4, (target - state.currentPercent) / 8);
            state.currentPercent = Math.min(target, state.currentPercent + increment);

            this.updateLoadingProgress({
                percent: state.currentPercent,
                message: step.message,
                stepLabel: step.stepLabel,
            });

            if (state.currentPercent >= target - 0.5) {
                if (state.stepIndex < state.normalizedSteps.length - 1) {
                    state.stepIndex += 1;
                } else if (state.currentPercent < state.capPercent) {
                    state.currentPercent = Math.min(state.capPercent, state.currentPercent + 0.15);
                    this.updateLoadingProgress({ percent: state.currentPercent, message: step.message, stepLabel: step.stepLabel });
                }
            }
        };

        this._loadingProgressTimer = setInterval(advance, tickMs);
        advance();

        return {
            stop: () => this.stopLoadingProgressSimulation(),
            complete: async (message) => {
                this.stopLoadingProgressSimulation();
                this.updateLoadingProgress({
                    percent: 100,
                    message: message || apiT('interview.loadingComplete', 'Done!'),
                    stepLabel: '',
                });
                await new Promise((resolve) => setTimeout(resolve, 350));
            },
        };
    },

    stopLoadingProgressSimulation() {
        if (this._loadingProgressTimer) {
            clearInterval(this._loadingProgressTimer);
            this._loadingProgressTimer = null;
        }
        this._loadingProgressState = null;
    },

    /**
     * Hide loading overlay
     */
    hideLoading() {
        this.stopLoadingProgressSimulation();
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
        }
        this._hideLoadingProgressUi();
    },

    /**
     * Update session ID display
     */
    updateSessionDisplay(sessionId) {
        const resolved = sessionId || (typeof apiClient !== 'undefined' ? apiClient.sessionId : '');
        const label = resolved
            ? String(resolved).substr(-8)
            : apiT('common.notStarted', 'Not started');
        const sessionElements = document.querySelectorAll('#session-id, #session-id-display');
        sessionElements.forEach(el => {
            if (el) {
                el.textContent = label;
                el.dataset.i18nDynamic = '1';
                el.title = resolved || apiT('common.notStarted', 'Not started');
            }
        });
        const badge = document.getElementById('session-badge');
        if (badge) {
            badge.title = resolved
                ? apiT('common.sessionFull', 'Session ID: {id}', { id: resolved })
                : apiT('common.notStarted', 'Not started');
        }
    },

    /**
     * Format file size
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    /**
     * Download file from blob
     */
    downloadFile(blob, filename) {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    },

    /**
     * Debounce function
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { APIClient, Utils, apiClient, MockAPIService };
}
