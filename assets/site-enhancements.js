(function () {
    'use strict';

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
            else if (action === 'details' && window.showToast) window.showToast((window.GBAI18n && GBAI18n.t ? GBAI18n.t('site.openWorkflow', 'Open the related workflow from the interactive tools section.') : 'Open the related workflow from the interactive tools section.'));
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
            if (window.GBAI18n) window.GBAI18n.applyLanguage(window.GBAI18n.getLang());
        }
        render();
        if (refresh) {
            refresh.addEventListener('click', function () {
                render();
                if (window.showToast) window.showToast((window.GBAI18n && GBAI18n.t ? GBAI18n.t('site.jobsRefreshed', 'Recommended jobs refreshed.') : 'Recommended jobs refreshed.'));
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
        var boot = function () {
            initDemoActions();
            initCounters();
            initChartPeriodSwitcher();
            initRecommendedJobs();
        };
        if (window.GBAI18n) {
            window.GBAI18n.initLanguage().then(boot);
        } else {
            boot();
        }
    });
})();
