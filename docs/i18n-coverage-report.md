# GBA Platform — i18n Coverage Report

Generated: 2026-07-03 12:20:27

Run again: `node backend/scripts/scan_i18n_coverage.js --out docs/i18n-coverage-report.md`

## Summary

| Grade | Pages | Meaning |
|-------|------:|---------|
| good | 7 | ≥40 `data-i18n` tags |
| partial | 19 | 10–39 tags and/or JS `t()` helpers |
| low | 0 | <10 static tags — prioritize |
| redirect | 2 | Jump pages (minimal copy) |
| dev | 1 | Dev/test pages |

Locales checked: zh-CN, zh-TW, pt

## All pages

| Page | Grade | data-i18n | placeholder | JS t() | Hardcoded JS | i18n.js | lang slot | Missing keys (zh-CN) |
|------|-------|----------:|------------:|-------:|-------------:|:-------:|:---------:|---------------------:|
| `individual/my-applications.html` | partial | 6 | 0 | 19 | 0 | ✓ | ✓ | 0 |
| `individual/friendly-employers.html` | partial | 13 | 0 | 7 | 0 | ✓ | ✓ | 0 |
| `individual/demo-jobs-database.html` | partial | 14 | 0 | 45 | 0 | ✓ | ✓ | 0 |
| `individual/demo-olivia.html` | partial | 14 | 1 | 1 | 0 | ✓ | ✓ | 0 |
| `individual/community.html` | partial | 18 | 0 | 0 | 0 | ✓ | ✓ | 0 |
| `corporate/donation-legal.html` | partial | 19 | 0 | 4 | 1 | ✓ | ✓ | 0 |
| `individual/donation-legal.html` | partial | 19 | 0 | 4 | 1 | ✓ | ✓ | 0 |
| `corporate/audit.html` | partial | 20 | 0 | 0 | 0 | ✓ | ✓ | 0 |
| `corporate/certification.html` | partial | 22 | 0 | 0 | 0 | ✓ | ✓ | 0 |
| `individual/credentials.html` | partial | 22 | 0 | 0 | 0 | ✓ | ✓ | 0 |
| `individual/profile.html` | partial | 23 | 2 | 0 | 0 | ✓ | ✓ | 0 |
| `corporate/auth.html` | partial | 24 | 1 | 0 | 0 | ✓ | ✓ | 0 |
| `individual/demo-resume-matching.html` | partial | 24 | 2 | 1 | 0 | ✓ | ✓ | 0 |
| `individual/my-resume.html` | partial | 24 | 0 | 0 | 0 | ✓ | ✓ | 0 |
| `corporate/company-profile.html` | partial | 25 | 7 | 7 | 0 | ✓ | ✓ | 0 |
| `individual/apply.html` | partial | 25 | 4 | 17 | 0 | ✓ | ✓ | 0 |
| `individual/course-learning.html` | partial | 26 | 0 | 0 | 0 | ✓ | ✓ | 0 |
| `individual/demo-policy-navigator.html` | partial | 27 | 0 | 1 | 0 | ✓ | ✓ | 0 |
| `individual/auth.html` | partial | 36 | 0 | 0 | 0 | ✓ | ✓ | 0 |
| `corporate/index.html` | redirect | 2 | 0 | 0 | 0 | ✓ | · | 0 |
| `individual/index.html` | redirect | 2 | 0 | 0 | 0 | ✓ | · | 0 |
| `individual/test-api.html` | dev | 17 | 0 | 31 | 0 | ✓ | ✓ | 0 |
| `individual/portal.html` | good | 46 | 0 | 13 | 0 | ✓ | ✓ | 0 |
| `individual/demo-learning-path.html` | good | 60 | 5 | 0 | 0 | ✓ | ✓ | 0 |
| `individual/demo-interview.html` | good | 68 | 5 | 0 | 0 | ✓ | ✓ | 0 |
| `individual/demo-resume-generator.html` | good | 122 | 3 | 0 | 0 | ✓ | ✓ | 0 |
| `corporate/post-job.html` | good | 148 | 12 | 32 | 1 | ✓ | ✓ | 0 |
| `index.html` | good | 225 | 5 | 20 | 0 | ✓ | · | 0 |
| `corporate/portal.html` | good | 282 | 5 | 47 | 0 | ✓ | · | 0 |

## Partial coverage

### `individual/demo-resume-matching.html`

- **Grade:** partial · **data-i18n:** 24 · **JS i18n calls:** 1 · **Hardcoded JS hints:** 0
- **Sample untagged static text:**
  - “Note:”

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

- **Grade:** good · **data-i18n:** 225 · **JS i18n calls:** 20 · **Hardcoded JS hints:** 0
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

- **Grade:** good · **data-i18n:** 122 · **JS i18n calls:** 0 · **Hardcoded JS hints:** 0
- **Sample untagged static text:**
  - “PDF”
  - “Word”
  - “Plain text”
  - “Markdown”
  - “extracts text only”
  - “Chinese resumes”

### `individual/demo-interview.html`

- **Grade:** good · **data-i18n:** 68 · **JS i18n calls:** 0 · **Hardcoded JS hints:** 0
- **Sample untagged static text:**
  - “Employer type / 单位性质”
  - “State-owned (国央企)”
  - “Public Sector (体制内)”
  - “Foreign Enterprise (外企)”
  - “Private Enterprise (民企)”
  - “Non-profit (NPO/NGO)”

### `individual/demo-learning-path.html`

- **Grade:** good · **data-i18n:** 60 · **JS i18n calls:** 0 · **Hardcoded JS hints:** 0
- **Sample untagged static text:**
  - “Technology & Software”
  - “Finance & Banking”
  - “E-commerce & Retail”
  - “Healthcare & Medical”
  - “Education & Training”
  - “Manufacturing”

### `individual/portal.html`

- **Grade:** good · **data-i18n:** 46 · **JS i18n calls:** 13 · **Hardcoded JS hints:** 0

## Notes

- `data-i18n` count alone understates pages that render UI via JS (`GBAI18n.t`, `appsT`, etc.).
- “Hardcoded JS hints” counts `alert`/`confirm`/`textContent=` patterns — review manually.
- “Untagged static text” ignores nodes already marked with `data-i18n*` attributes.
