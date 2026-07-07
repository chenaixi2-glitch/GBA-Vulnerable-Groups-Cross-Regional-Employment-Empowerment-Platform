#!/usr/bin/env node
/**
 * Inject shared auth header + page-bootstrap scripts into sub-pages.
 * Run: node backend/scripts/patch_shared_header_auth.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SCAN_DIRS = ['individual', 'corporate'];

const SKIP = new Set([
  'individual/portal.html',
  'corporate/portal.html',
  'individual/auth.html',
  'corporate/auth.html',
  'individual/index.html',
  'corporate/index.html',
  'individual/test-api.html',
]);

function authBlock(scope) {
  const profileLink = scope === 'corporate' ? 'company-profile.html' : 'profile.html';
  const btnColor = scope === 'corporate' ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700';
  return `
                <div id="portal-auth-guest" class="flex items-center gap-2">
                    <a href="auth.html" class="text-sm font-medium text-gray-600 hover:text-blue-600 px-3 py-1" data-i18n="portal.login">Log in</a>
                    <a href="auth.html?tab=register" class="text-sm font-medium text-white ${btnColor} px-3 py-1 rounded-lg" data-i18n="portal.signup">Sign up</a>
                </div>
                <div id="portal-auth-user" class="hidden flex items-center gap-3">
                    <a href="${profileLink}" class="text-sm text-blue-700 hover:text-blue-800 font-medium hidden sm:inline" data-i18n="portal.profile">Profile</a>
                    <div class="text-right hidden sm:block">
                        <div id="portal-user-name" class="text-sm font-medium text-gray-900"></div>
                        <div id="portal-user-email" class="text-xs text-gray-500"></div>
                    </div>
                    <button id="portal-logout-btn" type="button" class="text-sm text-gray-600 hover:text-red-600 px-2 py-1" data-i18n="portal.logout">Log out</button>
                </div>`;
}

function ensureDataPage(html, scope) {
  if (/data-page\s*=/.test(html)) return html;
  const value = scope === 'corporate' ? 'corporate' : 'individual';
  return html.replace(/<body(\s[^>]*)?>/i, function (match, attrs) {
    if (!attrs) return `<body data-page="${value}">`;
    return `<body${attrs} data-page="${value}">`;
  });
}

function injectAuthDom(html, scope) {
  if (html.includes('id="portal-auth-guest"')) return html;
  if (!html.includes('header-lang-slot')) return html;
  return html.replace(
    /(<div id="header-lang-slot"[^>]*><\/div>)/,
    '$1' + authBlock(scope)
  );
}

function injectScripts(html) {
  const prefix = '../assets';
  let next = html;
  const required = [
    `${prefix}/js/node-api-base.js`,
    `${prefix}/js/auth-api.js`,
    `${prefix}/js/portal-auth.js`,
  ];

  required.forEach(function (src) {
    if (next.includes(src)) return;
    next = next.replace(
      /(\s*<script src="[^"]*i18n\/i18n\.js"><\/script>)/,
      `\n    <script src="${src}"></script>$1`
    );
  });

  const bootstrap = `${prefix}/js/page-bootstrap.js`;
  if (!next.includes('page-bootstrap.js')) {
    next = next.replace(
      /(\s*<script src="[^"]*i18n\/i18n\.js"><\/script>)/,
      `$1\n    <script src="${bootstrap}"></script>`
    );
  }

  return next;
}

function patchFile(rel, scope) {
  const fp = path.join(ROOT, rel);
  let html = fs.readFileSync(fp, 'utf8');
  const before = html;

  html = ensureDataPage(html, scope);
  html = injectAuthDom(html, scope);
  html = injectScripts(html);

  if (html === before) return false;
  fs.writeFileSync(fp, html, 'utf8');
  return true;
}

let patched = 0;
let skipped = 0;

SCAN_DIRS.forEach(function (dir) {
  const base = path.join(ROOT, dir);
  if (!fs.existsSync(base)) return;
  fs.readdirSync(base)
    .filter(function (f) { return f.endsWith('.html'); })
    .forEach(function (file) {
      const rel = dir + '/' + file;
      if (SKIP.has(rel)) {
        skipped += 1;
        return;
      }
      const fp = path.join(base, file);
      const html = fs.readFileSync(fp, 'utf8');
      if (!html.includes('i18n/i18n.js')) {
        skipped += 1;
        return;
      }
      if (patchFile(rel, dir)) {
        console.log('patched', rel);
        patched += 1;
      } else {
        skipped += 1;
      }
    });
});

console.log('Done. patched', patched, 'skipped', skipped);
