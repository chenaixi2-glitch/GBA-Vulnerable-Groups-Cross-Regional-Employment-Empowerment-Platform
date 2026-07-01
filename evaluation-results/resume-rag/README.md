# Resume Optimization — RAG Evaluation Results

本目录存放 **简历优化 RAG 类指标** 的离线评估结果，与业务代码分离，便于毕设引用与复现。

## 指标说明

| 指标 | RAG 对应 | 含义 |
|------|----------|------|
| `jd_keyword_coverage` | Relevance | 简历文本对目标 JD 关键词的覆盖率 |
| `jd_embedding_similarity` | Relevance | 简历与 JD 的 embedding 余弦相似度（需 API Key） |
| `profile_groundedness` | Faithfulness | 简历 bullet 与候选人画像事实的对齐度 |
| `unsupported_bullet_count` | Hallucination | 与画像重叠过低的 bullet 数量 |
| `match_score` | Task utility | 岗位-简历匹配分（0–100） |
| `checklist_pass_rate` | Format compliance | 中英文简历规范检查通过率 |

## 如何运行

在 `backend/` 目录下：

```bash
# 仅词汇指标（无需 API Key，适合 CI）
python -m evaluation.resume_rag.runner --no-embeddings

# 含 embedding 指标（需 DASHSCOPE_API_KEY 等）
python -m evaluation.resume_rag.runner --embeddings
```

或使用 pytest：

```bash
cd backend
pytest tests/test_resume_rag_metrics.py -v
```

## 输出结构

```
evaluation-results/resume-rag/
  latest/
    report.json      # 最近一次完整结果
    summary.md       # 人类可读摘要
  runs/
    20260701T120000Z/
      report.json
      summary.md
```

## 用例数据

Golden cases 位于 `backend/evaluation/resume_rag/fixtures/golden_cases.json`（before/after 简历对 + 候选人画像 + JD）。
