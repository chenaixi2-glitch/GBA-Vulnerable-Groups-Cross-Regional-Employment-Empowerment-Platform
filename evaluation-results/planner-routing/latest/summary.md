# Planner Intent & Agent Routing — Evaluation Report

- Generated at: 2026-07-13T14:22:53.940132+00:00
- Mode: rule_only
- Cases: 20
- Intent accuracy: 100.00%
- Agent chain accuracy: 100.00%

## Intent classification metrics

| Metric | Value |
|--------|-------|
| Accuracy | 100.00% |
| Macro F1 | 1.0000 |
| Weighted F1 | 1.0000 |
| Macro Precision | 1.0000 |
| Macro Recall | 1.0000 |

### Intent confusion matrix

| Actual \ Predicted | ask_question | content_edit | evaluate_answer | export | gap_analysis | language_convert | learning_path | profile_patch | render_edit | start_interview | upload_jd | upload_profile |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **ask_question** | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| **content_edit** | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| **evaluate_answer** | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| **export** | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| **gap_analysis** | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| **language_convert** | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| **learning_path** | 0 | 0 | 0 | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 |
| **profile_patch** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| **render_edit** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 |
| **start_interview** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| **upload_jd** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 |
| **upload_profile** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |

## Agent chain (Tool-equivalent) metrics

| Metric | Value |
|--------|-------|
| Chain accuracy | 100.00% |
| Macro F1 | 1.0000 |

### Per-intent F1

| Intent | Precision | Recall | F1 | Support |
|--------|-----------|--------|-----|---------|
| ask_question | 1.00 | 1.00 | 1.00 | 2 |
| content_edit | 1.00 | 1.00 | 1.00 | 3 |
| evaluate_answer | 1.00 | 1.00 | 1.00 | 1 |
| export | 1.00 | 1.00 | 1.00 | 1 |
| gap_analysis | 1.00 | 1.00 | 1.00 | 2 |
| language_convert | 1.00 | 1.00 | 1.00 | 1 |
| learning_path | 1.00 | 1.00 | 1.00 | 3 |
| profile_patch | 1.00 | 1.00 | 1.00 | 1 |
| render_edit | 1.00 | 1.00 | 1.00 | 2 |
| start_interview | 1.00 | 1.00 | 1.00 | 1 |
| upload_jd | 1.00 | 1.00 | 1.00 | 1 |
| upload_profile | 1.00 | 1.00 | 1.00 | 2 |

## Misclassified cases

_All cases passed._

## Metric definitions

- **Intent accuracy** — fraction of cases where `resolve_intent()` matches golden label.
- **Agent chain accuracy** — fraction where `execution_plan` matches expected downstream nodes (Tool-equivalent).
- **Macro F1** — unweighted mean of per-intent F1 scores.
- Rule-only mode evaluates deterministic routing layer; LLM misclassification requires separate E2E runs with API key.
