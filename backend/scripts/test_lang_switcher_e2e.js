#!/usr/bin/env node
/**
 * Browser smoke test for language switcher (requires: npx playwright install chromium once).
 * Run: node static-server.js (port 8080) in another terminal, then:
 *      node backend/scripts/test_lang_switcher_e2e.js
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080';
const PAGES = [
  { path: '/index.html', name: 'home', open: '#language-toggle-btn', pick: '#language-dropdown [data-lang="zh-CN"]', expectLang: 'zh-CN', viewport: { width: 1280, height: 800 } },
  { path: '/individual/community.html', name: 'community', open: '.language-selector button', pick: '[data-lang="zh-CN"]', expectLang: 'zh-CN' },
  { path: '/individual/demo-olivia.html', name: 'olivia-dark', open: '.language-selector button', pick: '[data-lang="pt"]', expectLang: 'pt' },
  { path: '/corporate/portal.html', name: 'corp-portal', open: '.language-selector button', pick: '[data-lang="zh-TW"]', expectLang: 'zh-TW' },
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
      } catch (e) {}
    });
    const tab = await ctx.newPage();
    try {
      await tab.goto(BASE + page.path, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await tab.evaluate(() => {
        ['home', 'individual', 'corporate'].forEach((p) => {
          try { localStorage.setItem('gba_site_guide_v1_' + p, 'done'); } catch (e) {}
        });
        var o = document.getElementById('gba-guide-overlay');
        if (o) o.classList.remove('active');
        document.body.classList.remove('gba-guide-active');
      });
      await tab.waitForFunction(() => window.GBAI18n && GBAI18n.getLang, null, { timeout: 8000 });
      await tab.waitForTimeout(1200);
      await tab.evaluate(() => {
        var o = document.getElementById('gba-guide-overlay');
        if (o) o.classList.remove('active');
        document.body.classList.remove('gba-guide-active');
      });
      const hasSwitcher = await tab.locator('.language-selector, [data-lang]').first().count();
      if (!hasSwitcher) throw new Error('no switcher found');

      if (page.open) {
        const openBtn = tab.locator(page.open).first();
        if (await openBtn.count()) await openBtn.click();
      }
      const pickSel = page.pick || page.open;
      await tab.locator(pickSel).first().click();
      await tab.waitForFunction(
        (lang) => window.GBAI18n && GBAI18n.getLang() === lang,
        page.expectLang,
        { timeout: 5000 }
      );
      const docLang = await tab.evaluate(() => document.documentElement.lang);
      console.log('OK  ', page.name, '→', page.expectLang, '(html lang=' + docLang + ')');
    } catch (err) {
      console.log('FAIL', page.name, '→', err.message);
      fails.push(page.name);
    } finally {
      await ctx.close();
    }
  }
  await browser.close();
  if (fails.length) {
    console.log('\nFailed:', fails.join(', '));
    process.exit(1);
  }
  console.log('\nAll switcher smoke tests passed.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
