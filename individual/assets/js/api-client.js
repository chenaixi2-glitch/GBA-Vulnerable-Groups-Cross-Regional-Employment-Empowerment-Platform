/**
 * GBA Platform - API Client
 * Handles all backend communication with automatic demo/mock fallback
 */

const API_CONFIG = {
    BASE_URL: (typeof window !== 'undefined' && window.GBA_API_BASE_URL) || 'http://localhost:8000/api',
    TIMEOUT: 120000,
    MOCK_MODE_KEY: 'gba_api_mock_mode',
};

const MOCK_SAMPLE_RESUME_HTML = `
<div style="font-family: Inter, Arial, sans-serif; max-width: 720px; margin: 0 auto; padding: 24px;">
  <h1 style="margin-bottom: 4px;">Alex Chen</h1>
  <p style="color: #555;">alex.chen@example.com | +852 9123 4567 | Hong Kong</p>
  <h2 style="margin-top: 24px; border-bottom: 1px solid #ddd;">Professional Summary</h2>
  <p>Customer-focused professional with cross-border e-commerce experience and strong communication skills, ready for GBA opportunities.</p>
  <h2 style="margin-top: 24px; border-bottom: 1px solid #ddd;">Experience</h2>
  <p><strong>Customer Service Specialist</strong> — Global E-Trade Co. (2021–Present)</p>
  <ul>
    <li>Handled 80+ daily inquiries across English and Cantonese channels</li>
    <li>Improved first-response resolution rate by 18% through knowledge-base updates</li>
    <li>Coordinated with logistics teams on cross-border order issues</li>
  </ul>
  <h2 style="margin-top: 24px; border-bottom: 1px solid #ddd;">Skills</h2>
  <p>Customer service, Cross-border e-commerce, English/Cantonese, CRM tools, Problem solving</p>
</div>`;

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
        return {
            profile_basic: {
                name: 'Alex Chen',
                email: 'alex.chen@example.com',
                phone: '+852 9123 4567',
                city: 'Hong Kong',
            },
            materials: [],
            facts: [
                { id: 'fact_edu_1', type: 'education', content: '{"school":"City University of Hong Kong","major":"Business Administration","degree":"Bachelor","start_date":"2017-09","end_date":"2021-06"}', source_refs: [], updated_at: '' },
                { id: 'fact_skill_1', type: 'skill', content: 'Customer Service', source_refs: [], updated_at: '' },
                { id: 'fact_skill_2', type: 'skill', content: 'English', source_refs: [], updated_at: '' },
                { id: 'fact_skill_3', type: 'skill', content: 'Cantonese', source_refs: [], updated_at: '' },
                { id: 'fact_skill_4', type: 'skill', content: 'E-commerce', source_refs: [], updated_at: '' },
                { id: 'fact_intern_1', type: 'internship', content: '{"title":"Customer Service Specialist","company":"Global E-Trade Co.","start_date":"2021-01","end_date":"Present","achievements":"Handled 80+ daily inquiries; improved first-response resolution by 18%."}', source_refs: [], updated_at: '' },
                { id: 'fact_project_1', type: 'project', content: '{"title":"Knowledge Base Refresh","role":"Lead","achievements":"Updated CS FAQ articles for cross-border orders."}', source_refs: [], updated_at: '' },
            ],
        };
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
        return {
            records: [
                {
                    id: 'iis_mock_1',
                    session_id: 'mock_sess',
                    job_title: 'Customer Service Specialist',
                    industry: 'ecommerce',
                    tone: 'professional',
                    overall_score: 76,
                    round_count: 4,
                    saved_at: new Date().toISOString(),
                },
            ],
        };
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
        return {
            records: [
                {
                    id: 'lpp_mock_1',
                    session_id: 'mock_sess',
                    target_job: 'Software Engineer',
                    industry: 'tech',
                    estimated_total_hours: 120,
                    daily_hours: 2,
                    estimated_weeks: 9,
                    phase_count: 3,
                    saved_at: new Date().toISOString(),
                },
            ],
        };
    }

    profilePayload() {
        return {
            meta: { version: 1, content_hash: 'mock_profile_v1' },
            basics: {
                name: 'Alex Chen',
                email: 'alex.chen@example.com',
                phone: '+852 9123 4567',
                location: 'Hong Kong',
            },
            summary: 'Experienced customer service professional seeking GBA cross-border roles.',
            skills: ['Customer Service', 'English', 'Cantonese', 'E-commerce', 'CRM'],
            experience: [{
                company: 'Global E-Trade Co.',
                title: 'Customer Service Specialist',
                start_date: '2021-01',
                end_date: 'Present',
                highlights: ['Resolved cross-border order issues', 'Maintained 95% CSAT'],
            }],
        };
    }

    gapPayload() {
        return [
            { type: 'missing_skill', description: 'Advanced Excel / data reporting', severity: 'medium', suggestion: 'Complete a short Excel for business course' },
            { type: 'missing_skill', description: 'Cross-border payment workflows', severity: 'high', suggestion: 'Study marketplace settlement and refund policies' },
            { type: 'experience_gap', description: 'Live chat SLA metrics', severity: 'low', suggestion: 'Practice timed response drills' },
        ];
    }

    interviewPayload(tone = 'professional') {
        const sets = {
            professional: [
                { id: 'q_1', question: 'Describe your customer service experience in cross-border e-commerce.', category: 'Behavioral', answer: 'Use STAR: situation, task, action, result with metrics.' },
                { id: 'q_2', question: 'How would you handle an angry customer whose order is delayed overseas?', category: 'Situational', answer: 'Acknowledge, empathize, investigate, propose solution, follow up.' },
                { id: 'q_3', question: 'What CRM tools have you used and how did they improve your workflow?', category: 'Technical', answer: 'Name tools, describe ticket tagging, macros, and reporting.' },
            ],
            friendly: [
                { id: 'q_1', question: 'Tell me a bit about yourself and what excites you about this role.', category: 'Behavioral', answer: 'Keep it concise and role-relevant.' },
                { id: 'q_2', question: 'What kind of team environment helps you do your best work?', category: 'Culture', answer: 'Collaboration, clear goals, supportive feedback.' },
            ],
            cold: [
                { id: 'q_1', question: 'Why should we hire you over other candidates?', category: 'Pressure', answer: 'Lead with proven outcomes and role fit.' },
                { id: 'q_2', question: 'Describe a time you made a serious mistake. What happened?', category: 'Behavioral', answer: 'Own it, explain fix, show learning.' },
            ],
        };
        return sets[tone] || sets.professional;
    }

    _mockInteractiveFollowUps() {
        return [
            {
                brief_feedback: '回答结构清晰，但缺少具体数据和成果量化。',
                follow_up_type: 'follow_up',
                interviewer_message: '你刚才提到的项目中，你个人的核心贡献是什么？有没有可以量化的结果？',
                category: '项目实操与问题解决',
            },
            {
                brief_feedback: '案例选择恰当，体现了岗位相关能力。',
                follow_up_type: 'new_topic',
                interviewer_message: '你为什么选择申请这个岗位？对我们公司和这个职位有什么了解？',
                category: '岗位认知与求职动机',
            },
            {
                brief_feedback: '动机表达真诚，可再补充对业务的理解。',
                follow_up_type: 'new_topic',
                interviewer_message: '请描述一次你在高压环境下处理紧急问题的经历。',
                category: '压力应变与短板复盘',
            },
        ];
    }

    async startInteractiveInterview(sessionId, tone, jobTitle, industry, maxRounds) {
        await this.delay(1200);
        const opening = tone === 'pressure'
            ? '你好，我是今天的面试官。时间有限，我们直接开始——请用两分钟做一个自我介绍，突出与岗位最相关的经历。'
            : tone === 'friendly'
                ? '你好！很高兴今天能和你交流。先轻松介绍一下自己吧，说说你的背景和为什么对这个岗位感兴趣。'
                : '你好，欢迎参加本次模拟面试。请先做一个简短的自我介绍，重点介绍与目标岗位相关的经历与能力。';

        const session = {
            status: 'active',
            tone,
            job_title: jobTitle,
            industry,
            max_rounds: maxRounds,
            round_count: 1,
            turns: [{
                id: 'turn_open',
                role: 'interviewer',
                content: opening,
                turn_type: 'opening',
                category: '简历深挖与个人经历',
                round: 1,
                created_at: new Date().toISOString(),
            }],
            debrief: null,
            started_at: new Date().toISOString(),
            ended_at: '',
            latest_interviewer_message: opening,
            latest_brief_feedback: '',
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
            response.resume_html = { html: MOCK_SAMPLE_RESUME_HTML, version: 1 };
            response.reply_message = 'Customized resume generated (demo mode).';
            return response;
        }

        if (msg.includes('translate') || msg.includes('convert to chinese') || msg.includes('convert to english') || msg.includes('中文') || msg.includes('英文')) {
            this.state.hasResume = true;
            const isEn = /english|英文|en/i.test(message);
            const html = isEn ? MOCK_SAMPLE_RESUME_HTML : `
<div style="font-family: 'Source Han Sans', sans-serif; max-width: 720px; margin: 0 auto; padding: 20px; font-size: 13px; line-height: 1.35;">
  <h1 style="margin-bottom: 4px;">陈晓 Alex Chen</h1>
  <p style="color: #555;">alex.chen@example.com | +852 9123 4567 | 香港</p>
  <h2 style="margin-top: 16px; border-bottom: 1px solid #ddd; font-size: 15px;">个人总结</h2>
  <p>具备跨境电商客服经验，擅长中英文沟通，熟悉大湾区就业场景。</p>
  <h2 style="margin-top: 16px; border-bottom: 1px solid #ddd; font-size: 15px;">实习经历</h2>
  <p><strong>环球电商 — 客服专员</strong>（2021.01 - 至今）</p>
  <ul><li>日均处理 80+ 跨境咨询，首响解决率提升 18%</li></ul>
  <h2 style="margin-top: 16px; border-bottom: 1px solid #ddd; font-size: 15px;">专业技能</h2>
  <p>客户服务、跨境电商、英语/粤语、CRM 工具</p>
</div>`;
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
        return { resume_html: { html: MOCK_SAMPLE_RESUME_HTML, version: 1 } };
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
        const isEn = language === 'en';
        const items = isEn
            ? [
                { id: 'en_linkedin', category: 'contact', label: 'LinkedIn', severity: 'recommended', message: 'English resume strongly recommends LinkedIn URL', suggestion: 'Add https://linkedin.com/in/yourname', missing: true },
                { id: 'en_summary', category: 'content', label: 'Professional Summary', severity: 'required', message: '3-4 line Professional Summary required', suggestion: 'Replace long 自我评价 with concise summary', missing: true },
                { id: 'en_no_photo', category: 'forbidden', label: 'No photo', severity: 'ok', message: 'Complies with US/UK/EU no-photo rule', suggestion: '', missing: false },
            ]
            : [
                { id: 'zh_photo', category: 'photo', label: '证件照', severity: 'recommended', message: '中文简历（国企/体制内）建议附正装证件照', suggestion: '白底/浅蓝底一寸照，放右上角', missing: true },
                { id: 'zh_age', category: 'contact', label: '年龄', severity: 'recommended', message: '国内常规简历建议注明年龄', suggestion: '在个人信息中补充', missing: true },
                { id: 'zh_summary', category: 'content', label: '自我评价', severity: 'recommended', message: '中文简历通常有自我评价', suggestion: '2-4句突出优势', missing: true },
            ];
        const missing = items.filter((i) => i.missing);
        return {
            language,
            language_label: isEn ? 'English Resume' : '中文简历',
            missing_count: missing.length,
            missing_items: missing,
            items,
            summary: isEn
                ? `English resume reminders: ${missing.length} recommended item(s) to add.`
                : `中文简历待补充提醒：建议补充 ${missing.length} 项。`,
        };
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
     * Submit job description and trigger jd_agent
     */
    async submitJobDescription(jdText) {
        try {
            const response = await this.chat(jdText, []);
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
    async generateResume(instruction = 'Please generate a customized resume based on my experience and target position. Keep all content within one A4 page.') {
        try {
            const response = await this.chat(instruction, []);
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
    async optimizeResume(instruction = 'Optimize my resume for the target job. Shorten content to fit one A4 page while keeping key achievements.') {
        try {
            const response = await this.chat(instruction, []);
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
     * Export resume as PDF
     */
    async exportResumePDF() {
        try {
            if (!this.sessionId) {
                throw new Error('No active session');
            }

            const response = await this.client.post('/export/pdf', {
                session_id: this.sessionId,
            }, {
                responseType: 'blob',
            });

            return response.data;
        } catch (error) {
            console.error('Export PDF error:', error);
            throw error;
        }
    }

    /**
     * Export resume as DOCX
     */
    async exportResumeDOCX() {
        try {
            if (!this.sessionId) {
                throw new Error('No active session');
            }

            const response = await this.client.post('/export/docx', {
                session_id: this.sessionId,
            }, {
                responseType: 'blob',
            });

            return response.data;
        } catch (error) {
            console.error('Export DOCX error:', error);
            throw error;
        }
    }

    /**
     * Start interview session - triggers interview_agent (requires job, profile, resume in session)
     */
    async startInterviewSession(jobTitle, industry = '', tone = 'professional') {
        try {
            const message = [
                'Please generate interview questions based on my job description, candidate profile, and resume content.',
                `Target role: ${jobTitle}.`,
                industry ? `Industry: ${industry}.` : '',
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
    async startInteractiveInterview({ tone = 'professional', jobTitle = '', industry = '', maxRounds = 10 } = {}) {
        try {
            if (!this.sessionId) {
                this.generateSessionId();
            }
            await this.ensureBackendAvailable();
            if (this.useMockMode) {
                return await this.mockService.startInteractiveInterview(this.sessionId, tone, jobTitle, industry, maxRounds);
            }
            const response = await this.client.post('/interview/interactive/start', {
                session_id: this.sessionId,
                tone,
                job_title: jobTitle,
                industry,
                max_rounds: maxRounds,
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
    async generateLearningPathAnalysis({ targetJob, currentRole = '', industry = '', currentSkills = [], profileText = '', jdText = '' }) {
        await this.ensureBackendAvailable();
        if (this.useMockMode) {
            throw new Error('Learning path requires a connected backend. Demo mode is not supported for this feature.');
        }

        try {
            const skillsLine = currentSkills.length ? currentSkills.join(', ') : 'Not specified';
            const profileMessage = profileText || [
                'Here is my candidate profile for gap analysis.',
                currentRole ? `Current role: ${currentRole}.` : '',
                `Current skills: ${skillsLine}.`,
                `Career goal: ${targetJob}.`,
            ].filter(Boolean).join(' ');

            await this.submitProfileText(profileMessage);

            const jobMessage = jdText || [
                `Job Title: ${targetJob}`,
                industry ? `Industry: ${industry}` : '',
                '',
                'Requirements:',
                '- Relevant technical and soft skills for this role',
                '- Industry experience and domain knowledge',
                '- Problem-solving and communication abilities',
            ].filter(Boolean).join('\n');

            await this.submitJobDescription(jobMessage);

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
    async generateLearningPathTimeline(dailyHours) {
        await this.ensureBackendAvailable();
        if (this.useMockMode) {
            throw new Error('Learning path requires a connected backend. Demo mode is not supported for this feature.');
        }

        try {
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
    async generateLearningPath({ targetJob, currentRole = '', industry = '', currentSkills = [], profileText = '', jdText = '' }) {
        return this.generateLearningPathAnalysis({ targetJob, currentRole, industry, currentSkills, profileText, jdText });
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
    module.exports = { APIClient, Utils, apiClient };
}
