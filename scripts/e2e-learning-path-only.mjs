import { chromium } from 'playwright';

const STATIC = process.env.STATIC_BASE || 'http://127.0.0.1:8080';
const JD = `Customer Service Specialist — Cross-border E-commerce
Requirements:
- 2+ years customer service experience
- Fluent English and Cantonese
- CRM and live chat tools`;

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage();

try {
  await page.goto(`${STATIC}/individual/demo-learning-path.html`, { waitUntil: 'networkidle' });
  await page.fill('#target-job', 'Customer Service Manager');
  await page.fill('#current-role', 'Customer Service Specialist');
  await page.fill('#current-skills', 'Customer Service, English, Cantonese, CRM');
  await page.fill('#jd-text', JD);

  console.log('[1/2] Generating skill gap analysis...');
  await page.click('#btn-generate-path');
  await page.waitForSelector('#learning-path-results:not(.hidden)', { timeout: 600000 });
  const gaps = await page.locator('#skill-gaps-container > *').count();
  console.log(`  Skill gaps rendered: ${gaps}`);
  if (gaps === 0) throw new Error('No skill gaps rendered');

  await page.click('input[name="daily-hours"][value="2"]');
  console.log('[2/2] Generating learning timeline...');
  await page.click('#btn-generate-timeline');
  await page.waitForSelector('#timeline-section:not(.hidden)', { timeout: 600000 });
  const phases = await page.locator('#timeline-container > *').count();
  console.log(`  Timeline phases rendered: ${phases}`);
  if (phases === 0) throw new Error('No timeline phases rendered');

  console.log('\n✅ Learning path full E2E passed');
} finally {
  await browser.close();
}
