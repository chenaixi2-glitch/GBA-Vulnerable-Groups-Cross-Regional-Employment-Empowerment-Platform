#!/usr/bin/env node
/**
 * Audit frontend AI API calls for page-language wiring.
 * Run: node backend/scripts/audit_api_language.js
 *
 * Flags .chat( calls missing language / usePageLanguage, and interview helpers
 * that still hardcode 'zh' as default language.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const JS_DIRS = [
  path.join(ROOT, 'individual', 'assets', 'js'),
  path.join(ROOT, 'corporate', 'assets', 'js'),
  path.join(ROOT, 'assets', 'js'),
];

const CHAT_RE = /\.chat\s*\(/g;
const SAFE_CHAT = /(?:language\s*:|usePageLanguage\s*:\s*true)/;

function walk(dir, out) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach((name) => {
    const fp = path.join(dir, name);
    const st = fs.statSync(fp);
    if (st.isDirectory()) walk(fp, out);
    else if (name.endsWith('.js')) out.push(fp);
  });
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function auditFile(fp) {
  const rel = path.relative(ROOT, fp).replace(/\\/g, '/');
  const text = fs.readFileSync(fp, 'utf8');
  const issues = [];

  let m;
  while ((m = CHAT_RE.exec(text)) !== null) {
    const start = m.index;
    const snippet = text.slice(start, start + 400);
    if (SAFE_CHAT.test(snippet)) continue;
    issues.push({
      file: rel,
      line: lineOf(text, start),
      kind: 'chat-missing-language',
      snippet: snippet.split('\n')[0].trim().slice(0, 120),
    });
  }

  if (rel.endsWith('api-client.js')) {
    const hardcoded = text.match(/normalizeResumeLanguage\(\w+\s*\|\|\s*'zh'\)/g);
    if (hardcoded) {
      hardcoded.forEach((hit) => {
        issues.push({
          file: rel,
          kind: 'hardcoded-zh-default',
          snippet: hit,
        });
      });
    }
  }

  return issues;
}

const files = [];
JS_DIRS.forEach((d) => walk(d, files));

const all = [];
files.forEach((fp) => all.push(...auditFile(fp)));

if (!all.length) {
  console.log('OK — no missing language wiring found in .chat() calls.');
  process.exit(0);
}

console.log('Issues found:', all.length);
all.forEach((item) => {
  console.log(`- [${item.kind}] ${item.file}${item.line ? ':' + item.line : ''} — ${item.snippet}`);
});
process.exit(1);
