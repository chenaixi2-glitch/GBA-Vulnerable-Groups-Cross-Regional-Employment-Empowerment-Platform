(function () {
    'use strict';

    var LANG_KEY = 'gba_ui_lang';
    var SUPPORTED = ['en', 'zh-CN', 'zh-TW', 'pt'];
    var LABELS = {
        en: 'English',
        'zh-CN': '简体中文',
        'zh-TW': '繁體中文',
        pt: 'Português'
    };

    /** Language names shown in the switcher (English fallbacks when UI is English) */
    var LANG_NAMES_FB = {
        en: 'English',
        'zh-CN': 'Simplified Chinese',
        'zh-TW': 'Traditional Chinese',
        pt: 'Portuguese'
    };

    /** UI locale → resume/API language code */
    var UI_TO_API = {
        en: 'en',
        'zh-CN': 'zh',
        'zh-TW': 'zh-TW',
        pt: 'pt'
    };

    var API_TO_UI = {
        en: 'en',
        zh: 'zh-CN',
        'zh-cn': 'zh-CN',
        'zh-tw': 'zh-TW',
        pt: 'pt'
    };

    var RESUME_LANG_LABELS = {
        zh: { en: 'Simplified Chinese', 'zh-CN': '简体中文', 'zh-TW': '簡體中文', pt: 'Chinês simplificado' },
        'zh-TW': { en: 'Traditional Chinese', 'zh-CN': '繁体中文', 'zh-TW': '繁體中文', pt: 'Chinês tradicional' },
        en: { en: 'English', 'zh-CN': '英文', 'zh-TW': '英文', pt: 'Inglês' },
        pt: { en: 'Portuguese (Macau)', 'zh-CN': '葡语（澳门）', 'zh-TW': '葡語（澳門）', pt: 'Português (Macau)' }
    };

    var RESUME_LANG_CODES = ['zh', 'zh-TW', 'en', 'pt'];
    /** Legacy flat data-i18n keys → dotted locale keys (home page / shared footer) */
    var LEGACY_I18N_KEYS = {
        'nav-features': 'home.features',
        'nav-faq': 'home.faq',
        'nav-dashboard': 'home.dashboard',
        'nav-demos': 'home.demos',
        'nav-resources': 'home.resources',
        'nav-stories': 'home.stories',
        'nav-jobs': 'home.jobs',
        'nav-analytics': 'home.analytics',
        'hero-title': 'home.title',
        'hero-subtitle': 'home.subtitle',
        'hero-individual': 'home.individual',
        'hero-corporate': 'home.corporate',
        'hero-open-demos': 'home.open',
        'section-features-title': 'home.features',
        'section-features-lead': 'home.featuresLead',
        'section-workflow-title': 'home.workflow',
        'section-benefits-title': 'home.benefits',
        'section-stories-title': 'home.stories',
        'section-faq-title': 'home.faq',
        'section-cta-title': 'home.cta'
    };
    var localeCache = {};
    var currentLang = 'en';
    var applyLanguageTimer = null;

    /** English locale file (assets/i18n/locales/en.json) supplements inline fallbacks in JS */
    var META_FB = {
        groupTypes: {
            disability: 'People with disabilities',
            elderly_45plus: 'Workers aged 45+',
            career_returner: 'Career-returning women',
            youth: 'Low-income youth'
        },
        gender: {
            male: 'Male',
            female: 'Female',
            other: 'Other',
            prefer_not_say: 'Prefer not to say'
        },
        disabilityTypes: {
            none: 'None',
            physical: 'Physical disability',
            visual: 'Visual disability',
            hearing: 'Hearing disability',
            intellectual: 'Intellectual disability',
            mental: 'Mental disability',
            other: 'Other disability'
        }
    };

    var LEGAL_SERVICES_FB = {
        title: 'Legal aid for vulnerable groups',
        subtitle: 'Fully funded by the platform donation box. Users can submit legal requests; lawyers, volunteers or the platform can assist.',
        fundPromise: '100% of donations fund this service — no administrative fees.',
        contactHours: 'Mon–Fri 9:00–18:00',
        labor_rights: {
            title: 'Labor rights consultation',
            description: 'Basic labor law advice on contracts, pay, benefits, workplace injury recognition and rights guidance for vulnerable groups.'
        },
        cross_border: {
            title: 'Cross-border employment guidance',
            description: 'Visa, work permits and social insurance continuity for Greater Bay Area cross-border employment.'
        },
        anti_discrimination: {
            title: 'Anti-discrimination legal aid',
            description: 'Complaint channels and legal support for age, disability, gender and other employment discrimination.'
        },
        disability_employment: {
            title: 'Disability employment rights',
            description: 'Reasonable accommodation, accessible workplaces and disability certificate related rights.'
        },
        career_return: {
            title: 'Career-returning women support',
            description: 'Legal rights and negotiation guidance for re-employment after career gaps.'
        }
    };

    /** Map API error codes / Chinese API messages → English when UI language is English */
    var EN_API_MESSAGES = {
        'SESSION_BUSY': 'Another AI task is already running for this session. Please wait for it to finish, then try again.',
        'INTERVIEW_STARTED': 'Mock interview started. Please answer the interviewer\'s questions.',
        'INTERVIEW_TURN_ENDED': 'Interview ended. You can view the debrief report.',
        'INTERVIEW_TURN_WAITING': 'Core questions done — generating follow-ups and feedback, please wait…',
        'INTERVIEW_TURN_NEXT': 'Continue with the next question; feedback will appear asynchronously.',
        'INTERVIEW_TURN_RECORDED': 'Answer recorded. Please wait for the next question or feedback.',
        'INTERVIEW_POLL_ENDED': 'Interview ended.',
        'INTERVIEW_POLL_WAITING_FU': 'Generating follow-up questions…',
        'INTERVIEW_POLL_FEEDBACK': 'Generating feedback…',
        'INTERVIEW_POLL_SYNCED': 'Status synced.',
        'INTERVIEW_DEBRIEF_READY': 'Debrief report generated.',
        'INTERVIEW_ERR_NO_PREREQUISITES': 'Missing candidate profile — cannot start mock interview.',
        'INTERVIEW_ERR_NO_BANK': 'Could not generate question bank. Please complete job and resume steps.',
        'INTERVIEW_ERR_ALREADY_ACTIVE': 'A mock interview is already in progress.',
        'INTERVIEW_ERR_NOT_ACTIVE': 'No mock interview in progress.',
        'INTERVIEW_ERR_EMPTY_ANSWER': 'Please provide an answer.',
        'INTERVIEW_ERR_NO_CURRENT_QUESTION': 'No pending interview question.',
        'INTERVIEW_ERR_NO_POLL_SESSION': 'No mock interview session to sync.',
        'INTERVIEW_ERR_NO_TURNS': 'No interview dialogue recorded.',
        '您属于弱势群体，平台各项功能免费使用，无需捐款': 'You belong to a vulnerable group — platform features are free; no donation required.',
        '感谢您的爱心捐款！资金将全额用于弱势群体法律服务。': 'Thank you for your donation! All funds go to legal aid for vulnerable groups.',
        '请输入有效的捐款金额（大于 0，不限上限）': 'Please enter a valid donation amount (greater than 0).',
        '单次捐款金额超出上限': 'Donation amount exceeds the maximum limit.',
        '用户不存在': 'User not found.',
        '请先完善个人资料（年龄、性别、收入等）': 'Please complete your profile (age, gender, income, etc.) first.'
    };

    function getLang() {
        try {
            var saved = localStorage.getItem(LANG_KEY);
            if (saved && LABELS[saved]) return saved;
        } catch (e) {}
        return 'en';
    }

    function localePath(lang) {
        var base = document.currentScript && document.currentScript.src
            ? document.currentScript.src.replace(/[^/]+$/, '')
            : 'assets/i18n/';
        return base + 'locales/' + lang + '.json';
    }

    function loadLocale(lang) {
        if (localeCache[lang]) return Promise.resolve(localeCache[lang]);
        return fetch(localePath(lang))
            .then(function (res) {
                if (!res.ok) throw new Error('locale load failed: ' + lang);
                return res.json();
            })
            .then(function (data) {
                localeCache[lang] = data;
                return data;
            })
            .catch(function () {
                localeCache[lang] = {};
                return {};
            });
    }

    function resolveKey(obj, key) {
        if (!obj || !key) return '';
        var parts = key.split('.');
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
            if (!cur || typeof cur !== 'object') return '';
            cur = cur[parts[i]];
        }
        return typeof cur === 'string' ? cur : '';
    }

    function applyVars(text, vars) {
        if (!text || !vars) return text;
        var result = String(text);
        Object.keys(vars).forEach(function (k) {
            result = result.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
        });
        return result;
    }

    function t(key, fallback, vars) {
        var val = resolveKey(localeCache[currentLang], key);
        if (val) {
            return applyVars(val, vars);
        }
        var strings = localeCache[currentLang] && localeCache[currentLang].strings;
        if (strings && strings[fallback || key]) {
            return applyVars(strings[fallback || key], vars);
        }
        return applyVars(fallback || key, vars);
    }

    function translateString(raw, lang) {
        if (!raw || lang === 'en') return raw;
        var data = localeCache[lang];
        if (!data || !data.strings) return raw;
        var trimmed = raw.trim();
        if (!trimmed) return raw;
        var translated = data.strings[trimmed];
        if (!translated && /%\s*Match$/.test(trimmed)) {
            var matchWord = data.strings.Match || 'Match';
            translated = trimmed.replace('Match', matchWord);
        }
        if (!translated) return raw;
        return raw.replace(trimmed, translated);
    }

    function tMetaOption(category, key, serverLabel) {
        if (!key) return serverLabel || '';
        var fbMap = META_FB[category] || {};
        var fb = fbMap[key] || serverLabel || key;
        return t('meta.' + category + '.' + key, fb);
    }

    function formatGroupTypes(types) {
        var list = Array.isArray(types) ? types : [];
        if (!list.length) return '';
        var sep = t('meta.listSeparator', ', ');
        return list.map(function (key) {
            return tMetaOption('groupTypes', key, key);
        }).join(sep);
    }

    function translateOptionMap(options, category) {
        if (!options || typeof options !== 'object') return options || {};
        var out = {};
        Object.keys(options).forEach(function (key) {
            out[key] = tMetaOption(category, key, options[key]);
        });
        return out;
    }

    function translateLegalServicesData(data) {
        if (!data) return data;
        var translated = Object.assign({}, data);
        translated.title = t('legalServices.title', LEGAL_SERVICES_FB.title);
        translated.subtitle = t('legalServices.subtitle', LEGAL_SERVICES_FB.subtitle);
        translated.fund_promise = t('legalServices.fundPromise', LEGAL_SERVICES_FB.fundPromise);
        translated.services = (data.services || []).map(function (s) {
            var svcFb = LEGAL_SERVICES_FB[s.id] || {};
            return Object.assign({}, s, {
                title: t('legalServices.' + s.id + '.title', svcFb.title || s.title),
                description: t('legalServices.' + s.id + '.description', svcFb.description || s.description)
            });
        });
        if (data.contact) {
            translated.contact = Object.assign({}, data.contact, {
                hours: t('legalServices.contactHours', LEGAL_SERVICES_FB.contactHours)
            });
        }
        return translated;
    }

    /** Translate API error code (e.g. SESSION_BUSY) for the current UI language */
    function tApiCode(code, i18nKey, fallbackEn) {
        if (code == null) return '';
        var key = String(code).trim();
        if (!key) return '';
        if (currentLang === 'en' && EN_API_MESSAGES[key]) return EN_API_MESSAGES[key];
        var data = localeCache[currentLang];
        if (data && data.apiMessages && data.apiMessages[key]) return data.apiMessages[key];
        return t(i18nKey, fallbackEn);
    }

    /** Translate API / backend / thrown Error messages shown to users */
    function tApiMessage(raw) {
        if (raw == null) return '';
        var text = String(raw);
        if (!text) return text;
        var trimmed = text.trim();
        if (currentLang === 'en' && EN_API_MESSAGES[trimmed]) return EN_API_MESSAGES[trimmed];
        var data = localeCache[currentLang];
        if (!data) return text;
        if (data.apiMessages && data.apiMessages[trimmed]) return data.apiMessages[trimmed];
        if (data.strings && data.strings[trimmed]) return data.strings[trimmed];
        var prefixes = [
            ['Save failed: ', 'errors.saveFailedPrefix'],
            ['Failed to generate job description: ', 'errors.jdFailedPrefix'],
            ['Failed to upload resume: ', 'errors.uploadFailedPrefix'],
            ['Failed to generate resume: ', 'errors.generateFailedPrefix'],
            ['Translation failed: ', 'errors.translationFailedPrefix'],
            ['Optimization failed: ', 'errors.optimizeFailedPrefix'],
            ['Download failed: ', 'errors.downloadFailedPrefix'],
            ['导出失败: ', 'errors.exportFailedPrefix'],
            ['浏览器打印失败: ', 'errors.printFailedPrefix'],
            ['重新生成失败: ', 'resume.opt.regenerateFailed'],
            ['Failed to upload profile: ', 'interview.toast.profileFailed'],
            ['Failed to submit job description: ', 'interview.toast.jdFailed'],
            ['Failed to generate resume: ', 'interview.toast.resumeFailed'],
            ['Failed to generate questions: ', 'interview.toast.questionsFailed'],
            ['Failed to generate reference answers: ', 'interview.toast.answersFailed'],
            ['Failed to start interactive interview: ', 'interview.toast.startFailed'],
            ['Failed to submit answer: ', 'interview.toast.submitFailed'],
            ['Failed to generate debrief: ', 'interview.toast.debriefFailed'],
            ['Failed to get feedback: ', 'interview.toast.feedbackFailed'],
            ['Failed to analyze skill gaps: ', 'learningPath.toast.gapFailed'],
            ['Failed to generate timeline: ', 'learningPath.toast.timelineFailed'],
            ['Failed to update timeline: ', 'learningPath.toast.updateFailed'],
            ['Save failed: ', 'learningPath.toast.saveFailed'],
            ['API error: ', 'errors.apiError'],
            ['HTTP ', 'errors.httpPrefix'],
        ];
        for (var i = 0; i < prefixes.length; i++) {
            var p = prefixes[i][0];
            if (text.indexOf(p) === 0) {
                var tail = text.slice(p.length);
                var mappedTail = tApiMessage(tail);
                if (p === 'API error: ') {
                    return t('errors.apiError', 'API error: {detail}', { detail: mappedTail });
                }
                return mappedTail !== tail ? p.replace(/:\s*$/, '') + ': ' + mappedTail : text;
            }
        }
        return translateString(text, currentLang);
    }

    function uiText(key, fallback, vars) {
        return t(key, fallback, vars);
    }

    function setText(selector, text, fallback) {
        document.querySelectorAll(selector).forEach(function (node) {
            var value = text || fallback || node.textContent;
            if (value) node.textContent = value;
        });
    }

    function pageKey() {
        var explicit = document.body && document.body.getAttribute('data-page');
        if (explicit) return explicit;
        var path = location.pathname.replace(/\\/g, '/');
        if (path.indexOf('/corporate/') !== -1) return 'corporate';
        if (path.indexOf('/individual/') !== -1) return 'individual';
        return 'home';
    }

    function applyPageCopy(lang) {
        var pk = pageKey();
        function pageText(key, globalKey) {
            var nodes = document.querySelectorAll(key);
            var fb = nodes.length ? nodes[0].textContent : '';
            return t(pk + '.' + globalKey, t('home.' + globalKey, fb));
        }
        setText('[data-i18n="hero-title"]', pageText('[data-i18n="hero-title"]', 'title'));
        setText('[data-i18n="hero-subtitle"]', pageText('[data-i18n="hero-subtitle"]', 'subtitle'));
        setText('[data-i18n="nav-features"]', pageText('[data-i18n="nav-features"]', 'features'));
        setText('[data-i18n="nav-dashboard"]', pageText('[data-i18n="nav-dashboard"]', 'dashboard'));
        setText('[data-i18n="nav-demos"]', pageText('[data-i18n="nav-demos"]', 'demos'));
        setText('[data-i18n="nav-resources"]', pageText('[data-i18n="nav-resources"]', 'resources'));
        setText('[data-i18n="nav-stories"]', pageText('[data-i18n="nav-stories"]', 'stories'));
        setText('[data-i18n="nav-faq"]', pageText('[data-i18n="nav-faq"]', 'faq'));
        setText('[data-i18n="nav-jobs"]', pageText('[data-i18n="nav-jobs"]', 'jobs'));
        setText('[data-i18n="nav-analytics"]', pageText('[data-i18n="nav-analytics"]', 'analytics'));
        setText('[data-i18n="hero-individual"]', pageText('[data-i18n="hero-individual"]', 'individual'));
        setText('[data-i18n="hero-corporate"]', pageText('[data-i18n="hero-corporate"]', 'corporate'));
        setText('[data-i18n="section-features-title"]', pageText('[data-i18n="section-features-title"]', 'features'));
        setText('[data-i18n="section-features-lead"]', pageText('[data-i18n="section-features-lead"]', 'featuresLead'));
        setText('[data-i18n="section-workflow-title"]', pageText('[data-i18n="section-workflow-title"]', 'workflow'));
        setText('[data-i18n="section-benefits-title"]', pageText('[data-i18n="section-benefits-title"]', 'benefits'));
        setText('[data-i18n="section-stories-title"]', pageText('[data-i18n="section-stories-title"]', 'stories'));
        setText('[data-i18n="section-faq-title"]', pageText('[data-i18n="section-faq-title"]', 'faq'));
        setText('[data-i18n="section-cta-title"]', pageText('[data-i18n="section-cta-title"]', 'cta'));
        setText('[data-i18n="hero-open-demos"]', pageText('[data-i18n="hero-open-demos"]', 'open'));
        setText('[data-i18n="home.navFriendlyJobs"]', pageText('[data-i18n="home.navFriendlyJobs"]', 'navFriendlyJobs'));
        setText('[data-i18n="home.navFriendlyEmployers"]', pageText('[data-i18n="home.navFriendlyEmployers"]', 'navFriendlyEmployers'));
        setText('[data-i18n="home.heroFriendlyJobs"]', pageText('[data-i18n="home.heroFriendlyJobs"]', 'heroFriendlyJobs'));
        setText('[data-i18n="home.navMyApplications"]', pageText('[data-i18n="home.navMyApplications"]', 'navMyApplications'));
    }

    function isLanguageSwitcherNode(node) {
        if (!node) return false;
        if (node.id === 'current-language') return true;
        if (node.hasAttribute && node.hasAttribute('data-i18n-lang')) return true;
        return !!(node.closest && node.closest('.language-selector, #gba-lang-switcher, #language-dropdown, #ui-lang'));
    }

    function currentLanguageLabel(lang) {
        var fb = LABELS[lang] || lang;
        return t('lang.' + lang, fb);
    }

    function applyCurrentLanguageLabel(lang) {
        document.querySelectorAll('#current-language').forEach(function (node) {
            node.textContent = currentLanguageLabel(lang);
            delete node.dataset.l10nOriginal;
        });
    }

    function applyLangDropdownLabels() {
        document.querySelectorAll('[data-i18n-lang]').forEach(function (node) {
            var code = node.getAttribute('data-i18n-lang');
            if (!code) return;
            var fb = LANG_NAMES_FB[code] || code;
            var text = t('lang.' + code, fb);
            if (text) node.textContent = text;
            delete node.dataset.l10nOriginal;
        });
    }

    function resolveI18nKey(key) {
        if (!key) return '';
        if (key.indexOf('.') !== -1) return key;
        return LEGACY_I18N_KEYS[key] || key;
    }

    function snapshotI18nDefaults() {
        document.querySelectorAll('[data-i18n]').forEach(function (node) {
            if (node.dataset.i18nDefault || node.id === 'session-id' || node.dataset.i18nDynamic === '1') return;
            var fbAttr = node.getAttribute('data-i18n-fallback');
            var raw = (node.textContent || node.getAttribute('value') || '').trim();
            if (fbAttr && fbAttr.trim()) {
                node.dataset.i18nDefault = fbAttr.trim();
            } else if (raw) {
                node.dataset.i18nDefault = raw;
            }
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(function (node) {
            if (node.dataset.i18nPlaceholderDefault) return;
            var fb = node.getAttribute('data-i18n-fallback') || node.getAttribute('placeholder') || '';
            if (fb) node.dataset.i18nPlaceholderDefault = fb;
        });
    }

    function applyDataI18n(lang) {
        document.querySelectorAll('[data-i18n]').forEach(function (node) {
            var key = node.getAttribute('data-i18n');
            var lookupKey = resolveI18nKey(key);
            if (!lookupKey || lookupKey.indexOf('.') === -1) return;
            if (node.id === 'session-id' || node.dataset.i18nDynamic === '1') return;
            if (!node.dataset.i18nDefault) {
                var raw = (node.textContent || node.getAttribute('value') || '').trim();
                var fbAttr = node.getAttribute('data-i18n-fallback');
                node.dataset.i18nDefault = fbAttr && fbAttr.trim() ? fbAttr.trim() : raw;
            }
            var fb = node.dataset.i18nDefault;
            var text = t(lookupKey, fb);
            if (text) {
                node.textContent = text;
                if (node.tagName === 'TITLE') {
                    document.title = text;
                }
            }
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(function (node) {
            var key = node.getAttribute('data-i18n-placeholder');
            if (!key) return;
            if (!node.dataset.i18nPlaceholderDefault) {
                var initFb = node.getAttribute('data-i18n-fallback') || node.getAttribute('placeholder') || '';
                if (initFb) node.dataset.i18nPlaceholderDefault = initFb;
            }
            var fb = node.dataset.i18nPlaceholderDefault || node.getAttribute('placeholder') || '';
            var text = t(key, fb);
            if (text) node.setAttribute('placeholder', text);
        });
        document.querySelectorAll('[data-i18n-title]').forEach(function (node) {
            var key = node.getAttribute('data-i18n-title');
            var fb = node.getAttribute('title') || '';
            var text = t(key, fb);
            if (text) node.setAttribute('title', text);
        });
    }

    function applyStaticStrings(lang) {
        if (lang === 'en') {
            document.querySelectorAll('[data-l10n-original]').forEach(function (el) {
                if (isLanguageSwitcherNode(el)) return;
                var nodes = [];
                el.childNodes.forEach(function (n) {
                    if (n.nodeType === 3) nodes.push(n);
                });
                if (nodes.length === 1) nodes[0].nodeValue = el.dataset.l10nOriginal;
            });
            document.querySelectorAll('[data-l10n-placeholder]').forEach(function (node) {
                node.setAttribute('placeholder', node.dataset.l10nPlaceholder);
            });
            return;
        }
        var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
            acceptNode: function (node) {
                var parent = node.parentElement;
                if (!parent || parent.closest('script,style,noscript,[data-i18n],option[data-i18n]')) {
                    return NodeFilter.FILTER_REJECT;
                }
                if (isLanguageSwitcherNode(parent)) {
                    return NodeFilter.FILTER_REJECT;
                }
                if (parent.id === 'session-id' || parent.dataset.i18nDynamic === '1') {
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
            node.nodeValue = translateString(node.parentElement.dataset.l10nOriginal, lang);
        });
        document.querySelectorAll('input[placeholder],textarea[placeholder]').forEach(function (node) {
            if (!node.dataset.l10nPlaceholder) node.dataset.l10nPlaceholder = node.getAttribute('placeholder') || '';
            node.setAttribute('placeholder', translateString(node.dataset.l10nPlaceholder, lang));
        });
    }

    function applyResumeLangButtonLabels() {
        if (!window.GBAI18n || !GBAI18n.resumeLangLabel) return;
        document.querySelectorAll('[data-resume-lang] .resume-lang-label, [data-resume-translate] .resume-lang-label').forEach(function (span) {
            var btn = span.closest('[data-resume-lang], [data-resume-translate]');
            if (!btn) return;
            var code = btn.getAttribute('data-resume-lang') || btn.getAttribute('data-resume-translate');
            if (code) span.textContent = GBAI18n.resumeLangLabel(code);
        });
        var badge = document.getElementById('resume-language-badge');
        if (badge && badge.dataset.activeLang) {
            badge.textContent = GBAI18n.resumeLangLabel(badge.dataset.activeLang);
        }
    }

    function applyLanguage(lang) {
        lang = LABELS[lang] ? lang : 'en';
        currentLang = lang;
        document.documentElement.lang = lang;
        var sel = document.getElementById('ui-lang');
        if (sel) sel.value = lang === 'zh-CN' ? 'zh-CN' : lang;
        applyPageCopy(lang);
        applyDataI18n(lang);
        applyLangDropdownLabels();
        applyStaticStrings(lang);
        applyCurrentLanguageLabel(lang);
        applyResumeLangButtonLabels();
    }

    /** Re-apply after other scripts refresh dynamic DOM on language change / page boot */
    function scheduleApplyLanguage(lang) {
        lang = LABELS[lang] ? lang : getLang();
        if (applyLanguageTimer) clearTimeout(applyLanguageTimer);
        applyLanguageTimer = setTimeout(function () {
            applyLanguageTimer = null;
            applyLanguage(lang);
        }, 0);
    }

    function setLang(lang) {
        if (!LABELS[lang]) return;
        try {
            localStorage.setItem(LANG_KEY, lang);
        } catch (e) {}
        return loadLocale(lang).then(function () {
            applyLanguage(lang);
            try {
                window.dispatchEvent(new CustomEvent('gba:language-changed', { detail: { lang: lang } }));
            } catch (e2) {}
            scheduleApplyLanguage(lang);
        });
    }

    function injectLanguageSwitcherStyles() {
        if (document.getElementById('gba-i18n-switcher-style')) return;
        var style = document.createElement('style');
        style.id = 'gba-i18n-switcher-style';
        style.textContent = [
            '.language-selector{position:relative}',
            '.language-dropdown{display:none;position:absolute;right:0;top:100%;margin-top:.35rem;z-index:200;min-width:150px;background:#fff;border:1px solid #e2e8f0;border-radius:.75rem;box-shadow:0 10px 25px rgba(15,23,42,.12);padding:.25rem 0}',
            '.language-selector.is-open .language-dropdown{display:block}',
            '.language-dropdown a{display:block;padding:.5rem 1rem;color:#334155;text-decoration:none;font-size:.875rem;line-height:1.25rem}',
            '.language-dropdown a:hover{background:#f8fafc}',
            '.gba-lang-floating{position:fixed;bottom:5.5rem;left:1rem;z-index:8000;background:#fff;border:1px solid #e2e8f0;border-radius:.75rem;box-shadow:0 8px 20px rgba(15,23,42,.12);padding:.35rem .5rem;font-size:.875rem}',
            '.gba-lang-floating .language-dropdown{bottom:100%;top:auto;margin-bottom:.35rem;margin-top:0}',
            '@media (hover:hover){.language-selector:not(.gba-lang-floating):hover .language-dropdown{display:block}}',
            '@media (hover:none){.language-selector:hover .language-dropdown{display:none}}',
            '.gba-lang-on-dark>button{color:#e2e8f0}',
            '.gba-lang-on-dark .language-dropdown{background:#1e293b;border-color:#475569}',
            '.gba-lang-on-dark .language-dropdown a{color:#cbd5e1}',
            '.gba-lang-on-dark .language-dropdown a:hover{background:#334155;color:#fff}'
        ].join('');
        document.head.appendChild(style);
    }

    function languageSwitcherInnerHtml() {
        return (
            '<button type="button" class="flex items-center gap-2 text-slate-700 px-2 py-1 rounded-lg hover:bg-slate-50" aria-haspopup="listbox" aria-expanded="false">' +
            '<i class="fas fa-globe" aria-hidden="true"></i><span id="current-language">English</span><span aria-hidden="true">▾</span></button>' +
            '<div class="language-dropdown" role="listbox">' +
            '<a href="#" role="option" data-lang="en" data-i18n-lang="en">English</a>' +
            '<a href="#" role="option" data-lang="zh-CN" data-i18n-lang="zh-CN">Simplified Chinese</a>' +
            '<a href="#" role="option" data-lang="zh-TW" data-i18n-lang="zh-TW">Traditional Chinese</a>' +
            '<a href="#" role="option" data-lang="pt" data-i18n-lang="pt">Portuguese</a>' +
            '</div>'
        );
    }

    function bindLanguageSwitcherToggles() {
        document.querySelectorAll('.language-selector').forEach(function (sel) {
            if (sel.dataset.langToggleBound) return;
            sel.dataset.langToggleBound = '1';
            var btn = sel.querySelector('button');
            if (!btn) return;
            btn.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                var willOpen = !sel.classList.contains('is-open');
                document.querySelectorAll('.language-selector').forEach(function (other) {
                    other.classList.remove('is-open');
                    var otherBtn = other.querySelector('button');
                    if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
                });
                if (willOpen) {
                    sel.classList.add('is-open');
                    btn.setAttribute('aria-expanded', 'true');
                }
            });
        });
        if (document.documentElement.dataset.gbaLangGlobalClick) return;
        document.documentElement.dataset.gbaLangGlobalClick = '1';
        document.addEventListener('click', function () {
            document.querySelectorAll('.language-selector').forEach(function (sel) {
                sel.classList.remove('is-open');
                var btn = sel.querySelector('button');
                if (btn) btn.setAttribute('aria-expanded', 'false');
            });
        });
        document.addEventListener('keydown', function (event) {
            if (event.key !== 'Escape') return;
            document.querySelectorAll('.language-selector').forEach(function (sel) {
                sel.classList.remove('is-open');
                var btn = sel.querySelector('button');
                if (btn) btn.setAttribute('aria-expanded', 'false');
            });
        });
    }

    function ensureLanguageSwitcher() {
        if (document.querySelector('[data-lang]') || document.getElementById('ui-lang') || document.getElementById('gba-lang-switcher')) {
            return;
        }
        injectLanguageSwitcherStyles();
        var wrap = document.createElement('div');
        wrap.id = 'gba-lang-switcher';

        var slot = document.getElementById('header-lang-slot');
        if (slot) {
            wrap.className = 'language-selector relative text-sm shrink-0';
            if (slot.classList.contains('gba-lang-on-dark') || slot.dataset.langTheme === 'dark') {
                wrap.classList.add('gba-lang-on-dark');
            }
            wrap.innerHTML = languageSwitcherInnerHtml();
            slot.appendChild(wrap);
            return;
        }

        var headerRow =
            document.querySelector('header.flex.items-center.justify-between') ||
            document.querySelector('header .flex.items-center.justify-between') ||
            document.querySelector('header .flex.flex-wrap.items-center.justify-between') ||
            document.querySelector('nav .flex.items-center.justify-between') ||
            document.querySelector('nav .flex.flex-wrap.items-center.justify-between');

        wrap.innerHTML = languageSwitcherInnerHtml();
        if (headerRow) {
            wrap.className = 'language-selector shrink-0';
            headerRow.appendChild(wrap);
            return;
        }

        wrap.className = 'language-selector gba-lang-floating';
        document.body.appendChild(wrap);
    }

    function bindLanguageControls() {
        document.querySelectorAll('[data-lang]').forEach(function (node) {
            if (node.dataset.i18nBound) return;
            node.dataset.i18nBound = '1';
            node.addEventListener('click', function (event) {
                event.preventDefault();
                setLang(node.getAttribute('data-lang'));
                document.querySelectorAll('.language-selector').forEach(function (sel) {
                    sel.classList.remove('is-open');
                });
                if (window.showToast) window.showToast(t('common.languageUpdated', 'Language updated.'));
            });
        });
        var existingSelect = document.getElementById('ui-lang');
        if (existingSelect && !existingSelect.dataset.i18nBound) {
            existingSelect.dataset.i18nBound = '1';
            existingSelect.addEventListener('change', function () {
                var v = existingSelect.value;
                setLang(v === 'zh' ? 'zh-CN' : v);
            });
        }
    }

    var initPromise = null;

    function initLanguage() {
        if (initPromise) return initPromise;
        initPromise = Promise.resolve().then(function () {
            snapshotI18nDefaults();
            injectLanguageSwitcherStyles();
            ensureLanguageSwitcher();
            bindLanguageSwitcherToggles();
            bindLanguageControls();
            var lang = getLang();
            return loadLocale(lang).then(function () {
                applyLanguage(lang);
                scheduleApplyLanguage(lang);
            });
        });
        return initPromise;
    }

    function uiLangToApiLang(uiLang) {
        return UI_TO_API[uiLang || getLang()] || 'en';
    }

    function apiLangToUiLang(apiLang) {
        if (!apiLang) return getLang();
        var key = String(apiLang).toLowerCase();
        if (key === 'zh-tw') return 'zh-TW';
        if (key === 'zh' || key === 'zh-cn') return 'zh-CN';
        if (key === 'pt') return 'pt';
        return 'en';
    }

    function normalizeResumeLang(code) {
        var raw = String(code || 'zh').trim();
        var lower = raw.toLowerCase().replace('_', '-');
        if (lower === 'en' || lower === 'english') return 'en';
        if (lower === 'zh-tw' || lower === 'zh-hant' || lower === 'zh_tw') return 'zh-TW';
        if (lower === 'pt' || lower === 'pt-pt' || lower === 'pt-mo') return 'pt';
        if (lower === 'zh' || lower === 'zh-cn' || lower === 'chinese') return 'zh';
        return RESUME_LANG_CODES.indexOf(raw) !== -1 ? raw : 'zh';
    }

    function resumeLangLabel(code) {
        var norm = normalizeResumeLang(code);
        var ui = getLang();
        var map = RESUME_LANG_LABELS[norm] || {};
        return map[ui] || map.en || norm;
    }

    window.GBAI18n = {
        getLang: getLang,
        setLang: setLang,
        applyLanguage: applyLanguage,
        scheduleApplyLanguage: scheduleApplyLanguage,
        snapshotI18nDefaults: snapshotI18nDefaults,
        applyResumeLangButtonLabels: applyResumeLangButtonLabels,
        t: t,
        uiText: uiText,
        tApiMessage: tApiMessage,
        tApiCode: tApiCode,
        tMetaOption: tMetaOption,
        formatGroupTypes: formatGroupTypes,
        translateOptionMap: translateOptionMap,
        translateLegalServicesData: translateLegalServicesData,
        initLanguage: initLanguage,
        uiLangToApiLang: uiLangToApiLang,
        apiLangToUiLang: apiLangToUiLang,
        normalizeResumeLang: normalizeResumeLang,
        resumeLangLabel: resumeLangLabel,
        RESUME_LANG_CODES: RESUME_LANG_CODES,
        LABELS: LABELS,
        LANG_KEY: LANG_KEY
    };

    window.GBASite = window.GBASite || {};
    window.GBASite.applyLanguage = applyLanguage;
    window.GBASite.setLanguage = setLang;

    document.addEventListener('DOMContentLoaded', function () {
        initLanguage();
    });
})();
