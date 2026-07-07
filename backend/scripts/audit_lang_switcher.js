#!/usr/bin/env node
/**
 * Static audit: language switcher wiring on all site HTML pages.
 * Run: node backend/scripts/audit_lang_switcher.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SCAN_DIRS = ['', 'individual', 'corporate'];
const SKIP = new Set(['backend/test_resume_preview.html']);

function listHtml() {
  const out = [];
  SCAN_DIRS.forEach((dir) => {
    const base = dir ? path.join(ROOT, dir) : ROOT;
    if (!fs.existsSync(base)) return;
    fs.readdirSync(base)
      .filter((f) => f.endsWith('.html'))
      .forEach((f) => {
        const rel = (dir ? dir + '/' : '') + f;
        out.push({ rel, abs: path.join(base, f) });
      });
  });
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

function auditPage(entry) {
  const html = fs.readFileSync(entry.abs, 'utf8');
  const issues = [];
  const hasI18n = /i18n\/i18n\.js/.test(html);
  const hasSlot = /id\s*=\s*["']header-lang-slot["']/.test(html);
  const hasBuiltIn = /data-lang\s*=/.test(html);
  const hasUiLang = /id\s*=\s*["']ui-lang["']/.test(html);
  const isRedirect = /location\.replace\s*\(/.test(html);
  const hasFontAwesome = /font-awesome/.test(html);

  if (!hasI18n) {
    issues.push({ level: 'error', msg: 'missing i18n.js' });
    return { rel: entry.rel, issues, mechanism: 'none' };
  }

  let mechanism = 'auto-floating';
  if (hasBuiltIn) mechanism = 'built-in data-lang';
  else if (hasSlot) mechanism = 'header-lang-slot';
  else if (hasUiLang) mechanism = 'ui-lang select';

  if (!isRedirect && !hasBuiltIn && !hasSlot && !hasUiLang) {
    issues.push({ level: 'warn', msg: 'no switcher anchor — relies on floating fallback only' });
  }

  if (hasSlot && !hasBuiltIn && !hasFontAwesome) {
    issues.push({ level: 'warn', msg: 'header-lang-slot but no Font Awesome (globe icon may be missing)' });
  }

  if (hasBuiltIn && /language-selector[^>]*hidden\s+sm:block/.test(html) && !/mobile-menu[\s\S]*data-lang/.test(html)) {
    issues.push({ level: 'warn', msg: 'desktop-only language selector — no mobile menu language links' });
  }

  if (hasSlot && !hasBuiltIn) {
    const headerMatch = html.match(/<header[\s\S]*?<\/header>/i);
    const headerHtml = headerMatch ? headerMatch[0] : '';
    const darkHeader = /bg-slate-9|bg-gray-9|bg-slate-950|border-slate-7/.test(headerHtml)
      && !/bg-white/.test(headerHtml);
    if (darkHeader && !/gba-lang-on-dark|data-lang-theme\s*=\s*["']dark["']/.test(html)) {
      issues.push({ level: 'warn', msg: 'dark header — add gba-lang-on-dark on #header-lang-slot' });
    }
  }

  if (hasBuiltIn && hasSlot) {
    issues.push({ level: 'info', msg: 'has both built-in data-lang and header-lang-slot (injection skipped when data-lang present)' });
  }

  return { rel: entry.rel, issues, mechanism, isRedirect };
}

const pages = listHtml().filter((e) => !SKIP.has(e.rel.replace(/\\/g, '/')));
const results = pages.map(auditPage);
const errors = results.filter((r) => r.issues.some((i) => i.level === 'error'));
const warns = results.filter((r) => r.issues.some((i) => i.level === 'warn'));

console.log('Language switcher audit —', pages.length, 'pages\n');
results.forEach((r) => {
  if (!r.issues.length) {
    console.log('OK  ', r.rel, '→', r.mechanism);
    return;
  }
  r.issues.forEach((i) => {
    console.log(i.level.toUpperCase().padEnd(5), r.rel, '→', i.msg, '|', r.mechanism);
  });
});

console.log('\nSummary: errors', errors.length, 'warnings', warns.length);
process.exit(errors.length ? 1 : 0);
