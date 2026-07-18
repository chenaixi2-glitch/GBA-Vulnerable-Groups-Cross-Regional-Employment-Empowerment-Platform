/**
 * Build a complete assets/i18n/locales/en.json from zh-CN.json structure,
 * filling English leaf strings via reverse strings map + HTML/JS scrapes.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const localeDir = path.join(root, 'assets/i18n/locales');
const zh = JSON.parse(fs.readFileSync(path.join(localeDir, 'zh-CN.json'), 'utf8'));
const enExisting = JSON.parse(fs.readFileSync(path.join(localeDir, 'en.json'), 'utf8'));

const keyToEn = {};

function walkDir(dir) {
    for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        const st = fs.statSync(p);
        if (st.isDirectory()) {
            if (['node_modules', '.git', '__pycache__', 'venv', '.venv', 'locales'].includes(name)) continue;
            walkDir(p);
            continue;
        }
        if (!/\.(html|js)$/.test(name)) continue;
        const text = fs.readFileSync(p, 'utf8');
        let m;
        const re1 = /data-i18n="([^"]+)"[^>]*>([^<]+)</g;
        while ((m = re1.exec(text))) {
            const k = m[1].trim();
            const v = m[2].trim();
            if (v && !/^[{$]/.test(v)) keyToEn[k] = v;
        }
        const re3 = /\b(?:t|uiT|GBAI18n\.t)\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]/g;
        while ((m = re3.exec(text))) {
            if (m[2]) keyToEn[m[1]] = m[2];
        }
    }
}

walkDir(root);

const strings = zh.strings || {};
const rev = {};
for (const [en, cn] of Object.entries(strings)) {
    if (typeof cn === 'string' && cn && !rev[cn]) rev[cn] = en;
}

function hasCjk(s) {
    return /[\u4e00-\u9fff]/.test(s);
}

function walk(node, enNode, prefix) {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
        if (k === 'strings') continue;
        const pathKey = prefix ? prefix + '.' + k : k;
        if (typeof v === 'string') {
            if (enNode && typeof enNode[k] === 'string' && !hasCjk(enNode[k])) {
                out[k] = enNode[k];
            } else if (keyToEn[pathKey]) {
                out[k] = keyToEn[pathKey];
            } else if (rev[v]) {
                out[k] = rev[v];
            } else if (enNode && typeof enNode[k] === 'string') {
                out[k] = enNode[k];
            } else {
                out[k] = v;
            }
        } else if (v && typeof v === 'object' && !Array.isArray(v)) {
            out[k] = walk(v, enNode && enNode[k], pathKey);
        } else {
            out[k] = v;
        }
    }
    return out;
}

const en = walk(zh, enExisting, '');
en.errors = Object.assign({}, en.errors || {}, enExisting.errors || {});
en.apiMessages = Object.assign({}, en.apiMessages || {}, enExisting.apiMessages || {});
en.lang = { en: 'English', 'zh-CN': 'Simplified Chinese' };
en.strings = {};

if (en.home) {
    en.home.featureI18nTitle = 'Bilingual support';
    en.home.featureI18nDesc =
        'Full support for Simplified Chinese and English to serve Greater Bay Area users.';
    en.home.faqA8 =
        'The platform supports Simplified Chinese and English. Switch languages anytime from the language selector in the top navigation.';
    en.home.featureA11yDesc =
        'Built-in high contrast, larger text, keyboard-friendly navigation and screen-reader cues, with a bilingual interface.';
    en.home.benefitInd7 = 'Bilingual support and accessibility features';
}

let leftover = 0;
let total = 0;
function count(o) {
    for (const v of Object.values(o)) {
        if (typeof v === 'string') {
            total++;
            if (hasCjk(v)) leftover++;
        } else if (v && typeof v === 'object') count(v);
    }
}
count(en);

fs.writeFileSync(path.join(localeDir, 'en.json'), JSON.stringify(en, null, 2) + '\n', 'utf8');
console.log('scraped keys', Object.keys(keyToEn).length);
console.log('total leaves', total, 'still Chinese', leftover);
console.log('bytes', fs.statSync(path.join(localeDir, 'en.json')).size);
console.log('home.featureI18nDesc', en.home && en.home.featureI18nDesc);
