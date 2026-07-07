// Mock API responses for demos — fixtures in test-data/mock/
function mockT(key, fallback, vars) {
    if (typeof window !== 'undefined' && window.GBAI18n && window.GBAI18n.t) {
        return window.GBAI18n.t(key, fallback, vars);
    }
    var s = fallback || key;
    if (vars && s) {
        Object.keys(vars).forEach(function (k) {
            s = String(s).replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
        });
    }
    return s;
}

function platformMockData() {
    if (typeof window !== 'undefined' && window.GBA_TEST_DATA && window.GBA_TEST_DATA.mock) {
        return window.GBA_TEST_DATA.mock;
    }
    if (typeof require !== 'undefined') {
        try {
            const td = require('./test-data/index.js');
            return {
                jobs: td.mock.jobs(),
                interviewQuestions: td.mock.interviewQuestions(),
                policyQa: td.mock.policyQa(),
                learningPathAliases: td.mock.learningPathAliases(),
                learningPaths: td.mock.learningPaths(),
            };
        } catch (_e) { /* browser without bundle */ }
    }
    throw new Error('Load test-data/browser-bundle.js before mock-api.js');
}

const API = {
    // Simulated network delay
    delay: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
    
    // AI resume optimization
    async optimizeResume(resumeData, options) {
        await this.delay(1500);
        
        return {
            success: true,
            data: {
                originalResume: resumeData,
                optimizedResume: {
                    ...resumeData,
                    skills: [
                        ...resumeData.skills,
                        "Patience",
                        "Communication",
                        "Crisis management",
                        "Team collaboration",
                        "Adaptability"
                    ],
                    experience: resumeData.experience.map(exp => ({
                        ...exp,
                        description:
                            exp.description +
                            " In this role I demonstrated strong problem-solving and teamwork."
                    })),
                    score: Math.floor(Math.random() * 20) + 80
                },
                suggestions: [
                    mockT('mock.optimizeSuggestion1', 'Highlighted your communication and teamwork impact'),
                    mockT('mock.optimizeSuggestion2', 'Surfaced patience and crisis-handling from your CS experience'),
                    mockT('mock.optimizeSuggestion3', 'Tightened job descriptions for clearer impact'),
                    mockT('mock.optimizeSuggestion4', 'Improved resume structure for easier scanning')
                ]
            }
        };
    },
    
    // AI job matching — 优先调用 Node 后端真实匹配 API
    async matchJobs(userProfile, filters) {
        try {
            const res = await this.nodeRequest('/jobs/matched?source=internal');
            if (res.success && res.data && Array.isArray(res.data.jobs)) {
                return {
                    success: true,
                    data: {
                        jobs: res.data.jobs.map(function (j) {
                            return {
                                id: j.id,
                                title: j.title,
                                company: j.company_name || j.department || mockT('mock.defaultJobCompany', 'Company job'),
                                location: j.location || '',
                                salary: j.salary || '',
                                type: 'Full-time',
                                skills: j.skills || [],
                                description: j.description || '',
                                matchScore: j.matchScore,
                                matchReasons: j.matchReasons || [],
                                target_group_types: j.target_group_types,
                                vulnerable_group_friendly: j.vulnerable_group_friendly,
                            };
                        }),
                        user_group_types: res.data.user_group_types || [],
                        has_resume: res.data.has_resume,
                    },
                };
            }
        } catch (e) {
            /* fallback to mock */
        }

        await this.delay(1200);
        
        const mockJobs = platformMockData().jobs;
        
        let filteredJobs = mockJobs;
        
        if (filters.keyword) {
            const keyword = filters.keyword.toLowerCase();
            filteredJobs = filteredJobs.filter(job => 
                job.title.toLowerCase().includes(keyword) || 
                job.company.toLowerCase().includes(keyword) ||
                job.description.toLowerCase().includes(keyword)
            );
        }
        
        if (filters.location && filters.location !== "Any" && filters.location !== "\u4E0D\u9650") {
            filteredJobs = filteredJobs.filter(job => job.location === filters.location);
        }
        
        if (filters.jobType && filters.jobType.length > 0) {
            filteredJobs = filteredJobs.filter(job => {
                if (filters.jobType.includes("Full-time") && job.type === "Full-time") return true;
                if (filters.jobType.includes("Part-time") && job.type === "Part-time") return true;
                if (filters.jobType.includes("Remote") && job.remote) return true;
                if (filters.jobType.includes("Flexible hours") && job.type === "Part-time") return true;
                if (filters.jobType.includes("Accessibility-friendly") && job.accessibility) return true;
                if (filters.jobType.includes("\u5168\u804C") && job.type === "Full-time") return true;
                if (filters.jobType.includes("\u517C\u804C") && job.type === "Part-time") return true;
                if (filters.jobType.includes("\u8FDC\u7A0B") && job.remote) return true;
                if (filters.jobType.includes("\u7075\u6D3B\u65F6\u95F4") && job.type === "Part-time")
                    return true;
                if (filters.jobType.includes("\u65E0\u969C\u788D") && job.accessibility) return true;
                return false;
            });
        }
        
        filteredJobs.sort((a, b) => b.matchScore - a.matchScore);
        
        return {
            success: true,
            data: {
                jobs: filteredJobs,
                total: filteredJobs.length
            }
        };
    },
    
    // AI interview coaching
    async interviewCoaching(resume, jobDescription, interviewStyle) {
        await this.delay(1000);
        
        const mockQuestions = platformMockData().interviewQuestions;
        
        const questions = mockQuestions[interviewStyle] || mockQuestions.professional;
        
        return {
            success: true,
            data: {
                interviewStyle,
                questions,
                tips: [
                    mockT('mock.interviewTip1', 'Stay confident; answer clearly and in order'),
                    mockT('mock.interviewTip2', 'Use STAR (Situation, Task, Action, Result) framing'),
                    mockT('mock.interviewTip3', 'Surface soft skills tied to this role'),
                    mockT('mock.interviewTip4', 'Prepare thoughtful questions about the company and sector')
                ]
            }
        };
    },
    
    // AI policy Q&A
    async policyQA(question) {
        await this.delay(800);
        
        const policySynonyms = platformMockData().policyQa;
        
        let matchedPolicy = null;
        const qLower = question.toLowerCase();
        outer: for (const entry of policySynonyms) {
            for (const k of entry.keys) {
                const needle = typeof k === "string" ? k.toLowerCase() : k;
                if (needle && (qLower.includes(needle.toLowerCase()) || question.includes(k))) {
                    matchedPolicy = entry.data;
                    break outer;
                }
            }
        }
        
        if (!matchedPolicy) {
            return {
                success: true,
                data: {
                    question,
                    answer: mockT('mock.policyFallbackAnswer', 'Thank you — your question spans specialised regulation. Confirm details with competent authorities or counsel. Topics this demo recognises in English or Mandarin include: cross-border social security transfers, IIT subsidies, disability employment levy rules, inclusive hiring subsidies, qualification recognition, and visa / work-authorisation pathways.'),
                    relatedTopics: policySynonyms.map((x) => x.data.question)
                }
            };
        }
        
        return {
            success: true,
            data: matchedPolicy
        };
    },
    
    // AI learning path (target role + proficiency band; optional free-text experience for UI / audit stubs)
    async learningPath(targetJob, skillLevel, experienceNotes) {
        await this.delay(1200);

        const learningPathJobAliases = platformMockData().learningPathAliases;
        const resolvedJob = learningPathJobAliases[targetJob] || targetJob;

        const learningPaths = platformMockData().learningPaths;


        // Resolve job key and retrieve learning path
        const path = learningPaths[resolvedJob];
        if (!path) {
            return {
                success: false,
                message: mockT('mock.learningPathUnavailable', 'No learning path is available for that role in this demo.')
            };
        }
        
        // Skill level selects beginner/intermediate/advanced band
        let levelPath;
        if (skillLevel <= 2) {
            levelPath = path.beginner;
        } else if (skillLevel <= 4) {
            levelPath = path.intermediate;
        } else {
            levelPath = path.advanced;
        }
        
        return {
            success: true,
            data: {
                targetJob,
                skillLevel,
                experienceNotes: experienceNotes != null ? String(experienceNotes).trim() : '',
                learningPath: levelPath
            }
        };
    },
    
    // AI skill assessment (demo)
    async skillAssessment(userProfile) {
        await this.delay(1000);

        return {
            success: true,
            data: {
                overallScore: Math.floor(Math.random() * 20) + 70,
                skillScores: {
                    Communication: Math.floor(Math.random() * 30) + 70,
                    Teamwork: Math.floor(Math.random() * 30) + 70,
                    "Problem solving": Math.floor(Math.random() * 30) + 70,
                    Learnability: Math.floor(Math.random() * 30) + 70,
                    Adaptability: Math.floor(Math.random() * 30) + 70,
                    "Role-specific expertise": Math.floor(Math.random() * 30) + 70,
                    Creativity: Math.floor(Math.random() * 30) + 70,
                    "Time management": Math.floor(Math.random() * 30) + 70
                },
                strengths: [
                    mockT('mock.skillStrength1', 'Communication and collaboration read as signature strengths — great for stakeholder-heavy roles.'),
                    mockT('mock.skillStrength2', 'You onboard new concepts quickly, which lowers ramp time for rotations.'),
                    mockT('mock.skillStrength3', 'You stay productive when priorities shift mid-sprint.')
                ],
                improvementAreas: [
                    mockT('mock.skillImprove1', 'Deepen tooling or certifications tied to your target JD.'),
                    mockT('mock.skillImprove2', 'Stretch creative judgement with cross-functional critiques.'),
                    mockT('mock.skillImprove3', 'Layer structured time-blocking on top of your natural hustle.')
                ],
                recommendedJobs: [
                    {
                        title: mockT('mock.jobRecommend1Title', 'E-commerce Customer Service'),
                        matchScore: Math.floor(Math.random() * 15) + 80,
                        reason: mockT('mock.jobRecommend1Reason', 'Patience + clarity map exceptionally well to frontline CS KPIs.')
                    },
                    {
                        title: mockT('mock.jobRecommend2Title', 'Data Annotator'),
                        matchScore: Math.floor(Math.random() * 15) + 75,
                        reason: mockT('mock.jobRecommend2Reason', 'Detail orientation shines for precision labelling workloads.')
                    },
                    {
                        title: mockT('mock.jobRecommend3Title', 'Content Moderator'),
                        matchScore: Math.floor(Math.random() * 15) + 70,
                        reason: mockT('mock.jobRecommend3Reason', 'Balanced judgement helps keep community policies consistent.')
                    }
                ]
            }
        };
    },

    // AI voice assistant (keyword demo)
    async voiceAssistant(query, userId) {
        await this.delay(600);

        const q = query || '';
        const ql = q.toLowerCase();

        const bundles = [
            {
                phrases: [/optimize .*resume|resume optimization|better cv|\u4f18\u5316\u7b80\u5386/i],
                data: {
                    text: mockT('mock.oliviaResumeText', 'Lead with measurable wins, tune keywords to each role, and keep layout scannable. Upload your draft to our AI resume coach for targeted rewrites.'),
                    actions: [
                        {
                            type: "button",
                            text: mockT('mock.oliviaResumeBtn', 'Open resume coach'),
                            action: "open_modal",
                            modal: "resume-optimize"
                        }
                    ]
                }
            },
            {
                phrases: [/customer service job|support role|live chat agent|\u67e5\u627e\u5ba2\u670d/i],
                data: {
                    text: mockT('mock.oliviaJobsText', 'Blind-review friendly CS roles—including cross-border e-commerce desks—often mix remote shifts with coaching. Dive into curated matches tailored to accessibility needs.'),
                    actions: [
                        {
                            type: "button",
                            text: mockT('mock.oliviaJobsBtn', 'View matches'),
                            action: "open_modal",
                            modal: "job-match"
                        }
                    ]
                }
            },
            {
                phrases: [/social security|mandatory contributions|\u793e\u4fdd|\u8de8\u5883/i],
                data: {
                    text: mockT('mock.oliviaPolicyText', 'Hong Kong and Macau hires in mainland GBA cities can participate in—or later transfer—mainland social programmes. Officials need contribution histories from both municipalities.'),
                    actions: [
                        {
                            type: "button",
                            text: mockT('mock.oliviaPolicyBtn', 'Open policy briefing'),
                            action: "open_modal",
                            modal: "policy-qa",
                            params: { question: "Cross-border social security transfer" }
                        }
                    ]
                }
            },
            {
                phrases: [/mock interview|practice interview|\u9762\u8bd5|\u6a21\u62df/i],
                data: {
                    text: mockT('mock.oliviaInterviewText', 'Pick warm, neutral, or stress interview personas. Olivia builds question packs from your resume + JD then shares rubric-aligned feedback afterwards.'),
                    actions: [
                        {
                            type: "button",
                            text: mockT('mock.oliviaInterviewBtn', 'Start mock interview'),
                            action: "open_modal",
                            modal: "interview-coach"
                        }
                    ]
                }
            }
        ];

        for (const bundle of bundles) {
            const hit = bundle.phrases.some((p) =>
                typeof p === "string" ? ql.includes(String(p).toLowerCase()) : p.test(q)
            );
            if (hit) {
                return { success: true, data: bundle.data };
            }
        }

        return {
            success: true,
            data: {
                text: mockT('mock.oliviaDefaultText', "Hi — I'm Olivia, your bilingual cross-border careers copilot. Ask about CV upgrades, equitable job discovery, subsidies, visas, or interview drills."),
                actions: [
                    {
                        type: "button",
                        text: mockT('mock.oliviaDefaultResumeBtn', 'Resume help'),
                        action: "open_modal",
                        modal: "resume-optimize"
                    },
                    {
                        type: "button",
                        text: mockT('mock.oliviaDefaultJobsBtn', 'Job matches'),
                        action: "open_modal",
                        modal: "job-match"
                    },
                    {
                        type: "button",
                        text: mockT('mock.oliviaDefaultPolicyBtn', 'Policy Q&A'),
                        action: "open_modal",
                        modal: "policy-qa"
                    }
                ]
            }
        };
    },

    PORTALS: Object.freeze({
        individual: Object.freeze({
            staticEntry: 'individual/index.html',
            pathname: '/individual/'
        }),
        corporate: Object.freeze({
            staticEntry: 'corporate/index.html',
            pathname: '/corporate/'
        })
    }),

    PORTAL_SESSION_KEY: 'gba_portal_role',

    normalizePortalRole(dataRoleOrPortal) {
        if (!dataRoleOrPortal) return 'individual';
        if (dataRoleOrPortal === 'company' || dataRoleOrPortal === 'corporate') return 'corporate';
        return 'individual';
    },

    persistPortal(roleOrPortal) {
        try {
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem(this.PORTAL_SESSION_KEY, this.normalizePortalRole(roleOrPortal));
            }
        } catch (e) {
            /* ignore unavailable storage */
        }
    },

    loadPersistedPortal() {
        try {
            if (typeof sessionStorage !== 'undefined') {
                const v = sessionStorage.getItem(this.PORTAL_SESSION_KEY);
                if (v === 'individual' || v === 'corporate') return v;
            }
        } catch (e) {}
        return null;
    },

    portalEntryHref(roleOrPortal) {
        return this.PORTALS[this.normalizePortalRole(roleOrPortal)].staticEntry;
    },

    AUTH_SESSION_KEY: 'gba_auth_user',
    AUTH_TOKEN_KEY: 'gba_auth_token',

    nodeApiBase() {
        const g = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : {});
        if (typeof g.resolveNodeApiBase === 'function') {
            return g.resolveNodeApiBase();
        }
        const host = (typeof location !== 'undefined' && location.hostname) || 'localhost';
        if (host === 'localhost' || host === '127.0.0.1') {
            return `http://${host}:3000/api`;
        }
        if (typeof location !== 'undefined' && location.origin) {
            return `${location.origin}/api`;
        }
        return `http://${host}:3000/api`;
    },

    saveAuthToken(token) {
        try {
            if (typeof localStorage !== 'undefined' && token) {
                localStorage.setItem(this.AUTH_TOKEN_KEY, token);
            }
        } catch (e) { /* ignore */ }
    },

    getAuthToken() {
        try {
            if (typeof localStorage !== 'undefined') {
                const t = localStorage.getItem(this.AUTH_TOKEN_KEY);
                if (t) return t;
                const session = this.getAuthSession();
                return session && session.token ? session.token : null;
            }
        } catch (e) { /* ignore */ }
        return null;
    },

    emailToUsername(email) {
        if (typeof AuthAPI !== 'undefined' && AuthAPI.emailToUsername) {
            return AuthAPI.emailToUsername(email);
        }
        const e = String(email || '').trim().toLowerCase();
        const sanitized = e
            .replace(/@/g, '_at_')
            .replace(/[^a-z0-9_]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
        return (sanitized || 'user').slice(0, 50);
    },

    async nodeRequest(path, options) {
        const headers = Object.assign({ 'Content-Type': 'application/json' }, (options && options.headers) || {});
        const token = this.getAuthToken();
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(`${this.nodeApiBase()}${path}`, Object.assign({}, options, { headers }));
        const data = await res.json().catch(function () { return {}; });
        if (!res.ok) {
            return { success: false, message: data.message || `HTTP ${res.status}`, data: data };
        }
        return Object.assign({ success: true }, data);
    },

    getAuthSession() {
        try {
            if (typeof localStorage !== 'undefined') {
                const raw = localStorage.getItem(this.AUTH_SESSION_KEY);
                if (!raw) return null;
                return JSON.parse(raw);
            }
        } catch (e) {
            /* ignore */
        }
        return null;
    },

    saveAuthSession(user) {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(this.AUTH_SESSION_KEY, JSON.stringify(user));
            }
        } catch (e) {
            /* ignore */
        }
    },

    clearAuthSession() {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.removeItem(this.AUTH_SESSION_KEY);
            }
        } catch (e) {
            /* ignore */
        }
    },

    async login(identifier, password, portalHint) {
        if (typeof AuthAPI !== 'undefined') {
            return AuthAPI.login(identifier, password, portalHint);
        }
        const id = String(identifier || '').trim();
        if (!id || !password) {
            return { success: false, message: mockT('auth.errors.fillRequired', 'Please fill all required fields.') };
        }
        if (String(password).length < 6) {
            return { success: false, message: mockT('auth.errors.passwordMin', 'Password must be at least 6 characters.') };
        }

        const expectedPortal = this.normalizePortalRole(portalHint);
        const expectedRole = expectedPortal === 'corporate' ? 'corporate' : 'individual';

        try {
            const nodeRes = await this.nodeRequest('/auth/login', {
                method: 'POST',
                body: JSON.stringify({
                    identifier: id,
                    password: password,
                    expected_role: expectedRole,
                }),
            });
            if (nodeRes.success && nodeRes.data) {
                const u = nodeRes.data.user;
                if (u.role !== 'admin' && u.role !== expectedRole) {
                    return {
                        success: false,
                        message:
                            expectedRole === 'corporate'
                                ? mockT('auth.errors.wrongPortalCorporate', 'This is an individual account. Please log in on the individual portal.')
                                : mockT('auth.errors.wrongPortalIndividual', 'This is a corporate account. Please log in on the corporate portal.'),
                    };
                }
                const portal = this.normalizePortalRole(portalHint || u.role);
                const session = {
                    email: u.email,
                    displayName: u.full_name || u.username,
                    portal: portal,
                    role: u.role,
                    group_types: u.group_types || [],
                    token: nodeRes.data.token,
                    loginAt: new Date().toISOString(),
                };
                this.saveAuthSession(session);
                this.saveAuthToken(nodeRes.data.token);
                return { success: true, data: session };
            }
            return { success: false, message: nodeRes.message || mockT('auth.errors.loginFailed', 'Login failed') };
        } catch (e) {
            return { success: false, message: mockT('auth.errors.networkDetailed', 'Cannot reach auth service. Ensure the backend is running.') };
        }
    },

    async register(identifier, password, portalHint, displayNameOptional, profileOptional) {
        if (typeof AuthAPI !== 'undefined') {
            return AuthAPI.register(identifier, password, portalHint, displayNameOptional, profileOptional);
        }
        const id = String(identifier || '').trim();
        if (!id || !password) {
            return { success: false, message: mockT('auth.errors.fillRequired', 'Please fill all required fields.') };
        }
        if (String(password).length < 6) {
            return { success: false, message: mockT('auth.errors.passwordMin', 'Password must be at least 6 characters.') };
        }

        const portal = this.normalizePortalRole(portalHint);
        const role = portal === 'corporate' ? 'corporate' : 'individual';

        try {
            const body = {
                username: this.emailToUsername(id),
                email: id,
                password: password,
                role: role,
                full_name: String(displayNameOptional || '').trim() || null,
            };
            if (role === 'individual') {
                if (!profileOptional || profileOptional.age == null || !profileOptional.gender || profileOptional.current_income == null) {
                    return { success: false, message: mockT('auth.errors.completeProfileFields', 'Please complete age, gender and monthly income.') };
                }
                body.age = profileOptional.age;
                body.gender = profileOptional.gender;
                body.disability_type = profileOptional.disability_type || 'none';
                body.career_gap_years = profileOptional.career_gap_years != null ? profileOptional.career_gap_years : 0;
                body.current_income = profileOptional.current_income;
            }
            const nodeRes = await this.nodeRequest('/auth/register', {
                method: 'POST',
                body: JSON.stringify(body),
            });
            if (nodeRes.success && nodeRes.data) {
                const u = nodeRes.data.user;
                const session = {
                    email: u.email,
                    displayName: u.full_name || u.username,
                    portal: portal,
                    role: u.role,
                    group_types: u.group_types || [],
                    token: nodeRes.data.token,
                    loginAt: new Date().toISOString(),
                };
                this.saveAuthSession(session);
                this.saveAuthToken(nodeRes.data.token);
                return { success: true, data: session };
            }
            return { success: false, message: nodeRes.message || mockT('auth.errors.registerFailed', 'Registration failed') };
        } catch (e) {
            return { success: false, message: mockT('auth.errors.networkDetailed', 'Cannot reach auth service. Ensure the backend is running.') };
        }
    },


    async fetchHomeStats() {
        try {
            const res = await this.nodeRequest('/stats/home');
            if (res.success && res.data) {
                return { success: true, data: res.data };
            }
        } catch (e) { /* fallback */ }
        return {
            success: false,
            data: {
                individual_users: 0,
                companies: 0,
                active_jobs: 0,
                total_applications: 0,
                match_success_rate: null,
            },
        };
    },

    logout() {
        if (typeof AuthAPI !== 'undefined') {
            return AuthAPI.logout();
        }
        this.clearAuthSession();
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.removeItem(this.AUTH_TOKEN_KEY);
            }
        } catch (e) { /* ignore */ }
        return { success: true };
    }
};

// Export for Node.js contexts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
}

// Classic script: expose on window for inline handlers and devtools
if (typeof window !== 'undefined') {
    window.API = API;
}