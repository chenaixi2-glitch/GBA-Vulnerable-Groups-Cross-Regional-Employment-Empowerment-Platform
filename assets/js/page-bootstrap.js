/**
 * 子页面统一初始化：i18n 加载完成后再刷新登录态导航，并向功能脚本提供 whenReady。
 */
(function (global) {
  'use strict';

  var readyResolved = false;
  var readyPromise = null;
  var pendingCallbacks = [];

  function detectPortal() {
    var body = document.body;
    if (body && body.dataset && body.dataset.page) {
      var page = body.dataset.page;
      if (page === 'corporate' || page === 'individual') return page;
    }
    var path = String(global.location.pathname || '').replace(/\\/g, '/');
    if (path.indexOf('/corporate/') !== -1) return 'corporate';
    return 'individual';
  }

  function flushReady() {
    if (readyResolved) return;
    readyResolved = true;
    var queue = pendingCallbacks.slice();
    pendingCallbacks = [];
    queue.forEach(function (fn) {
      try {
        fn();
      } catch (err) {
        console.error('[GBAPageBootstrap]', err);
      }
    });
    global.dispatchEvent(new CustomEvent('gba:page-ready', { detail: { portal: detectPortal() } }));
  }

  function getReadyPromise() {
    if (!readyPromise) {
      readyPromise = new Promise(function (resolve) {
        if (readyResolved) {
          resolve();
          return;
        }
        var timer = setInterval(function () {
          if (readyResolved) {
            clearInterval(timer);
            resolve();
          }
        }, 16);
      });
    }
    return readyPromise;
  }

  function whenReady(fn) {
    if (typeof fn === 'function') {
      if (readyResolved) {
        try {
          fn();
        } catch (err) {
          console.error('[GBAPageBootstrap]', err);
        }
      } else {
        pendingCallbacks.push(fn);
      }
    }
    return getReadyPromise();
  }

  function runWhenReady(fn) {
    return whenReady(fn);
  }

  function initAuthNav() {
    if (!global.PortalAuth || typeof global.PortalAuth.initPortalAuth !== 'function') return;
    if (!document.getElementById('portal-auth-guest') && !document.getElementById('portal-auth-user')) return;
    global.PortalAuth.initPortalAuth({ portal: detectPortal(), requireAuth: false });
  }

  function bootPage() {
    var chain = global.GBAI18n && typeof global.GBAI18n.initLanguage === 'function'
      ? global.GBAI18n.initLanguage()
      : Promise.resolve();

    return chain.then(function () {
      initAuthNav();
      flushReady();
    });
  }

  global.addEventListener('gba:language-changed', function () {
    var portal = detectPortal();
    if (global.PortalAuth && typeof global.PortalAuth.refreshPortalAuthNav === 'function') {
      global.PortalAuth.refreshPortalAuthNav(portal);
    }
    if (global.GBAI18n && typeof global.GBAI18n.applyLanguage === 'function') {
      global.GBAI18n.applyLanguage(global.GBAI18n.getLang());
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    bootPage();
  });

  global.GBAPageBootstrap = {
    detectPortal: detectPortal,
    whenReady: whenReady,
    runWhenReady: runWhenReady,
    getReadyPromise: getReadyPromise,
  };
})(window);
