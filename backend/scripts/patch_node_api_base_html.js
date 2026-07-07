/**
 * Insert node-api-base.js before first Node platform script in HTML pages.
 * Usage: node backend/scripts/patch_node_api_base_html.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const MARKER = 'node-api-base.js';
const TARGETS = [
  'index.html',
  'individual/auth.html',
  'individual/portal.html',
  'individual/profile.html',
  'individual/apply.html',
  'individual/my-applications.html',
  'individual/donation-legal.html',
  'individual/demo-jobs-database.html',
  'individual/demo-resume-generator.html',
  'individual/friendly-employers.html',
  'corporate/auth.html',
  'corporate/portal.html',
  'corporate/company-profile.html',
  'corporate/post-job.html',
  'corporate/donation-legal.html',
];

const NODE_SCRIPT_RE =
  /<script src="([^"]*(?:auth-api|platform-api|platform-access|api-client)\.js)"><\/script>/;

function nodeBasePath(firstScriptSrc, relFile) {
  const inSubdir = relFile.includes('/');
  if (inSubdir && !firstScriptSrc.startsWith('../')) {
    return '../assets/js/node-api-base.js';
  }
  if (firstScriptSrc.startsWith('../assets/')) {
    return '../assets/js/node-api-base.js';
  }
  return 'assets/js/node-api-base.js';
}

let patched = 0;
for (const rel of TARGETS) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) {
    console.warn('skip missing', rel);
    continue;
  }
  let html = fs.readFileSync(fp, 'utf8');
  if (html.includes(MARKER)) {
    console.log('already', rel);
    continue;
  }
  const m = html.match(NODE_SCRIPT_RE);
  if (!m) {
    console.warn('no node script tag', rel);
    continue;
  }
  const tag = `<script src="${nodeBasePath(m[1], rel)}"></script>`;
  html = html.replace(m[0], `${tag}\n    ${m[0]}`);
  fs.writeFileSync(fp, html, 'utf8');
  patched += 1;
  console.log('patched', rel);
}
console.log('done, patched', patched);
