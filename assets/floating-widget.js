/**
 * GBA Platform – Floating Quick-Access Widget
 * Injected into: index.html / individual/portal.html / corporate/portal.html / post-job.html
 * Features: Quick navigation, Large text, High contrast, Page shortcuts, Back to top
 */
(function () {
    'use strict';

    /* ── 1. Page-context detection ───────────────────────────────────────── */
    const page = document.body.getAttribute('data-page') || 'unknown';

    const NAV_LINKS = {
        home: [
            { label: 'Platform Overview', href: '#top-hero', icon: 'fa-home' },
            { label: 'Features', href: '#features', icon: 'fa-star' },
            { label: 'How It Works', href: '#how-it-works', icon: 'fa-circle-info' },
            { label: 'FAQ', href: '#faq', icon: 'fa-circle-question' },
        ],
        individual: [
            { label: 'My Dashboard', href: '#dashboard', icon: 'fa-chart-pie' },
            { label: 'Resume Generator', href: 'demo-resume-generator.html', icon: 'fa-file-lines' },
            { label: 'Interview Prep', href: 'demo-interview.html', icon: 'fa-comments' },
            { label: 'Learning Path', href: 'demo-learning-path.html', icon: 'fa-route' },
            { label: '爱心捐款箱', href: 'donation-legal.html', icon: 'fa-hand-holding-heart' },
        ],
        corporate: [
            { label: 'Recruiter Dashboard', href: '#dashboard', icon: 'fa-chart-line' },
            { label: 'HR Tools', href: '#ai-features', icon: 'fa-toolbox' },
            { label: 'My Jobs', href: '#jobs', icon: 'fa-briefcase' },
            { label: '爱心捐款箱', href: 'donation-legal.html', icon: 'fa-hand-holding-heart' },
        ],
    };

    const PAGE_LINKS = {
        home: [
            { label: 'Individual Portal', href: 'individual/portal.html', icon: 'fa-user' },
            { label: 'Corporate Portal', href: 'corporate/portal.html', icon: 'fa-building' },
        ],
        individual: [
            { label: 'Home', href: '../index.html', icon: 'fa-house' },
            { label: 'Corporate Portal', href: '../corporate/portal.html', icon: 'fa-building' },
        ],
        corporate: [
            { label: 'Home', href: '../index.html', icon: 'fa-house' },
            { label: 'Individual Portal', href: '../individual/portal.html', icon: 'fa-user' },
            { label: 'Post a Job', href: 'post-job.html', icon: 'fa-plus-circle' },
        ],
    };

    /* ── 2. Inject CSS ───────────────────────────────────────────────────── */
    const style = document.createElement('style');
    style.textContent = `
    /* Remove old accessibility btn if it exists */
    .accessibility-btn, .accessibility-panel { display: none !important; }

    /* Widget fab button */
    #gba-fab {
        position: fixed; bottom: 2rem; right: 2rem; z-index: 9000;
        width: 52px; height: 52px; border-radius: 50%;
        background: linear-gradient(135deg, #10b981, #059669);
        color: white; border: none; cursor: pointer;
        box-shadow: 0 6px 20px rgba(16,185,129,.45);
        display: flex; align-items: center; justify-content: center;
        font-size: 1.25rem;
        transition: transform .25s, box-shadow .25s;
        -webkit-tap-highlight-color: transparent;
    }
    #gba-fab:hover { transform: scale(1.1); box-shadow: 0 10px 28px rgba(16,185,129,.55); }
    #gba-fab .fab-icon-open  { display: block; }
    #gba-fab .fab-icon-close { display: none; }
    #gba-fab.open .fab-icon-open  { display: none; }
    #gba-fab.open .fab-icon-close { display: block; }

    /* Widget panel */
    #gba-widget-panel {
        position: fixed; bottom: 6rem; right: 2rem; z-index: 8999;
        width: 290px;
        background: white;
        border-radius: 18px;
        box-shadow: 0 16px 48px rgba(15,23,42,.18);
        overflow: hidden;
        transform: translateY(20px) scale(.95);
        opacity: 0;
        pointer-events: none;
        transition: transform .28s cubic-bezier(.34,1.56,.64,1), opacity .22s ease;
    }
    #gba-widget-panel.open {
        transform: translateY(0) scale(1);
        opacity: 1;
        pointer-events: all;
    }

    /* Panel header */
    .gwa-header {
        background: linear-gradient(135deg, #10b981, #059669);
        padding: .85rem 1.1rem;
        display: flex; align-items: center; justify-content: space-between;
    }
    .gwa-header-title {
        display: flex; align-items: center; gap: .6rem;
        color: white; font-weight: 700; font-size: .92rem;
    }
    .gwa-header-title i { font-size: .85rem; opacity: .85; }
    .gwa-close-btn {
        width: 26px; height: 26px; border-radius: 50%;
        background: rgba(255,255,255,.2); border: none; cursor: pointer;
        color: white; font-size: .75rem;
        display: flex; align-items: center; justify-content: center;
        transition: background .15s;
    }
    .gwa-close-btn:hover { background: rgba(255,255,255,.35); }

    /* Tabs */
    .gwa-tabs {
        display: flex; border-bottom: 1px solid #f0f0f0;
    }
    .gwa-tab {
        flex: 1; padding: .55rem .25rem; font-size: .72rem; font-weight: 600;
        color: #9ca3af; background: none; border: none; cursor: pointer;
        display: flex; flex-direction: column; align-items: center; gap: 3px;
        transition: color .15s;
        border-bottom: 2px solid transparent;
        margin-bottom: -1px;
    }
    .gwa-tab i { font-size: .8rem; }
    .gwa-tab:hover { color: #10b981; }
    .gwa-tab.active { color: #10b981; border-bottom-color: #10b981; }

    /* Tab panes */
    .gwa-pane { display: none; padding: .75rem 1rem 1rem; }
    .gwa-pane.active { display: block; }

    /* Nav links in widget */
    .gwa-nav-link {
        display: flex; align-items: center; gap: .55rem;
        padding: .55rem .65rem; border-radius: 9px;
        font-size: .82rem; font-weight: 500;
        color: #374151; text-decoration: none;
        transition: background .15s, color .15s;
        margin-bottom: 2px;
    }
    .gwa-nav-link i { width: 16px; text-align: center; color: #10b981; font-size: .78rem; }
    .gwa-nav-link:hover { background: #f0fdf4; color: #059669; }

    /* Section title */
    .gwa-section-title {
        font-size: .68rem; font-weight: 700; text-transform: uppercase;
        letter-spacing: .06em; color: #9ca3af; margin-bottom: .4rem;
        margin-top: .1rem;
    }

    /* Toggle row */
    .gwa-toggle-row {
        display: flex; align-items: center; justify-content: space-between;
        padding: .5rem .1rem; margin-bottom: 2px;
    }
    .gwa-toggle-label { font-size: .82rem; font-weight: 500; color: #374151; display: flex; align-items: center; gap: .4rem; }
    .gwa-toggle-label i { color: #6b7280; font-size: .78rem; }

    .gwa-toggle {
        width: 38px; height: 22px; border-radius: 999px;
        background: #e5e7eb; border: none; cursor: pointer;
        position: relative; transition: background .2s;
        flex-shrink: 0;
    }
    .gwa-toggle::after {
        content: ''; position: absolute; left: 3px; top: 3px;
        width: 16px; height: 16px; border-radius: 50%;
        background: white; box-shadow: 0 1px 4px rgba(0,0,0,.18);
        transition: transform .2s;
    }
    .gwa-toggle.on { background: #10b981; }
    .gwa-toggle.on::after { transform: translateX(16px); }

    /* Font size buttons */
    .gwa-font-btns {
        display: flex; gap: .4rem; margin-top: .35rem;
    }
    .gwa-font-btn {
        flex: 1; padding: .4rem; border-radius: 8px;
        border: 1.5px solid #e5e7eb; background: white;
        cursor: pointer; font-weight: 600; font-size: .78rem;
        color: #374151; transition: all .15s;
    }
    .gwa-font-btn:hover { border-color: #10b981; color: #10b981; }
    .gwa-font-btn.active { background: #ecfdf5; border-color: #10b981; color: #10b981; }

    /* Back to top */
    .gwa-top-btn {
        display: flex; align-items: center; justify-content: center; gap: .4rem;
        width: 100%; padding: .55rem; border-radius: 10px;
        background: #f9fafb; border: 1.5px solid #e5e7eb;
        font-size: .8rem; font-weight: 600; color: #374151;
        cursor: pointer; transition: all .15s; margin-top: .2rem;
    }
    .gwa-top-btn:hover { background: #ecfdf5; border-color: #10b981; color: #10b981; }

    /* Body classes */
    body.gba-large-text  { font-size: 1.15em !important; }
    body.gba-xl-text     { font-size: 1.32em !important; }
    body.gba-high-contrast {
        filter: contrast(1.45) !important;
    }

    @media (max-width: 480px) {
        #gba-widget-panel { right: 1rem; width: calc(100vw - 2rem); max-width: 290px; }
        #gba-fab { right: 1rem; bottom: 1.5rem; }
    }
    `;
    document.head.appendChild(style);

    /* ── 3. Build HTML ───────────────────────────────────────────────────── */
    const navLinks  = NAV_LINKS[page]  || [];
    const pageLinks = PAGE_LINKS[page] || [];

    function renderLinks(links) {
        return links.map(l =>
            `<a class="gwa-nav-link" href="${l.href}"><i class="fas ${l.icon}"></i>${l.label}</a>`
        ).join('');
    }

    const html = `
    <button id="gba-fab" aria-label="Quick Access" aria-expanded="false">
        <i class="fas fa-sliders fab-icon-open"></i>
        <i class="fas fa-times fab-icon-close"></i>
    </button>

    <div id="gba-widget-panel" role="dialog" aria-label="Quick Access Panel">
        <div class="gwa-header">
            <div class="gwa-header-title">
                <i class="fas fa-sliders"></i>
                Quick Access
            </div>
            <button class="gwa-close-btn" id="gwa-close-btn" aria-label="Close">
                <i class="fas fa-times"></i>
            </button>
        </div>

        <div class="gwa-tabs">
            <button class="gwa-tab active" data-tab="nav">
                <i class="fas fa-compass"></i>Navigate
            </button>
            <button class="gwa-tab" data-tab="access">
                <i class="fas fa-universal-access"></i>Display
            </button>
            <button class="gwa-tab" data-tab="pages">
                <i class="fas fa-link"></i>Pages
            </button>
        </div>

        <!-- Tab: Navigate -->
        <div class="gwa-pane active" id="gwa-pane-nav">
            ${navLinks.length
                ? `<p class="gwa-section-title">On this page</p>${renderLinks(navLinks)}`
                : `<p style="font-size:.82rem;color:#9ca3af;padding:.25rem 0;">No sections on this page.</p>`
            }
        </div>

        <!-- Tab: Display / Accessibility -->
        <div class="gwa-pane" id="gwa-pane-access">
            <p class="gwa-section-title">Text Size</p>
            <div class="gwa-font-btns">
                <button class="gwa-font-btn" data-size="default">A</button>
                <button class="gwa-font-btn" data-size="large">A+</button>
                <button class="gwa-font-btn" data-size="xl">A++</button>
            </div>

            <div style="margin-top:.85rem;">
                <p class="gwa-section-title">Visual</p>
                <div class="gwa-toggle-row">
                    <span class="gwa-toggle-label"><i class="fas fa-circle-half-stroke"></i>High Contrast</span>
                    <button class="gwa-toggle" id="gwa-toggle-contrast" aria-pressed="false"></button>
                </div>
                <div class="gwa-toggle-row">
                    <span class="gwa-toggle-label"><i class="fas fa-eye"></i>Reduce Motion</span>
                    <button class="gwa-toggle" id="gwa-toggle-motion" aria-pressed="false"></button>
                </div>
            </div>

            <button class="gwa-top-btn" id="gwa-back-top">
                <i class="fas fa-arrow-up"></i>Back to Top
            </button>
        </div>

        <!-- Tab: Pages -->
        <div class="gwa-pane" id="gwa-pane-pages">
            ${pageLinks.length
                ? `<p class="gwa-section-title">Jump to</p>${renderLinks(pageLinks)}`
                : ''
            }
            <button class="gwa-top-btn" id="gwa-back-top-2" style="margin-top:.65rem;">
                <i class="fas fa-arrow-up"></i>Back to Top
            </button>
        </div>
    </div>`;

    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);

    /* ── 4. Widget logic ──────────────────────────────────────────────────── */
    const fab    = document.getElementById('gba-fab');
    const panel  = document.getElementById('gba-widget-panel');
    const closeBtn = document.getElementById('gwa-close-btn');

    function openPanel() {
        panel.classList.add('open');
        fab.classList.add('open');
        fab.setAttribute('aria-expanded', 'true');
    }
    function closePanel() {
        panel.classList.remove('open');
        fab.classList.remove('open');
        fab.setAttribute('aria-expanded', 'false');
    }
    function togglePanel() {
        panel.classList.contains('open') ? closePanel() : openPanel();
    }

    fab.addEventListener('click', togglePanel);
    closeBtn.addEventListener('click', closePanel);

    // Close when clicking outside
    document.addEventListener('click', function (e) {
        if (!panel.contains(e.target) && e.target !== fab && !fab.contains(e.target)) {
            closePanel();
        }
    });

    // Close on Escape
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closePanel();
    });

    // Smooth-scroll nav links inside widget
    panel.querySelectorAll('.gwa-nav-link[href^="#"]').forEach(function (a) {
        a.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                closePanel();
            }
        });
    });

    // Tabs
    panel.querySelectorAll('.gwa-tab').forEach(function (tab) {
        tab.addEventListener('click', function () {
            panel.querySelectorAll('.gwa-tab').forEach(t => t.classList.remove('active'));
            panel.querySelectorAll('.gwa-pane').forEach(p => p.classList.remove('active'));
            this.classList.add('active');
            document.getElementById('gwa-pane-' + this.dataset.tab).classList.add('active');
        });
    });

    // Font size buttons
    const fontBtns = panel.querySelectorAll('.gwa-font-btn');
    let currentSize = localStorage.getItem('gba_font_size') || 'default';

    function applyFontSize(size) {
        document.body.classList.remove('gba-large-text', 'gba-xl-text');
        if (size === 'large') document.body.classList.add('gba-large-text');
        if (size === 'xl')    document.body.classList.add('gba-xl-text');
        fontBtns.forEach(b => b.classList.toggle('active', b.dataset.size === size));
        currentSize = size;
        try { localStorage.setItem('gba_font_size', size); } catch (e) {}
    }

    fontBtns.forEach(function (btn) {
        btn.addEventListener('click', function () { applyFontSize(this.dataset.size); });
    });

    // Restore saved font size
    applyFontSize(currentSize);

    // High contrast toggle
    const contrastToggle = document.getElementById('gwa-toggle-contrast');
    let highContrast = localStorage.getItem('gba_high_contrast') === 'true';

    function applyContrast(on) {
        document.body.classList.toggle('gba-high-contrast', on);
        contrastToggle.classList.toggle('on', on);
        contrastToggle.setAttribute('aria-pressed', String(on));
        try { localStorage.setItem('gba_high_contrast', String(on)); } catch (e) {}
    }

    contrastToggle.addEventListener('click', function () { applyContrast(!highContrast); highContrast = !highContrast; });
    applyContrast(highContrast);

    // Reduce motion toggle
    const motionToggle = document.getElementById('gwa-toggle-motion');
    let reduceMotion = localStorage.getItem('gba_reduce_motion') === 'true';

    function applyMotion(on) {
        const styleId = 'gba-reduce-motion-style';
        let el = document.getElementById(styleId);
        if (on && !el) {
            el = document.createElement('style');
            el.id = styleId;
            el.textContent = '*, *::before, *::after { animation-duration: .001ms !important; transition-duration: .001ms !important; }';
            document.head.appendChild(el);
        } else if (!on && el) {
            el.remove();
        }
        motionToggle.classList.toggle('on', on);
        motionToggle.setAttribute('aria-pressed', String(on));
        try { localStorage.setItem('gba_reduce_motion', String(on)); } catch (e) {}
    }

    motionToggle.addEventListener('click', function () { reduceMotion = !reduceMotion; applyMotion(reduceMotion); });
    applyMotion(reduceMotion);

    // Back to top
    function backToTop() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        closePanel();
    }
    const btn1 = document.getElementById('gwa-back-top');
    const btn2 = document.getElementById('gwa-back-top-2');
    if (btn1) btn1.addEventListener('click', backToTop);
    if (btn2) btn2.addEventListener('click', backToTop);

})();
