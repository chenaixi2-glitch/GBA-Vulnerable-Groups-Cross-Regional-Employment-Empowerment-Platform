# GBA Platform — i18n Coverage Report

Generated: 2026-07-06 13:45:33

Run again: `node backend/scripts/scan_i18n_coverage.js --out docs/i18n-coverage-report.md`

## Summary

| Grade | Pages | Meaning |
|-------|------:|---------|
| good | 26 | ≥40 `data-i18n` tags |
| partial | 0 | 10–39 tags and/or JS `t()` helpers |
| low | 0 | <10 static tags — prioritize |
| redirect | 2 | Jump pages (minimal copy) |
| dev | 1 | Dev/test pages |

Locales checked: zh-CN, zh-TW, pt

## All pages

| Page | Grade | data-i18n | placeholder | JS t() | Hardcoded JS | i18n.js | lang slot | Missing keys (zh-CN) |
|------|-------|----------:|------------:|-------:|-------------:|:-------:|:---------:|---------------------:|
| `corporate/index.html` | redirect | 2 | 0 | 0 | 0 | ✓ | · | 0 |
| `individual/index.html` | redirect | 2 | 0 | 0 | 0 | ✓ | · | 0 |
| `individual/test-api.html` | dev | 17 | 0 | 31 | 0 | ✓ | ✓ | 0 |
| `corporate/donation-legal.html` | good | 40 | 0 | 4 | 1 | ✓ | ✓ | 0 |
| `individual/community.html` | good | 40 | 0 | 0 | 0 | ✓ | ✓ | 0 |
| `individual/friendly-employers.html` | good | 40 | 0 | 7 | 0 | ✓ | ✓ | 0 |
| `corporate/audit.html` | good | 41 | 0 | 0 | 0 | ✓ | ✓ | 0 |
| `individual/donation-legal.html` | good | 41 | 0 | 4 | 1 | ✓ | ✓ | 0 |
| `individual/my-applications.html` | good | 41 | 0 | 19 | 0 | ✓ | ✓ | 0 |
| `corporate/certification.html` | good | 43 | 0 | 0 | 0 | ✓ | ✓ | 0 |
| `individual/demo-jobs-database.html` | good | 43 | 0 | 45 | 0 | ✓ | ✓ | 0 |
| `individual/demo-olivia.html` | good | 43 | 1 | 1 | 0 | ✓ | ✓ | 0 |
| `individual/credentials.html` | good | 44 | 0 | 0 | 0 | ✓ | ✓ | 0 |
| `corporate/auth.html` | good | 45 | 1 | 0 | 0 | ✓ | ✓ | 0 |
| `individual/profile.html` | good | 45 | 2 | 0 | 0 | ✓ | ✓ | 0 |
| `corporate/company-profile.html` | good | 46 | 7 | 7 | 0 | ✓ | ✓ | 0 |
| `individual/demo-resume-matching.html` | good | 46 | 2 | 1 | 0 | ✓ | ✓ | 0 |
| `individual/my-resume.html` | good | 46 | 0 | 0 | 0 | ✓ | ✓ | 0 |
| `individual/portal.html` | good | 46 | 0 | 13 | 0 | ✓ | ✓ | 0 |
| `individual/apply.html` | good | 47 | 4 | 17 | 0 | ✓ | ✓ | 0 |
| `individual/demo-policy-navigator.html` | good | 47 | 0 | 1 | 0 | ✓ | ✓ | 0 |
| `individual/course-learning.html` | good | 48 | 0 | 0 | 0 | ✓ | ✓ | 0 |
| `individual/auth.html` | good | 58 | 0 | 0 | 0 | ✓ | ✓ | 0 |
| `individual/demo-learning-path.html` | good | 77 | 5 | 0 | 0 | ✓ | ✓ | 0 |
| `individual/demo-interview.html` | good | 103 | 6 | 0 | 0 | ✓ | ✓ | 0 |
| `individual/demo-resume-generator.html` | good | 142 | 3 | 0 | 0 | ✓ | ✓ | 0 |
| `corporate/post-job.html` | good | 148 | 12 | 32 | 1 | ✓ | ✓ | 0 |
| `index.html` | good | 226 | 5 | 20 | 0 | ✓ | · | 0 |
| `corporate/portal.html` | good | 282 | 5 | 47 | 0 | ✓ | · | 0 |

## Good coverage (reference)

### `corporate/portal.html`

- **Grade:** good · **data-i18n:** 282 · **JS i18n calls:** 47 · **Hardcoded JS hints:** 0
- **Sample untagged static text:**
  - “GBA Cross-Border Employment Empowerment Platform - Corporate”
  - “English”
  - “Simplified Chinese”
  - “Traditional Chinese”
  - “Português”
  - “&starf;”

### `index.html`

- **Grade:** good · **data-i18n:** 226 · **JS i18n calls:** 20 · **Hardcoded JS hints:** 0
- **Sample untagged static text:**
  - “GBA Cross-Border Employment Empowerment Platform”
  - “English”
  - “Zhang Wei”
  - “Tech Solutions Ltd”
  - “Maria Chen”
  - “Mr. Lau”

### `corporate/post-job.html`

- **Grade:** good · **data-i18n:** 148 · **JS i18n calls:** 32 · **Hardcoded JS hints:** 1
- **Sample untagged static text:**
  - “GBA-2026-0001”

### `individual/demo-resume-generator.html`

- **Grade:** good · **data-i18n:** 142 · **JS i18n calls:** 0 · **Hardcoded JS hints:** 0
- **Sample untagged static text:**
  - “PDF”
  - “Word”
  - “Plain text”
  - “Markdown”
  - “extracts text only”
  - “Chinese resumes”

### `individual/demo-interview.html`

- **Grade:** good · **data-i18n:** 103 · **JS i18n calls:** 0 · **Hardcoded JS hints:** 0
- **Sample untagged static text:**
  - “Simplified Chinese”
  - “Traditional Chinese”
  - “English”
  - “Portuguese”
  - “Your interview question will appear here...”
  - “Log in”

### `individual/demo-learning-path.html`

- **Grade:** good · **data-i18n:** 77 · **JS i18n calls:** 0 · **Hardcoded JS hints:** 0
- **Sample untagged static text:**
  - “gap_agent”

### `individual/auth.html`

- **Grade:** good · **data-i18n:** 58 · **JS i18n calls:** 0 · **Hardcoded JS hints:** 0

### `individual/course-learning.html`

- **Grade:** good · **data-i18n:** 48 · **JS i18n calls:** 0 · **Hardcoded JS hints:** 0

## Notes

- `data-i18n` count alone understates pages that render UI via JS (`GBAI18n.t`, `appsT`, etc.).
- “Hardcoded JS hints” counts `alert`/`confirm`/`textContent=` patterns — review manually.
- “Untagged static text” ignores nodes already marked with `data-i18n*` attributes.
