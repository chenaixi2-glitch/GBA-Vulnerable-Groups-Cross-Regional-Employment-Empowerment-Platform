/**
 * Local stack smoke test (no secrets printed).
 * Run: node backend/scripts/smoke_local_stack.js
 */
const http = require('http');

function get(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 8000 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode, body }));
    });
    req.on('error', (e) => resolve({ ok: false, status: 0, body: e.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, status: 0, body: 'timeout' });
    });
  });
}

async function main() {
  const checks = [
    ['static home', 'http://127.0.0.1:8080/'],
    ['i18n en', 'http://127.0.0.1:8080/assets/i18n/locales/en.json'],
    ['i18n zh-CN', 'http://127.0.0.1:8080/assets/i18n/locales/zh-CN.json'],
    ['i18n zh-TW removed', 'http://127.0.0.1:8080/assets/i18n/locales/zh-TW.json'],
    ['resume page', 'http://127.0.0.1:8080/individual/demo-resume-generator.html'],
    ['node health', 'http://127.0.0.1:3000/health'],
    ['node stats', 'http://127.0.0.1:3000/api/stats/home'],
    ['node jobs', 'http://127.0.0.1:3000/api/jobs?limit=1'],
    ['ai health', 'http://127.0.0.1:8000/health'],
    ['ai docs', 'http://127.0.0.1:8000/docs'],
  ];

  let fail = 0;
  for (const [name, url] of checks) {
    const r = await get(url);
    const expectFail = name.includes('removed');
    const pass = expectFail ? r.status === 404 : r.ok;
    if (!pass) fail += 1;
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(22)} ${r.status}  ${url}`);
  }

  const i18n = await get('http://127.0.0.1:8080/assets/i18n/i18n.js');
  const hasBilingual = /SUPPORTED\s*=\s*\[\s*'en'\s*,\s*'zh-CN'\s*\]/.test(i18n.body);
  // Only count switcher option markup, ignore cleanup selectors that mention legacy codes.
  const switcherHtmlMatch = i18n.body.match(/function languageSwitcherInnerHtml\(\)[\s\S]*?\n\s*\}/);
  const switcherHtml = switcherHtmlMatch ? switcherHtmlMatch[0] : '';
  const hasTwOption = /data-lang="zh-TW"/.test(switcherHtml);
  const hasPtOption = /data-lang="pt"/.test(switcherHtml);
  console.log(`${hasBilingual ? 'PASS' : 'FAIL'}  i18n bilingual only`);
  console.log(`${switcherHtml && !hasTwOption && !hasPtOption ? 'PASS' : 'FAIL'}  switcher no zh-TW/pt`);
  if (!hasBilingual || !switcherHtml || hasTwOption || hasPtOption) fail += 1;

  const home = await get('http://127.0.0.1:8080/index.html');
  const hasLangSlot = /header-lang-slot/.test(home.body);
  const hasHeroStats = /hero-stats/.test(home.body);
  const oldCopy = /Traditional Chinese, English, and Portuguese/.test(home.body);
  console.log(`${hasLangSlot ? 'PASS' : 'FAIL'}  home lang slot`);
  console.log(`${hasHeroStats ? 'PASS' : 'FAIL'}  home hero-stats`);
  console.log(`${!oldCopy ? 'PASS' : 'FAIL'}  home bilingual copy`);
  if (!hasLangSlot || !hasHeroStats || oldCopy) fail += 1;

  console.log(fail ? `\n${fail} check(s) failed` : '\nAll smoke checks passed');
  process.exit(fail ? 1 : 0);
}

main();
