/**
 * 通用「功能未开放」提示条
 * 给任意元素加上 data-coming-soon 属性即可：点击时阻止默认跳转，
 * 并在页面上弹出一个黑底白字的小提示框，几秒后自动消失。
 * 提示文案可通过 data-coming-soon="自定义文案" 覆盖默认文案。
 */
(function () {
    'use strict';

    var DEFAULT_MESSAGE = '功能还未开放，尽情期待~';
    var toastEl = null;
    var hideTimer = null;

    function csT(key, fallback) {
        if (window.GBAI18n && window.GBAI18n.t) return window.GBAI18n.t(key, fallback);
        return fallback;
    }

    function injectStyles() {
        if (document.getElementById('gba-coming-soon-styles')) return;
        var style = document.createElement('style');
        style.id = 'gba-coming-soon-styles';
        style.textContent = [
            '#gba-coming-soon-toast {',
            '  position: fixed; left: 50%; bottom: 2.5rem; z-index: 9999;',
            '  transform: translate(-50%, 12px); opacity: 0; pointer-events: none;',
            '  background: #111827; color: #fff; font-size: .9rem; font-weight: 600;',
            '  padding: .75rem 1.5rem; border-radius: 999px;',
            '  box-shadow: 0 12px 30px rgba(0,0,0,0.28);',
            '  transition: opacity .25s ease, transform .25s ease;',
            '  max-width: min(90vw, 360px); text-align: center;',
            '}',
            '#gba-coming-soon-toast.active { opacity: 1; transform: translate(-50%, 0); pointer-events: auto; }'
        ].join('\n');
        document.head.appendChild(style);
    }

    function ensureToast() {
        if (toastEl) return toastEl;
        injectStyles();
        toastEl = document.createElement('div');
        toastEl.id = 'gba-coming-soon-toast';
        toastEl.setAttribute('role', 'status');
        document.body.appendChild(toastEl);
        return toastEl;
    }

    function showComingSoon(message) {
        var el = ensureToast();
        el.textContent = message || csT('common.comingSoon', DEFAULT_MESSAGE);
        el.classList.add('active');
        if (hideTimer) window.clearTimeout(hideTimer);
        hideTimer = window.setTimeout(function () {
            el.classList.remove('active');
        }, 2400);
    }

    document.addEventListener('click', function (e) {
        var el = e.target.closest ? e.target.closest('[data-coming-soon]') : null;
        if (!el) return;
        e.preventDefault();
        var customMessage = el.getAttribute('data-coming-soon');
        showComingSoon(customMessage && customMessage.trim() ? customMessage : null);
    });

    window.GBAComingSoon = { show: showComingSoon };
})();
