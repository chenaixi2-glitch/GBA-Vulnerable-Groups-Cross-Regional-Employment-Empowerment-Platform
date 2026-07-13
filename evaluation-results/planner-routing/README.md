# Planner Intent & Agent Routing — Evaluation Results

Planner 意图分类与下游 Agent 链路（Tool 等价物）的离线评测结果。

## 指标

| 指标 | 含义 |
|------|------|
| Intent accuracy | 意图识别准确率 |
| Macro F1 / Weighted F1 | 多类 F1（含混淆矩阵） |
| Agent chain accuracy | `execution_plan` 与 Golden 期望一致的比例 |

## 运行

```bash
cd backend
python -m evaluation.planner_routing.runner
pytest tests/test_planner_routing_eval.py -v
```

## Golden Set

`backend/evaluation/planner_routing/fixtures/golden_cases.json`（20 条，rule-only 层）
