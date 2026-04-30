// Mock API responses for demos
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
                    "Highlighted your communication and teamwork impact",
                    "Surfaced patience and crisis-handling from your CS experience",
                    "Tightened job descriptions for clearer impact",
                    "Improved resume structure for easier scanning"
                ]
            }
        };
    },
    
    // AI job matching
    async matchJobs(userProfile, filters) {
        await this.delay(1200);
        
        const mockJobs = [
            {
                id: 1,
                title: "Cross-border E-commerce Customer Service Specialist",
                company: "Global E-Trade Co., Ltd.",
                location: "Shenzhen",
                salary: "6K-8K",
                type: "Full-time",
                remote: true,
                accessibility: true,
                skills: ["Communication", "English", "Customer service", "Problem solving"],
                description:
                    "Handle international customer inquiries and provide product and after-sales support",
                matchScore: 92,
                matchReasons: [
                    "Your CS background aligns strongly with this role",
                    "Your English fits international support needs",
                    "Patience and communication are central to success here"
                ]
            },
            {
                id: 2,
                title: "Data Annotator",
                company: "Smart Tech Co., Ltd.",
                location: "Guangzhou",
                salary: "5K-7K",
                type: "Part-time",
                remote: true,
                accessibility: true,
                skills: ["Attention to detail", "Focus", "Basic computer skills"],
                description: "Label and review data for AI model training",
                matchScore: 88,
                matchReasons: [
                    "Your careful working style suits annotation work",
                    "Remote-friendly with flexible hours",
                    "Accessible workplace friendly to diverse candidates"
                ]
            },
            {
                id: 3,
                title: "Content Moderator",
                company: "New Media Tech Co., Ltd.",
                location: "Zhuhai",
                salary: "5.5K-7.5K",
                type: "Full-time",
                remote: false,
                accessibility: true,
                skills: ["Responsibility", "Judgment", "Basic computer skills"],
                description: "Review platform content and ensure compliance",
                matchScore: 85,
                matchReasons: [
                    "Strong sense of duty and judgment fits moderation",
                    "Company provides an accessible workspace",
                    "Stable schedule for those who need routine"
                ]
            },
            {
                id: 4,
                title: "Live Stream Assistant",
                company: "E-commerce Live Co., Ltd.",
                location: "Shenzhen",
                salary: "6K-8K",
                type: "Part-time",
                remote: false,
                accessibility: false,
                skills: ["Communication", "Adaptability", "Basic computer skills"],
                description: "Assist hosts during live sales and resolve on-air issues",
                matchScore: 80,
                matchReasons: [
                    "Communication and composure suit live commerce",
                    "Training provided — beginners welcome",
                    "Part-time with flexible scheduling"
                ]
            },
            {
                id: 5,
                title: "Operations Assistant",
                company: "Cross-border Commerce Co., Ltd.",
                location: "Hong Kong",
                salary: "8K-10K",
                type: "Full-time",
                remote: false,
                accessibility: true,
                skills: ["Data literacy", "Communication", "English", "Office productivity"],
                description:
                    "Support daily ops: metrics, coordination, campaign planning alongside the Ops lead",
                matchScore: 78,
                matchReasons: [
                    "English meets cross-border ops needs",
                    "Detail orientation supports operations workflows",
                    "Structured onboarding and training"
                ]
            }
        ];
        
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
        
        const mockQuestions = {
            professional: [
                "Describe your prior customer service experience, especially a complaint you resolved.",
                "How do you see the responsibilities of cross-border e-commerce CS?",
                "What do you understand about our product line?",
                "How would you handle language barriers with a caller?",
                "Tell me how you stay effective under high pressure."
            ],
            cold: [
                "Your resume looks average — why should we hire you?",
                "What serious mistake have you made in past roles?",
                "What would you say is your biggest weakness?",
                "How would you respond if a customer verbally abused you?",
                "Are you willing to work overtime or irregular shifts?"
            ],
            friendly: [
                "Briefly introduce yourself.",
                "What attracts you to our company?",
                "What role do you usually play on a team?",
                "Any hobbies or strengths outside work?",
                "How do you balance work and life?"
            ]
        };
        
        const questions = mockQuestions[interviewStyle] || mockQuestions.professional;
        
        return {
            success: true,
            data: {
                interviewStyle,
                questions,
                tips: [
                    "Stay confident; answer clearly and in order",
                    "Use STAR (Situation, Task, Action, Result) framing",
                    "Surface soft skills tied to this role",
                    "Prepare thoughtful questions about the company and sector"
                ]
            }
        };
    },
    
    // AI policy Q&A
    async policyQA(question) {
        await this.delay(800);
        
        const policySynonyms = [
            {
                keys: [
                    "cross-border social security",
                    "social security transfer",
                    "\u793E\u4FDD\u8F6C\u79FB",
                    "\u8DE8\u5883\u793E\u4FDD"
                ],
                data: {
                    question: "Cross-border social security transfer",
                    answer:
                        "Under Greater Bay Area (GBA) integration, HK and Macau residents employed in mainland GBA cities may participate in mainland social insurance. Returning to HK/Macau, they may retain or transfer coverage. Outline: (1) obtain contribution proof from the original bureau; (2) apply to the new bureau; (3) the new bureau coordinates transfer with the old one.",
                    steps: [
                        "Gather ID / travel permit and employment proof",
                        "Request a formal contribution record from your original bureau",
                        "Submit a transfer request to the new bureau",
                        "Allow review — often 15–30 business days",
                        "Upon approval your relationship formally transfers"
                    ]
                }
            },
            {
                keys: ["15%", "individual income tax subsidy", "\u7A0E\u8D39\u8865\u8D34"],
                data: {
                    question: "15% IIT subsidy for HK/Macau talents",
                    answer:
                        "Eligible overseas high-end and urgently-needed talents working in the GBA may receive a fiscal subsidy equal to IIT paid minus 15% of taxable income, for the Pearl River Delta municipalities. Typically tax-free itself. Applicants must qualify as recognised talent categories, earn income taxed in the GBA, and have no serious compliance violations.",
                    formula: "Subsidy = IIT paid − (Taxable income × 15%)",
                    example:
                        "Example: taxable income CN¥ 1m, IIT paid CN¥ 300k → subsidy ≈ 300k − 150k = 150k (illustrative only)."
                }
            },
            {
                keys: ["disability insurance fund", "employment quota", "\u6B8B\u4FDD\u91D1"],
                data: {
                    question: "Disability employment security fund exemptions",
                    answer:
                        "Employers generally must hire persons with disabilities at a minimum ratio of total headcount (often ~1.5%, varies locally). Meet or exceed the ratio to avoid assessments; otherwise pay into the security fund. Hiring PWD employees can also qualify for VAT relief, extra CIT deductions, etc.—rules vary—confirm with local Disabled Persons Federation or tax bureau.",
                    calculation:
                        "Annual levy basis ≈ (Headcount × required ratio − actual hires with disabilities) × average payroll (local formula applies)"
                }
            },
            {
                keys: ["employer subsidy", "hiring subsidy", "\u8D34"],
                data: {
                    question: "Employer hiring subsidies",
                    answer:
                        "GBA municipalities offer grants for inclusive hiring—typical pillars: onboarding incentives for underserved groups; training subsidies for skills programmes; partial social-premium rebates; incubator or base rent support. Processes usually include filings, audits, publicity, payout.",
                    requiredMaterials: [
                        "Business licence copy",
                        "Tax registration certificate copy",
                        "Unified org code certificate (historical filings)",
                        "Roster of hires under the programme",
                        "Signed labour contracts copies",
                        "Payroll evidence",
                        "Social insurance contribution proof",
                        "Disability certificate or equivalent supporting proof"
                    ]
                }
            },
            {
                keys: ["qualification recognition", "professional recognition", "\u8D44\u8D28", "\u4E92\u8BA4"],
                data: {
                    question: "Cross-border professional recognition",
                    answer:
                        "The GBA is expanding mutual recognition of qualifications in construction, healthcare, education, accounting, and more. Examples: HK architects/engineers may practice on the mainland via streamlined routes; doctors and teachers may serve in qualified facilities. Scope and tests differ by sector—check professional bodies and regulators.",
                    recognizedFields: [
                        "Built environment: architects, engineers",
                        "Healthcare: doctors, nurses",
                        "Education: teachers, professors",
                        "Accounting: CPAs, auditors",
                        "Legal: limited-scope practice arrangements"
                    ]
                }
            },
            {
                keys: ["visa", "work permit", "residence permit", "\u7B7E\u8BC1"],
                data: {
                    question: "Visas / work permits for HK & Macau residents",
                    answer:
                        "HK residents usually need a Home Return Permit (Mainland Travel Permit) for mainland mobility; Macau residents may use passports or relevant travel permits. Long-term mainland employment additionally requires compliant work/residence permits — consult PSB exit-entry offices for timelines and dossiers.",
                    requiredDocuments: [
                        "Valid ID / travel permits or passport",
                        "Job offer letter or sponsor invitation",
                        "Medical clearance",
                        "Criminal-record certificate where required",
                        "Recent biography photo",
                        "Completed official application forms"
                    ]
                }
            }
        ];
        
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
                    answer:
                        "Thank you — your question spans specialised regulation. Confirm details with competent authorities or counsel. Topics this demo recognises in English or Mandarin include: cross-border social security transfers, IIT subsidies, disability employment levy rules, inclusive hiring subsidies, qualification recognition, and visa / work-authorisation pathways.",
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

        const learningPathJobAliases = {
            "\u7535\u5546\u5ba2\u670d": "E-commerce Customer Service",
            "\u6570\u636e\u6807\u6ce8\u5e08": "Data Annotator",
            "\u76f4\u64ad\u52a9\u7406": "Live Stream Assistant"
        };
        const resolvedJob = learningPathJobAliases[targetJob] || targetJob;

        const learningPaths = {
            "E-commerce Customer Service": {
                beginner: {
                    modules: [
                        {
                            title: "E-commerce fundamentals",
                            courses: [
                                "Marketplace landscape (Taobao, JD, Amazon, etc.)",
                                "CS representative scope and duties",
                                "Key retail and CS vocabulary"
                            ],
                            duration: "1 week",
                            resources: ["Video lessons", "Drills", "Knowledge base"]
                        },
                        {
                            title: "Communication skills",
                            courses: [
                                "Principles of concise support communication",
                                "Active listening frameworks",
                                "Empathy and clarity under stress"
                            ],
                            duration: "1 week",
                            resources: ["Role plays", "Scripts", "Peer review"]
                        },
                        {
                            title: "Customer service delivery",
                            courses: [
                                "Diagnosing shopper intent",
                                "Escalation paths and issue ownership",
                                "Returns, refunds, and SLA basics"
                            ],
                            duration: "2 weeks",
                            resources: ["Simulators", "Coach feedback", "QA scorecards"]
                        },
                        {
                            title: "Operations tooling",
                            courses: [
                                "Order lifecycle in OMS/CRM",
                                "Coordinating fulfilment and logistics views",
                                "Internal documentation hygiene"
                            ],
                            duration: "1 week",
                            resources: ["Screen recordings", "Checklists", "Assessments"]
                        }
                    ],
                    certificate: "E-commerce CS Foundations",
                    jobOpportunities: ["Junior CS agent", "Omni-channel associate", "Aftercare specialist"]
                },
                intermediate: {
                    modules: [
                        {
                            title: "Advanced communication",
                            courses: ["High-stakes callers", "Stress regulation", "Cross-cultural nuance"],
                            duration: "1 week",
                            resources: ["Case labs", "Facilitator clinics"]
                        },
                        {
                            title: "Product depth",
                            courses: ["Feature storytelling", "Competitive positioning", "Quarterly trend briefs"],
                            duration: "1 week",
                            resources: ["PM office hours", "Analyst memos"]
                        },
                        {
                            title: "Commercial acumen",
                            courses: ["Healthy upsell cues", "Basket recovery", "Retention signals"],
                            duration: "2 weeks",
                            resources: ["Playbooks", "KPI dashboards"]
                        },
                        {
                            title: "Analytics for CS",
                            courses: ["Tickets-to-insight loops", "CSAT/DSAT drivers", "Process mining intro"],
                            duration: "1 week",
                            resources: ["Spreadsheet labs", "BI sandboxes"]
                        }
                    ],
                    certificate: "E-commerce CS Practitioner",
                    jobOpportunities: ["Senior agent", "Team lead", "Voice-of-customer analyst"]
                },
                advanced: {
                    modules: [
                        {
                            title: "Leading teams",
                            courses: ["Rostering fairness", "Coaching rhythms", "Quality programmes"],
                            duration: "2 weeks",
                            resources: ["Toolkit library", "Mentorship circles"]
                        },
                        {
                            title: "Journey optimisation",
                            courses: ["Journey maps", "Automation guardrails", "CX experimentation"],
                            duration: "2 weeks",
                            resources: ["Design sprints", "Experiment logs"]
                        },
                        {
                            title: "Executive presence",
                            courses: ["Board-ready metrics", "Crisis comms rehearsal", "Vendor governance"],
                            duration: "2 weeks",
                            resources: ["Briefing templates", "Scenario drills"]
                        }
                    ],
                    certificate: "E-commerce CS Leader",
                    jobOpportunities: ["CX manager", "Head of Digital Care", "Contact centre director"]
                }
            },
            "Data Annotator": {
                beginner: {
                    modules: [
                        {
                            title: "Annotation essentials",
                            courses: ["Purpose of labelled data", "Common modalities overview", "Tooling hygiene"],
                            duration: "1 week",
                            resources: ["Videos", "Guided drills", "Handbook"]
                        },
                        {
                            title: "Vision tasks",
                            courses: ["Classification vs detection vs segmentation", "Edge cases", "Pixel QA"],
                            duration: "2 weeks",
                            resources: ["Workbench tasks", "Pair audits"]
                        },
                        {
                            title: "Language tasks",
                            courses: ["Sentiment and NER tagging", "Intent tagging", "Inter-annotator agreement"],
                            duration: "2 weeks",
                            resources: ["Consensus sessions", "Rubric drills"]
                        },
                        {
                            title: "QA discipline",
                            courses: ["Rubric fidelity", "Error taxonomies", "Self-review habits"],
                            duration: "1 week",
                            resources: ["Calibration sets", "Coaching loops"]
                        }
                    ],
                    certificate: "Annotation Foundations",
                    jobOpportunities: ["Junior annotator", "CV labeler", "NLP labeler"]
                },
                intermediate: {
                    modules: [
                        {
                            title: "Advanced annotation",
                            courses: ["3D point clouds", "Video temporality", "Multimodal fusion"],
                            duration: "2 weeks",
                            resources: ["Specialist workshops", "Tool extensions"]
                        },
                        {
                            title: "Domain nuance",
                            courses: ["Autonomous driving rubrics", "Clinical imaging etiquette", "Financial redaction"],
                            duration: "2 weeks",
                            resources: ["Compliance primers", "Field SMEs"]
                        },
                        {
                            title: "Throughput",
                            courses: ["Hotkeys & batching", "Automation assists", "Capacity planning"],
                            duration: "1 week",
                            resources: ["Throughput labs", "Efficiency KPIs"]
                        },
                        {
                            title: "Review leadership",
                            courses: ["Gold-set maintenance", "Disagreement arbitration", "Coaching cues"],
                            duration: "1 week",
                            resources: ["Calibration war rooms"]
                        }
                    ],
                    certificate: "Senior Annotator Track",
                    jobOpportunities: ["Senior labeler", "QA reviewer", "Project coordinator"]
                },
                advanced: {
                    modules: [
                        {
                            title: "Programme management",
                            courses: ["Milestone modelling", "Resource buffers", "ISO-style QA systems"],
                            duration: "2 weeks",
                            resources: ["Governance decks", "Retrospectives"]
                        },
                        {
                            title: "Platform design",
                            courses: ["Spec gathering", "Custom templates", "Workflow automation hooks"],
                            duration: "3 weeks",
                            resources: ["Hack weeks", "Engineering buddies"]
                        },
                        {
                            title: "Training data science",
                            courses: ["Dataset budgeting", "Slice-based evaluation", "Augmentation pitfalls"],
                            duration: "2 weeks",
                            resources: ["Notebook challenges", "Model PM shadowing"]
                        }
                    ],
                    certificate: "ML Data Steward",
                    jobOpportunities: ["Labelling programme manager", "Data quality chief", "ML operations partner"]
                }
            },
            "Live Stream Assistant": {
                beginner: {
                    modules: [
                        {
                            title: "Live fundamentals",
                            courses: ["Platform roles", "Run-of-show etiquette", "Basic AV hygiene"],
                            duration: "1 week",
                            resources: ["Tutorial packs", "Hardware walkthrough"]
                        },
                        {
                            title: "Show prep",
                            courses: ["Product fact sheets", "Script beats", "Engagement gimmicks"],
                            duration: "1 week",
                            resources: ["Brief templates", "Creative prompts"]
                        },
                        {
                            title: "Control-room support",
                            courses: ["Chat moderation", "Link drops", "Incident triage"],
                            duration: "2 weeks",
                            resources: ["Shadow shifts", "Runbooks"]
                        },
                        {
                            title: "Metrics literacy",
                            courses: ["Funnel KPIs", "Audience heatmaps", "GMV sensitivities"],
                            duration: "1 week",
                            resources: ["Reporting clinic"]
                        }
                    ],
                    certificate: "Live Ops Associate",
                    jobOpportunities: ["Junior live assistant", "Studio runner", "Shoppertainment liaison"]
                },
                intermediate: {
                    modules: [
                        {
                            title: "Programming shows",
                            courses: ["Narrative arcs", "Pacing choreography", "Promo choreography"],
                            duration: "2 weeks",
                            resources: ["Director shadowing"]
                        },
                        {
                            title: "Community vibes",
                            courses: ["Fan psychology", "Chat tactics", "Lightweight CRM"],
                            duration: "1 week",
                            resources: ["Psych primer", "Engagement KPIs"]
                        },
                        {
                            title: "Production polish",
                            courses: ["Lighting/audio sweet spots", "Multi-cam choreography", "Encoder tuning"],
                            duration: "1 week",
                            resources: ["Hands-on rigs"]
                        },
                        {
                            title: "Optimisation labs",
                            courses: ["Cohort benchmarking", "Competitive tear-downs", "Experiment design"],
                            duration: "1 week",
                            resources: ["Insights war room"]
                        }
                    ],
                    certificate: "Live Commerce Specialist",
                    jobOpportunities: ["Senior assistant", "Show producer", "Ops analyst"]
                },
                advanced: {
                    modules: [
                        {
                            title: "Team orchestration",
                            courses: ["Crew charters", "Incentive schemes", "Hand-off rituals"],
                            duration: "2 weeks",
                            resources: ["Cadence tooling"]
                        },
                        {
                            title: "Innovation arcs",
                            courses: ["Format invention", "IP partnerships", "Short-form synergy"],
                            duration: "2 weeks",
                            resources: ["Innovation incubator"]
                        },
                        {
                            title: "Commercial rigour",
                            courses: ["Sponsor negotiation helpers", "Sponsorship math", "ROI storytelling"],
                            duration: "2 weeks",
                            resources: ["Finance clinics"]
                        }
                    ],
                    certificate: "Head of Live Revenue",
                    jobOpportunities: ["Studio manager", "Content director", "Live-commerce GM"]
                }
            }
        };


        // Resolve job key and retrieve learning path
        const path = learningPaths[resolvedJob];
        if (!path) {
            return {
                success: false,
                message: "No learning path is available for that role in this demo."
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
                    "Communication and collaboration read as signature strengths — great for stakeholder-heavy roles.",
                    "You onboard new concepts quickly, which lowers ramp time for rotations.",
                    "You stay productive when priorities shift mid-sprint."
                ],
                improvementAreas: [
                    "Deepen tooling or certifications tied to your target JD.",
                    "Stretch creative judgement with cross-functional critiques.",
                    "Layer structured time-blocking on top of your natural hustle."
                ],
                recommendedJobs: [
                    {
                        title: "E-commerce Customer Service",
                        matchScore: Math.floor(Math.random() * 15) + 80,
                        reason: "Patience + clarity map exceptionally well to frontline CS KPIs."
                    },
                    {
                        title: "Data Annotator",
                        matchScore: Math.floor(Math.random() * 15) + 75,
                        reason: "Detail orientation shines for precision labelling workloads."
                    },
                    {
                        title: "Content Moderator",
                        matchScore: Math.floor(Math.random() * 15) + 70,
                        reason: "Balanced judgement helps keep community policies consistent."
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
                    text: "Lead with measurable wins, tune keywords to each role, and keep layout scannable. Upload your draft to our AI resume coach for targeted rewrites.",
                    actions: [
                        {
                            type: "button",
                            text: "Open resume coach",
                            action: "open_modal",
                            modal: "resume-optimize"
                        }
                    ]
                }
            },
            {
                phrases: [/customer service job|support role|live chat agent|\u67e5\u627e\u5ba2\u670d/i],
                data: {
                    text: "Blind-review friendly CS roles—including cross-border e-commerce desks—often mix remote shifts with coaching. Dive into curated matches tailored to accessibility needs.",
                    actions: [
                        {
                            type: "button",
                            text: "View matches",
                            action: "open_modal",
                            modal: "job-match"
                        }
                    ]
                }
            },
            {
                phrases: [/social security|mandatory contributions|\u793e\u4fdd|\u8de8\u5883/i],
                data: {
                    text: "Hong Kong and Macau hires in mainland GBA cities can participate in—or later transfer—mainland social programmes. Officials need contribution histories from both municipalities.",
                    actions: [
                        {
                            type: "button",
                            text: "Open policy briefing",
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
                    text: "Pick warm, neutral, or stress interview personas. Olivia builds question packs from your resume + JD then shares rubric-aligned feedback afterwards.",
                    actions: [
                        {
                            type: "button",
                            text: "Start mock interview",
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
                text: "Hi — I'm Olivia, your bilingual cross-border careers copilot. Ask about CV upgrades, equitable job discovery, subsidies, visas, or interview drills.",
                actions: [
                    {
                        type: "button",
                        text: "Resume help",
                        action: "open_modal",
                        modal: "resume-optimize"
                    },
                    {
                        type: "button",
                        text: "Job matches",
                        action: "open_modal",
                        modal: "job-match"
                    },
                    {
                        type: "button",
                        text: "Policy Q&A",
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
        await this.delay(450);
        const id = String(identifier || '').trim();
        if (!id || !password) {
            return { success: false, message: 'Please enter email and password.' };
        }
        if (String(password).length < 6) {
            return { success: false, message: 'Password must be at least 6 characters.' };
        }
        const portal = this.normalizePortalRole(portalHint);
        const displayName =
            id.includes('@') ? id.split('@')[0].replace(/\./g, ' ') : id;
        const session = {
            email: id,
            displayName:
                displayName.charAt(0).toUpperCase() + displayName.slice(1) || 'User',
            portal,
            loginAt: new Date().toISOString()
        };
        this.saveAuthSession(session);
        return { success: true, data: session };
    },

    async register(identifier, password, portalHint, displayNameOptional) {
        await this.delay(550);
        const id = String(identifier || '').trim();
        if (!id || !password) {
            return { success: false, message: 'Please fill all required fields.' };
        }
        if (String(password).length < 6) {
            return { success: false, message: 'Password must be at least 6 characters.' };
        }
        const dn = String(displayNameOptional || '').trim();
        const portal = this.normalizePortalRole(portalHint);
        const fallbackName =
            id.includes('@') ? id.split('@')[0].replace(/\./g, ' ') : id;
        const session = {
            email: id,
            displayName: dn || (fallbackName.charAt(0).toUpperCase() + fallbackName.slice(1)),
            portal,
            loginAt: new Date().toISOString()
        };
        this.saveAuthSession(session);
        return { success: true, data: session };
    },

    async requestPasswordReset(email) {
        await this.delay(400);
        const e = String(email || '').trim();
        if (!e) {
            return { success: false, message: 'Please enter your email address.' };
        }
        return {
            success: true,
            message:
                'If this email is registered, you will receive a reset link shortly. (Demo mode: no email is sent.)'
        };
    },

    logout() {
        this.clearAuthSession();
        return { success: true };
    }
};

// Export for Node.js contexts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
}