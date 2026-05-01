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
                    'An ability-first platform for matching, policy navigation, compliant data flow, and inclusive remote work across the Guangdong-Hong Kong-Macao Greater Bay Area.',
                individual: 'Individual Access',
                corporate: 'Corporate Access',
                features: 'Platform Capabilities',
                featuresLead:
                    'Explore the key platform capabilities that help job seekers and inclusive employers move from discovery to matching, training, compliance, and long-term support.',
                workflow: 'One-stop Employment Loop',
                benefits: 'Who We Serve',
                stories: 'Success Stories',
                faq: 'FAQ',
                cta: 'Start your cross-regional employment journey'
            },
            'zh-CN': {
                title: '粤港澳大湾区跨区域就业赋能',
                subtitle:
                    '以能力优先匹配、政策红利导航、合规数据流转与包容远程就业为核心，服务大湾区跨区域就业。',
                individual: '个人端入口',
                corporate: '企业端入口',
                features: '平台能力',
                featuresLead:
                    '了解平台如何帮助求职者与包容雇主完成机会发现、岗位匹配、技能提升、合规支持与长期跟进。',
                workflow: '一站式就业闭环',
                benefits: '服务对象',
                stories: '成功案例',
                faq: '常见问题',
                cta: '开启跨区域就业赋能之旅'
            },
            'zh-TW': {
                title: '粵港澳大灣區跨區域就業賦能',
                subtitle:
                    '以能力優先匹配、政策紅利導航、合規資料流轉與包容遠端就業為核心，服務大灣區跨區域就業。',
                individual: '個人端入口',
                corporate: '企業端入口',
                features: '平台能力',
                featuresLead:
                    '了解平台如何幫助求職者與包容僱主完成機會發現、職位匹配、技能提升、合規支援與長期跟進。',
                workflow: '一站式就業閉環',
                benefits: '服務對象',
                stories: '成功案例',
                faq: '常見問題',
                cta: '開啟跨區域就業賦能之旅'
            },
            pt: {
                title: 'Empoderamento Laboral Transregional da GBA',
                subtitle:
                    'Plataforma para correspondência por competências, navegação de políticas, fluxo de dados conforme e trabalho remoto inclusivo na Grande Baía Guangdong-Hong Kong-Macau.',
                individual: 'Acesso individual',
                corporate: 'Acesso empresarial',
                features: 'Capacidades da plataforma',
                featuresLead:
                    'Explore capacidades que ajudam candidatos e empregadores inclusivos na descoberta, matching, formação, conformidade e acompanhamento.',
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
                faq: 'Perguntas frequentes',
                open: 'Abrir ferramentas interativas'
            }
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
            '.faq-answer p{font-size:1rem;line-height:1.8;color:#475569!important;border-left:4px solid #60a5fa;padding:.85rem 1rem;background:rgba(255,255,255,.75);border-radius:.75rem;box-shadow:inset 0 0 0 1px rgba(226,232,240,.65)}',
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
    });

    window.GBASite = {
        applyLanguage: applyLanguage,
        setLanguage: setLang
    };
})();
