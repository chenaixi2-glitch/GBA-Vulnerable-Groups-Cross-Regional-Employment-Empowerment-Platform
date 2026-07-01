# 简历优化效果 — 真人评估问卷（题本）

> **用途**：评估「AI 优化后简历」是否优于原版。  
> **建议平台**：腾讯问卷 / 金数据 / Google Forms（按本文逐题录入）。  
> **配套文件**：`blinding_map.csv`（A/B 与 before/after 对应关系，仅研究者持有，勿给评估者）。

---

## 评估说明（放在问卷开头）

您好，感谢参与本次简历评估研究。

- 您将看到若干 **目标岗位（JD）** 及对应的 **两份匿名简历（A / B）**。
- 两份简历针对 **同一候选人、同一岗位**，请假设您是 **HR 初筛官**，判断哪份更可能通过筛选。
- 请勿猜测哪份由 AI 生成；无标准答案，请凭专业判断。
- 预计耗时：**30–45 分钟**（约 10–20 组 case）。
- 所有简历请用 **统一 PDF/HTML 模板** 呈现，避免排版干扰。

**评分尺度（Likert 部分）**  
1 = 很差，2 = 较差，3 = 一般，4 = 较好，5 = 很好

**Pairwise 偏好尺度**  
- A 明显更好 / A 略好 / 差不多 / B 略好 / B 明显更好

---

## Part 0 — 评估者信息

| 题号 | 题目 | 类型 | 选项 |
|------|------|------|------|
| Q0-1 | 您的评估者编号（由研究者分配，如 R01） | 填空 | — |
| Q0-2 | 您的身份 | 单选 | HR / 职业规划师 / 导师 / 有招聘经验的同学 / 其他 |
| Q0-3 | 相关行业经验年限 | 单选 | 0 / 1–2 / 3–5 / 6–10 / 10+ |
| Q0-4 | 是否熟悉大湾区跨境就业场景 | 单选 | 是 / 否 |

---

## Part 1 — 盲评 Pairwise（**主指标**，每组 case 一题）

> **操作**：每组先展示 JD，再并排展示简历 A、B（或分页展示）。  
> **盲法**：A/B 与优化前/后的对应关系见 `blinding_map.csv`，评估者不可见。

---

### Case 1 — `alex_chen_cross_border_cs`

**目标岗位 JD（原文展示）：**

```
Job Title: Cross-border Customer Service Specialist
Requirements: English, Cantonese, CRM, cross-border e-commerce experience, dispute resolution, CSAT metrics
```

**附件**：`case_01_resume_A.pdf`、`case_01_resume_B.pdf`（由研究者从 golden case 导出）

| 题号 | 题目 | 类型 | 选项 |
|------|------|------|------|
| Q1-1 | 针对上述岗位，哪份简历更可能通过 HR 初筛？ | 单选 | A 明显更好 / A 略好 / 差不多 / B 略好 / B 明显更好 |
| Q1-2 | （可选）请用一句话说明理由 | 填空 | — |
| Q1-3 | 简历 A 是否存在「编造或过度包装」？ | 单选 | 无 / 轻微 / 明显 |
| Q1-4 | 简历 B 是否存在「编造或过度包装」？ | 单选 | 无 / 轻微 / 明显 |

---

### Case 2 — `aixi_ai_application_dev`

**目标岗位 JD（原文展示）：**

```
AI Application Development Engineer at a private technology enterprise.
Python, LLM APIs, RAG, prompt engineering, data analysis, REST APIs, business problem solving.
```

**附件**：`case_02_resume_A.pdf`、`case_02_resume_B.pdf`

| 题号 | 题目 | 类型 | 选项 |
|------|------|------|------|
| Q2-1 | 针对上述岗位，哪份简历更可能通过 HR 初筛？ | 单选 | A 明显更好 / A 略好 / 差不多 / B 略好 / B 明显更好 |
| Q2-2 | （可选）请用一句话说明理由 | 填空 | — |
| Q2-3 | 简历 A 是否存在「编造或过度包装」？ | 单选 | 无 / 轻微 / 明显 |
| Q2-4 | 简历 B 是否存在「编造或过度包装」？ | 单选 | 无 / 轻微 / 明显 |

---

### Case 3–N — 扩展模板（复制本节）

每新增一个 golden case，复制以下块并替换 `case_id`、JD 文本、附件名：

```markdown
### Case N — `{case_id}`

**目标岗位 JD：**
（粘贴 jd_text）

**附件**：`case_NN_resume_A.pdf`、`case_NN_resume_B.pdf`

| 题号 | 题目 | 类型 | 选项 |
|------|------|------|------|
| QN-1 | 针对上述岗位，哪份简历更可能通过 HR 初筛？ | 单选 | A 明显更好 / A 略好 / 差不多 / B 略好 / B 明显更好 |
| QN-2 | （可选）请用一句话说明理由 | 填空 | — |
| QN-3 | 简历 A 是否存在「编造或过度包装」？ | 单选 | 无 / 轻微 / 明显 |
| QN-4 | 简历 B 是否存在「编造或过度包装」？ | 单选 | 无 / 轻微 / 明显 |
```

**扩展 case 建议来源**：`backend/evaluation/resume_rag/fixtures/golden_cases.json`

---

## Part 2 — 多维 Likert 评分（**辅指标**，每份简历各评一次）

> 在完成 Part 1 后，对 **同一份简历 A 或 B** 按维度打分。  
> 维度与系统自动指标对应关系见 `README.md`。

**五个维度（1–5 分）：**

| 维度 | 含义 | 对应自动指标 |
|------|------|--------------|
| 岗位契合 (job_fit) | 与 JD 的匹配程度 | jd_keyword_coverage |
| 事实可信 (credibility) | 经历是否具体可信 | profile_groundedness |
| 表达专业 (professionalism) | 格式、措辞是否专业 | checklist_pass_rate |
| 亮点突出 (highlights) | 成就是否清楚、有量化 | STAR / 量化 |
| 整体推荐 (overall_recommend) | 是否愿意约面试 | match_score |

### 对每个 Case 重复以下 2 题（A 一份、B 一份）

**示例（Case 1 简历 A）：**

| 题号 | 题目 | 类型 |
|------|------|------|
| Q1-A-1 | Case1 简历 A — 岗位契合 | 1–5 |
| Q1-A-2 | Case1 简历 A — 事实可信 | 1–5 |
| Q1-A-3 | Case1 简历 A — 表达专业 | 1–5 |
| Q1-A-4 | Case1 简历 A — 亮点突出 | 1–5 |
| Q1-A-5 | Case1 简历 A — 整体推荐 | 1–5 |

（简历 B 同理：Q1-B-1 … Q1-B-5）

---

## Part 3 — 整体反馈（可选）

| 题号 | 题目 | 类型 |
|------|------|------|
| QEnd-1 | 您认为 AI 优化简历最需要保留的原则是什么？ | 填空 |
| QEnd-2 | 您是否察觉到某份简历由 AI 润色？ | 单选：是 / 否 / 不确定 |
| QEnd-3 | 其他意见 | 填空 |

---

## 数据导出与汇总

1. 从问卷平台导出 CSV，或按模板填入：
   - `pairwise_responses.csv`（Part 1）
   - `likert_responses.csv`（Part 2）
   - `rater_info.csv`（Part 0）
2. 确认 `blinding_map.csv` 中 A/B 与 before/after 对应关系正确。
3. 运行汇总脚本：

```bash
cd backend
python -m evaluation.resume_rag.human_eval
```

输出：`evaluation-results/resume-rag/human/latest/summary.md` 与 `summary.json`

---

## 论文可报告指标

- **优化版胜率** = 评估者偏好优化版的 case 数 / 总 case 数  
- **Pairwise 显著性** = 二项检验 vs 50% 随机基线  
- **Likert Δ** = mean(after) − mean(before)，按维度与整体  
- **标注者一致性** = Cohen's κ（分类偏好）或 ICC（连续分，≥3 人时）  
- **人机相关** = Likert Δ 与 RAG `match_score Δ` 的 Spearman ρ
