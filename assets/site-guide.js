/**
 * GBA Platform – Site Guide (onboarding tour)
 * Auto-starts for first-time visitors; skippable; replayable anytime.
 */
(function () {
    'use strict';

    var STORAGE_PREFIX = 'gba_site_guide_v1_';
    var LANG_KEY = 'gba_ui_lang';

    var UI = {
        en: {
            fabLabel: 'Site guide',
            welcomeTitle: 'Welcome to GBA Platform',
            welcomeBody: 'This short tour shows how to navigate the site. You can skip anytime and replay later from the guide button.',
            stepOf: 'Step {current} of {total}',
            skip: 'Skip tour',
            back: 'Back',
            next: 'Next',
            finish: 'Got it',
            replay: 'Replay guide',
            close: 'Close'
        },
        'zh-CN': {
            fabLabel: '使用指引',
            welcomeTitle: '欢迎使用大湾区就业赋能平台',
            welcomeBody: '接下来将用几步介绍网站主要功能。可随时跳过，之后也可通过左下角按钮重温指引。',
            stepOf: '第 {current} / {total} 步',
            skip: '跳过指引',
            back: '上一步',
            next: '下一步',
            finish: '完成',
            replay: '重温指引',
            close: '关闭'
        },
        'zh-TW': {
            fabLabel: '使用指引',
            welcomeTitle: '歡迎使用大灣區就業賦能平台',
            welcomeBody: '接下來將用幾步介紹網站主要功能。可隨時跳過，之後也可透過左下角按鈕重溫指引。',
            stepOf: '第 {current} / {total} 步',
            skip: '跳過指引',
            back: '上一步',
            next: '下一步',
            finish: '完成',
            replay: '重溫指引',
            close: '關閉'
        },
        pt: {
            fabLabel: 'Guia do site',
            welcomeTitle: 'Bem-vindo à Plataforma GBA',
            welcomeBody: 'Este tour rápido mostra como navegar no site. Pode saltar a qualquer momento e rever depois no botão de guia.',
            stepOf: 'Passo {current} de {total}',
            skip: 'Saltar tour',
            back: 'Anterior',
            next: 'Seguinte',
            finish: 'Concluir',
            replay: 'Rever guia',
            close: 'Fechar'
        }
    };

    var STEPS = {
        home: {
            en: [
                { target: null, title: 'Welcome to GBA Platform', body: 'This platform connects job seekers and inclusive employers across the Greater Bay Area with AI tools, job matching, and legal support.' },
                { target: '#top-hero', title: 'Choose your portal', body: 'Start as an individual job seeker or as a corporate recruiter. Both portals share the same platform infrastructure.' },
                { target: '#features', title: 'Platform capabilities', body: 'Explore resume AI, interview prep, learning paths, policy tools, and inclusive hiring features built for cross-border employment.' },
                { target: '#how-it-works', title: 'How it works', body: 'Follow the end-to-end loop from profile creation and matching to applications, interviews, and post-hire support.' },
                { target: '#faq', title: 'FAQ & help', body: 'Find answers about access, donations, data security, and accessibility. Expand any question for details.' },
                { target: '#language-toggle-btn, .language-selector', title: 'Language & accessibility', body: 'Switch between English, Chinese, and Portuguese.' }
            ],
            'zh-CN': [
                { target: null, title: '欢迎使用大湾区就业赋能平台', body: '本平台连接大湾区求职者与包容型企业，提供 AI 简历/面试、岗位匹配与法律支持等服务。' },
                { target: '#top-hero', title: '选择入口', body: '个人用户进入「个人端」，企业用户进入「企业端」。两端共享同一套平台能力。' },
                { target: '#features', title: '平台能力', body: '了解智能简历、面试准备、学习路径、政策工具与包容招聘等功能，助力跨境就业。' },
                { target: '#how-it-works', title: '运作方式', body: '从注册建档、智能匹配到投递、面试与入职跟进，一站式完成就业闭环。' },
                { target: '#faq', title: '常见问题', body: '查阅访问权限、捐款解锁、数据安全与无障碍等说明，点击问题展开详情。' },
                { target: '#language-toggle-btn, .language-selector', title: '语言与无障碍', body: '可切换英文、中文与葡语。' }
            ],
            'zh-TW': [
                { target: null, title: '歡迎使用大灣區就業賦能平台', body: '本平台連接大灣區求職者與包容型企業，提供 AI 履歷/面試、職位匹配與法律支援等服務。' },
                { target: '#top-hero', title: '選擇入口', body: '個人用戶進入「個人端」，企業用戶進入「企業端」。兩端共享同一套平台能力。' },
                { target: '#features', title: '平台能力', body: '了解智能履歷、面試準備、學習路徑、政策工具與包容招聘等功能，助力跨境就業。' },
                { target: '#how-it-works', title: '運作方式', body: '從註冊建檔、智能匹配到投遞、面試與入職跟進，一站式完成就業閉環。' },
                { target: '#faq', title: '常見問題', body: '查閱訪問權限、捐款解鎖、資料安全與無障礙等說明，點擊問題展開詳情。' },
                { target: '#language-toggle-btn, .language-selector', title: '語言與無障礙', body: '可切換英文、中文與葡語。' }
            ],
            pt: [
                { target: null, title: 'Bem-vindo à Plataforma GBA', body: 'A plataforma liga candidatos e empregadores inclusivos na GBA com ferramentas de IA, matching e apoio jurídico.' },
                { target: '#top-hero', title: 'Escolha o portal', body: 'Entre como candidato individual ou recrutador empresarial. Ambos partilham a mesma infraestrutura.' },
                { target: '#features', title: 'Capacidades', body: 'Explore CV com IA, preparação para entrevistas, percursos de aprendizagem e recrutamento inclusivo.' },
                { target: '#how-it-works', title: 'Como funciona', body: 'Siga o ciclo completo: perfil, matching, candidaturas, entrevistas e acompanhamento pós-contratação.' },
                { target: '#faq', title: 'FAQ', body: 'Respostas sobre acesso, doações, segurança de dados e acessibilidade.' },
                { target: '#language-toggle-btn, .language-selector', title: 'Idioma e acessibilidade', body: 'Mude entre inglês, chinês e português.' }
            ]
        },
        individual: {
            en: [
                { target: null, title: 'Individual portal guide', body: 'Your dashboard brings together AI career tools, job matching, applications, and legal/donation access in one place.' },
                { target: '#dashboard', title: 'Personal dashboard', body: 'Overview of all tools. Complete your profile and check access status banners here before starting.' },
                { target: 'a[href="demo-resume-generator.html"]', title: 'Smart resume', body: 'Upload a resume and target job description. AI analyzes gaps and generates a tailored version.' },
                { target: 'a[href="demo-interview.html"]', title: 'Interview prep', body: 'Practice role-specific questions with AI feedback to build confidence before real interviews.' },
                { target: 'a[href="demo-jobs-database.html"]', title: 'Job matching', body: 'Browse matched roles by group type and resume score. Apply on-platform or follow external links.' },
                { target: 'a[href="donation-legal.html"]', title: 'Donation & legal aid', body: 'Vulnerable groups use the platform for free. Others may donate any amount to unlock features and support legal services.' }
            ],
            'zh-CN': [
                { target: null, title: '个人端使用指引', body: '仪表盘集中了 AI 职业工具、岗位匹配、投递记录与捐款/法律服务入口。' },
                { target: '#dashboard', title: '个人仪表盘', body: '在此查看全部工具入口与访问状态横幅，建议先完善资料再开始使用。' },
                { target: 'a[href="demo-resume-generator.html"]', title: '智能简历', body: '上传简历与目标岗位描述，AI 分析差距并生成定制版简历。' },
                { target: 'a[href="demo-interview.html"]', title: '面试准备', body: '针对目标岗位练习 AI 生成的面试题，获得反馈后再参加真实面试。' },
                { target: 'a[href="demo-jobs-database.html"]', title: '岗位匹配', body: '按人群类型与简历评分浏览推荐岗位，平台内可直接投递。' },
                { target: 'a[href="donation-legal.html"]', title: '捐款与法律服务', body: '弱势群体免费使用；其他用户可向法律服务捐款箱捐款（金额不限）以解锁功能。' }
            ],
            'zh-TW': [
                { target: null, title: '個人端使用指引', body: '儀表板集中了 AI 職業工具、職位匹配、投遞記錄與捐款/法律服務入口。' },
                { target: '#dashboard', title: '個人儀表板', body: '在此查看全部工具入口與訪問狀態橫幅，建議先完善資料再開始使用。' },
                { target: 'a[href="demo-resume-generator.html"]', title: '智能履歷', body: '上傳履歷與目標職位描述，AI 分析差距並生成定制版履歷。' },
                { target: 'a[href="demo-interview.html"]', title: '面試準備', body: '針對目標職位練習 AI 生成的面試題，獲得回饋後再參加真實面試。' },
                { target: 'a[href="demo-jobs-database.html"]', title: '職位匹配', body: '按人群類型與履歷評分瀏覽推薦職位，平台內可直接投遞。' },
                { target: 'a[href="donation-legal.html"]', title: '捐款與法律服務', body: '弱勢群體免費使用；其他用戶可向法律服務捐款箱捐款（金額不限）以解鎖功能。' }
            ],
            pt: [
                { target: null, title: 'Guia do portal individual', body: 'O painel reúne ferramentas de IA, matching, candidaturas e acesso jurídico/doações.' },
                { target: '#dashboard', title: 'Painel pessoal', body: 'Visão geral das ferramentas e banners de acesso. Complete o perfil antes de começar.' },
                { target: 'a[href="demo-resume-generator.html"]', title: 'CV inteligente', body: 'Carregue CV e descrição da vaga. A IA analisa lacunas e gera uma versão personalizada.' },
                { target: 'a[href="demo-interview.html"]', title: 'Preparação para entrevista', body: 'Pratique perguntas específicas do cargo com feedback da IA.' },
                { target: 'a[href="demo-jobs-database.html"]', title: 'Matching de vagas', body: 'Navegue vagas recomendadas por perfil e pontuação do CV.' },
                { target: 'a[href="donation-legal.html"]', title: 'Doação e apoio jurídico', body: 'Grupos vulneráveis usam gratuitamente. Outros podem doar para desbloquear funcionalidades.' }
            ]
        },
        corporate: {
            en: [
                { target: null, title: 'Corporate portal guide', body: 'Manage inclusive hiring, post jobs with target criteria, and review scored applicants from one dashboard.' },
                { target: '#dashboard', title: 'Recruitment dashboard', body: 'Track diversity metrics, pipeline stats, and quick actions for your hiring workflow.' },
                { target: '#ai-features', title: 'HR & compliance tools', body: 'Use blind screening, compliance calculators, DEI analytics, and remote-work readiness checks.' },
                { target: '#jobs', title: 'My jobs', body: 'View and manage posted roles, edit requirements, and monitor applicant volume.' },
                { target: 'a[href="post-job.html"]', title: 'Post a job', body: 'Create new inclusive roles with target group criteria so matching scores applicants accurately.' },
                { target: '.language-selector', title: 'Language', body: 'Switch UI language here.' }
            ],
            'zh-CN': [
                { target: null, title: '企业端使用指引', body: '在一个门户中管理包容招聘、发布带目标条件的岗位，并查看评分排序的申请人。' },
                { target: '#dashboard', title: '招聘仪表盘', body: '查看多样性指标、招聘漏斗数据与快捷操作。' },
                { target: '#ai-features', title: 'HR 与合规工具', body: '使用盲筛、合规测算、DEI 分析与远程包容工作就绪检查。' },
                { target: '#jobs', title: '岗位管理', body: '查看已发布岗位、编辑要求并监控申请量。' },
                { target: 'a[href="post-job.html"]', title: '发布岗位', body: '创建带目标人群条件的包容型岗位，以便系统准确匹配评分。' },
                { target: '.language-selector', title: '语言', body: '在此切换界面语言。' }
            ],
            'zh-TW': [
                { target: null, title: '企業端使用指引', body: '在一個門戶中管理包容招聘、發布帶目標條件的職位，並查看評分排序的申請人。' },
                { target: '#dashboard', title: '招聘儀表板', body: '查看多樣性指標、招聘漏斗數據與快捷操作。' },
                { target: '#ai-features', title: 'HR 與合規工具', body: '使用盲篩、合規測算、DEI 分析與遠端包容工作就緒檢查。' },
                { target: '#jobs', title: '職位管理', body: '查看已發布職位、編輯要求並監控申請量。' },
                { target: 'a[href="post-job.html"]', title: '發布職位', body: '創建帶目標人群條件的包容型職位，以便系統準確匹配評分。' },
                { target: '.language-selector', title: '語言', body: '在此切換介面語言。' }
            ],
            pt: [
                { target: null, title: 'Guia do portal empresarial', body: 'Gerencie recrutamento inclusivo, publique vagas com critérios-alvo e analise candidatos pontuados.' },
                { target: '#dashboard', title: 'Painel de recrutamento', body: 'Acompanhe métricas de diversidade e estatísticas do pipeline.' },
                { target: '#ai-features', title: 'Ferramentas de RH', body: 'Triagem cega, calculadoras de conformidade, análise DEI e verificação de trabalho remoto.' },
                { target: '#jobs', title: 'Minhas vagas', body: 'Veja e gira vagas publicadas e monitorize candidaturas.' },
                { target: 'a[href="post-job.html"]', title: 'Publicar vaga', body: 'Crie vagas inclusivas com critérios de grupo-alvo para matching preciso.' },
                { target: '.language-selector', title: 'Idioma', body: 'Mude o idioma aqui.' }
            ]
        }
    };

    var page = (document.body && document.body.getAttribute('data-page')) || detectPage();
    var active = false;
    var currentStep = 0;
    var steps = [];
    var overlayEl, spotlightEl, cardEl, fabEl;

    function detectPage() {
        var path = location.pathname.replace(/\\/g, '/');
        if (path.indexOf('/corporate/') !== -1) return 'corporate';
        if (path.indexOf('/individual/') !== -1) return 'individual';
        return 'home';
    }

    function getLang() {
        try {
            return localStorage.getItem(LANG_KEY) || 'en';
        } catch (e) {
            return 'en';
        }
    }

    function t(key) {
        var lang = UI[getLang()] ? getLang() : 'en';
        return UI[lang][key] || UI.en[key] || key;
    }

    function formatStepOf(current, total) {
        return t('stepOf').replace('{current}', String(current)).replace('{total}', String(total));
    }

    function storageKey() {
        return STORAGE_PREFIX + page;
    }

    function getStatus() {
        try {
            return localStorage.getItem(storageKey()) || '';
        } catch (e) {
            return '';
        }
    }

    function setStatus(value) {
        try {
            localStorage.setItem(storageKey(), value);
        } catch (e) {}
    }

    function loadSteps() {
        var lang = getLang();
        var pack = STEPS[page];
        if (!pack) return [];
        return pack[lang] || pack.en || [];
    }

    function resolveTarget(selector) {
        if (!selector) return null;
        var parts = selector.split(',').map(function (s) { return s.trim(); });
        for (var i = 0; i < parts.length; i += 1) {
            var el = document.querySelector(parts[i]);
            if (el) return el;
        }
        return null;
    }

    function injectStyles() {
        if (document.getElementById('gba-site-guide-styles')) return;
        var style = document.createElement('style');
        style.id = 'gba-site-guide-styles';
        style.textContent = [
            '#gba-guide-overlay {',
            '  position: fixed; inset: 0; z-index: 9600;',
            '  background: rgba(15, 23, 42, 0.55);',
            '  opacity: 0; pointer-events: none; transition: opacity .25s ease;',
            '}',
            '#gba-guide-overlay.active { opacity: 1; pointer-events: all; }',
            '#gba-guide-spotlight {',
            '  position: fixed; z-index: 9601; border-radius: 14px;',
            '  box-shadow: 0 0 0 9999px rgba(15, 23, 42, 0.62);',
            '  pointer-events: none; transition: top .25s ease, left .25s ease, width .25s ease, height .25s ease;',
            '  outline: 2px solid rgba(96, 165, 250, 0.95);',
            '  outline-offset: 2px;',
            '}',
            '#gba-guide-spotlight.hidden { display: none; }',
            '#gba-guide-card {',
            '  position: fixed; z-index: 9602; width: min(420px, calc(100vw - 2rem));',
            '  background: #fff; border-radius: 16px;',
            '  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28);',
            '  padding: 1.25rem 1.35rem 1rem;',
            '  transform: translateY(8px); opacity: 0;',
            '  transition: transform .25s ease, opacity .25s ease, top .25s ease, left .25s ease;',
            '}',
            '#gba-guide-card.active { transform: translateY(0); opacity: 1; }',
            '#gba-guide-card .gga-step { font-size: .72rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #2563eb; margin-bottom: .35rem; }',
            '#gba-guide-card .gga-title { font-size: 1.05rem; font-weight: 700; color: #0f172a; margin-bottom: .5rem; line-height: 1.35; }',
            '#gba-guide-card .gga-body { font-size: .9rem; color: #475569; line-height: 1.65; margin-bottom: 1rem; }',
            '#gba-guide-card .gga-actions { display: flex; align-items: center; justify-content: space-between; gap: .5rem; flex-wrap: wrap; }',
            '#gba-guide-card .gga-left { display: flex; gap: .4rem; flex-wrap: wrap; }',
            '#gba-guide-card .gga-right { display: flex; gap: .4rem; }',
            '#gba-guide-card button {',
            '  border-radius: 10px; padding: .5rem .85rem; font-size: .82rem; font-weight: 600;',
            '  cursor: pointer; border: 1.5px solid transparent; transition: all .15s;',
            '}',
            '#gba-guide-card .gga-skip { background: transparent; color: #64748b; border-color: #e2e8f0; }',
            '#gba-guide-card .gga-skip:hover { background: #f8fafc; color: #334155; }',
            '#gba-guide-card .gga-back { background: #f1f5f9; color: #334155; }',
            '#gba-guide-card .gga-back:hover { background: #e2e8f0; }',
            '#gba-guide-card .gga-next { background: linear-gradient(135deg, #2563eb, #059669); color: #fff; }',
            '#gba-guide-card .gga-next:hover { filter: brightness(1.05); }',
            '#gba-guide-fab {',
            '  position: fixed; bottom: 2rem; left: 2rem; z-index: 8900;',
            '  display: inline-flex; align-items: center; gap: .45rem;',
            '  padding: .65rem 1rem; border-radius: 999px; border: none; cursor: pointer;',
            '  background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #fff;',
            '  font-size: .82rem; font-weight: 700;',
            '  box-shadow: 0 8px 24px rgba(37, 99, 235, 0.35);',
            '  transition: transform .2s, box-shadow .2s, opacity .2s;',
            '}',
            '#gba-guide-fab:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(37, 99, 235, 0.42); }',
            '#gba-guide-fab.hidden { opacity: 0; pointer-events: none; }',
            'body.gba-guide-active { overflow: hidden; }',
            '@media (max-width: 480px) {',
            '  #gba-guide-fab { left: 1rem; bottom: 1.5rem; padding: .55rem .75rem; }',
            '  #gba-guide-card { left: 1rem !important; right: 1rem; width: auto; }',
            '}'
        ].join('\n');
        document.head.appendChild(style);
    }

    function buildUi() {
        injectStyles();

        overlayEl = document.createElement('div');
        overlayEl.id = 'gba-guide-overlay';
        overlayEl.setAttribute('role', 'presentation');

        spotlightEl = document.createElement('div');
        spotlightEl.id = 'gba-guide-spotlight';
        spotlightEl.className = 'hidden';

        cardEl = document.createElement('div');
        cardEl.id = 'gba-guide-card';
        cardEl.setAttribute('role', 'dialog');
        cardEl.setAttribute('aria-modal', 'true');
        cardEl.setAttribute('aria-labelledby', 'gba-guide-title');
        cardEl.innerHTML =
            '<div class="gga-step" id="gba-guide-step-label"></div>' +
            '<div class="gga-title" id="gba-guide-title"></div>' +
            '<div class="gga-body" id="gba-guide-body"></div>' +
            '<div class="gga-actions">' +
            '  <div class="gga-left"><button type="button" class="gga-skip" id="gba-guide-skip">' + t('skip') + '</button></div>' +
            '  <div class="gga-right">' +
            '    <button type="button" class="gga-back" id="gba-guide-back">' + t('back') + '</button>' +
            '    <button type="button" class="gga-next" id="gba-guide-next">' + t('next') + '</button>' +
            '  </div>' +
            '</div>';

        fabEl = document.createElement('button');
        fabEl.id = 'gba-guide-fab';
        fabEl.type = 'button';
        fabEl.setAttribute('aria-label', t('fabLabel'));
        fabEl.innerHTML = '<i class="fas fa-compass"></i><span>' + t('fabLabel') + '</span>';

        document.body.appendChild(overlayEl);
        document.body.appendChild(spotlightEl);
        document.body.appendChild(cardEl);
        document.body.appendChild(fabEl);

        document.getElementById('gba-guide-skip').addEventListener('click', skipTour);
        document.getElementById('gba-guide-back').addEventListener('click', prevStep);
        document.getElementById('gba-guide-next').addEventListener('click', nextStep);
        fabEl.addEventListener('click', function () { startTour(true); });

        document.addEventListener('keydown', function (e) {
            if (!active) return;
            if (e.key === 'Escape') skipTour();
            if (e.key === 'ArrowRight') nextStep();
            if (e.key === 'ArrowLeft') prevStep();
        });

        window.addEventListener('resize', function () {
            if (active) renderStep(false);
        });
    }

    function refreshLabels() {
        if (!fabEl) return;
        fabEl.setAttribute('aria-label', t('fabLabel'));
        fabEl.querySelector('span').textContent = t('fabLabel');
        var skipBtn = document.getElementById('gba-guide-skip');
        var backBtn = document.getElementById('gba-guide-back');
        var nextBtn = document.getElementById('gba-guide-next');
        if (skipBtn) skipBtn.textContent = t('skip');
        if (backBtn) backBtn.textContent = t('back');
        if (nextBtn) nextBtn.textContent = currentStep >= steps.length - 1 ? t('finish') : t('next');
    }

    function positionCard(targetRect, centered) {
        var margin = 16;
        var cardW = Math.min(420, window.innerWidth - margin * 2);
        var cardH = cardEl.offsetHeight || 220;
        var top;
        var left;

        if (centered || !targetRect) {
            top = Math.max(margin, (window.innerHeight - cardH) / 2);
            left = Math.max(margin, (window.innerWidth - cardW) / 2);
        } else {
            var preferBelow = targetRect.bottom + cardH + 20 < window.innerHeight;
            top = preferBelow ? targetRect.bottom + 16 : Math.max(margin, targetRect.top - cardH - 16);
            left = Math.min(
                Math.max(margin, targetRect.left),
                window.innerWidth - cardW - margin
            );
        }

        cardEl.style.top = top + 'px';
        cardEl.style.left = left + 'px';
        cardEl.style.width = cardW + 'px';
    }

    function renderStep(scrollToTarget) {
        if (!steps.length) return;
        var step = steps[currentStep];
        var target = resolveTarget(step.target);
        var backBtn = document.getElementById('gba-guide-back');
        var nextBtn = document.getElementById('gba-guide-next');

        document.getElementById('gba-guide-step-label').textContent = formatStepOf(currentStep + 1, steps.length);
        document.getElementById('gba-guide-title').textContent = step.title;
        document.getElementById('gba-guide-body').textContent = step.body;

        backBtn.style.visibility = currentStep === 0 ? 'hidden' : 'visible';
        nextBtn.textContent = currentStep >= steps.length - 1 ? t('finish') : t('next');

        if (target) {
            if (scrollToTarget !== false) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            }
            window.setTimeout(function () {
                var rect = target.getBoundingClientRect();
                if (rect.width < 2 && rect.height < 2) {
                    spotlightEl.classList.add('hidden');
                    positionCard(null, true);
                    cardEl.classList.add('active');
                    return;
                }
                var pad = 10;
                spotlightEl.classList.remove('hidden');
                spotlightEl.style.top = Math.max(8, rect.top - pad) + 'px';
                spotlightEl.style.left = Math.max(8, rect.left - pad) + 'px';
                spotlightEl.style.width = Math.min(window.innerWidth - 16, rect.width + pad * 2) + 'px';
                spotlightEl.style.height = Math.min(window.innerHeight - 16, rect.height + pad * 2) + 'px';
                positionCard(rect, false);
                cardEl.classList.add('active');
            }, scrollToTarget === false ? 0 : 350);
        } else {
            spotlightEl.classList.add('hidden');
            positionCard(null, true);
            cardEl.classList.add('active');
        }
    }

    function portalGuideUrl() {
        if (page === 'corporate') return 'portal.html?guide=1';
        if (page === 'individual') return 'portal.html?guide=1';
        return 'index.html?guide=1';
    }

    function startTour(force) {
        if (!isMainPortalPage()) {
            window.location.href = portalGuideUrl();
            return;
        }

        steps = loadSteps();
        if (!steps.length) return;

        if (!overlayEl) buildUi();
        refreshLabels();

        currentStep = 0;
        active = true;
        document.body.classList.add('gba-guide-active');
        fabEl.classList.add('hidden');
        overlayEl.classList.add('active');
        cardEl.classList.remove('active');

        window.setTimeout(function () {
            renderStep(true);
        }, force ? 50 : 200);

        if (force) {
            try {
                var url = new URL(location.href);
                if (url.searchParams.has('guide')) {
                    url.searchParams.delete('guide');
                    history.replaceState({}, '', url.pathname + url.search + url.hash);
                }
            } catch (e) {}
        }
    }

    function endTour(status) {
        active = false;
        document.body.classList.remove('gba-guide-active');
        overlayEl.classList.remove('active');
        spotlightEl.classList.add('hidden');
        cardEl.classList.remove('active');
        fabEl.classList.remove('hidden');
        if (status) setStatus(status);
    }

    function skipTour() {
        endTour('skipped');
    }

    function finishTour() {
        endTour('done');
    }

    function nextStep() {
        if (currentStep >= steps.length - 1) {
            finishTour();
            return;
        }
        currentStep += 1;
        cardEl.classList.remove('active');
        renderStep(true);
    }

    function prevStep() {
        if (currentStep <= 0) return;
        currentStep -= 1;
        cardEl.classList.remove('active');
        renderStep(true);
    }

    function isMainPortalPage() {
        var path = location.pathname.replace(/\\/g, '/').toLowerCase();
        if (path.indexOf('/individual/portal.html') !== -1) return true;
        if (path.indexOf('/corporate/portal.html') !== -1) return true;
        return /(^|\/)index\.html$/.test(path) && path.indexOf('/individual/') === -1 && path.indexOf('/corporate/') === -1;
    }

    function shouldAutoStart() {
        if (!isMainPortalPage()) return false;
        var params;
        try {
            params = new URLSearchParams(location.search);
        } catch (e) {
            params = null;
        }
        if (params && params.get('guide') === 'reset') {
            setStatus('');
            return true;
        }
        if (params && (params.get('guide') === '1' || params.get('guide') === 'replay')) {
            return true;
        }
        return !getStatus();
    }

    function init() {
        steps = loadSteps();
        if (!steps.length) return;

        buildUi();

        if (shouldAutoStart()) {
            window.setTimeout(function () {
                startTour(false);
            }, 900);
        }
    }

    window.GBAGuide = {
        start: function () { startTour(true); },
        skip: skipTour,
        reset: function () {
            setStatus('');
            startTour(true);
        },
        hasSeen: function () { return !!getStatus(); },
        page: page
    };

    window.addEventListener('gba:language-changed', function () {
        steps = loadSteps();
        refreshLabels();
        if (active) renderStep(false);
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
