"""Learning Path Agent Prompts — timeline (analysis uses shared gap core + resources prompt)."""

LEARNING_PATH_TIMELINE_PROMPT = """你是一位职业发展顾问。请根据已识别的能力缺口、推荐资源与候选人可用学习时间，生成分阶段学习 timeline。

目标岗位信息：
{job_json}

候选人画像：
{profile_json}

已识别能力缺口：
{gaps_json}

推荐学习资源：
{resources_json}

总预估学习时长：{estimated_total_hours} 小时
候选人每日可学习：{daily_hours} 小时
换算周期：约 {total_days} 天 / {total_weeks} 周 / {total_months} 月
本次要求的计划粒度（unit）：{timeline_unit}
参考总跨度：约 {total_span} 个 {timeline_unit}（可按优先级微调）

粒度说明：
- month：月计划。period 格式如 "1-2" 表示第 1–2 月；适合跨多月的长周期。
- week：周计划。period 格式如 "1-4" 表示第 1–4 周。
- day：日计划。period 格式如 "1-5" 表示第 1–5 天；适合短周期或需要逐日执行的安排。

要求：
1. timeline：分阶段学习计划，phase 从 1 递增
2. 每个阶段必须包含 unit（固定为 "{timeline_unit}"）与 period（字符串区间）
3. 各阶段 skills 应覆盖 gaps 中的关键技能，按优先级（severity）排序
4. 阶段数量 2–6 个，总跨度应与参考总跨度大致匹配
5. description 说明本阶段目标与建议完成的资源/技能
6. 不要输出 children 字段（展开到更细粒度由后续请求完成）
7. 禁止混用其他粒度：本次只能使用 {timeline_unit}

## 输出语言
{output_language_instruction}

机器协议：
- 返回且仅返回一个合法 JSON 对象
- 不要输出 Markdown、代码块、注释或额外说明
- 所有 key 必须使用双引号

返回格式：
{{
    "timeline": [
        {{
            "phase": 1,
            "title": "阶段标题",
            "period": "1-2",
            "unit": "{timeline_unit}",
            "skills": ["技能1", "技能2"],
            "description": "本阶段目标"
        }}
    ]
}}
"""


LEARNING_PATH_EXPAND_PROMPT = """你是一位职业发展顾问。请将学习路径中的某一个阶段，展开为更细粒度的子计划。

目标岗位信息：
{job_json}

候选人画像：
{profile_json}

已识别能力缺口：
{gaps_json}

推荐学习资源：
{resources_json}

总预估学习时长：{estimated_total_hours} 小时
候选人每日可学习：{daily_hours} 小时

待展开阶段：
{phase_json}

当前粒度：{source_unit}
目标粒度：{target_unit}

要求：
1. 仅展开上述阶段，生成 children 子计划列表
2. 每个子项 phase 从 1 递增，unit 必须为 "{target_unit}"
3. period 使用相对该父阶段的序号区间，如 "1-3"（表示该父阶段内的第 1–3 个 {target_unit}）
4. 子项数量 2–7 个，覆盖父阶段的 skills 与目标
5. description 写清每天/每周可执行的学习动作

## 输出语言
{output_language_instruction}

机器协议：
- 返回且仅返回一个合法 JSON 对象
- 不要输出 Markdown、代码块、注释或额外说明
- 所有 key 必须使用双引号

返回格式：
{{
    "children": [
        {{
            "phase": 1,
            "title": "子阶段标题",
            "period": "1-2",
            "unit": "{target_unit}",
            "skills": ["技能1"],
            "description": "可执行目标"
        }}
    ]
}}
"""
