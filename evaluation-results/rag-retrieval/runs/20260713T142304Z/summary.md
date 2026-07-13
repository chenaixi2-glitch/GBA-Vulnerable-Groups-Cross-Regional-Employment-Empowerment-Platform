# RAG Retrieval Quality — Evaluation Report

- Generated at: 2026-07-13T14:23:04.713326+00:00
- Mode: lexical_fallback
- Cases: 6
- Hit rate (any relevant in top-10): 100.00%
- Mean Reciprocal Rank (MRR): 0.8889

## Aggregate metrics

| K | Recall@K | NDCG@K |
|---|----------|--------|
| 1 | 75.00% | 0.8333 |
| 3 | 100.00% | 0.9167 |
| 5 | 100.00% | 0.9167 |
| 10 | 100.00% | 0.9167 |

## Per-query results

### query_job_title — MRR 0.3333
- Query: What is my target job title?
- Relevant: `['job:title']`
- Retrieved: `['job:responsibilities', 'job:skills', 'job:title']`

### query_job_skills — MRR 1.0000
- Query: Which technical skills does the job require?
- Relevant: `['job:skills']`
- Retrieved: `['job:skills', 'job:title']`

### query_profile_skill — MRR 1.0000
- Query: What Python projects do I have?
- Relevant: `['profile:fact_proj_1']`
- Retrieved: `['profile:fact_proj_1']`

### query_resume_summary — MRR 1.0000
- Query: Summarize my current resume profile section.
- Relevant: `['resume:summary']`
- Retrieved: `['resume:summary']`

### query_gap_analysis — MRR 1.0000
- Query: What skill gaps were identified?
- Relevant: `['gaps:summary']`
- Retrieved: `['gaps:summary']`

### query_multi_relevant — MRR 1.0000
- Query: Tell me about the job responsibilities and required skills.
- Relevant: `['job:responsibilities', 'job:skills']`
- Retrieved: `['job:responsibilities', 'job:skills', 'job:title']`

## Metric definitions

- **Recall@K** — fraction of relevant chunks found in top-K results.
- **MRR** — mean reciprocal rank of the first relevant chunk.
- **NDCG@K** — normalized discounted cumulative gain at K.
- **lexical_fallback** mode uses token overlap (CI-friendly, no API key).
- **embedding** mode uses Qwen embedding + optional rerank (production-like).
