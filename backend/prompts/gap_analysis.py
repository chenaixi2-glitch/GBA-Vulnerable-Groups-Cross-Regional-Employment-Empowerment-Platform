"""Gap Analysis Prompt。"""

GAP_ANALYSIS_PROMPT = """你是一个能力缺口分析专家。请根据以下岗位要求和候选人画像，分析候选人相对于岗位的能力缺口，并给出需要补充的追问问题。

目标岗位信息：
{job_json}

候选人画像：
{profile_json}

机器协议：
- 返回且仅返回一个合法 JSON 对象
- 不要输出 Markdown、代码块、注释或额外说明
- 所有 key 必须使用双引号
- 所有字符串中的双引号必须转义

返回格式如下：
{{
    "gaps": [
        {{
            "id": "gap_1",
            "type": "missing_skill | missing_experience | no_quantification | low_relevance",
            "severity": "high | medium | low",
            "description": "能力缺口描述",
            "related_section_ids": ["section_id"],
            "resolved": false,
            "resolution_source": "gap_analysis"
        }}
    ],
    "questions_to_ask": [
        {{
            "id": "q_1",
            "question": "你有 RAG 项目经验吗？",
            "reason": "补充候选人项目经验的关键细节",
            "target_field": "projects",
            "priority": "high",
            "status": "pending",
            "answer_ref": ""
        }}
    ]
}}

注意：
1. 如果没有候选人画像或岗位信息，输出空数组
2. 当岗位名称较泛（如「软件工程师」）而简历中有明确主技术栈时，必须生成追问以确认优化方向（如「您的主要开发语言是 Java 还是 Python？」）
3. 当岗位名称指定某技术栈（如 Java）而简历中缺少该栈证据时，必须生成 high 优先级追问
4. 当无法从简历判断与岗位的匹配方向时，questions_to_ask 至少包含 1 条 high 优先级问题
5. 即使没有 gaps，若存在技术方向不确定性，也应输出 questions_to_ask
6. 即使没有结果，也必须返回合法 JSON 对象
"""
