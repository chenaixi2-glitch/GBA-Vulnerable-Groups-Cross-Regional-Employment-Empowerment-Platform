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
    var localeCache = {};
    var currentLang = 'en';

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
        if (lang === 'en') return Promise.resolve({});
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

    function t(key, fallback) {
        if (currentLang === 'en') return fallback || key;
        var val = resolveKey(localeCache[currentLang], key);
        if (val) return val;
        var strings = localeCache[currentLang] && localeCache[currentLang].strings;
        if (strings && strings[fallback || key]) return strings[fallback || key];
        return fallback || key;
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
        setText('[data-i18n="hero-individual"]', t('home.individual', ''));
        setText('[data-i18n="hero-corporate"]', t('home.corporate', ''));
        setText('[data-i18n="section-features-title"]', pageText('[data-i18n="section-features-title"]', 'features'));
        setText('[data-i18n="section-features-lead"]', pageText('[data-i18n="section-features-lead"]', 'featuresLead'));
        setText('[data-i18n="section-workflow-title"]', t(pk + '.workflow', t('home.workflow', '')));
        setText('[data-i18n="section-benefits-title"]', t(pk + '.benefits', t('home.benefits', '')));
        setText('[data-i18n="section-stories-title"]', pageText('[data-i18n="section-stories-title"]', 'stories'));
        setText('[data-i18n="section-faq-title"]', pageText('[data-i18n="section-faq-title"]', 'faq'));
        setText('[data-i18n="section-cta-title"]', t(pk + '.cta', t('home.cta', '')));
        setText('[data-i18n="hero-open-demos"]', pageText('[data-i18n="hero-open-demos"]', 'open'));
    }

    function applyDataI18n(lang) {
        document.querySelectorAll('[data-i18n]').forEach(function (node) {
            var key = node.getAttribute('data-i18n');
            if (!key || key.indexOf('.') === -1) return;
            if (/^(home|individual|corporate)\./.test(key)) return;
            var fb = node.getAttribute('data-i18n-fallback') || node.textContent;
            var text = t(key, fb);
            if (text) node.textContent = text;
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(function (node) {
            var key = node.getAttribute('data-i18n-placeholder');
            var fb = node.getAttribute('data-i18n-fallback') || node.getAttribute('placeholder') || '';
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
            node.nodeValue = translateString(node.parentElement.dataset.l10nOriginal, lang);
        });
        document.querySelectorAll('input[placeholder],textarea[placeholder]').forEach(function (node) {
            if (!node.dataset.l10nPlaceholder) node.dataset.l10nPlaceholder = node.getAttribute('placeholder') || '';
            node.setAttribute('placeholder', translateString(node.dataset.l10nPlaceholder, lang));
        });
    }

    function applyLanguage(lang) {
        lang = LABELS[lang] ? lang : 'en';
        currentLang = lang;
        document.documentElement.lang = lang;
        var cur = document.getElementById('current-language');
        if (cur) cur.textContent = LABELS[lang];
        var sel = document.getElementById('ui-lang');
        if (sel) sel.value = lang === 'zh-CN' ? 'zh-CN' : lang;
        applyPageCopy(lang);
        applyDataI18n(lang);
        applyStaticStrings(lang);
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
        });
    }

    function ensureLanguageSwitcher() {
        if (document.querySelector('[data-lang]') || document.getElementById('ui-lang')) return;
        var wrap = document.createElement('div');
        wrap.className =
            'language-selector fixed top-4 right-4 z-50 bg-white border border-slate-200 shadow-lg rounded-xl px-3 py-2 text-sm';
        wrap.innerHTML =
            '<button type="button" class="flex items-center gap-2 text-slate-700"><i class="fas fa-globe"></i><span id="current-language">English</span><span>▾</span></button>' +
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
            ensureLanguageSwitcher();
            bindLanguageControls();
            var lang = getLang();
            return loadLocale(lang).then(function () {
                applyLanguage(lang);
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
        t: t,
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
