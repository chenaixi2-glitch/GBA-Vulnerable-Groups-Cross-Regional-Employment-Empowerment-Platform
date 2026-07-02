/**
 * GBA Platform - API Client
 * Handles all backend communication with automatic demo/mock fallback
 */

const API_CONFIG = {
    BASE_URL: (typeof window !== 'undefined' && window.GBA_API_BASE_URL)
        || `http://${(typeof window !== 'undefined' && window.location && window.location.hostname) || 'localhost'}:8000/api`,
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

function apiMsg(message) {
    if (message == null) return '';
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
            message: apiT('mock.timelineUpdatedDemo', 'Timeline updated (demo mode).'),
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

    gapPayload() {
        return alexChenMock().gaps;
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

    async chat(sessionId, message, attachments = []) {
        await this.delay();
        const response = this.baseResponse(sessionId);
        const msg = (message || '').toLowerCase();

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
            const versionMatch = message.match(/program version:\s*(quick|full|specialized)/i);
            const programVersion = versionMatch ? versionMatch[1].toLowerCase() : 'quick';
            const focusMatch = message.match(/specialized focus:\s*(technical|final_negotiation|resume_deep_dive)/i);
            const specializedFocus = focusMatch ? focusMatch[1].toLowerCase() : '';
            this.state.tone = tone;
            response.triggered_agents = ['interview_agent'];
            response.interview_qa = this.interviewPayload(tone, programVersion, specializedFocus);
            response.reply_message = `Generated ${response.interview_qa.length} staged interview questions (demo mode).`;
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
            const err = new Error('演示模式不支持服务端 PDF/DOCX，请连接后端或使用浏览器打印');
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
        const response = await this.chat(sessionId, messageMap[lang] || messageMap.zh, []);
        response.language = lang;
        response.language_checklist = this.buildMockChecklist(lang);
        return response;
    }

    async getLanguageChecklist(sessionId, language) {
        await this.delay(400);
        const checklist = this.buildMockChecklist(language);
        return { language: checklist.language, language_checklist: checklist };
    }

    buildMockJd(industry, experienceLevel, employerType = 'private', jdDraft = '') {
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

        const draftTitle = (jdDraft || '').split('\n')[0].trim();
        const jobTitle = draftTitle || `${industryLabel} Professional`;

        return {
            title: jobTitle,
            jd_text: [
                `Job Title: ${jobTitle}`,
                '',
                'Key Responsibilities:',
                `- Perform core duties for ${levelLabel.toLowerCase()} roles in the ${industryLabel.toLowerCase()} sector`,
                '- Collaborate with cross-functional and cross-border teams',
                '- Communicate clearly with stakeholders in English and Chinese contexts',
                '- Solve problems independently and improve processes continuously',
                '- Document work and share knowledge with teammates',
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
                '- Industry certifications or project portfolio (if applicable)',
            ].join('\n'),
        };
    }

    async generateJobDescription(sessionId, industry, experienceLevel, employerType = 'private', jdDraft = '') {
        await this.delay(1200);
        return this.buildMockJd(industry, experienceLevel, employerType, jdDraft);
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

    _syncMockModeIndicator() {
        if (typeof document === 'undefined') return;
        let banner = document.getElementById('gba-mock-mode-banner');
        if (!this.useMockMode) {
            banner?.remove();
            return;
        }
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'gba-mock-mode-banner';
            banner.className = 'fixed top-0 inset-x-0 z-[9998] bg-amber-500 text-white text-center text-sm py-2 px-4 shadow-md';
            banner.innerHTML = (
                '<strong>演示模式</strong>：后端未连接，简历解析会使用示例数据（Alex Chen），与上传文件无关。'
                + ' 请启动 backend 后刷新页面，或在控制台执行 <code class="bg-amber-600/40 px-1 rounded">localStorage.removeItem(\'gba_api_mock_mode\'); location.reload()</code>'
            );
            document.body.prepend(banner);
        }
    }

    _healthUrl() {
        return `${API_CONFIG.BASE_URL.replace('/api', '')}/health`;
    }

    async _probeBackendHealth() {
        try {
            await axios.get(this._healthUrl(), { timeout: API_CONFIG.HEALTH_TIMEOUT });
            return true;
        } catch (_) {
            return false;
        }
    }

    async ensureBackendAvailable() {
        if (this.backendChecked) {
            return !this.useMockMode;
        }
        this.backendChecked = true;

        const wasMockCached = localStorage.getItem(API_CONFIG.MOCK_MODE_KEY) === 'true';

        try {
            await axios.get(this._healthUrl(), { timeout: API_CONFIG.HEALTH_TIMEOUT });
            this.useMockMode = false;
            localStorage.removeItem(API_CONFIG.MOCK_MODE_KEY);
            this._syncMockModeIndicator();
            if (wasMockCached && typeof Utils !== 'undefined') {
                Utils.showToast(apiT('mock.backendRestored', 'Connected to live backend — please re-upload your resume to parse it'));
            }
            return true;
        } catch (error) {
            this.useMockMode = true;
            localStorage.setItem(API_CONFIG.MOCK_MODE_KEY, 'true');
            this._syncMockModeIndicator();
            console.warn('[API] Backend unavailable, using demo mode:', error.message);
            if (typeof Utils !== 'undefined') {
                Utils.showToast(apiT('mock.backendOfflineDemo', 'Backend offline — running in demo mode with sample data'));
            }
            return false;
        }
    }

    /**
     * Only enter global demo mode when the backend health check fails.
     * Avoids flipping to Alex Chen mock data after transient errors (e.g. draft save).
     */
    async _enableMockModeIfBackendDown(options = {}) {
        const { showToast = true } = options;
        const backendUp = await this._probeBackendHealth();
        if (backendUp) {
            return false;
        }
        this.enableMockMode();
        if (showToast && typeof Utils !== 'undefined') {
            Utils.showToast(apiT('mock.backendUnreachableDemo', 'Backend unreachable — switched to demo mode'));
        }
        return true;
    }

    enableMockMode() {
        this.useMockMode = true;
        this.backendChecked = true;
        localStorage.setItem(API_CONFIG.MOCK_MODE_KEY, 'true');
        this._syncMockModeIndicator();
    }

    disableMockMode() {
        this.useMockMode = false;
        this.backendChecked = false;
        localStorage.removeItem(API_CONFIG.MOCK_MODE_KEY);
        this._syncMockModeIndicator();
    }

    /**
     * Map site UI language (GBAI18n) to backend API language code.
     */
    getApiLanguage() {
        if (typeof window !== 'undefined' && window.GBAI18n && typeof GBAI18n.uiLangToApiLang === 'function') {
            return GBAI18n.uiLangToApiLang(GBAI18n.getLang());
        }
        return 'zh';
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

    /**
     * Main chat endpoint - unified entry point for all agents
     */
    async chat(message, attachments = [], options = {}) {
        const retryOnAccessDenied = options.retryOnAccessDenied !== false;
        const allowMockFallback = options.allowMockFallback !== false;
        try {
            this.ensureSessionStarted();

            await this.ensureBackendAvailable();
            if (this.useMockMode) {
                return this._applyChatResponseSession(
                    await this.mockService.chat(this.sessionId, message, attachments)
                );
            }

            const response = await this.client.post('/chat', {
                session_id: this.sessionId,
                message: message,
                attachments: attachments,
                language: this.getApiLanguage(),
            });

            return this._applyChatResponseSession(response.data);
        } catch (error) {
            console.error('Chat API error:', error);
            if (this._isSessionAccessError(error) && retryOnAccessDenied) {
                this.clearSession();
                this.generateSessionId();
                return this.chat(message, attachments, { retryOnAccessDenied: false, allowMockFallback });
            }
            if (allowMockFallback && this._shouldUseMockFallback(error)) {
                const switched = await this._enableMockModeIfBackendDown();
                if (switched) {
                    return this._applyChatResponseSession(
                        await this.mockService.chat(this.sessionId, message, attachments)
                    );
                }
            }
            throw this.handleError(error);
        }
    }

    _shouldUseMockFallback(error) {
        if (this.useMockMode) return false;
        if (!error.response) return true;
        const status = error.response.status;
        return status >= 500 || status === 408 || status === 429;
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
            ], { allowMockFallback: true });

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
     * Generate a suggested target JD from JD draft text, industry, employer type, and experience level
     */
    async generateJobDescription(industry, experienceLevel, employerType = '', jdDraft = '') {
        try {
            if (!this.sessionId) {
                throw new Error(apiT('errors.noActiveSession', 'No active session'));
            }
            if (!industry || !experienceLevel) {
                throw new Error(apiT('errors.selectIndustryLevel', 'Please select industry and experience level'));
            }

            await this.ensureBackendAvailable();
            if (this.useMockMode) {
                return this.mockService.generateJobDescription(this.sessionId, industry, experienceLevel, employerType || 'private', jdDraft);
            }

            const response = await this.client.post('/resume/generate-jd', {
                session_id: this.sessionId,
                industry: industry,
                experience_level: experienceLevel,
                employer_type: employerType,
                jd_draft: jdDraft || '',
            });

            return response.data;
        } catch (error) {
            console.error('JD generation error:', error);
            if (!error.response && !this.useMockMode && await this._enableMockModeIfBackendDown()) {
                return this.mockService.generateJobDescription(this.sessionId, industry, experienceLevel, employerType || 'private', jdDraft);
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
                throw new Error(apiT('errors.draftNotFound', '404: Draft not found'));
            }
            if (!error.response && !this.useMockMode) {
                console.warn('[API] Draft load failed, using local fallback:', error.message);
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
                throw new Error(apiT('errors.noActiveSession', 'No active session'));
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
                console.warn('[API] Draft save failed, keeping edits in local fallback:', error.message);
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
     * Generate profile-aware JD from job title only (user must confirm before optimize)
     */
    async generateJdFromTitle(jobTitle, targetContext = null) {
        try {
            if (!this.sessionId) {
                throw new Error(apiT('errors.noActiveSession', 'No active session'));
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
     * Sync session render language with current UI language (resume checklist / next generation).
     */
    async syncSessionLanguageFromUi() {
        if (!this.sessionId || this.useMockMode) {
            return null;
        }
        try {
            await this.ensureBackendAvailable();
            return await this.setResumeLanguage(this.getApiLanguage());
        } catch (error) {
            console.warn('Session language sync skipped:', error.message);
            return null;
        }
    }

    /**
     * Generate customized resume - triggers content_agent + render_agent
     */
    async generateResume(instruction = 'Please generate a customized resume based on my experience and target position. Keep all content within one A4 page.', targetContext = null) {
        try {
            await this.syncTargetJobContext(targetContext);
            await this.syncSessionLanguageFromUi();
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
                throw new Error(apiT('errors.noActiveSession', 'No active session'));
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
                console.warn('[API] Resume HTML fetch failed, using local fallback:', error.message);
                return this.mockService.getResumeHtml(this.sessionId);
            }
            throw error;
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
                console.warn('[API] Set resume language failed, using local checklist fallback:', error.message);
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
                throw new Error(apiT('errors.noActiveSession', 'No active session'));
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
                console.warn('[API] Language checklist failed, using local fallback:', error.message);
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
                throw new Error(apiT('errors.noActiveSession', 'No active session'));
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
            if (!error.response && !this.useMockMode && await this._enableMockModeIfBackendDown()) {
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
                    return new Error(typeof parsed.detail === 'string' ? parsed.detail : JSON.stringify(parsed.detail));
                }
                return new Error(text);
            } catch (_) {
                return new Error('导出失败，请稍后重试');
            }
        }
        if (error?.response?.status === 503) {
            const detail = error.response.data?.detail;
            return new Error(detail || 'PDF 导出服务暂不可用，请使用浏览器打印');
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

            if (this.useMockMode) {
                return this.mockService.exportResume(this.sessionId, normalized);
            }

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
            if (!error.response && !this.useMockMode && await this._enableMockModeIfBackendDown({ showToast: false })) {
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
    async startInterviewSession(jobTitle, industry = '', tone = 'professional', targetContext = null, programVersion = 'quick', specializedFocus = '') {
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
                `Program version: ${programVersion}.`,
                specializedFocus ? `Specialized focus: ${specializedFocus}.` : '',
            ].filter(Boolean).join(' ');
            const response = await this.chat(message, []);
            return response;
        } catch (error) {
            console.error('Interview session error:', error);
            throw error;
        }
    }

    /**
     * Generate reference answers for user-uploaded custom interview questions
     */
    async generateCustomInterviewAnswers(questions, targetContext = null) {
        try {
            if (!this.sessionId) {
                this.generateSessionId();
            }
            const ctx = targetContext || (typeof collectTargetJobContext === 'function' ? collectTargetJobContext() : null);
            await this.syncTargetJobContext(ctx);
            await this.ensureBackendAvailable();
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
                language: this.getApiLanguage(),
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
                language: this.getApiLanguage(),
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
                throw new Error(apiT('errors.noActiveSession', 'No active session'));
            }
            await this.ensureBackendAvailable();
            if (this.useMockMode) {
                return await this.mockService.submitInteractiveTurn(this.sessionId, answer);
            }
            const response = await this.client.post('/interview/interactive/turn', {
                session_id: this.sessionId,
                answer,
                language: this.getApiLanguage(),
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
                throw new Error(apiT('errors.noActiveSession', 'No active session'));
            }
            await this.ensureBackendAvailable();
            if (this.useMockMode) {
                return await this.mockService.endInteractiveInterview(this.sessionId, generateDebrief);
            }
            const response = await this.client.post('/interview/interactive/end', {
                session_id: this.sessionId,
                generate_debrief: generateDebrief,
                language: this.getApiLanguage(),
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
            throw new Error(apiT('errors.learningPathRequiresBackend', 'Learning path requires a connected backend. Demo mode is not supported for this feature.'));
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

            switch (status) {
                case 404:
                    return new Error(apiT('errors.notFound', 'Resource not found. Please check your session ID.'));
                case 500:
                    return new Error(apiT('errors.serverError', 'Server error. Please try again later.'));
                case 422:
                    return new Error(apiT('errors.invalidRequest', 'Invalid request. Please check your input.'));
                default:
                    return new Error(apiT('errors.apiError', 'API error: {detail}', { detail: mappedDetail }));
            }
        } else if (error.request) {
            return new Error(apiT('errors.networkError', 'Network error. Please check your connection and ensure the backend is running.'));
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
        }
    });
}

// Utility functions
const Utils = {
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
     * Show loading overlay
     */
    showLoading(message) {
        const overlay = document.getElementById('loading-overlay');
        const messageEl = document.getElementById('loading-message');
        const text = apiMsg(message || apiT('common.processing', 'Processing...'));

        if (overlay) {
            if (messageEl) {
                messageEl.textContent = text;
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
