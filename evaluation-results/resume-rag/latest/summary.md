# Resume Optimization — RAG Metrics Report

- Generated at: 2026-07-01T10:39:29.246534+00:00
- Embedding metrics: lexical only
- Cases: 2
- Improved: 2 / 2

## Aggregate deltas (after − before)

| Metric | Mean Δ |
|--------|--------|
| JD keyword coverage | +81.95% |
| Profile groundedness | +0.1666 |
| Match score | +35.0 |
| Checklist pass rate | +3.84% |

## Per-case results

### alex_chen_cross_border_cs — IMPROVED

| Metric | Before | After | Δ |
|--------|--------|-------|---|
| JD keyword coverage | 11.11% | 100.00% | +88.89% |
| Profile groundedness | 0.2922 | 0.4152 | +0.1230 |
| Match score | 49 | 83 | +34 |
| Checklist pass rate | 84.62% | 92.31% | +7.69% |

**Improvements:** JD keyword coverage +88.89%; match score +34; checklist pass rate +7.69%

### aixi_ai_application_dev — IMPROVED

| Metric | Before | After | Δ |
|--------|--------|-------|---|
| JD keyword coverage | 12.50% | 87.50% | +75.00% |
| Profile groundedness | 0.1729 | 0.3831 | +0.2102 |
| Match score | 37 | 73 | +36 |
| Checklist pass rate | 84.62% | 84.62% | +0.00% |

**Improvements:** JD keyword coverage +75.00%; match score +36

## Metric definitions

- **JD keyword coverage** — fraction of target JD keywords found in resume text (RAG relevance proxy).
- **Profile groundedness** — mean lexical/embedding overlap of resume bullets with candidate profile facts (RAG faithfulness).
- **Unsupported bullets** — bullets with low profile overlap (possible hallucination).
- **Match score** — Python port of `server/src/services/match.service.js` (0–100).
- **Checklist pass rate** — pass rate from `resume_language_checklist` rules.
