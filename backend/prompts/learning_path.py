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
建议总周期约：{total_weeks} 周（供参考，可按优先级微调）

要求：
1. timeline：分阶段学习计划，phase 从 1 递增，weeks 格式如 "1-4"
2. 各阶段 skills 应覆盖 gaps 中的关键技能，按优先级（severity）排序
3. 阶段数量 2–5 个，总周数应与总学时和每日学习时长相匹配
4. 每个阶段 description 说明本阶段目标与建议完成的资源/技能

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
            "weeks": "1-4",
            "skills": ["技能1", "技能2"],
            "description": "本阶段目标"
        }}
    ]
}}
"""
