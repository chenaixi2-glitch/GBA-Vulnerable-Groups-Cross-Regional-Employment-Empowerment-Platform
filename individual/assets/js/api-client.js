/**
 * GBA Platform - API Client
 * Handles all backend communication with automatic demo/mock fallback
 */

const API_CONFIG = {
    BASE_URL: (typeof window !== 'undefined' && window.GBA_API_BASE_URL) || 'http://localhost:8000/api',
    // SiliconFlow DeepSeek: single LLM call ~60–90s; multi-agent workflows may take 2–3 min
    TIMEOUT: 300000,
    MOCK_MODE_KEY: 'gba_api_mock_mode',
};

/** Canonical mock fixtures live in test-data/ (loaded via browser-bundle.js). */
function alexChenFixtures() {
    const td = (typeof window !== 'undefined' && window.GBA_TEST_DATA)
        || (typeof globalThis !== 'undefined' && globalThis.GBA_TEST_DATA);
    if (!td || !td.alexChen) {
        throw new Error('Load test-data/browser-bundle.js before api-client.js');
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
            throw new Error('Resource not found. Please check your session ID.');
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
        return { ok: true, message: 'Resume saved securely to your account (demo mode).', session_id: sessionId };
    }

    async saveInteractiveInterview(sessionId, recordId = '') {
        await this.delay(500);
        const id = recordId || `iis_mock_${Date.now()}`;
        return {
            ok: true,
            message: 'Mock interview saved to your account (demo mode).',
            session_id: sessionId,
            record_id: id,
        };
    }

    async getInteractiveInterviewHistory(limit = 20) {
        await this.delay(300);
        return { records: alexChenMock().interactiveInterviewHistory.slice(0, limit) };
    }

    async updateLearningPathTimeline(sessionId, timeline) {
        await this.delay(300);
        const lastWeeks = timeline.length ? timeline[timeline.length - 1].weeks : '0';
        const match = String(lastWeeks).match(/(\d+)$/);
        return {
            ok: true,
            message: 'Timeline updated (demo mode).',
            session_id: sessionId,
            timeline,
            estimated_weeks: match ? parseInt(match[1], 10) : timeline.length * 4,
        };
    }

    async saveLearningPathToAccount(sessionId, recordId = '') {
        await this.delay(400);
        const id = recordId || `lpp_mock_${Date.now()}`;
        return {
            ok: true,
            message: 'Learning path saved to your account (demo mode).',
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

    gapPayload() {
        return alexChenMock().gaps;
    }

    interviewPayload(tone = 'professional') {
        const sets = alexChenMock().interviewSets;
        return sets[tone] || sets.professional;
    }

    _mockInteractiveFollowUps() {
        return alexChenMock().interactiveFollowUps;
    }

    async startInteractiveInterview(sessionId, tone, jobTitle, industry, maxRounds, programVersion = 'quick', specializedFocus = '') {
        await this.delay(1200);

        const programLabels = {
            quick: '极速版 (~30分钟)',
            full: '完整版 (~60分钟)',
            specialized: '专项版',
        };
        const stageSets = {
            quick: [
                { stage_id: 'screening_final', name: '综合面·初筛+终面', subtitle: '15分钟 · HR+综合评估', max_turns: 5, turn_count: 1, status: 'active' },
                { stage_id: 'professional', name: '第二轮·专业/技术面', subtitle: '20-30分钟 · 部门主管', max_turns: 8, turn_count: 0, status: 'pending' },
            ],
            full: [
                { stage_id: 'screening', name: '第一轮·初筛面试', subtitle: '10-15分钟 · HR', max_turns: 5, turn_count: 1, status: 'active' },
                { stage_id: 'professional', name: '第二轮·专业/技术面', subtitle: '20-30分钟 · 主管', max_turns: 8, turn_count: 0, status: 'pending' },
                { stage_id: 'final', name: '第三轮·总监/HR终面', subtitle: '10-15分钟 · 总监/HRD', max_turns: 4, turn_count: 0, status: 'pending' },
            ],
            specialized: [{
                stage_id: `specialized_${specializedFocus || 'technical'}`,
                name: { technical: '专项·技术/专业面', final_negotiation: '专项·终面谈判', resume_deep_dive: '专项·简历深挖' }[specializedFocus || 'technical'],
                subtitle: '专项练习',
                max_turns: 8,
                turn_count: 1,
                status: 'active',
            }],
        };

        const stages = stageSets[programVersion] || stageSets.quick;
        const totalRounds = maxRounds || stages.reduce((sum, s) => sum + s.max_turns, 0);

        const opening = tone === 'pressure'
            ? '你好，我是今天的面试官。我们采用结构化面试流程，时间有限——请用两分钟做一个结构化自我介绍（个人背景+核心经历+匹配岗位优势+求职意向）。'
            : tone === 'friendly'
                ? '你好！很高兴今天能和你交流。我们按企业标准流程进行模拟，先轻松介绍一下自己吧——背景、经历和为什么对这个岗位感兴趣。'
                : '你好，欢迎参加本次结构化模拟面试。请先做一个结构化自我介绍：个人背景、核心经历、匹配岗位的优势，以及你的求职意向。';

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
                category: '简历深挖与个人经历',
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
            message: '模拟面试已开始（demo mode）',
        };
    }

    async submitInteractiveTurn(sessionId, answer) {
        await this.delay(1000);
        const stored = this.interactiveSessions[sessionId];
        if (!stored || stored.session.status !== 'active') {
            throw new Error('No active interactive interview');
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
                content: '感谢你的回答，本次模拟面试到此结束。你可以查看复盘报告。',
                turn_type: 'end',
                category: followUp.category,
                round: session.round_count,
                created_at: new Date().toISOString(),
            });
            session.status = 'completed';
            session.ended_at = new Date().toISOString();
            session.latest_interviewer_message = '感谢你的回答，本次模拟面试到此结束。';
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
            message: shouldEnd ? '面试已结束' : '请继续回答',
        };
    }

    async endInteractiveInterview(sessionId, generateDebrief) {
        await this.delay(1500);
        const stored = this.interactiveSessions[sessionId];
        if (!stored) {
            throw new Error('No interview session found');
        }
        const session = stored.session;
        session.status = 'completed';
        session.ended_at = new Date().toISOString();

        if (generateDebrief) {
            session.debrief = {
                overall_score: 76,
                summary: '整体表现良好，沟通表达清晰，案例选择贴合岗位。建议在回答中增加量化成果，并加强对公司业务和岗位要求的关联阐述。',
                strengths: [
                    '表达流畅，逻辑结构较好',
                    '能结合真实经历回答问题',
                    '态度积极，求职动机明确',
                ],
                weaknesses: [
                    '部分回答缺少量化数据',
                    '对岗位业务细节了解可加深',
                    '压力情境下的回答可更简洁有力',
                ],
                key_moments: [
                    {
                        question: '请做一个自我介绍',
                        your_answer_summary: '介绍了教育背景和客服实习经历',
                        analysis: '结构完整但可更突出与岗位的匹配亮点',
                        improved_answer: '以目标岗位为核心，用1-2个量化成果开场，再展开相关经历',
                        score: 72,
                    },
                    {
                        question: '描述一次处理客户投诉的经历',
                        your_answer_summary: '讲述了跨境订单延迟的处理过程',
                        analysis: 'STAR结构较好，缺少最终客户满意度或业务指标',
                        improved_answer: '补充处理时效、客户反馈和后续流程优化措施',
                        score: 78,
                    },
                ],
                recommendations: [
                    '每次回答尽量包含一个量化结果',
                    '提前研究目标公司业务和岗位要求',
                    '用STAR法则练习行为面试题',
                    '准备2-3个不同维度的核心案例',
                ],
                category_scores: {
                    '简历深挖与个人经历': 75,
                    '岗位认知与求职动机': 80,
                    '项目实操与问题解决': 72,
                    '压力应变与短板复盘': 70,
                },
                generated_at: new Date().toISOString(),
            };
        }

        return {
            session_id: sessionId,
            interactive_interview: session,
            message: '复盘报告已生成（demo mode）',
        };
    }

    async chat(sessionId, message, attachments = []) {
        await this.delay();
        const response = this.baseResponse(sessionId);
        const msg = (message || '').toLowerCase();

        if (attachments.length > 0 || (!this.state.hasProfile && message.trim().length > 20 && !msg.includes('job title'))) {
            this.state.hasProfile = true;
            response.triggered_agents = ['profile_agent'];
            response.candidate_profile = this.candidateProfilePayload();
            response.resume_content_json = this.profilePayload();
            response.reply_message = 'Profile extracted successfully (demo mode).';
            return response;
        }

        if (msg.includes('skill gaps') || msg.includes('missing competencies')) {
            this.state.hasJob = true;
            response.triggered_agents = ['gap_agent'];
            response.gaps = this.gapPayload();
            response.questions_to_ask = [
                { question: 'Do you have experience with marketplace seller dashboards?', reason: 'Common requirement for cross-border CS roles', priority: 'High' },
                { question: 'Have you handled refund disputes across regions?', reason: 'Validates cross-border operational knowledge', priority: 'Medium' },
            ];
            response.reply_message = 'Skill gap analysis completed (demo mode).';
            return response;
        }

        if (msg.includes('generate interview questions')) {
            const toneMatch = message.match(/interview tone:\s*(\w+)/i);
            const tone = toneMatch ? toneMatch[1].toLowerCase() : this.state.tone;
            this.state.tone = tone;
            response.triggered_agents = ['interview_agent'];
            response.interview_qa = this.interviewPayload(tone);
            response.reply_message = `Generated ${response.interview_qa.length} interview questions (demo mode).`;
            return response;
        }

        if (msg.includes('evaluate my answer')) {
            response.triggered_agents = ['answer_evaluation_agent'];
            response.reply_message = 'Your answer shows good structure. Add a concrete metric or outcome to strengthen impact.';
            response.score = 78;
            response.strengths = ['Clear communication', 'Relevant example chosen'];
            response.improvements = ['Quantify results where possible', 'Mention cross-border context explicitly'];
            response.suggestions = ['Try the STAR format with a measurable result', 'Reference tools or policies you used'];
            response.judge_scores = { relevance: 82, groundedness: 74, actionability: 79, rationale: 'Demo rubric scores.' };
            return response;
        }

        if (msg.includes('generate a customized resume') || msg.includes('generate resume')) {
            this.state.hasResume = true;
            response.triggered_agents = ['content_agent', 'render_agent'];
            response.resume_content_json = this.profilePayload();
            response.resume_html = { html: mockResumeEnHtml(), version: 1 };
            response.reply_message = 'Customized resume generated (demo mode).';
            return response;
        }

        if (msg.includes('translate') || msg.includes('convert to chinese') || msg.includes('convert to english') || msg.includes('中文') || msg.includes('英文')) {
            this.state.hasResume = true;
            const isEn = /english|英文|en/i.test(message);
            const html = isEn ? mockResumeEnHtml() : mockResumeZhHtml();
            response.triggered_agents = ['content_agent', 'render_agent'];
            response.resume_content_json = this.profilePayload();
            response.resume_html = { html, version: 2 };
            response.language = isEn ? 'en' : 'zh';
            response.reply_message = `Resume converted to ${isEn ? 'English' : 'Chinese'} (demo mode, A4 single page).`;
            return response;
        }

        if (!this.state.hasJob && message.trim().length > 30) {
            this.state.hasJob = true;
            response.triggered_agents = ['jd_agent', 'gap_agent'];
            response.job = { id: 'job_mock_1', title: 'Cross-border Customer Service Specialist', company: 'GBA Employer' };
            response.gaps = this.gapPayload();
            response.reply_message = 'Job description analyzed and gaps identified (demo mode).';
            return response;
        }

        response.reply_message = 'Request processed (demo mode).';
        response.triggered_agents = ['planner'];
        return response;
    }

    async getResumeHtml(sessionId) {
        await this.delay(300);
        return { resume_html: { html: mockResumeEnHtml(), version: 1 } };
    }

    _resumeContentToMarkdown(content) {
        const profile = content.profile || {};
        const lines = [
            '# 简历内容',
            '',
            '## 基本信息',
            `- 姓名: ${profile.name || '-'}`,
            `- 邮箱: ${profile.email || '-'}`,
            `- 电话: ${profile.phone || '-'}`,
            `- 城市: ${profile.city || '-'}`,
            `- GitHub: ${profile.github || '-'}`,
            '',
            '## 个人总结',
            content.summary || '-',
        ];
        const sections = [
            ['技能', content.skills],
            ['项目', content.projects],
            ['实习', content.internships],
            ['奖项', content.awards],
            ['论文', content.papers],
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
            return new Blob([this._resumeContentToMarkdown(content)], { type: 'text/markdown' });
        }
        if (normalized === 'pdf' || normalized === 'docx') {
            throw new Error('PDF/DOCX export requires a connected backend');
        }
        throw new Error(`Unsupported export format: ${format}`);
    }

    async translateResume(sessionId, targetLanguage) {
        await this.delay(1200);
        const isEn = String(targetLanguage).toLowerCase().startsWith('en');
        const message = isEn ? 'translate resume to english' : 'convert to chinese resume';
        const response = await this.chat(sessionId, message, []);
        response.language_checklist = this.buildMockChecklist(isEn ? 'en' : 'zh');
        return response;
    }

    buildMockChecklist(language) {
        const key = String(language).startsWith('en') ? 'en' : 'zh';
        return alexChenMock().languageChecklists[key];
    }

    async getLanguageChecklist(sessionId, language) {
        await this.delay(400);
        const checklist = this.buildMockChecklist(String(language).startsWith('en') ? 'en' : 'zh');
        return { language: checklist.language, language_checklist: checklist };
    }

    buildMockJd(industry, experienceLevel, employerType = 'private') {
        const industryLabels = {
            tech: 'Technology',
            finance: 'Finance',
            ecommerce: 'E-commerce',
            healthcare: 'Healthcare',
            education: 'Education',
            other: 'General',
        };
        const employerLabels = {
            soe: 'State-owned Enterprise (国央企)',
            public: 'Public Sector (体制内)',
            foreign: 'Foreign Enterprise (外企)',
            private: 'Private Enterprise (民企)',
            npo: 'Non-profit Organization (NPO/NGO 非营利社会组织)',
            hmt: 'HK/Macau/TW-funded Enterprise (港澳台资企业)',
            other: 'Other (其他)',
        };
        const levelLabels = {
            entry: 'Entry Level (0-2 years)',
            mid: 'Mid Level (3-5 years)',
            senior: 'Senior Level (5+ years)',
            executive: 'Executive / Leadership',
        };
        const industryLabel = industryLabels[industry] || industry || 'General';
        const employerLabel = employerLabels[employerType] || employerType || 'Private Enterprise';
        const levelLabel = levelLabels[experienceLevel] || experienceLevel || 'Mid Level';

        return {
            title: `${industryLabel} Professional (${levelLabel})`,
            jd_text: [
                `Job Title: ${industryLabel} Professional`,
                `Industry: ${industryLabel}`,
                `Employer Type: ${employerLabel}`,
                `Experience Level: ${levelLabel}`,
                '',
                'Job Summary:',
                `We are seeking a motivated ${levelLabel.toLowerCase()} professional for roles across the ${industryLabel.toLowerCase()} sector in the Greater Bay Area. This generic description covers common target positions aligned with your background.`,
                '',
                'Key Responsibilities:',
                '- Apply domain knowledge and technical/operational skills to daily work',
                '- Collaborate with cross-functional and cross-border teams',
                '- Communicate clearly with stakeholders in English and Chinese contexts',
                '- Solve problems independently and improve processes continuously',
                '- Document work and share knowledge with teammates',
                '',
                'Requirements:',
                `- ${levelLabel} experience in ${industryLabel.toLowerCase()} or related fields`,
                '- Relevant skills demonstrated in your uploaded resume',
                '- Strong communication, teamwork, and learning agility',
                '- Ability to adapt to cross-regional employment in the GBA',
                '',
                'Preferred Qualifications:',
                '- Bilingual or multilingual communication skills',
                '- Experience with digital tools and remote collaboration',
                '- Industry certifications or project portfolio (if applicable)',
            ].join('\n'),
        };
    }

    async generateJobDescription(sessionId, industry, experienceLevel, employerType = 'private') {
        await this.delay(1200);
        if (!this.state.hasProfile) {
            throw new Error('Please upload your resume first');
        }
        return this.buildMockJd(industry, experienceLevel, employerType);
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
        this.useMockMode = localStorage.getItem(API_CONFIG.MOCK_MODE_KEY) === 'true';
        this.backendChecked = false;

        this.client.interceptors.request.use((config) => {
            const token = this.getAuthToken();
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
            return config;
        });
    }

    async ensureBackendAvailable() {
        if (this.backendChecked) {
            return !this.useMockMode;
        }
        this.backendChecked = true;

        if (localStorage.getItem(API_CONFIG.MOCK_MODE_KEY) === 'true') {
            this.useMockMode = true;
            console.warn('[API] Demo mode enabled (mock backend)');
            return false;
        }

        try {
            await axios.get(`${API_CONFIG.BASE_URL.replace('/api', '')}/health`, { timeout: 3000 });
            this.useMockMode = false;
            localStorage.removeItem(API_CONFIG.MOCK_MODE_KEY);
            return true;
        } catch (error) {
            this.useMockMode = true;
            localStorage.setItem(API_CONFIG.MOCK_MODE_KEY, 'true');
            console.warn('[API] Backend unavailable, using demo mode:', error.message);
            if (typeof Utils !== 'undefined') {
                Utils.showToast('Backend offline — running in demo mode with sample data');
            }
            return false;
        }
    }

    enableMockMode() {
        this.useMockMode = true;
        this.backendChecked = true;
        localStorage.setItem(API_CONFIG.MOCK_MODE_KEY, 'true');
    }

    disableMockMode() {
        this.useMockMode = false;
        this.backendChecked = false;
        localStorage.removeItem(API_CONFIG.MOCK_MODE_KEY);
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
     * Main chat endpoint - unified entry point for all agents
     */
    async chat(message, attachments = []) {
        try {
            if (!this.sessionId) {
                this.generateSessionId();
            }

            await this.ensureBackendAvailable();
            if (this.useMockMode) {
                return this.mockService.chat(this.sessionId, message, attachments);
            }

            const response = await this.client.post('/chat', {
                session_id: this.sessionId,
                message: message,
                attachments: attachments,
            });

            return response.data;
        } catch (error) {
            console.error('Chat API error:', error);
            if (!error.response && !this.useMockMode) {
                this.enableMockMode();
                if (typeof Utils !== 'undefined') {
                    Utils.showToast('Backend unreachable — switched to demo mode');
                }
                return this.mockService.chat(this.sessionId, message, attachments);
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
            ]);

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

        if (this.useMockMode) {
            return { ok: true, target_context: ctx };
        }

        await this.ensureBackendAvailable();
        const response = await this.client.put('/resume/target-context', {
            session_id: this.sessionId,
            jd_text: ctx.jd_text || '',
            industry: ctx.industryLabel || ctx.industry || '',
            employer_type: ctx.employer_type || '',
            experience_level: ctx.experienceLevelLabel || ctx.experience_level || '',
        });
        return response.data;
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
            const ctx = this._resolveTargetJobContext(targetContext, jdText);
            await this.syncTargetJobContext(ctx, jdText);
            const message = typeof buildJdSubmissionText === 'function'
                ? buildJdSubmissionText(jdText, ctx)
                : jdText;
            const response = await this.chat(message, []);
            return response;
        } catch (error) {
            console.error('JD submission error:', error);
            throw error;
        }
    }

    /**
     * Generate a generic target JD when user has no specific job posting
     */
    async generateJobDescription(industry, experienceLevel, employerType = '') {
        try {
            if (!this.sessionId) {
                throw new Error('No active session');
            }
            if (!industry || !experienceLevel) {
                throw new Error('Please select industry and experience level');
            }

            await this.ensureBackendAvailable();
            if (this.useMockMode) {
                return this.mockService.generateJobDescription(this.sessionId, industry, experienceLevel, employerType || 'private');
            }

            const response = await this.client.post('/resume/generate-jd', {
                session_id: this.sessionId,
                industry: industry,
                experience_level: experienceLevel,
                employer_type: employerType,
            });

            return response.data;
        } catch (error) {
            console.error('JD generation error:', error);
            if (!error.response && !this.useMockMode) {
                this.enableMockMode();
                if (typeof Utils !== 'undefined') {
                    Utils.showToast('Backend unreachable — switched to demo mode');
                }
                return this.mockService.generateJobDescription(this.sessionId, industry, experienceLevel, employerType || 'private');
            }
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

            await this.ensureBackendAvailable();
            if (this.useMockMode) {
                return this.mockService.getResumeDraft(this.sessionId || 'mock_sess');
            }

            const params = {};
            if (this.sessionId) {
                params.session_id = this.sessionId;
            }

            const response = await this.client.get('/resume/draft', { params });
            return response.data;
        } catch (error) {
            if (error.response && error.response.status === 404) {
                throw new Error('404: Draft not found');
            }
            if (!error.response && !this.useMockMode) {
                this.enableMockMode();
                return this.mockService.getResumeDraft(this.sessionId);
            }
            throw this.handleError(error);
        }
    }

    /**
     * Persist resume edit draft to Redis (12h for logged-in users)
     */
    async saveResumeDraft(draft) {
        try {
            if (!this.sessionId) {
                throw new Error('No active session');
            }

            const payload = {
                ...draft,
                updated_at: new Date().toISOString(),
            };

            await this.ensureBackendAvailable();
            if (this.useMockMode) {
                return this.mockService.saveResumeDraft(this.sessionId, payload, this.isLoggedIn());
            }

            const response = await this.client.put('/resume/draft', {
                session_id: this.sessionId,
                draft: payload,
            });
            return response.data;
        } catch (error) {
            console.error('Save draft error:', error);
            if (!error.response && !this.useMockMode) {
                this.enableMockMode();
                return this.mockService.saveResumeDraft(this.sessionId, draft, this.isLoggedIn());
            }
            throw this.handleError(error);
        }
    }

    /**
     * Save resume to user account (MySQL) after explicit confirmation
     */
    async saveResumeToAccount() {
        try {
            if (!this.sessionId) {
                throw new Error('No active session');
            }
            if (!this.isLoggedIn()) {
                throw new Error('Please log in to save your resume to the website');
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
     * Generate profile-aware JD from job title only (user must confirm before optimize)
     */
    async generateJdFromTitle(jobTitle, targetContext = null) {
        try {
            if (!this.sessionId) {
                throw new Error('No active session');
            }
            const ctx = this._resolveTargetJobContext(targetContext, jobTitle);
            await this.ensureBackendAvailable();
            if (this.useMockMode) {
                return this.mockService.buildMockJd(ctx.industry || 'tech', ctx.experience_level || 'mid', ctx.employer_type || 'private');
            }
            const response = await this.client.post('/resume/generate-jd-from-title', {
                session_id: this.sessionId,
                job_title: jobTitle,
                industry: ctx.industryLabel || ctx.industry || '',
                employer_type: ctx.employer_type || '',
                experience_level: ctx.experienceLevelLabel || ctx.experience_level || '',
            });
            return response.data;
        } catch (error) {
            console.error('Generate JD from title error:', error);
            throw this.handleError(error);
        }
    }

    /**
     * Submit user answers from optimization dialog to enrich candidate profile
     */
    async submitOptimizationClarifications(answers) {
        if (!answers || !answers.length) return null;
        const lines = answers.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n');
        const message = [
            'Please incorporate the following clarifications into my candidate profile for resume optimization.',
            'These answers clarify my primary tech stack, project details, or role fit:',
            '',
            lines,
        ].join('\n');
        return this.submitProfileText(message);
    }

    /**
     * Submit candidate profile text — triggers profile_agent
     */
    async submitProfileText(profileText) {
        try {
            const response = await this.chat(profileText, []);
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
            const response = await this.chat(
                'Please analyze skill gaps and missing competencies between my profile and the target job.',
                []
            );
            return response;
        } catch (error) {
            console.error('Gap analysis error:', error);
            throw error;
        }
    }

    /**
     * Generate customized resume - triggers content_agent + render_agent
     */
    async generateResume(instruction = 'Please generate a customized resume based on my experience and target position. Keep all content within one A4 page.', targetContext = null) {
        try {
            await this.syncTargetJobContext(targetContext);
            const fullInstruction = this._appendTargetContextToInstruction(instruction, targetContext);
            const response = await this.chat(fullInstruction, []);
            return response;
        } catch (error) {
            console.error('Resume generation error:', error);
            throw error;
        }
    }

    /**
     * Get current resume HTML
     */
    async getResumeHtml() {
        try {
            if (!this.sessionId) {
                throw new Error('No active session');
            }

            await this.ensureBackendAvailable();
            if (this.useMockMode) {
                return this.mockService.getResumeHtml(this.sessionId);
            }

            const response = await this.client.get('/resume/html', {
                params: { session_id: this.sessionId },
            });

            return response.data;
        } catch (error) {
            console.error('Get resume HTML error:', error);
            if (!error.response && !this.useMockMode) {
                this.enableMockMode();
                return this.mockService.getResumeHtml(this.sessionId);
            }
            throw error;
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
            if (this.useMockMode) {
                return this.mockService.getLanguageChecklist(this.sessionId, targetLanguage);
            }

            const response = await this.client.put('/resume/language', {
                session_id: this.sessionId,
                target_language: targetLanguage,
            });

            return response.data;
        } catch (error) {
            console.error('Set resume language error:', error);
            if (!error.response && !this.useMockMode) {
                this.enableMockMode();
                return this.mockService.getLanguageChecklist(this.sessionId, targetLanguage);
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
                throw new Error('No active session');
            }

            await this.ensureBackendAvailable();
            if (this.useMockMode) {
                return this.mockService.getLanguageChecklist(this.sessionId, language);
            }

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
            if (!error.response && !this.useMockMode) {
                this.enableMockMode();
                return this.mockService.getLanguageChecklist(this.sessionId, language);
            }
            throw this.handleError(error);
        }
    }

    /**
     * Convert resume between Chinese and English
     */
    async translateResume(targetLanguage) {
        try {
            if (!this.sessionId) {
                throw new Error('No active session');
            }

            await this.ensureBackendAvailable();
            if (this.useMockMode) {
                return this.mockService.translateResume(this.sessionId, targetLanguage);
            }

            const response = await this.client.post('/resume/translate', {
                session_id: this.sessionId,
                target_language: targetLanguage,
            });

            return response.data;
        } catch (error) {
            console.error('Resume translation error:', error);
            if (!error.response && !this.useMockMode) {
                this.enableMockMode();
                return this.mockService.translateResume(this.sessionId, targetLanguage);
            }
            throw this.handleError(error);
        }
    }

    /**
     * Optimize resume content via chat (A4 one-page constraint)
     */
    async optimizeResume(instruction = 'Optimize my resume for the target job. Shorten content to fit one A4 page while keeping key achievements.', targetContext = null) {
        try {
            await this.syncTargetJobContext(targetContext);
            const fullInstruction = this._appendTargetContextToInstruction(instruction, targetContext);
            const response = await this.chat(fullInstruction, []);
            return response;
        } catch (error) {
            console.error('Resume optimization error:', error);
            throw error;
        }
    }

    /**
     * Render resume with custom instruction
     */
    async renderResume(renderInstruction) {
        try {
            if (!this.sessionId) {
                throw new Error('No active session');
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
     * Export resume in PDF / DOCX / JSON / Markdown
     */
    async exportResumeFormat(format = 'pdf') {
        try {
            if (!this.sessionId) {
                throw new Error('No active session');
            }

            await this.ensureBackendAvailable();
            const normalized = String(format || 'pdf').toLowerCase();

            if (this.useMockMode) {
                return this.mockService.exportResume(this.sessionId, normalized);
            }

            if (normalized === 'pdf') {
                const response = await this.client.post('/export/pdf', {
                    session_id: this.sessionId,
                }, { responseType: 'blob' });
                return response.data;
            }

            if (normalized === 'docx') {
                const response = await this.client.post('/export/docx', {
                    session_id: this.sessionId,
                }, { responseType: 'blob' });
                return response.data;
            }

            const exportFormat = normalized === 'md' ? 'markdown' : normalized;
            const response = await this.client.post('/export', {
                session_id: this.sessionId,
                format: exportFormat,
                target: 'resume',
            }, { responseType: 'blob' });
            return response.data;
        } catch (error) {
            console.error('Export resume error:', error);
            if (!error.response && !this.useMockMode) {
                this.enableMockMode();
                return this.mockService.exportResume(this.sessionId, format);
            }
            throw error;
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
     * Start interview session - triggers interview_agent (requires job, profile, resume in session)
     */
    async startInterviewSession(jobTitle, industry = '', tone = 'professional', targetContext = null) {
        try {
            const ctx = targetContext || (typeof collectTargetJobContext === 'function' ? collectTargetJobContext() : null);
            await this.syncTargetJobContext(ctx);
            const message = [
                'Please generate interview questions based on my job description, candidate profile, and resume content.',
                `Target role: ${jobTitle || ctx?.jd_text?.split('\n')[0] || 'target position'}.`,
                (ctx?.industryLabel || industry) ? `Industry: ${ctx?.industryLabel || industry}.` : '',
                ctx?.employerTypeLabel ? `Employer type: ${ctx.employerTypeLabel}.` : '',
                ctx?.experienceLevelLabel ? `Experience level: ${ctx.experienceLevelLabel}.` : '',
                `Interview tone: ${tone}.`,
            ].filter(Boolean).join(' ');
            const response = await this.chat(message, []);
            return response;
        } catch (error) {
            console.error('Interview session error:', error);
            throw error;
        }
    }

    /**
     * Submit answer and get feedback - triggers question_agent
     */
    async submitAnswer(questionId, answer) {
        try {
            const message = `Evaluate my answer to question ${questionId}: ${answer}`;
            const response = await this.chat(message, []);
            return response;
        } catch (error) {
            console.error('Submit answer error:', error);
            throw error;
        }
    }

    /**
     * Start interactive multi-turn mock interview
     */
    async startInteractiveInterview({ tone = 'professional', jobTitle = '', industry = '', maxRounds = 0, programVersion = 'quick', specializedFocus = '', targetContext = null } = {}) {
        try {
            if (!this.sessionId) {
                this.generateSessionId();
            }
            const ctx = targetContext || (typeof collectTargetJobContext === 'function' ? collectTargetJobContext() : null);
            await this.syncTargetJobContext(ctx);
            await this.ensureBackendAvailable();
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
     * Submit answer in interactive interview, get follow-up question
     */
    async submitInteractiveTurn(answer) {
        try {
            if (!this.sessionId) {
                throw new Error('No active session');
            }
            await this.ensureBackendAvailable();
            if (this.useMockMode) {
                return await this.mockService.submitInteractiveTurn(this.sessionId, answer);
            }
            const response = await this.client.post('/interview/interactive/turn', {
                session_id: this.sessionId,
                answer,
            });
            return response.data;
        } catch (error) {
            console.error('Submit interactive turn error:', error);
            throw error;
        }
    }

    /**
     * End interactive interview and generate debrief
     */
    async endInteractiveInterview(generateDebrief = true) {
        try {
            if (!this.sessionId) {
                throw new Error('No active session');
            }
            await this.ensureBackendAvailable();
            if (this.useMockMode) {
                return await this.mockService.endInteractiveInterview(this.sessionId, generateDebrief);
            }
            const response = await this.client.post('/interview/interactive/end', {
                session_id: this.sessionId,
                generate_debrief: generateDebrief,
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
                throw new Error('No active session');
            }
            if (!this.isLoggedIn()) {
                throw new Error('Please log in to save your mock interview to the website');
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
                throw new Error('Please log in to view saved mock interviews');
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
    }) {
        await this.ensureBackendAvailable();
        if (this.useMockMode) {
            throw new Error('Learning path requires a connected backend. Demo mode is not supported for this feature.');
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

            const skillsLine = currentSkills.length ? currentSkills.join(', ') : 'Not specified';
            const profileMessage = profileText || [
                'Here is my candidate profile for gap analysis.',
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

            const response = await this.chat(
                'Please analyze my skill gaps against the target job and recommend learning resources with estimated study hours. Do not generate a timeline yet.',
                []
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
    async generateLearningPathTimeline(dailyHours, targetContext = null) {
        await this.ensureBackendAvailable();
        if (this.useMockMode) {
            throw new Error('Learning path requires a connected backend. Demo mode is not supported for this feature.');
        }

        try {
            await this.syncTargetJobContext(targetContext);
            const response = await this.chat(
                `Generate my learning timeline with ${dailyHours} hours per day based on the analyzed gaps and resources.`,
                []
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
                throw new Error('No active session');
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
     * Save learning path plan to user account (MySQL)
     */
    async saveLearningPathToAccount(recordId = '') {
        try {
            if (!this.sessionId) {
                throw new Error('No active session');
            }
            if (!this.isLoggedIn()) {
                throw new Error('Please log in to save your learning path to the website');
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
                throw new Error('Please log in to view saved learning paths');
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
            const response = await axios.get(`${API_CONFIG.BASE_URL.replace('/api', '')}/health`, { timeout: 3000 });
            return response.data;
        } catch (error) {
            console.error('Health check error:', error);
            throw error;
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
            // Server responded with error status
            const status = error.response.status;
            const message = error.response.data?.detail || error.response.statusText;

            switch (status) {
                case 404:
                    return new Error('Resource not found. Please check your session ID.');
                case 500:
                    return new Error('Server error. Please try again later.');
                case 422:
                    return new Error('Invalid request. Please check your input.');
                default:
                    return new Error(`API error: ${message}`);
            }
        } else if (error.request) {
            // Request was made but no response
            return new Error('Network error. Please check your connection and ensure the backend is running.');
        } else {
            // Something else happened
            return new Error(error.message || 'An unexpected error occurred.');
        }
    }
}

// Create global API client instance
const apiClient = new APIClient();

// Utility functions
const Utils = {
    /**
     * Show toast notification
     */
    showToast(message, duration = 3000) {
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toast-message');

        if (toast && toastMessage) {
            toastMessage.textContent = message;
            toast.classList.remove('translate-y-20', 'opacity-0');
            toast.classList.add('translate-y-0', 'opacity-100');

            setTimeout(() => {
                toast.classList.remove('translate-y-0', 'opacity-100');
                toast.classList.add('translate-y-20', 'opacity-0');
            }, duration);
        }
    },

    /**
     * Show loading overlay
     */
    showLoading(message = 'Processing...') {
        const overlay = document.getElementById('loading-overlay');
        const messageEl = document.getElementById('loading-message');

        if (overlay) {
            if (messageEl) {
                messageEl.textContent = message;
            }
            overlay.classList.remove('hidden');
        }
    },

    /**
     * Hide loading overlay
     */
    hideLoading() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
        }
    },

    /**
     * Update session ID display
     */
    updateSessionDisplay(sessionId) {
        const sessionElements = document.querySelectorAll('#session-id');
        sessionElements.forEach(el => {
            if (el) {
                el.textContent = sessionId ? sessionId.substr(-8) : 'Not started';
            }
        });
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
