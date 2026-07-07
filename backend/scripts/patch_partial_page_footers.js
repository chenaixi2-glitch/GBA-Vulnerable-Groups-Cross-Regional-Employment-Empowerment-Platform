#!/usr/bin/env node
/**
 * Inject shared i18n footer into partial-coverage HTML pages (<40 data-i18n tags).
 * Run: node backend/scripts/patch_partial_page_footers.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SCAN_DIRS = ['individual', 'corporate'];
const THRESHOLD = 40;
const SKIP = new Set([
  'individual/index.html',
  'corporate/index.html',
  'individual/test-api.html',
]);

function countDataI18n(html) {
  return (html.match(/data-i18n\s*=/g) || []).length;
}

function footerIndividual() {
  return `
    <footer class="gba-site-footer bg-slate-800 text-slate-100 py-10 mt-10" data-gba-footer="1">
        <div class="max-w-6xl mx-auto px-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 text-sm">
                <div>
                    <p class="font-bold text-white mb-2" data-i18n="home.brandName">GBA Platform</p>
                    <p class="text-slate-300 leading-relaxed" data-i18n="home.footerTagline">Empowering vulnerable groups with inclusive employment opportunities, smart matching, and AI career tools across the Greater Bay Area.</p>
                </div>
                <div>
                    <p class="font-semibold text-white mb-2" data-i18n="home.footerQuickLinks">Quick Links</p>
                    <ul class="space-y-1.5 text-slate-300">
                        <li><a href="../index.html#features" class="hover:text-white" data-i18n="nav-features">Features</a></li>
                        <li><a href="../index.html#how-it-works" class="hover:text-white" data-i18n="home.howItWorks">How It Works</a></li>
                        <li><a href="../index.html#benefits" class="hover:text-white" data-i18n="section-benefits-title">Benefits</a></li>
                        <li><a href="../index.html#faq" class="hover:text-white" data-i18n="nav-faq">FAQ</a></li>
                    </ul>
                </div>
                <div>
                    <p class="font-semibold text-white mb-2" data-i18n="home.footerUserAccess">User Access</p>
                    <ul class="space-y-1.5 text-slate-300">
                        <li><a href="portal.html" class="hover:text-white" data-i18n="home.footerIndividualPortal">Individual Portal</a></li>
                        <li><a href="../corporate/portal.html" class="hover:text-white" data-i18n="home.footerCorporatePortal">Corporate Portal</a></li>
                        <li><a href="demo-jobs-database.html" class="hover:text-white" data-i18n="home.navFriendlyJobs">Friendly jobs</a></li>
                        <li><a href="friendly-employers.html" class="hover:text-white" data-i18n="home.navFriendlyEmployers">Friendly employers</a></li>
                        <li><a href="my-applications.html" class="hover:text-white" data-i18n="home.navMyApplications">My applications</a></li>
                        <li><a href="auth.html" class="hover:text-white" data-i18n="home.login">Log in</a></li>
                    </ul>
                </div>
                <div>
                    <p class="font-semibold text-white mb-2" data-i18n="home.footerContact">Contact Us</p>
                    <ul class="space-y-1.5 text-slate-300">
                        <li data-i18n="home.footerAddress">GBA Innovation Center, 123 Bay Area Blvd, Shenzhen, China</li>
                        <li data-i18n="home.footerPhone">+86 400-123-4567</li>
                        <li data-i18n="home.footerEmail">info@gba-platform.com</li>
                    </ul>
                </div>
            </div>
            <div class="mt-8 pt-6 border-t border-slate-600 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
                <p data-i18n="home.footerCopyright">&copy; 2026 GBA Cross-Border Employment Empowerment Platform. All rights reserved.</p>
                <div class="flex flex-wrap justify-center gap-4">
                    <a href="#" class="hover:text-white" data-i18n="portal.privacy">Privacy Policy</a>
                    <a href="#" class="hover:text-white" data-i18n="portal.terms">Terms of Service</a>
                    <a href="#" class="hover:text-white" data-i18n="portal.contact">Contact Support</a>
                </div>
            </div>
        </div>
    </footer>`;
}

function footerCorporate() {
  return `
    <footer class="gba-site-footer bg-slate-800 text-slate-100 py-10 mt-10" data-gba-footer="1">
        <div class="max-w-6xl mx-auto px-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 text-sm">
                <div>
                    <p class="font-bold text-white mb-2" data-i18n="home.brandName">GBA Platform</p>
                    <p class="text-slate-300 leading-relaxed" data-i18n="home.footerTagline">Empowering vulnerable groups with inclusive employment opportunities, smart matching, and AI career tools across the Greater Bay Area.</p>
                </div>
                <div>
                    <p class="font-semibold text-white mb-2" data-i18n="home.footerQuickLinks">Quick Links</p>
                    <ul class="space-y-1.5 text-slate-300">
                        <li><a href="../index.html#features" class="hover:text-white" data-i18n="nav-features">Features</a></li>
                        <li><a href="../index.html#how-it-works" class="hover:text-white" data-i18n="home.howItWorks">How It Works</a></li>
                        <li><a href="../index.html#benefits" class="hover:text-white" data-i18n="section-benefits-title">Benefits</a></li>
                        <li><a href="../index.html#faq" class="hover:text-white" data-i18n="nav-faq">FAQ</a></li>
                    </ul>
                </div>
                <div>
                    <p class="font-semibold text-white mb-2" data-i18n="home.footerUserAccess">User Access</p>
                    <ul class="space-y-1.5 text-slate-300">
                        <li><a href="portal.html" class="hover:text-white" data-i18n="home.footerCorporatePortal">Corporate Portal</a></li>
                        <li><a href="../individual/portal.html" class="hover:text-white" data-i18n="home.footerIndividualPortal">Individual Portal</a></li>
                        <li><a href="post-job.html" class="hover:text-white" data-i18n="home.footerHrTools">HR interactive tools</a></li>
                        <li><a href="auth.html" class="hover:text-white" data-i18n="home.login">Log in</a></li>
                        <li><a href="auth.html" class="hover:text-white" data-i18n="home.signup">Sign up</a></li>
                    </ul>
                </div>
                <div>
                    <p class="font-semibold text-white mb-2" data-i18n="home.footerContact">Contact Us</p>
                    <ul class="space-y-1.5 text-slate-300">
                        <li data-i18n="home.footerAddress">GBA Innovation Center, 123 Bay Area Blvd, Shenzhen, China</li>
                        <li data-i18n="home.footerPhone">+86 400-123-4567</li>
                        <li data-i18n="home.footerEmail">info@gba-platform.com</li>
                    </ul>
                </div>
            </div>
            <div class="mt-8 pt-6 border-t border-slate-600 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
                <p data-i18n="home.footerCopyright">&copy; 2026 GBA Cross-Border Employment Empowerment Platform. All rights reserved.</p>
                <div class="flex flex-wrap justify-center gap-4">
                    <a href="#" class="hover:text-white" data-i18n="portal.privacy">Privacy Policy</a>
                    <a href="#" class="hover:text-white" data-i18n="portal.terms">Terms of Service</a>
                    <a href="#" class="hover:text-white" data-i18n="portal.contact">Contact Support</a>
                </div>
            </div>
        </div>
    </footer>`;
}

function patchHtml(html, scope) {
  if (html.includes('data-gba-footer="1"')) return null;
  const block = scope === 'corporate' ? footerCorporate() : footerIndividual();
  let next = html;
  if (/<footer[\s\S]*?<\/footer>/i.test(next)) {
    next = next.replace(/<footer[\s\S]*?<\/footer>/i, block.trim());
  } else if (/<\/main>/i.test(next)) {
    next = next.replace(/<\/main>/i, '</main>\n' + block);
  } else {
    next = next.replace(/(\s*<script\s+src="[^"]*i18n\/i18n\.js"[\s\S]*?<\/body>)/i, block + '\n$1');
  }
  return next;
}

let patched = 0;
let skipped = 0;

SCAN_DIRS.forEach((dir) => {
  const base = path.join(ROOT, dir);
  if (!fs.existsSync(base)) return;
  fs.readdirSync(base)
    .filter((f) => f.endsWith('.html'))
    .forEach((file) => {
      const rel = dir + '/' + file;
      if (SKIP.has(rel)) {
        skipped += 1;
        return;
      }
      const fp = path.join(base, file);
      const html = fs.readFileSync(fp, 'utf8');
      if (!html.includes('i18n/i18n.js')) {
        skipped += 1;
        return;
      }
      const count = countDataI18n(html);
      if (count >= THRESHOLD) {
        skipped += 1;
        return;
      }
      const next = patchHtml(html, dir);
      if (!next || next === html) {
        skipped += 1;
        return;
      }
      fs.writeFileSync(fp, next, 'utf8');
      const newCount = countDataI18n(next);
      console.log('patched', rel, count, '->', newCount);
      patched += 1;
    });
});

console.log('Done. patched', patched, 'skipped', skipped);
