/**
 * E2E smoke test: interview simulation + learning path user flows.
 * Usage: node scripts/e2e-interview-learning-path.mjs
 *
 * Env:
 *   STATIC_BASE=http://127.0.0.1:8080
 *   API_BASE=http://127.0.0.1:8000
 *   SKIP_LLM=1   — UI + API route checks only (default)
 *   SKIP_LLM=0   — full LLM chain (slow, 5–15 min)
 */

import { chromium } from 'playwright';

const STATIC_BASE = process.env.STATIC_BASE || 'http://127.0.0.1:8080';
const API_BASE = process.env.API_BASE || 'http://127.0.0.1:8000';
const SKIP_LLM = process.env.SKIP_LLM !== '0';

const PROFILE_TEXT = `Alex Chen, Customer Service Specialist at Global E-Trade Co. since 2021.
Skills: Customer Service, English, Cantonese, E-commerce, CRM.
Education: BBA, City University of Hong Kong (2017-2021).
Achievements: Handled 80+ daily inquiries; improved first-response resolution by 18%.`;

const JD_TEXT = `Customer Service Specialist — Cross-border E-commerce
Requirements:
- 2+ years customer service experience
- Fluent English and Cantonese
- CRM and live chat tools
- Cross-border order and refund handling
- Strong communication under pressure`;

const results = [];

function log(icon, name, detail = '') {
  const line = detail ? `${icon} ${name} — ${detail}` : `${icon} ${name}`;
  console.log(line);
  results.push({ icon, name, detail });
}

async function test(name, fn) {
  try {
    await fn();
    log('✅', name);
    return true;
  } catch (err) {
    log('❌', name, err.message);
    return false;
  }
}

async function waitForLoadingHidden(page, timeout = 300000) {
  const overlay = page.locator('#loading-overlay');
  if (await overlay.isVisible().catch(() => false)) {
    await overlay.waitFor({ state: 'hidden', timeout });
  }
}

async function runInterviewUiFlow(page) {
  await page.goto(`${STATIC_BASE}/individual/demo-interview.html`, { waitUntil: 'networkidle' });

  await test('Interview page loads', async () => {
    await page.waitForSelector('#btn-load-questions');
    const title = await page.title();
    if (!title.includes('Interview')) throw new Error(`Unexpected title: ${title}`);
  });

  await test('Start button disabled before prerequisites', async () => {
    const disabled = await page.locator('#btn-load-questions').isDisabled();
    if (!disabled) throw new Error('Expected start button to be disabled');
  });

  await page.fill('#interview-profile-text', PROFILE_TEXT);

  if (SKIP_LLM) {
    await test('Interview form fields and mode tabs present', async () => {
      for (const id of ['interview-profile-text', 'job-title', 'btn-load-questions', 'interactive-panel']) {
        if (!(await page.locator(`#${id}`).count())) throw new Error(`Missing #${id}`);
      }
      await page.click('[data-mode="interactive"]');
      const btnText = await page.locator('#btn-load-questions').innerText();
      if (!/mock|interview|面试/i.test(btnText)) throw new Error(`Unexpected start button label: ${btnText}`);
    });
    return;
  }

  await page.click('button:has-text("Submit Profile")');

  await waitForLoadingHidden(page);
  await page.waitForSelector('#interview-jd-section:not(.hidden)', { timeout: 300000 });

  await page.fill('#interview-jd-text', JD_TEXT);
  await page.fill('#job-title', 'Customer Service Specialist');
  await page.click('button:has-text("Submit Job Description")');
  await waitForLoadingHidden(page);
  await page.waitForSelector('#interview-resume-section:not(.hidden)', { timeout: 300000 });

  await page.click('button:has-text("Generate Resume Content")');
  await waitForLoadingHidden(page);

  await page.waitForFunction(() => {
    const btn = document.getElementById('btn-load-questions');
    return btn && !btn.disabled;
  }, { timeout: 300000 });

  await test('Prerequisites complete — start enabled', async () => {
    const disabled = await page.locator('#btn-load-questions').isDisabled();
    if (disabled) throw new Error('Start button still disabled after prerequisites');
  });

  // Interactive mock interview mode
  await page.click('[data-mode="interactive"]');
  await page.click('#btn-load-questions');
  await waitForLoadingHidden(page);

  await page.waitForSelector('#interactive-panel:not(.hidden)', { timeout: 300000 });
  await page.waitForSelector('#interactive-answer-input', { timeout: 60000 });

  await test('Interactive interview started — chat visible', async () => {
    const chat = page.locator('#interactive-chat');
    if (!(await chat.count())) throw new Error('Interactive chat area not found');
    await page.waitForFunction(() => {
      const el = document.getElementById('interactive-chat');
      return el && el.children.length >= 1;
    }, { timeout: 120000 });
  });

  await page.fill('#interactive-answer-input', 'I handled cross-border order issues using CRM tools and maintained 95% CSAT.');
  await page.locator('#interactive-input-section button:has-text("Send Answer")').click();
  await waitForLoadingHidden(page);

  await test('Interactive turn submitted — new interviewer message', async () => {
    await page.waitForFunction(() => {
      const el = document.getElementById('interactive-chat');
      return el && el.children.length >= 2;
    }, { timeout: 300000 });
  });

  await page.locator('#interactive-panel button:has-text("End & Debrief")').click();
  await waitForLoadingHidden(page);
  await page.waitForSelector('#interactive-debrief-section:not(.hidden)', { timeout: 300000 });

  await test('Interactive debrief generated', async () => {
    const debrief = page.locator('#interactive-debrief-section');
    if (!(await debrief.isVisible())) throw new Error('Debrief panel not visible');
  });
}

async function runLearningPathUiFlow(page) {
  await page.goto(`${STATIC_BASE}/individual/demo-learning-path.html`, { waitUntil: 'networkidle' });

  await test('Learning path page loads', async () => {
    await page.waitForSelector('#btn-generate-path');
  });

  await page.fill('#target-job', 'Customer Service Manager');
  await page.fill('#current-role', 'Customer Service Specialist');
  await page.fill('#current-skills', 'Customer Service, English, Cantonese, CRM');
  await page.fill('#jd-text', JD_TEXT);

  await test('Form validation — empty target job blocked', async () => {
    await page.fill('#target-job', '');
    await page.click('#btn-generate-path');
    await page.waitForTimeout(500);
    const resultsVisible = await page.locator('#learning-path-results').isVisible();
    if (resultsVisible) throw new Error('Results shown with empty target job');
    await page.fill('#target-job', 'Customer Service Manager');
  });

  if (SKIP_LLM) {
    await test('Learning path generate button wired', async () => {
      const btn = page.locator('#btn-generate-path');
      if (!(await btn.isVisible())) throw new Error('Generate button missing');
    });
    return;
  }

  await page.click('#btn-generate-path');
  await page.waitForSelector('#learning-path-results:not(.hidden)', { timeout: 600000 });
  await page.waitForSelector('#daily-hours-section:not(.hidden)', { timeout: 10000 });

  await test('Gap analysis results displayed', async () => {
    const gaps = await page.locator('#skill-gaps-container > *').count();
    if (gaps === 0) throw new Error('No skill gaps rendered');
  });

  await page.click('input[name="daily-hours"][value="2"]');
  await page.click('#btn-generate-timeline');
  await page.waitForSelector('#timeline-section:not(.hidden)', { timeout: 600000 });

  await test('Timeline generated', async () => {
    const phases = await page.locator('#timeline-container .timeline-item, #timeline-container > div').count();
    if (phases === 0) throw new Error('No timeline phases rendered');
  });

  await page.click('#btn-edit-timeline');
  await test('Timeline edit mode toggles', async () => {
    const applyBtn = page.locator('#btn-apply-timeline');
    if (!(await applyBtn.isVisible())) throw new Error('Apply timeline button not shown in edit mode');
  });
  await page.click('#btn-cancel-timeline');
}

async function runApiRouteChecks() {
  await test('Backend /health', async () => {
    const res = await fetch(`${API_BASE}/health`);
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  });

  await test('Interview API routes exist', async () => {
    const res = await fetch(`${API_BASE}/api/interview/interactive/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: 'e2e_probe', job_title: 'Test' }),
    });
    // 400/409/500 acceptable — route exists; 404 means missing
    if (res.status === 404) throw new Error('Route not found');
  });

  await test('Learning path history requires auth', async () => {
    const res = await fetch(`${API_BASE}/api/learning-path/history`);
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });
}

async function main() {
  console.log('\n=== Interview + Learning Path E2E ===');
  console.log(`Static: ${STATIC_BASE} | API: ${API_BASE} | SKIP_LLM: ${SKIP_LLM}\n`);

  await runApiRouteChecks();

  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('dialog', (dialog) => dialog.accept());

  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('  [browser error]', msg.text());
  });
  page.on('pageerror', (err) => console.log('  [page error]', err.message));

  try {
    console.log('\n--- Interview Simulation ---');
    await runInterviewUiFlow(page);

    console.log('\n--- Learning Path ---');
    await runLearningPathUiFlow(page);
  } finally {
    await browser.close();
  }

  const passed = results.filter((r) => r.icon === '✅').length;
  const failed = results.filter((r) => r.icon === '❌').length;
  console.log(`\n=== Summary: ${passed} passed, ${failed} failed / ${results.length} total ===`);
  if (SKIP_LLM) {
    console.log('Note: SKIP_LLM=1 — run SKIP_LLM=0 for full LLM chain (slow).\n');
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
