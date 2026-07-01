# 简历优化 — 真人评估（Human Evaluation）

与 RAG 自动指标并列的 **人工盲评** 材料与结果目录。

## 文件说明

| 文件 | 用途 |
|------|------|
| `survey_questionnaire.md` | 完整题本（可录入腾讯问卷 / 金数据） |
| `blinding_map.csv` | **仅研究者持有**：case 的 A/B 哪份是 before/after |
| `pairwise_responses_template.csv` | Pairwise 盲评结果模板（含示例行） |
| `likert_responses_template.csv` | 五维 Likert 评分模板（含示例行） |
| `rater_info_template.csv` | 评估者元数据模板 |
| `latest/summary.json` | 汇总脚本输出（运行后生成） |
| `latest/summary.md` | 人类可读报告（运行后生成） |

## 工作流程

```
1. 从 golden_cases 导出 before/after 为统一格式 PDF
2. 按 blinding_map.csv 随机分配 A/B（勿泄露给评估者）
3. 发放 survey_questionnaire.md 中的问卷
4. 导出 CSV → 保存为 pairwise_responses.csv / likert_responses.csv
5. 运行汇总脚本，与 RAG report.json 对齐分析
```

## 运行汇总

```bash
cd backend
python -m evaluation.resume_rag.human_eval

# 指定路径
python -m evaluation.resume_rag.human_eval \
  --pairwise ../evaluation-results/resume-rag/human/pairwise_responses.csv \
  --likert ../evaluation-results/resume-rag/human/likert_responses.csv \
  --blinding ../evaluation-results/resume-rag/human/blinding_map.csv \
  --rag-report ../evaluation-results/resume-rag/latest/report.json
```

首次可用模板中的示例数据试跑（将 `*_template.csv` 复制为无 `template` 后缀的文件，或直接用 `--pairwise ..._template.csv`）。

## 主指标

- **optimized_win_rate**：盲评中优化版被偏好的比例  
- **likert_delta_*`**：五维及 overall 的 after−before 均值变化  
- **rag_correlation**：人工 overall Δ 与 `match_score` Δ 的 Spearman 相关

## 注意

- 扩展 case 时同步更新 `blinding_map.csv` 与 `golden_cases.json` 的 `case_id`  
- 论文中需说明样本量、评估者背景与盲法流程
