#!/usr/bin/env node
/**
 * Browser smoke test for language switcher (requires: npx playwright install chromium once).
 * Run: node static-server.js (port 8080) in another terminal, then:
 *      node backend/scripts/test_lang_switcher_e2e.js
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080';
const PAGES = [
  { path: '/index.html', name: 'home', open: '.language-selector button', pick: '[data-lang="zh-CN"]', expectLang: 'zh-CN', viewport: { width: 1280, height: 800 } },
  { path: '/individual/community.html', name: 'community', open: '.language-selector button', pick: '[data-lang="zh-CN"]', expectLang: 'zh-CN' },
  { path: '/individual/demo-resume-generator.html', name: 'resume', open: '.language-selector button', pick: '[data-lang="en"]', expectLang: 'en' },
  { path: '/corporate/portal.html', name: 'corp-portal', open: '.language-selector button', pick: '[data-lang="zh-CN"]', expectLang: 'zh-CN' },
];

async function run() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    console.error('Playwright unavailable — install with: npx playwright install chromium');
    process.exit(2);
  }

  const fails = [];
  for (const page of PAGES) {
    const ctx = await browser.newContext(page.viewport ? { viewport: page.viewport } : {});
    await ctx.addInitScript(() => {
      try {
        ['home', 'individual', 'corporate'].forEach((p) => {
          localStorage.setItem('gba_site_guide_v1_' + p, 'done');
        });
        localStorage.setItem('gba_ui_lang', 'en');
      } catch (e) {}
    });
    const tab = await ctx.newPage();
    try {
      await tab.goto(BASE + page.path, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await tab.waitForTimeout(500);
      const openBtn = tab.locator(page.open).first();
      await openBtn.click({ timeout: 10000 });
      await tab.locator(page.pick).first().click({ timeout: 10000 });
      await tab.waitForTimeout(800);
      const lang = await tab.evaluate(() => localStorage.getItem('gba_ui_lang'));
      const htmlLang = await tab.evaluate(() => document.documentElement.lang);
      const unsupported = await tab.evaluate(() =>
        !!document.querySelector('[data-lang="zh-TW"], [data-lang="pt"]')
      );
      if (lang !== page.expectLang) {
        fails.push(page.name + ': localStorage=' + lang + ' expected ' + page.expectLang);
      } else if (htmlLang !== page.expectLang && htmlLang !== page.expectLang.toLowerCase()) {
        fails.push(page.name + ': html lang=' + htmlLang + ' expected ' + page.expectLang);
      } else if (unsupported) {
        fails.push(page.name + ': still has zh-TW/pt options');
      } else {
        console.log('OK', page.name, '->', lang);
      }
    } catch (err) {
      fails.push(page.name + ': ' + (err && err.message ? err.message : String(err)));
    }
    await ctx.close();
  }
  await browser.close();
  if (fails.length) {
    console.error('FAILED:\n' + fails.join('\n'));
    process.exit(1);
  }
  console.log('All language switcher checks passed (en / zh-CN only).');
}

run();
