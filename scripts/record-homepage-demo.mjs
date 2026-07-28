/**
 * Record a smooth homepage walkthrough video for defense presentation.
 * Usage: node scripts/record-homepage-demo.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync, mkdirSync, readdirSync, renameSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'docs', 'demo-videos');
const PORT = 8765;

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

async function scrollToSection(page, selector, pauseMs = 2200) {
  const y = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return 0;
    const nav = document.querySelector('nav');
    const offset = nav ? nav.offsetHeight + 16 : 80;
    return Math.max(0, el.getBoundingClientRect().top + window.scrollY - offset);
  }, selector);
  await smoothScroll(page, y, 2000);
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
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3500);

  // Hero: highlight entry points for individual / corporate portals
  await page.locator('[data-portal-target="individual"]').first().hover();
  await page.waitForTimeout(1200);
  await page.locator('[data-portal-target="corporate"]').first().hover();
  await page.waitForTimeout(1500);

  const sections = [
    '#features',
    '#how-it-works',
    '#benefits',
    '#faq',
  ];

  for (const section of sections) {
    await scrollToSection(page, section, 2800);
  }

  // Expand first FAQ for interaction demo
  const firstFaq = page.locator('.faq-question').first();
  if (await firstFaq.count()) {
    await firstFaq.click();
    await page.waitForTimeout(2200);
  }

  // Scroll to CTA footer area
  await smoothScroll(page, await page.evaluate(() => document.body.scrollHeight - 1080), 2200);
  await page.waitForTimeout(2500);

  // Return to hero for closing shot
  await smoothScroll(page, 0, 2400);
  await page.waitForTimeout(2000);

  const video = page.video();
  await context.close();
  await browser.close();
  server.close();

  if (video) {
    const tempPath = await video.path();
    const finalPath = join(OUT_DIR, 'homepage-walkthrough.webm');
    if (existsSync(finalPath)) {
      const backup = join(OUT_DIR, `homepage-walkthrough-${Date.now()}.webm`);
      renameSync(finalPath, backup);
    }
    renameSync(tempPath, finalPath);
    console.log(`Video saved: ${finalPath}`);
  } else {
    const files = readdirSync(OUT_DIR).filter((f) => f.endsWith('.webm'));
    console.log(`Video saved in: ${join(OUT_DIR, files[files.length - 1] || '')}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
