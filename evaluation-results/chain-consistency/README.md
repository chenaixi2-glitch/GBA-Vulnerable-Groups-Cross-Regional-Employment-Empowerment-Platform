# Cross-Agent Chain Consistency — Evaluation Results

gap → content → render 等链路的字段传递一致性检查。

## 检查项

- profile → content 身份字段
- job → content target_role
- gap → content 高优缺口覆盖
- content → render HTML 非空

## 运行

```bash
cd backend
python -m evaluation.chain_consistency.runner
pytest tests/test_chain_consistency_eval.py -v
```
