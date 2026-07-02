const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const dirs = ['', 'individual', 'corporate'];
let updated = 0;
let skipped = 0;

dirs.forEach((dir) => {
    const base = dir ? path.join(root, dir) : root;
    if (!fs.existsSync(base)) return;
    fs.readdirSync(base)
        .filter((f) => f.endsWith('.html'))
        .forEach((file) => {
            const fp = path.join(base, file);
            let html = fs.readFileSync(fp, 'utf8');
            if (html.includes('assets/i18n/i18n.js') || html.includes('../assets/i18n/i18n.js')) {
                skipped++;
                return;
            }
            const rel = dir ? '../assets/i18n/i18n.js' : 'assets/i18n/i18n.js';
            const tag = '    <script src="' + rel + '"></script>\n';
            if (html.includes('site-enhancements.js')) {
                html = html.replace(
                    /(\s*<script src="[^"]*site-enhancements\.js"><\/script>)/,
                    tag + '$1'
                );
            } else if (html.includes('site-guide.js')) {
                html = html.replace(/(\s*<script src="[^"]*site-guide\.js"><\/script>)/, tag + '$1');
            } else {
                html = html.replace('</body>', tag + '</body>');
            }
            fs.writeFileSync(fp, html);
            updated++;
        });
});

console.log('updated', updated, 'skipped', skipped);
