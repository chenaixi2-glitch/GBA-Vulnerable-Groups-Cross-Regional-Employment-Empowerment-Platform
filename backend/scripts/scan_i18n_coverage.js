#!/usr/bin/env node
/**
 * Site-wide i18n coverage scanner for GBA platform HTML pages.
 *
 * Usage:
 *   node backend/scripts/scan_i18n_coverage.js
 *   node backend/scripts/scan_i18n_coverage.js --out docs/i18n-coverage-report.md
 *   node backend/scripts/scan_i18n_coverage.js --json
 *
 * Scans: index.html, individual/*.html, corporate/*.html
 * Validates data-i18n keys against assets/i18n/locales/zh-CN.json
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const LOCALE_DIR = path.join(ROOT, 'assets', 'i18n', 'locales');
const SCAN_DIRS = ['', 'individual', 'corporate'];

const DEV_PAGES = new Set([
    'individual/test-api.html',
    'backend/test_resume_preview.html',
]);

const I18N_ATTRS = ['data-i18n', 'data-i18n-placeholder', 'data-i18n-title', 'data-i18n-lang'];

const JS_I18N_PATTERNS = [
    { name: 'GBAI18n.t', re: /\bGBAI18n\.t\s*\(/g },
    { name: 'tApiMessage', re: /\btApiMessage\s*\(/g },
    { name: 'helperT (appsT/dlT/cpT/…)', re: /\b[A-Za-z]{2,12}T\s*\(\s*['"][a-zA-Z0-9_.]+['"]/g },
    { name: 'jobsT/matching t()', re: /\b(?:jobsT|function t)\s*\(\s*['"]/g },
];

const JS_HARDCODED_PATTERNS = [
    { name: 'alert()', re: /\balert\s*\(\s*['"`]/g },
    { name: 'confirm()', re: /\bconfirm\s*\(\s*['"`]/g },
    { name: 'textContent=', re: /\.textContent\s*=\s*['"`][^'"`]{4,}/g },
    { name: 'innerHTML= (plain)', re: /\.innerHTML\s*=\s*['"`][^'"`<]{8,}/g },
];

function parseArgs(argv) {
    const args = { out: null, json: false, thresholdGood: 40, thresholdPartial: 10 };
    for (let i = 2; i < argv.length; i += 1) {
        if (argv[i] === '--json') args.json = true;
        else if (argv[i] === '--out' && argv[i + 1]) { args.out = argv[++i]; }
    }
    return args;
}

function flattenKeys(obj, prefix) {
    prefix = prefix || '';
    const keys = [];
    if (!obj || typeof obj !== 'object') return keys;
    Object.keys(obj).forEach(function (k) {
        const full = prefix ? prefix + '.' + k : k;
        if (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])) {
            keys.push.apply(keys, flattenKeys(obj[k], full));
        } else {
            keys.push(full);
        }
    });
    return keys;
}

function loadLocale(lang) {
    const fp = path.join(LOCALE_DIR, lang + '.json');
    if (!fs.existsSync(fp)) return { lang, keys: new Set(), raw: null };
    const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
    return { lang, keys: new Set(flattenKeys(raw)), raw };
}

function hasKey(keySet, dottedKey) {
    return keySet.has(dottedKey);
}

function listHtmlFiles() {
    const seen = new Set();
    const files = [];
    SCAN_DIRS.forEach(function (dir) {
        const base = dir ? path.join(ROOT, dir) : ROOT;
        if (!fs.existsSync(base)) return;
        fs.readdirSync(base)
            .filter(function (f) { return f.endsWith('.html'); })
            .forEach(function (f) {
                const rel = dir ? dir + '/' + f : f;
                const norm = rel.replace(/\\/g, '/');
                if (seen.has(norm)) return;
                seen.add(norm);
                files.push({ rel: norm, abs: path.join(base, f) });
            });
    });
    return files.sort(function (a, b) { return a.rel.localeCompare(b.rel); });
}

function countMatches(html, re) {
    const m = html.match(re);
    return m ? m.length : 0;
}

function extractI18nKeys(html) {
    const keys = [];
    I18N_ATTRS.forEach(function (attr) {
        const re = new RegExp(attr + '\\s*=\\s*"([^"]+)"', 'g');
        let m;
        while ((m = re.exec(html)) !== null) {
            if (m[1] && m[1].indexOf('.') !== -1) keys.push(m[1]);
        }
    });
    return keys.filter(function (k, i, arr) { return arr.indexOf(k) === i; });
}

function stripBlocks(html) {
    return html
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
}

function isIgnorableText(text) {
    const t = text.replace(/\s+/g, ' ').trim();
    if (!t || t.length < 3) return true;
    if (/^[\d\s%:.,+\-–—/\\|]+$/.test(t)) return true;
    if (/^(GBA|OK|pts|EN|CN|TW|pt)$/i.test(t)) return true;
    if (/^https?:\/\//.test(t)) return true;
    if (/^[\d.]+%$/.test(t)) return true;
    if (/^fa[srb]? fa-/.test(t)) return true;
    return false;
}

function findUntaggedSnippets(html) {
    const body = stripBlocks(html);
    const snippets = [];
    const re = /<(\w+)([^>]*)>([^<]{3,120})<\//g;
    let m;
    while ((m = re.exec(body)) !== null) {
        const tag = m[1].toLowerCase();
        const attrs = m[2];
        const text = m[3];
        if (['script', 'style', 'svg', 'path', 'canvas', 'pre', 'code'].indexOf(tag) !== -1) continue;
        if (/\bdata-i18n\b/.test(attrs)) continue;
        if (/\bdata-i18n-(?:placeholder|title|lang|fallback)\b/.test(attrs)) continue;
        if (/\bid\s*=\s*"(?:session-id|session-display|match-status|header-lang-slot)"/.test(attrs)) continue;
        if (isIgnorableText(text)) continue;
        if (!/[A-Za-z\u4e00-\u9fff]/.test(text)) continue;
        const snippet = text.replace(/\s+/g, ' ').trim();
        if (snippets.indexOf(snippet) === -1) snippets.push(snippet);
    }
    return snippets.slice(0, 12);
}

function analyzeInlineScript(html) {
    const scripts = [];
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(html)) !== null) scripts.push(m[1]);
    const joined = scripts.join('\n');
    const i18n = {};
    JS_I18N_PATTERNS.forEach(function (p) {
        i18n[p.name] = countMatches(joined, p.re);
    });
    const hardcoded = {};
    JS_HARDCODED_PATTERNS.forEach(function (p) {
        hardcoded[p.name] = countMatches(joined, p.re);
    });
    return { i18n, hardcoded, scriptBlocks: scripts.length };
}

function gradePage(metrics) {
    if (DEV_PAGES.has(metrics.rel)) return 'dev';
    if (/^(individual|corporate)\/index\.html$/.test(metrics.rel)) return 'redirect';
    if (metrics.dataI18n >= 40) return 'good';
    if (metrics.dataI18n >= 10) return 'partial';
    if (metrics.jsI18nCalls >= 8) return 'partial';
    return 'low';
}

function analyzeFile(entry, localeSets) {
    const html = fs.readFileSync(entry.abs, 'utf8');
    const keys = extractI18nKeys(html);
    const missingByLocale = {};
    localeSets.forEach(function (loc) {
        missingByLocale[loc.lang] = keys.filter(function (k) { return !hasKey(loc.keys, k); });
    });
    const scriptInfo = analyzeInlineScript(html);
    const jsI18nTotal = Object.values(scriptInfo.i18n).reduce(function (a, b) { return a + b; }, 0);
    const hardcodedTotal = Object.values(scriptInfo.hardcoded).reduce(function (a, b) { return a + b; }, 0);

    const metrics = {
        rel: entry.rel,
        dataI18n: countMatches(html, /data-i18n\s*=/g),
        dataI18nPlaceholder: countMatches(html, /data-i18n-placeholder\s*=/g),
        dataI18nTitle: countMatches(html, /data-i18n-title\s*=/g),
        hasI18nJs: /i18n\/i18n\.js/.test(html),
        hasLangSlot: /id\s*=\s*["']header-lang-slot["']/.test(html) || /id\s*=\s*["']ui-lang["']/.test(html),
        localeKeys: keys.length,
        missingKeysZhCN: missingByLocale['zh-CN'] || [],
        untaggedSnippets: findUntaggedSnippets(html),
        jsI18nCalls: jsI18nTotal,
        jsHardcoded: hardcodedTotal,
        scriptBlocks: scriptInfo.scriptBlocks,
    };
    metrics.grade = gradePage(metrics);
    metrics.score = metrics.dataI18n + metrics.dataI18nPlaceholder + metrics.jsI18nCalls * 0.5;
    return metrics;
}

function mdEscape(s) {
    return String(s).replace(/\|/g, '\\|');
}

function buildMarkdown(results, localeSets) {
    const lines = [];
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const byGrade = { good: [], partial: [], low: [], redirect: [], dev: [] };
    results.forEach(function (r) { (byGrade[r.grade] || byGrade.low).push(r); });

    lines.push('# GBA Platform — i18n Coverage Report');
    lines.push('');
    lines.push('Generated: ' + now);
    lines.push('');
    lines.push('Run again: `node backend/scripts/scan_i18n_coverage.js --out docs/i18n-coverage-report.md`');
    lines.push('');
    lines.push('## Summary');
    lines.push('');
    lines.push('| Grade | Pages | Meaning |');
    lines.push('|-------|------:|---------|');
    lines.push('| good | ' + byGrade.good.length + ' | ≥40 `data-i18n` tags |');
    lines.push('| partial | ' + byGrade.partial.length + ' | 10–39 tags and/or JS `t()` helpers |');
    lines.push('| low | ' + byGrade.low.length + ' | <10 static tags — prioritize |');
    lines.push('| redirect | ' + byGrade.redirect.length + ' | Jump pages (minimal copy) |');
    lines.push('| dev | ' + byGrade.dev.length + ' | Dev/test pages |');
    lines.push('');
    lines.push('Locales checked: ' + localeSets.map(function (l) { return l.lang; }).join(', '));
    lines.push('');

    lines.push('## All pages');
    lines.push('');
    lines.push('| Page | Grade | data-i18n | placeholder | JS t() | Hardcoded JS | i18n.js | lang slot | Missing keys (zh-CN) |');
    lines.push('|------|-------|----------:|------------:|-------:|-------------:|:-------:|:---------:|---------------------:|');
    results.forEach(function (r) {
        lines.push('| `' + mdEscape(r.rel) + '` | ' + r.grade + ' | ' + r.dataI18n + ' | ' + r.dataI18nPlaceholder + ' | ' + r.jsI18nCalls + ' | ' + r.jsHardcoded + ' | ' + (r.hasI18nJs ? '✓' : '✗') + ' | ' + (r.hasLangSlot ? '✓' : '·') + ' | ' + r.missingKeysZhCN.length + ' |');
    });
    lines.push('');

    function section(title, items) {
        if (!items.length) return;
        lines.push('## ' + title);
        lines.push('');
        items.forEach(function (r) {
            lines.push('### `' + r.rel + '`');
            lines.push('');
            lines.push('- **Grade:** ' + r.grade + ' · **data-i18n:** ' + r.dataI18n + ' · **JS i18n calls:** ' + r.jsI18nCalls + ' · **Hardcoded JS hints:** ' + r.jsHardcoded);
            if (!r.hasI18nJs) lines.push('- ⚠ Missing `assets/i18n/i18n.js` script');
            if (r.missingKeysZhCN.length) {
                lines.push('- **Missing locale keys (zh-CN):** `' + r.missingKeysZhCN.slice(0, 8).join('`, `') + '`' + (r.missingKeysZhCN.length > 8 ? ' …' : ''));
            }
            if (r.untaggedSnippets.length) {
                lines.push('- **Sample untagged static text:**');
                r.untaggedSnippets.slice(0, 6).forEach(function (s) {
                    lines.push('  - “' + mdEscape(s) + '”');
                });
            }
            lines.push('');
        });
    }

    section('Low coverage — fix first', byGrade.low);
    section('Partial coverage', byGrade.partial.filter(function (r) {
        return r.untaggedSnippets.length > 0 || r.missingKeysZhCN.length > 0 || r.jsHardcoded > 2;
    }));
    section('Good coverage (reference)', byGrade.good.sort(function (a, b) { return b.dataI18n - a.dataI18n; }).slice(0, 8));

    const allMissing = {};
    results.forEach(function (r) {
        r.missingKeysZhCN.forEach(function (k) {
            allMissing[k] = (allMissing[k] || 0) + 1;
        });
    });
    const missingList = Object.keys(allMissing).sort();
    if (missingList.length) {
        lines.push('## Missing keys in zh-CN.json');
        lines.push('');
        missingList.forEach(function (k) {
            lines.push('- `' + k + '` (used on ' + allMissing[k] + ' page(s))');
        });
        lines.push('');
    }

    lines.push('## Notes');
    lines.push('');
    lines.push('- `data-i18n` count alone understates pages that render UI via JS (`GBAI18n.t`, `appsT`, etc.).');
    lines.push('- “Hardcoded JS hints” counts `alert`/`confirm`/`textContent=` patterns — review manually.');
    lines.push('- “Untagged static text” ignores nodes already marked with `data-i18n*` attributes.');
    lines.push('');

    return lines.join('\n');
}

function main() {
    const args = parseArgs(process.argv);
    const localeSets = ['zh-CN', 'zh-TW', 'pt'].map(loadLocale);
    const files = listHtmlFiles();
    const results = files.map(function (f) { return analyzeFile(f, localeSets); });

    results.sort(function (a, b) {
        const order = { low: 0, partial: 1, redirect: 2, dev: 3, good: 4 };
        if (order[a.grade] !== order[b.grade]) return order[a.grade] - order[b.grade];
        return a.dataI18n - b.dataI18n;
    });

    if (args.json) {
        const out = JSON.stringify({ generatedAt: new Date().toISOString(), pages: results }, null, 2);
        if (args.out) fs.writeFileSync(path.resolve(ROOT, args.out), out, 'utf8');
        else console.log(out);
        return;
    }

    const md = buildMarkdown(results, localeSets);
    const outPath = args.out ? path.resolve(ROOT, args.out) : null;

    if (outPath) {
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, md, 'utf8');
        console.log('Report written to ' + outPath);
    } else {
        console.log(md);
    }

    const low = results.filter(function (r) { return r.grade === 'low'; }).length;
    const missing = results.reduce(function (n, r) { return n + r.missingKeysZhCN.length; }, 0);
    console.error('\nScan complete: ' + results.length + ' pages, ' + low + ' low coverage, ' + missing + ' missing zh-CN keys.');
}

main();
