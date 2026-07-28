/**
 * Record a corporate portal walkthrough video for defense presentation.
 * Usage: node scripts/record-corporate-demo.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'docs', 'demo-videos');
const PORT = 8766;

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

async function smoothScroll(page, targetY, durationMs = 1800) {
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

async function scrollToSection(page, selector, pauseMs = 2400) {
  const y = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return 0;
    const nav = document.querySelector('#corp-top-nav') || document.querySelector('nav');
    const offset = nav ? nav.offsetHeight + 20 : 100;
    return Math.max(0, el.getBoundingClientRect().top + window.scrollY - offset);
  }, selector);
  await smoothScroll(page, y, 2200);
  await page.waitForTimeout(pauseMs);
}

async function dismissTour(page) {
  const skipTour = page.locator('#gba-guide-skip, .gga-skip');
  if (await skipTour.count()) {
    await skipTour.first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(600);
  }
}

async function scrollBy(page, deltaY, pauseMs = 1800) {
  const target = await page.evaluate((d) => Math.min(document.body.scrollHeight - window.innerHeight, window.scrollY + d), deltaY);
  await smoothScroll(page, target, 1800);
  await page.waitForTimeout(pauseMs);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const server = await startStaticServer();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: OUT_DIR,
      size: { width: 1920, height: 1080 },
    },
    locale: 'en-US',
  });

  const page = await context.newPage();
  const base = `http://127.0.0.1:${PORT}`;

  // Corporate portal landing
  await page.goto(`${base}/corporate/portal.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  await dismissTour(page);
  await page.waitForTimeout(1500);

  // Hero: highlight dashboard & HR tools entry
  const hero = page.locator('.hero-section');
  await hero.locator('a[href="#dashboard"]').hover();
  await page.waitForTimeout(1200);
  await hero.locator('a[href="#ai-features"]').first().hover();
  await page.waitForTimeout(1500);

  // Recruiter dashboard with KPI counters & charts
  await scrollToSection(page, '#dashboard', 3200);
  await scrollBy(page, 520, 2200);
  await scrollBy(page, 520, 2400);

  // Donation / legal aid section
  await scrollToSection(page, '#donation-fund', 2000);

  // HR & compliance tools
  await scrollToSection(page, '#ai-features', 2800);
  const hrTools = page.locator('.hr-tool-card');
  if (await hrTools.count() >= 3) {
    await hrTools.nth(0).hover();
    await page.waitForTimeout(1000);
    await hrTools.nth(2).hover();
    await page.waitForTimeout(1200);
  }

  // My job postings
  await scrollToSection(page, '#jobs', 2600);

  // Post job form
  await page.goto(`${base}/corporate/post-job.html`, { waitUntil: 'networkidle' });
  await dismissTour(page);
  await page.waitForTimeout(2000);
  await scrollBy(page, 480, 2200);
  await scrollBy(page, 480, 2200);
  await scrollBy(page, 480, 2000);

  // Company profile
  await page.goto(`${base}/corporate/company-profile.html`, { waitUntil: 'networkidle' });
  await dismissTour(page);
  await page.waitForTimeout(2500);
  await scrollBy(page, 400, 2200);

  // Closing: back to portal hero
  await page.goto(`${base}/corporate/portal.html`, { waitUntil: 'networkidle' });
  await dismissTour(page);
  await smoothScroll(page, 0, 2200);
  await page.waitForTimeout(2500);

  const video = page.video();
  await context.close();
  await browser.close();
  server.close();

  if (video) {
    const tempPath = await video.path();
    const finalPath = join(OUT_DIR, 'corporate-walkthrough.webm');
    if (existsSync(finalPath)) {
      renameSync(finalPath, join(OUT_DIR, `corporate-walkthrough-${Date.now()}.webm`));
    }
    renameSync(tempPath, finalPath);
    console.log(`Video saved: ${finalPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
