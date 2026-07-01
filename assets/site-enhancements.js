(function () {
    'use strict';

    var LANG_KEY = 'gba_ui_lang';
    var LABELS = {
        en: 'English',
        'zh-CN': '简体中文',
        'zh-TW': '繁體中文',
        pt: 'Português'
    };

    var COPY = {
        home: {
            en: {
                title: 'GBA Cross-Regional Employment Empowerment',
                subtitle:
                    'Live job matching, applications, and employer workflows across the GBA — deployed on Alibaba Cloud with Node.js, MySQL, and Python AI services.',
                individual: 'Individual Access',
                corporate: 'Corporate Access',
                features: 'Platform Capabilities',
                featuresLead:
                    'Individuals browse matched jobs (internal + external), apply online, and use Python AI demos. Companies post roles with target criteria and review scored applicants — all on the live Alibaba Cloud stack.',
                workflow: 'One-stop Employment Loop',
                benefits: 'Who We Serve',
                stories: 'Success Stories',
                faq: 'FAQ',
                cta: 'Start your cross-regional employment journey'
            },
            'zh-CN': {
                title: '粤港澳大湾区跨区域就业赋能',
                subtitle:
                    '已部署于阿里云：Node.js + MySQL 提供岗位匹配与投递，Python AI 提供简历/面试/学习路径演示。',
                individual: '个人端入口',
                corporate: '企业端入口',
                features: '平台能力',
                featuresLead:
                    '个人端可浏览内外部匹配岗位、在线投递并使用 Python AI 演示；企业端可发布带目标条件的岗位并查看评分申请人，运行于阿里云生产环境。',
                workflow: '一站式就业闭环',
                benefits: '服务对象',
                stories: '成功案例',
                faq: '常见问题',
                cta: '开启跨区域就业赋能之旅'
            },
            'zh-TW': {
                title: '粵港澳大灣區跨區域就業賦能',
                subtitle:
                    '已部署於阿里雲：Node.js + MySQL 提供崗位匹配與投遞，Python AI 提供履歷/面試/學習路徑示範。',
                individual: '個人端入口',
                corporate: '企業端入口',
                features: '平台能力',
                featuresLead:
                    '個人端可瀏覽匹配崗位、保存履歷並在線投遞；企業端可發布帶目標條件的崗位並查看評分排序的申請人，均由即時後端 API 支撐。',
                workflow: '一站式就業閉環',
                benefits: '服務對象',
                stories: '成功案例',
                faq: '常見問題',
                cta: '開啟跨區域就業賦能之旅'
            },
            pt: {
                title: 'Empoderamento Laboral Transregional da GBA',
                subtitle:
                    'Matching de vagas, candidaturas e fluxos empresariais na GBA — em Alibaba Cloud com Node.js, MySQL e serviços Python AI.',
                individual: 'Acesso individual',
                corporate: 'Acesso empresarial',
                features: 'Capacidades da plataforma',
                featuresLead:
                    'Candidatos navegam vagas com score e candidatam-se online; empresas publicam vagas com critérios-alvo e analisam candidatos por pontuação — tudo via API em produção.',
                workflow: 'Ciclo completo de emprego',
                benefits: 'Quem servimos',
                stories: 'Histórias de sucesso',
                faq: 'Perguntas frequentes',
                cta: 'Comece a sua jornada laboral transregional'
            }
        },
        individual: {
            en: {
                title: 'Individual Empowerment Portal',
                subtitle:
                    'Plan your route from skill assessment to resume optimization, job matching, learning, onboarding, and follow-up support.',
                dashboard: 'Personal Dashboard',
                demos: 'Interactive Tools',
                resources: 'Resources',
                stories: 'Success Stories',
                faq: 'FAQ',
                open: 'Open interactive tools'
            },
            'zh-CN': {
                title: '个人就业赋能门户',
                subtitle:
                    '从能力评估、简历优化、岗位匹配、技能学习，到入职与就业后跟进，完整规划你的跨区域就业路径。',
                dashboard: '个人仪表盘',
                demos: '互动工具',
                resources: '资源中心',
                stories: '成功案例',
                faq: '常见问题',
                open: '打开互动工具'
            },
            'zh-TW': {
                title: '個人就業賦能門戶',
                subtitle:
                    '從能力評估、履歷優化、職位匹配、技能學習，到入職與就業後跟進，完整規劃你的跨區域就業路徑。',
                dashboard: '個人儀表板',
                demos: '互動工具',
                resources: '資源中心',
                stories: '成功案例',
                faq: '常見問題',
                open: '打開互動工具'
            },
            pt: {
                title: 'Portal de Empoderamento Individual',
                subtitle:
                    'Planeie o percurso desde avaliação de competências, CV, matching, aprendizagem, integração e acompanhamento pós-emprego.',
                dashboard: 'Painel pessoal',
                demos: 'Ferramentas interativas',
                resources: 'Recursos',
                stories: 'Histórias de sucesso',
                faq: 'Perguntas frequentes',
                open: 'Abrir ferramentas interativas'
            }
        },
        corporate: {
            en: {
                title: 'Corporate Inclusive Hiring Portal',
                subtitle:
                    'Recruit diverse GBA talent with blind screening, compliance calculators, DEI analytics, and inclusive remote-work workflows.',
                dashboard: 'Recruitment Dashboard',
                demos: 'HR & Compliance Tools',
                jobs: 'My Jobs',
                analytics: 'Analytics',
                stories: 'Success Stories',
                faq: 'FAQ',
                open: 'Open interactive tools'
            },
            'zh-CN': {
                title: '企业包容招聘门户',
                subtitle:
                    '通过盲筛、合规测算、DEI 分析与远程包容工作流程，连接大湾区多元人才。',
                dashboard: '招聘仪表盘',
                demos: 'HR 与合规工具',
                jobs: '岗位管理',
                analytics: '数据分析',
                stories: '成功案例',
                faq: '常见问题',
                open: '打开互动工具'
            },
            'zh-TW': {
                title: '企業包容招聘門戶',
                subtitle:
                    '透過盲篩、合規測算、DEI 分析與遠端包容工作流程，連接大灣區多元人才。',
                dashboard: '招聘儀表板',
                demos: 'HR 與合規工具',
                jobs: '職位管理',
                analytics: '數據分析',
                stories: '成功案例',
                faq: '常見問題',
                open: '打開互動工具'
            },
            pt: {
                title: 'Portal Empresarial de Recrutamento Inclusivo',
                subtitle:
                    'Recrute talento diverso da GBA com triagem cega, calculadoras de conformidade, análise DEI e fluxos de trabalho remoto inclusivo.',
                dashboard: 'Painel de recrutamento',
                demos: 'Ferramentas de RH e conformidade',
                jobs: 'Vagas',
                analytics: 'Análises',
                stories: 'Histórias de sucesso',
                faq: 'Perguntas frequentes',
                open: 'Abrir ferramentas interativas'
            }
        }
    };

    var STATIC_COPY = {
        'zh-CN': {
            'GBA Platform': '大湾区平台',
            'Platform Capabilities': '平台能力',
            'How It Works': '运作方式',
            'Who We Serve': '服务对象',
            'Success Stories': '成功案例',
            FAQ: '常见问题',
            'Log in': '登录',
            'Sign up': '注册',
            'Active Users': '活跃用户',
            'Partner Companies': '合作企业',
            'Matching Success Rate': '匹配成功率',
            'AI-Powered Matching': 'AI 智能匹配',
            'Skills Development': '技能发展',
            'Policy Intelligence': '政策智能',
            'Multi-Language Support': '多语言支持',
            'Data Security & Compliance': '数据安全与合规',
            Accessibility: '无障碍支持',
            'Intelligent skills-based matching algorithm that connects the right talent with the right opportunities, eliminating bias through "blind screening" technology.':
                '基于技能的智能匹配算法连接合适人才与岗位，并通过“盲筛”技术减少偏见。',
            'Personalized learning paths and skill assessment tools to help job seekers enhance their employability in the cross-border job market.':
                '个性化学习路径与技能评估工具，帮助求职者提升跨境就业竞争力。',
            'AI-powered policy consultation service that provides guidance on cross-border employment regulations, visa requirements, and compliance issues.':
                'AI 政策咨询服务，为跨境就业法规、签证要求和合规事项提供指引。',
            'Full support for Simplified Chinese, Traditional Chinese, English, and Portuguese to serve the diverse GBA population.':
                '全面支持简体中文、繁体中文、英文和葡语，服务大湾区多元人群。',
            'Strict adherence to cross-border data localization principles with hierarchical privacy storage and automatic sensitive information anonymization.':
                '严格遵循跨境数据本地化原则，采用分级隐私存储与敏感信息自动匿名化。',
            'WCAG 2.2 compliant design with screen reader compatibility, keyboard navigation, high contrast mode, and voice assistant for users with disabilities.':
                '符合 WCAG 2.2 的设计，支持屏幕阅读器、键盘导航、高对比度模式和语音助手。',
            'Learn more': '了解更多',
            'Create Your Profile': '创建个人资料',
            'AI Matching Process': 'AI 匹配流程',
            'Review & Connect': '查看并连接',
            'Support Throughout': '全程支持',
            'Platform Benefits': '平台价值',
            'For Individuals': '面向个人',
            'For Companies': '面向企业',
            'Data Security': '数据安全',
            'Social Impact': '社会影响',
            'Real stories from our users who have found success through the platform': '真实用户通过平台获得机会的故事',
            'Individual Empowerment Portal': '个人就业赋能门户',
            'Personal Dashboard': '个人仪表盘',
            'Interactive Tools': '互动工具',
            Resources: '资源中心',
            'Open interactive tools': '打开互动工具',
            'My Account': '我的账户',
            Dashboard: '仪表盘',
            'Interactive tools': '互动工具',
            'Your Personal Dashboard': '你的个人仪表盘',
            'Profile Completeness': '资料完整度',
            Applications: '申请记录',
            'Skill Development': '技能发展',
            'Complete your profile to get better job matches': '完善资料以获得更精准的岗位匹配',
            'Complete Profile': '完善资料',
            'Pending Review': '待审核',
            'Interview Stage': '面试阶段',
            Completed: '已完成',
            'View Applications': '查看申请',
            'Continue your learning journey': '继续你的学习旅程',
            'Continue Learning': '继续学习',
            'Recommended Jobs For You': '为你推荐的岗位',
            Refresh: '刷新',
            'View All': '查看全部',
            'Full-time': '全职',
            Remote: '远程',
            Hybrid: '混合办公',
            Flexible: '弹性',
            'Part-time': '兼职',
            'Apply Now': '立即申请',
            Match: '匹配',
            'Digital Marketing Specialist': '数字营销专员',
            'Financial Analyst': '金融分析师',
            'Customer Service Representative': '客户服务代表',
            'Data Annotation Specialist': '数据标注专员',
            'E-commerce Operations Assistant': '电商运营助理',
            'Remote Support Coordinator': '远程支持协调员',
            'Content Moderation Analyst': '内容审核分析员',
            'Live-commerce Assistant': '直播电商助理',
            'Accessibility QA Tester': '无障碍质检测试员',
            'Community Operations Trainee': '社群运营见习生',
            'Micro-credential Coach': '微证书学习教练',
            'Scroll inside this panel to browse more matched roles.': '将鼠标放在面板内并向下滚动，可浏览更多匹配岗位。',
            'From registration to post-employment follow-up': '从注册到就业后跟进',
            'Interactive modules': '互动模块',
            'Nine connected tools support matching, policy, learning, accessibility, credentialing and feedback across the employment journey.':
                '九个互相关联的工具覆盖匹配、政策、学习、无障碍、证书与反馈，支持完整就业旅程。',
            'Quick links:': '快捷入口：',
            'Job-seeking Community': '求职互助社群',
            'Find peer circles, mentor office hours and warm introductions for cross-border job search confidence.':
                '寻找同伴小组、导师答疑和跨境求职内推资源，增强求职信心。',
            'View community': '查看社群',
            'Micro-credential wallet': '微证书钱包',
            'Track skill badges for e-commerce service, data labeling and live-commerce support across GBA employers.':
                '追踪电商服务、数据标注、直播支持等技能徽章，并向大湾区雇主展示。',
            'View credentials': '查看证书',
            'User feedback': '用户反馈',
            'Resources for Your Success': '助你成功的资源',
            'Comprehensive resources to help you navigate cross-border employment': '帮助你了解跨境就业的综合资源',
            Guidebooks: '指南手册',
            'Video Tutorials': '视频教程',
            Events: '活动',
            Community: '社群',
            'Join Community': '加入社群',
            'Frequently Asked Questions': '常见问题',
            'Corporate Inclusive Hiring Portal': '企业包容招聘门户',
            'Recruitment Dashboard': '招聘仪表盘',
            'HR & Compliance Tools': 'HR 与合规工具',
            'My Jobs': '岗位管理',
            Analytics: '数据分析',
            'Candidate view': '候选人视图',
            'Recruitment Analytics': '招聘数据分析',
            'Real stories from inclusive employers and cross-border candidates using the platform':
                '包容雇主与跨境候选人使用平台的真实故事'
        },
        'zh-TW': {
            'GBA Platform': '大灣區平台',
            'Platform Capabilities': '平台能力',
            'How It Works': '運作方式',
            'Who We Serve': '服務對象',
            'Success Stories': '成功案例',
            FAQ: '常見問題',
            'Log in': '登入',
            'Sign up': '註冊',
            'Active Users': '活躍用戶',
            'Partner Companies': '合作企業',
            'Matching Success Rate': '匹配成功率',
            'AI-Powered Matching': 'AI 智能匹配',
            'Skills Development': '技能發展',
            'Policy Intelligence': '政策智能',
            'Multi-Language Support': '多語言支援',
            'Data Security & Compliance': '資料安全與合規',
            Accessibility: '無障礙支援',
            'Learn more': '了解更多',
            'Individual Empowerment Portal': '個人就業賦能門戶',
            'Personal Dashboard': '個人儀表板',
            'Interactive Tools': '互動工具',
            Resources: '資源中心',
            'Open interactive tools': '打開互動工具',
            'My Account': '我的帳戶',
            Dashboard: '儀表板',
            'Interactive tools': '互動工具',
            'Your Personal Dashboard': '你的個人儀表板',
            'Recommended Jobs For You': '為你推薦的職位',
            Refresh: '刷新',
            'View All': '查看全部',
            'Full-time': '全職',
            Remote: '遠端',
            Hybrid: '混合辦公',
            Flexible: '彈性',
            'Part-time': '兼職',
            'Apply Now': '立即申請',
            Match: '匹配',
            'Digital Marketing Specialist': '數碼行銷專員',
            'Financial Analyst': '金融分析師',
            'Customer Service Representative': '客戶服務代表',
            'Data Annotation Specialist': '資料標註專員',
            'E-commerce Operations Assistant': '電商營運助理',
            'Remote Support Coordinator': '遠端支援協調員',
            'Content Moderation Analyst': '內容審核分析員',
            'Live-commerce Assistant': '直播電商助理',
            'Accessibility QA Tester': '無障礙質檢測試員',
            'Community Operations Trainee': '社群營運見習生',
            'Micro-credential Coach': '微證書學習教練',
            'Scroll inside this panel to browse more matched roles.': '將滑鼠放在面板內並向下捲動，可瀏覽更多匹配職位。',
            'Interactive modules': '互動模組',
            'Quick links:': '快捷入口：',
            'Job-seeking Community': '求職互助社群',
            'Find peer circles, mentor office hours and warm introductions for cross-border job search confidence.':
                '尋找同伴小組、導師答疑和跨境求職引薦資源，增強求職信心。',
            'View community': '查看社群',
            'Micro-credential wallet': '微證書錢包',
            'View credentials': '查看證書',
            'User feedback': '用戶回饋',
            'Resources for Your Success': '助你成功的資源',
            Guidebooks: '指南手冊',
            'Video Tutorials': '影片教學',
            Events: '活動',
            Community: '社群',
            'Join Community': '加入社群',
            'Frequently Asked Questions': '常見問題',
            'Corporate Inclusive Hiring Portal': '企業包容招聘門戶',
            'Recruitment Dashboard': '招聘儀表板',
            'HR & Compliance Tools': 'HR 與合規工具',
            'My Jobs': '職位管理',
            Analytics: '數據分析',
            'Candidate view': '候選人視圖',
            'Recruitment Analytics': '招聘數據分析'
        },
        pt: {
            'GBA Platform': 'Plataforma GBA',
            'Platform Capabilities': 'Capacidades da plataforma',
            'How It Works': 'Como funciona',
            'Who We Serve': 'Quem servimos',
            'Success Stories': 'Histórias de sucesso',
            FAQ: 'Perguntas frequentes',
            'Log in': 'Entrar',
            'Sign up': 'Registar',
            'Active Users': 'Utilizadores ativos',
            'Partner Companies': 'Empresas parceiras',
            'Matching Success Rate': 'Taxa de matching',
            'AI-Powered Matching': 'Matching com IA',
            'Skills Development': 'Desenvolvimento de competências',
            'Policy Intelligence': 'Inteligência de políticas',
            'Multi-Language Support': 'Suporte multilingue',
            'Data Security & Compliance': 'Segurança e conformidade de dados',
            Accessibility: 'Acessibilidade',
            'Learn more': 'Saber mais',
            'Individual Empowerment Portal': 'Portal de empoderamento individual',
            'Personal Dashboard': 'Painel pessoal',
            'Interactive Tools': 'Ferramentas interativas',
            Resources: 'Recursos',
            'Open interactive tools': 'Abrir ferramentas interativas',
            'My Account': 'A minha conta',
            Dashboard: 'Painel',
            'Interactive tools': 'Ferramentas interativas',
            'Your Personal Dashboard': 'O seu painel pessoal',
            'Recommended Jobs For You': 'Vagas recomendadas para si',
            Refresh: 'Atualizar',
            'View All': 'Ver tudo',
            'Full-time': 'Tempo inteiro',
            Remote: 'Remoto',
            Hybrid: 'Híbrido',
            Flexible: 'Flexível',
            'Part-time': 'Tempo parcial',
            'Apply Now': 'Candidatar-se',
            Match: 'compatível',
            'Digital Marketing Specialist': 'Especialista de marketing digital',
            'Financial Analyst': 'Analista financeiro',
            'Customer Service Representative': 'Representante de atendimento',
            'Data Annotation Specialist': 'Especialista de anotação de dados',
            'E-commerce Operations Assistant': 'Assistente de operações e-commerce',
            'Remote Support Coordinator': 'Coordenador de suporte remoto',
            'Content Moderation Analyst': 'Analista de moderação de conteúdo',
            'Live-commerce Assistant': 'Assistente de live-commerce',
            'Accessibility QA Tester': 'Tester QA de acessibilidade',
            'Community Operations Trainee': 'Trainee de operações comunitárias',
            'Micro-credential Coach': 'Coach de microcredenciais',
            'Scroll inside this panel to browse more matched roles.': 'Passe o rato no painel e role para ver mais vagas compatíveis.',
            'Interactive modules': 'Módulos interativos',
            'Quick links:': 'Links rápidos:',
            'Job-seeking Community': 'Comunidade de procura de emprego',
            'Find peer circles, mentor office hours and warm introductions for cross-border job search confidence.':
                'Encontre grupos de pares, mentoria e apresentações úteis para procurar emprego transfronteiriço.',
            'View community': 'Ver comunidade',
            'Micro-credential wallet': 'Carteira de microcredenciais',
            'View credentials': 'Ver credenciais',
            'User feedback': 'Feedback do utilizador',
            'Resources for Your Success': 'Recursos para o seu sucesso',
            Guidebooks: 'Guias',
            'Video Tutorials': 'Tutoriais em vídeo',
            Events: 'Eventos',
            Community: 'Comunidade',
            'Join Community': 'Entrar na comunidade',
            'Frequently Asked Questions': 'Perguntas frequentes',
            'Corporate Inclusive Hiring Portal': 'Portal empresarial de contratação inclusiva',
            'Recruitment Dashboard': 'Painel de recrutamento',
            'HR & Compliance Tools': 'Ferramentas de RH e conformidade',
            'My Jobs': 'Vagas',
            Analytics: 'Análises',
            'Candidate view': 'Vista do candidato',
            'Recruitment Analytics': 'Análises de recrutamento'
        }
    };

    function getLang() {
        try {
            return localStorage.getItem(LANG_KEY) || 'en';
        } catch (e) {
            return 'en';
        }
    }

    function setLang(lang) {
        if (!LABELS[lang]) return;
        try {
            localStorage.setItem(LANG_KEY, lang);
        } catch (e) {}
        applyLanguage(lang);
    }

    function pageKey() {
        var explicit = document.body && document.body.getAttribute('data-page');
        if (explicit) return explicit;
        var path = location.pathname.replace(/\\/g, '/');
        if (path.indexOf('/corporate/') !== -1) return 'corporate';
        if (path.indexOf('/individual/') !== -1) return 'individual';
        return 'home';
    }

    function setText(selector, text) {
        document.querySelectorAll(selector).forEach(function (node) {
            node.textContent = text;
        });
    }

    function translateText(raw, lang) {
        var map = STATIC_COPY[lang];
        if (!map || !raw) return raw;
        var trimmed = raw.trim();
        if (!trimmed) return raw;
        var translated = map[trimmed];
        if (!translated && /%\s*Match$/.test(trimmed)) {
            translated = trimmed.replace('Match', map.Match || 'Match');
        }
        if (!translated) return raw;
        return raw.replace(trimmed, translated);
    }

    function applyStaticTranslations(lang) {
        lang = LABELS[lang] ? lang : 'en';
        var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
            acceptNode: function (node) {
                var parent = node.parentElement;
                if (!parent || parent.closest('script,style,noscript,[data-i18n]')) {
                    return NodeFilter.FILTER_REJECT;
                }
                return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            }
        });
        var nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(function (node) {
            if (!node.parentElement.dataset.l10nOriginal) {
                node.parentElement.dataset.l10nOriginal = node.nodeValue;
            }
            var original = node.parentElement.dataset.l10nOriginal;
            node.nodeValue = lang === 'en' ? original : translateText(original, lang);
        });
        document.querySelectorAll('input[placeholder],textarea[placeholder]').forEach(function (node) {
            if (!node.dataset.l10nPlaceholder) node.dataset.l10nPlaceholder = node.getAttribute('placeholder') || '';
            node.setAttribute('placeholder', lang === 'en' ? node.dataset.l10nPlaceholder : translateText(node.dataset.l10nPlaceholder, lang));
        });
    }

    function applyLanguage(lang) {
        lang = LABELS[lang] ? lang : 'en';
        document.documentElement.lang = lang;
        var cur = document.getElementById('current-language');
        if (cur) cur.textContent = LABELS[lang];

        var key = pageKey();
        var copy = COPY[key] && COPY[key][lang];
        if (!copy) return;

        setText('[data-i18n="hero-title"]', copy.title);
        setText('[data-i18n="hero-subtitle"]', copy.subtitle);
        setText('[data-i18n="nav-features"]', copy.features || copy.demos);
        setText('[data-i18n="nav-dashboard"]', copy.dashboard);
        setText('[data-i18n="nav-demos"]', copy.demos);
        setText('[data-i18n="nav-resources"]', copy.resources);
        setText('[data-i18n="nav-stories"]', copy.stories);
        setText('[data-i18n="nav-faq"]', copy.faq);
        setText('[data-i18n="nav-jobs"]', copy.jobs);
        setText('[data-i18n="nav-analytics"]', copy.analytics);
        setText('[data-i18n="hero-individual"]', copy.individual);
        setText('[data-i18n="hero-corporate"]', copy.corporate);
        setText('[data-i18n="section-features-title"]', copy.features);
        setText('[data-i18n="section-features-lead"]', copy.featuresLead);
        setText('[data-i18n="section-workflow-title"]', copy.workflow);
        setText('[data-i18n="section-benefits-title"]', copy.benefits);
        setText('[data-i18n="section-stories-title"]', copy.stories);
        setText('[data-i18n="section-faq-title"]', copy.faq);
        setText('[data-i18n="section-cta-title"]', copy.cta);
        setText('[data-i18n="hero-open-demos"]', copy.open);
        applyStaticTranslations(lang);
    }

    function initLanguage() {
        ensureLanguageSwitcher();
        applyLanguage(getLang());
        var existingSelect = document.getElementById('ui-lang');
        if (existingSelect) {
            existingSelect.value = getLang() === 'zh-CN' ? 'zh' : getLang();
            existingSelect.addEventListener('change', function () {
                setLang(existingSelect.value === 'zh' ? 'zh-CN' : existingSelect.value);
            });
        }
        document.querySelectorAll('[data-lang]').forEach(function (node) {
            node.addEventListener('click', function (event) {
                event.preventDefault();
                setLang(node.getAttribute('data-lang'));
                document.querySelectorAll('.language-selector').forEach(function (sel) {
                    sel.classList.remove('is-open');
                });
                if (window.showToast) window.showToast('Language updated.');
            });
        });
    }

    function ensureLanguageSwitcher() {
        if (document.querySelector('[data-lang]') || document.getElementById('ui-lang')) return;
        var wrap = document.createElement('div');
        wrap.className =
            'language-selector fixed top-4 right-4 z-50 bg-white border border-slate-200 shadow-lg rounded-xl px-3 py-2 text-sm';
        wrap.innerHTML =
            '<button type="button" class="flex items-center gap-2 text-slate-700"><span id="current-language">English</span><span>▾</span></button>' +
            '<div class="language-dropdown absolute right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-lg py-2 min-w-[150px] hidden">' +
            '<a href="#" class="block px-4 py-2 hover:bg-slate-50" data-lang="en">English</a>' +
            '<a href="#" class="block px-4 py-2 hover:bg-slate-50" data-lang="zh-CN">简体中文</a>' +
            '<a href="#" class="block px-4 py-2 hover:bg-slate-50" data-lang="zh-TW">繁體中文</a>' +
            '<a href="#" class="block px-4 py-2 hover:bg-slate-50" data-lang="pt">Português</a>' +
            '</div>';
        document.body.appendChild(wrap);
        wrap.querySelector('button').addEventListener('click', function (event) {
            event.stopPropagation();
            wrap.classList.toggle('is-open');
        });
        document.addEventListener('click', function () {
            wrap.classList.remove('is-open');
        });
    }

    function initDemoActions() {
        document.querySelectorAll('a[href="#"]').forEach(function (link) {
            var label = (link.textContent || '').trim().toLowerCase();
            if (label.indexOf('facebook') !== -1) link.href = 'https://www.facebook.com/';
            else if (label.indexOf('twitter') !== -1 || label.indexOf('x') === 0) link.href = 'https://x.com/';
            else if (label.indexOf('linkedin') !== -1) link.href = 'https://www.linkedin.com/';
            else if (label.indexOf('instagram') !== -1) link.href = 'https://www.instagram.com/';
            else if (label.indexOf('guide') !== -1) link.href = 'demo-policy-navigator.html';
            else if (label.indexOf('tutorial') !== -1 || label.indexOf('watch') !== -1) link.href = 'demo-learning-path.html';
            else if (label.indexOf('event') !== -1) link.href = '#resources';
            else if (label.indexOf('community') !== -1) link.href = '#feedback';
            else if (label.indexOf('help') !== -1 || label.indexOf('contact') !== -1) link.href = '#faq';
            else if (label.indexOf('privacy') !== -1 || label.indexOf('terms') !== -1 || label.indexOf('accessibility') !== -1) link.href = '#faq';
            else link.href = '#dashboard';
        });

        document.querySelectorAll('button').forEach(function (button) {
            var text = (button.textContent || '').trim();
            if (!text || button.dataset.enhancedAction) return;
            if (/complete profile/i.test(text)) button.dataset.enhancedAction = 'profile';
            if (/view applications/i.test(text)) button.dataset.enhancedAction = 'applications';
            if (/apply now/i.test(text)) button.dataset.enhancedAction = 'apply';
            if (/post new job/i.test(text)) button.dataset.enhancedAction = 'post-job';
            if (/view profile|view details|view offer/i.test(text)) button.dataset.enhancedAction = 'details';
        });

        document.addEventListener('click', function (event) {
            var button = event.target.closest('[data-enhanced-action]');
            if (!button) return;
            var action = button.dataset.enhancedAction;
            if (action === 'profile') location.hash = 'ai-features';
            else if (action === 'applications') location.hash = 'dashboard';
            else if (action === 'apply') window.location.href = 'apply.html';
            else if (action === 'post-job' && window.openModal) window.openModal('job-optimization-modal');
            else if (action === 'details' && window.showToast) window.showToast('Open the related workflow from the interactive tools section.');
        });
    }

    function parseCounterText(text) {
        var raw = String(text || '').trim();
        var match = raw.match(/^([\d,]+)(\+|%)?$/);
        if (!match) return null;
        return {
            value: Number(match[1].replace(/,/g, '')),
            suffix: match[2] || '',
            comma: match[1].indexOf(',') !== -1
        };
    }

    function formatCounter(value, config) {
        var rounded = Math.round(value);
        var body = config.comma ? rounded.toLocaleString('en-US') : String(rounded);
        return body + config.suffix;
    }

    function animateCounter(node, config) {
        if (node.dataset.counterDone === 'true') return;
        node.dataset.counterDone = 'true';
        var start = performance.now();
        var duration = Math.min(1800, Math.max(900, config.value * 3));
        function tick(now) {
            var p = Math.min((now - start) / duration, 1);
            var eased = 1 - Math.pow(1 - p, 3);
            node.textContent = formatCounter(config.value * eased, config);
            if (p < 1) requestAnimationFrame(tick);
            else node.textContent = formatCounter(config.value, config);
        }
        requestAnimationFrame(tick);
    }

    function initCounters() {
        var candidates = Array.prototype.slice.call(
            document.querySelectorAll('.font-bold, .stat-card .text-3xl, .dashboard-card span')
        );
        var counters = candidates
            .map(function (node) {
                var config = parseCounterText(node.textContent);
                if (!config || config.value <= 0) return null;
                node.dataset.counterValue = String(config.value);
                node.textContent = formatCounter(0, config);
                return { node: node, config: config };
            })
            .filter(Boolean);
        if (!counters.length) return;

        if (!('IntersectionObserver' in window)) {
            counters.forEach(function (item) {
                animateCounter(item.node, item.config);
            });
            return;
        }

        var observer = new IntersectionObserver(
            function (entries) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) return;
                    var found = counters.find(function (item) {
                        return item.node === entry.target;
                    });
                    if (found) animateCounter(found.node, found.config);
                    observer.unobserve(entry.target);
                });
            },
            { threshold: 0.35 }
        );
        counters.forEach(function (item) {
            observer.observe(item.node);
        });
    }

    function initChartPeriodSwitcher() {
        document.querySelectorAll('[data-chart-period]').forEach(function (button) {
            button.addEventListener('click', function () {
                var period = button.getAttribute('data-chart-period');
                document.querySelectorAll('[data-chart-period]').forEach(function (btn) {
                    btn.className =
                        btn === button
                            ? 'px-4 py-2 bg-green-100 text-green-800 rounded-lg shadow-sm'
                            : 'px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg';
                });
                window.dispatchEvent(new CustomEvent('gba:chart-period', { detail: { period: period } }));
            });
        });
    }

    var RECOMMENDED_JOBS = [
        ['Digital Marketing Specialist', 'Tech Solutions Ltd. - Hong Kong', ['Full-time', 'Remote', '¥25K-35K'], 92, 'digital-marketing-specialist'],
        ['Financial Analyst', 'Global Finance Group - Shenzhen', ['Full-time', 'Hybrid', '¥30K-40K'], 88, 'financial-analyst'],
        ['Customer Service Representative', 'Service Excellence Co. - Macau', ['Full-time', 'Remote', '¥18K-25K'], 95, 'customer-service-representative'],
        ['Data Annotation Specialist', 'AI Lab Partner - Zhuhai', ['Part-time', 'Remote', '¥14K-20K'], 94, 'data-annotation-specialist'],
        ['E-commerce Operations Assistant', 'Bay Retail Hub - Guangzhou', ['Full-time', 'Flexible', '¥20K-28K'], 91, 'ecommerce-operations-assistant'],
        ['Remote Support Coordinator', 'Inclusive Cloud Services - Foshan', ['Full-time', 'Remote', '¥22K-30K'], 89, 'remote-support-coordinator'],
        ['Content Moderation Analyst', 'Trust & Safety Studio - Shenzhen', ['Hybrid', 'Flexible', '¥19K-27K'], 93, 'content-moderation-analyst'],
        ['Live-commerce Assistant', 'Hengqin Commerce - Macau', ['Part-time', 'Hybrid', '¥16K-24K'], 87, 'live-commerce-assistant'],
        ['Accessibility QA Tester', 'Universal UX Lab - Hong Kong', ['Full-time', 'Remote', '¥24K-32K'], 96, 'accessibility-qa-tester'],
        ['Community Operations Trainee', 'GBA Career Network - Guangzhou', ['Flexible', 'Hybrid', '¥15K-22K'], 90, 'community-operations-trainee'],
        ['Micro-credential Coach', 'Skills Bridge Academy - Shenzhen', ['Part-time', 'Remote', '¥18K-26K'], 86, 'micro-credential-coach']
    ];

    function shuffleJobs() {
        var list = RECOMMENDED_JOBS.slice();
        for (var i = list.length - 1; i > 0; i -= 1) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = list[i];
            list[i] = list[j];
            list[j] = tmp;
        }
        return list;
    }

    function initRecommendedJobs() {
        var list = document.getElementById('recommended-jobs-list');
        var refresh = document.getElementById('refresh-recommended-jobs');
        if (!list) return;
        function render() {
            list.innerHTML = shuffleJobs()
                .map(function (job) {
                    return (
                        '<div class="job-recommendation-card border border-orange-100 rounded-xl p-4 hover:shadow-md transition-shadow bg-white/95">' +
                        '<div class="flex flex-col sm:flex-row sm:justify-between gap-4">' +
                        '<div><h4 class="text-lg font-semibold text-gray-800">' +
                        job[0] +
                        '</h4><p class="text-gray-600">' +
                        job[1] +
                        '</p><div class="flex flex-wrap items-center mt-2">' +
                        job[2]
                            .map(function (tag, idx) {
                                return '<span class="tag ' + (idx === 0 ? 'tag-primary' : idx === 1 ? 'tag-secondary' : 'tag-accent') + '">' + tag + '</span>';
                            })
                            .join('') +
                        '</div></div><div class="text-left sm:text-right shrink-0"><div class="text-green-600 font-semibold mb-2">' +
                        job[3] +
                        '% Match</div><a href="apply.html?role=' +
                        job[4] +
                        '" class="btn-primary justify-center">Apply Now</a></div></div></div>'
                    );
                })
                .join('');
            applyStaticTranslations(getLang());
        }
        render();
        if (refresh) {
            refresh.addEventListener('click', function () {
                render();
                if (window.showToast) window.showToast('Recommended jobs refreshed.');
            });
        }
    }

    function initPolish() {
        var style = document.createElement('style');
        style.textContent = [
            '.language-selector.is-open .language-dropdown{display:block}',
            '.feature-card,.dashboard-card,.ai-module,.stat-card{will-change:transform}',
            'a,button{transition-property:color,background-color,border-color,box-shadow,transform,opacity;transition-duration:.2s}',
            'button:hover,a.btn-primary:hover,.btn-hero:hover{filter:saturate(1.06)}',
            '.faq-question{border:1px solid rgba(226,232,240,.9);border-radius:1rem;background:linear-gradient(135deg,#fff,#f8fafc)!important}',
            '.faq-question:hover{box-shadow:0 14px 30px rgba(15,23,42,.08);transform:translateY(-1px)}',
            '.faq-answer{margin-top:-.35rem;border:1px solid rgba(226,232,240,.9);border-top:0;border-radius:0 0 1rem 1rem;background:linear-gradient(135deg,#f8fafc,#fff)!important}',
            '.faq-answer p{font-size:1rem;line-height:1.8;color:#475569!important;padding:.85rem 1rem}',
            '.skip-link{position:absolute;left:-999px;top:0;background:#111827;color:#fff;padding:.75rem 1rem;z-index:9999}',
            '.skip-link:focus{left:1rem;top:1rem;border-radius:.5rem}'
        ].join('');
        document.head.appendChild(style);

        if (!document.querySelector('.skip-link')) {
            var skip = document.createElement('a');
            skip.href = document.getElementById('dashboard')
                ? '#dashboard'
                : document.getElementById('features')
                  ? '#features'
                  : document.querySelector('main, section, div[id]')
                    ? '#' + document.querySelector('main, section, div[id]').id
                    : '#';
            skip.className = 'skip-link';
            skip.textContent = 'Skip to content';
            document.body.insertBefore(skip, document.body.firstChild);
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        initPolish();
        initLanguage();
        initDemoActions();
        initCounters();
        initChartPeriodSwitcher();
        initRecommendedJobs();
    });

    window.GBASite = {
        applyLanguage: applyLanguage,
        setLanguage: setLang
    };
})();
