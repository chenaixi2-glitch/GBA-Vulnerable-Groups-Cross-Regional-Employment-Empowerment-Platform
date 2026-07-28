/**
 * Record a detailed individual portal walkthrough for defense presentation.
 * Usage: node scripts/record-individual-demo.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'docs', 'demo-videos');
const PORT = 8767;

const SAMPLE_PROFILE = readFileSync(join(ROOT, 'test-data/alex-chen/profile-text.txt'), 'utf8').trim();
const SAMPLE_JD = readFileSync(join(ROOT, 'test-data/alex-chen/jd-text.txt'), 'utf8').trim();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
};

function startStaticServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const rel = urlPath === '/' ? '/index.html' : urlPath;
      const filePath = join(ROOT, rel.replace(/^\//, '').replace(/\.\./g, ''));
      if (!filePath.startsWith(ROOT) || !existsSync(filePath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(readFileSync(filePath));
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

async function smoothScroll(page, targetY, durationMs = 2000) {
  await page.evaluate(
    ({ targetY, durationMs }) =>
      new Promise((resolve) => {
        const startY = window.scrollY;
        const delta = targetY - startY;
        const start = performance.now();
        function step(now) {
          const t = Math.min(1, (now - start) / durationMs);
          const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          window.scrollTo(0, startY + delta * eased);
          if (t < 1) requestAnimationFrame(step);
          else resolve();
        }
        requestAnimationFrame(step);
      }),
    { targetY, durationMs }
  );
}

async function scrollBy(page, deltaY, pauseMs = 2200) {
  const target = await page.evaluate(
    (d) => Math.min(Math.max(0, document.body.scrollHeight - window.innerHeight), window.scrollY + d),
    deltaY
  );
  await smoothScroll(page, target, 2000);
  await page.waitForTimeout(pauseMs);
}

async function scrollToTop(page, pauseMs = 1500) {
  await smoothScroll(page, 0, 1800);
  await page.waitForTimeout(pauseMs);
}

async function dismissTour(page) {
  const skipTour = page.locator('#gba-guide-skip, .gga-skip');
  if (await skipTour.count()) {
    await skipTour.first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(600);
  }
}

async function visit(page, path, { waitMs = 2200, scrolls = 0, scrollDelta = 450 } = {}) {
  const base = `http://127.0.0.1:${PORT}`;
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await dismissTour(page);
  await page.waitForTimeout(waitMs);
  for (let i = 0; i < scrolls; i++) {
    await scrollBy(page, scrollDelta, 2400);
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const server = await startStaticServer();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: OUT_DIR, size: { width: 1920, height: 1080 } },
    locale: 'en-US',
  });

  const page = await context.newPage();
  const base = `http://127.0.0.1:${PORT}`;

  // ── 1. Individual portal dashboard ──
  await page.goto(`${base}/individual/portal.html`, { waitUntil: 'networkidle' });
  await dismissTour(page);
  await page.waitForTimeout(3000);

  const cards = page.locator('#dashboard .feature-card');
  const cardCount = await cards.count();
  for (let i = 0; i < cardCount; i++) {
    await cards.nth(i).hover();
    await page.waitForTimeout(900);
  }

  await scrollBy(page, 380, 2800);
  await page.locator('button:has-text("New Session"), button:has-text("API Status")').first().hover().catch(() => {});
  await page.waitForTimeout(1200);

  // ── 2. Smart Resume Generator (AI workflow) ──
  await visit(page, '/individual/demo-resume-generator.html', { waitMs: 2500 });
  const resumeText = page.locator('#resume-text');
  if (await resumeText.isVisible()) {
    await resumeText.fill(SAMPLE_PROFILE);
    await page.waitForTimeout(2000);
  }
  await scrollBy(page, 420, 2800);
  await scrollBy(page, 420, 2800);

  const jdText = page.locator('#jd-text');
  if (await jdText.isVisible({ timeout: 1500 }).catch(() => false)) {
    await jdText.fill(SAMPLE_JD);
    await page.waitForTimeout(2200);
    await scrollBy(page, 380, 2600);
  } else {
    await page.locator('#step-2, .step').nth(1).click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(1500);
    if (await jdText.isVisible({ timeout: 1500 }).catch(() => false)) {
      await jdText.fill(SAMPLE_JD);
      await page.waitForTimeout(2200);
    }
  }

  await scrollBy(page, 500, 2600);
  await scrollToTop(page, 1200);

  // ── 3. Job matching & applications ──
  await visit(page, '/individual/demo-jobs-database.html?friendly=1', { waitMs: 3500, scrolls: 2 });
  const firstJob = page.locator('#job-list button, #job-list a, #job-list [role="button"]').first();
  if (await firstJob.count()) {
    await firstJob.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(3000);
  }
  await scrollBy(page, 350, 2400);

  // ── 4. Interview preparation ──
  await visit(page, '/individual/demo-interview.html', { waitMs: 2500 });
  const interviewProfile = page.locator('#interview-profile-text');
  if (await interviewProfile.isVisible()) {
    await interviewProfile.fill(SAMPLE_PROFILE);
    await page.waitForTimeout(2000);
  }
  await scrollBy(page, 420, 2800);
  await scrollBy(page, 420, 2800);
  await scrollBy(page, 350, 2400);

  // ── 5. Personalized learning path ──
  await visit(page, '/individual/demo-learning-path.html', { waitMs: 2500 });
  const learningProfile = page.locator('#profile-text');
  if (await learningProfile.isVisible()) {
    await learningProfile.fill(SAMPLE_PROFILE);
    await page.waitForTimeout(2000);
  }
  await scrollBy(page, 450, 2800);
  await scrollBy(page, 450, 2800);

  // ── 6. My applications ──
  await visit(page, '/individual/my-applications.html', { waitMs: 3500, scrolls: 1 });

  // ── 7. User profile (group-type matching fields) ──
  await visit(page, '/individual/profile.html', { waitMs: 2500, scrolls: 2 });

  // ── 8. Inclusive employers directory ──
  await visit(page, '/individual/friendly-employers.html', { waitMs: 3500, scrolls: 2 });

  // ── 9. GBA policy navigator ──
  await visit(page, '/individual/demo-policy-navigator.html', { waitMs: 2500 });
  const policyTabs = page.locator('button.tab[data-tab]');
  const tabCount = await policyTabs.count();
  for (let i = 0; i < Math.min(tabCount, 3); i++) {
    await policyTabs.nth(i).click();
    await page.waitForTimeout(2800);
    await scrollBy(page, 320, 2200);
  }

  // ── 10. Donation & legal aid ──
  await visit(page, '/individual/donation-legal.html', { waitMs: 2500, scrolls: 2 });

  // ── Closing: return to portal ──
  await page.goto(`${base}/individual/portal.html`, { waitUntil: 'networkidle' });
  await dismissTour(page);
  await scrollToTop(page, 3000);

  const video = page.video();
  await context.close();
  await browser.close();
  server.close();

  if (video) {
    const tempPath = await video.path();
    const finalPath = join(OUT_DIR, 'individual-walkthrough.webm');
    if (existsSync(finalPath)) {
      renameSync(finalPath, join(OUT_DIR, `individual-walkthrough-${Date.now()}.webm`));
    }
    renameSync(tempPath, finalPath);
    console.log(`Video saved: ${finalPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
