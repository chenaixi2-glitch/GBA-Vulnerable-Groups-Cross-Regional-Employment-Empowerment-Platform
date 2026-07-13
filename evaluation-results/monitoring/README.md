# Production Monitoring — Bad Case Review

LangSmith 接入后的 bad case 采样与人工复核闭环。

## 流程

```
线上 /api/chat → LangSmith trace
       ↓
bad_case_sampler（失败节点 / 空回复 / 路由偏差 / 低分评估）
       ↓
bad_cases_review.csv（人工标注 review_status / root_cause）
       ↓
回归 Golden Set / 修复 Planner 规则
```

## 运行

```bash
cd backend

# 离线 fixture 采样
python -m evaluation.monitoring.runner

# LangSmith 导出（需 LANGCHAIN_API_KEY）
python -m evaluation.monitoring.langsmith_export --project ai-career-copilot

pytest tests/test_bad_case_sampler.py -v
```

## 复核 CSV 字段

| 字段 | 说明 |
|------|------|
| review_status | pending / reviewed / confirmed_bug / false_positive |
| root_cause | 人工归因 |
| fix_priority | P0 / P1 / P2 |
