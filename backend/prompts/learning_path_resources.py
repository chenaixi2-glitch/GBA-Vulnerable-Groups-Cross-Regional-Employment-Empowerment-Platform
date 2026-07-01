"""Learning path resources prompt — runs after shared gap analysis."""

LEARNING_PATH_RESOURCES_PROMPT = """你是一位职业发展顾问。能力缺口已由上一步分析完成，请为每个主要缺口推荐学习资源并估算总学时。

目标岗位信息：
{job_json}

候选人画像：
{profile_json}

已识别能力缺口：
{gaps_json}

要求：
1. resources：每个 high/medium 优先级缺口对应 1–2 个学习资源
2. duration 为人类可读时长（如 "8 hours"），duration_hours 为数值小时数
3. url 可为真实公开课程链接或平台搜索链接
4. estimated_total_hours：综合所有缺口与推荐资源的总预估学习小时数（整数）
5. gap_hours：为每个缺口 id 给出 estimated_hours（预估补齐该缺口所需学习小时数）

注意：不要重复分析缺口，不要生成 timeline。

机器协议：
- 返回且仅返回一个合法 JSON 对象
- 不要输出 Markdown、代码块、注释或额外说明
- 所有 key 必须使用双引号

返回格式：
{{
    "resources": [
        {{
            "id": "res_1",
            "skill": "目标技能",
            "type": "course",
            "title": "资源标题",
            "platform": "Coursera",
            "duration": "8 hours",
            "duration_hours": 8,
            "url": "https://www.coursera.org/",
            "rating": 4.5
        }}
    ],
    "estimated_total_hours": 120,
    "gap_hours": [
        {{"id": "gap_1", "estimated_hours": 20}}
    ]
}}
"""
