/**
 * GBA Platform – Site Guide (onboarding tour)
 * Auto-starts for first-time visitors; skippable; replayable anytime.
 * Copy via GBAI18n (siteGuide.* keys); English fallbacks below when UI is en.
 */
(function () {
    'use strict';

    var STORAGE_PREFIX = 'gba_site_guide_v1_';

    /** English fallbacks (no en.json locale file) */
    var UI_FB = {
        fabLabel: 'Site guide',
        welcomeTitle: 'Welcome to GBA Platform',
        welcomeBody:
            'This short tour shows how to navigate the site. You can skip anytime and replay later from the guide button.',
        stepOf: 'Step {current} of {total}',
        skip: 'Skip tour',
        back: 'Back',
        next: 'Next',
        finish: 'Got it',
        replay: 'Replay guide',
        close: 'Close'
    };

    var STEP_TARGETS = {
        home: [
            null,
            '#top-hero',
            '#features',
            '#how-it-works',
            '#faq',
            '#language-toggle-btn, .language-selector'
        ],
        individual: [
            null,
            '#dashboard',
            'a[href="demo-resume-generator.html"]',
            'a[href="demo-interview.html"]',
            'a[href="demo-jobs-database.html"]',
            'a[href="donation-legal.html"]'
        ],
        corporate: [
            null,
            '#dashboard',
            '#ai-features',
            '#jobs',
            'a[href="post-job.html"]',
            '.language-selector'
        ]
    };

    var STEPS_FB = {
        home: [
            {
                title: 'Welcome to GBA Platform',
                body: 'This platform connects job seekers and inclusive employers across the Greater Bay Area with AI tools, job matching, and legal support.'
            },
            {
                title: 'Choose your portal',
                body: 'Start as an individual job seeker or as a corporate recruiter. Both portals share the same platform infrastructure.'
            },
            {
                title: 'Platform capabilities',
                body: 'Explore resume AI, interview prep, learning paths, policy tools, and inclusive hiring features built for cross-border employment.'
            },
            {
                title: 'How it works',
                body: 'Follow the end-to-end loop from profile creation and matching to applications, interviews, and post-hire support.'
            },
            {
                title: 'FAQ & help',
                body: 'Find answers about access, donations, data security, and accessibility. Expand any question for details.'
            },
            {
                title: 'Language & accessibility',
                body: 'Switch between English, Chinese, and Portuguese.'
            }
        ],
        individual: [
            {
                title: 'Individual portal guide',
                body: 'Your dashboard brings together AI career tools, job matching, applications, and legal/donation access in one place.'
            },
            {
                title: 'Personal dashboard',
                body: 'Overview of all tools. Complete your profile and check access status banners here before starting.'
            },
            {
                title: 'Smart resume',
                body: 'Upload a resume and target job description. AI analyzes gaps and generates a tailored version.'
            },
            {
                title: 'Interview prep',
                body: 'Practice role-specific questions with AI feedback to build confidence before real interviews.'
            },
            {
                title: 'Job matching',
                body: 'Browse matched roles by group type and resume score. Apply on-platform or follow external links.'
            },
            {
                title: 'Donation & legal aid',
                body: 'Vulnerable groups use the platform for free. Others may donate any amount to unlock features and support legal services.'
            }
        ],
        corporate: [
            {
                title: 'Corporate portal guide',
                body: 'Manage inclusive hiring, post jobs with target criteria, and review scored applicants from one dashboard.'
            },
            {
                title: 'Recruitment dashboard',
                body: 'Track diversity metrics, pipeline stats, and quick actions for your hiring workflow.'
            },
            {
                title: 'HR & compliance tools',
                body: 'Use blind screening, compliance calculators, DEI analytics, and remote-work readiness checks.'
            },
            {
                title: 'My jobs',
                body: 'View and manage posted roles, edit requirements, and monitor applicant volume.'
            },
            {
                title: 'Post a job',
                body: 'Create new inclusive roles with target group criteria so matching scores applicants accurately.'
            },
            {
                title: 'Language',
                body: 'Switch UI language here.'
            }
        ]
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

    function guideT(key, fallback, vars) {
        if (window.GBAI18n && GBAI18n.t) {
            return GBAI18n.t(key, fallback, vars);
        }
        if (vars && fallback) {
            var result = String(fallback);
            Object.keys(vars).forEach(function (k) {
                result = result.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
            });
            return result;
        }
        return fallback || key;
    }

    function t(key) {
        return guideT('siteGuide.' + key, UI_FB[key]);
    }

    function formatStepOf(current, total) {
        return guideT('siteGuide.stepOf', UI_FB.stepOf, {
            current: String(current),
            total: String(total)
        });
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
        var targets = STEP_TARGETS[page];
        var fb = STEPS_FB[page];
        if (!targets || !fb) return [];
        return targets.map(function (target, i) {
            var prefix = 'siteGuide.steps.' + page + '.' + i;
            var stepFb = fb[i] || { title: '', body: '' };
            return {
                target: target,
                title: guideT(prefix + '.title', stepFb.title),
                body: guideT(prefix + '.body', stepFb.body)
            };
        });
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

    function boot() {
        if (window.GBAI18n && GBAI18n.initLanguage) {
            GBAI18n.initLanguage().then(init).catch(init);
        } else {
            init();
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
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
