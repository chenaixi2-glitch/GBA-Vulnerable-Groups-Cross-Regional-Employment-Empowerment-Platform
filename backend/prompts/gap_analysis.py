"""Gap Analysis Prompt。"""

GAP_ANALYSIS_PROMPT = """=== MANDATORY OUTPUT LANGUAGE (HIGHEST PRIORITY) ===
{gap_output_language_instruction}

{output_language_instruction}

你是一个能力缺口分析专家。请根据以下岗位要求和候选人画像，分析候选人相对于岗位的能力缺口，并给出需要补充的追问问题。

目标岗位信息：
{job_json}

JD–经历语义匹配（embedding 预计算，按批次；可能为空数组）：
{experience_match_json}

候选人画像：
{profile_json}

硬性要求：
- gaps[].description、questions_to_ask[].question、questions_to_ask[].reason 必须全部使用上述输出语言
- 即使岗位描述或候选人画像是其他语言，也禁止在 JSON 自然语言字段中使用中文（除非输出语言就是 zh/zh-TW）
- JSON 的 key 保持英文

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
            "description": "<gap description in the required output language>",
            "related_section_ids": ["section_id"],
            "resolved": false,
            "resolution_source": "gap_analysis"
        }}
    ],
    "questions_to_ask": [
        {{
            "id": "q_1",
            "question": "<follow-up question in the required output language>",
            "reason": "<why this question matters, in the required output language>",
            "target_field": "projects",
            "priority": "high",
            "status": "pending",
            "answer_ref": ""
        }}
    ],
    "experiences_to_remove": [
        {{
            "id": "rem_1",
            "fact_id": "fact_internship_2",
            "section_type": "internship | project | award | paper | skill | education",
            "title": "<experience title in the required output language>",
            "reason": "<clear explanation why this entry is low-relevance or redundant for the target role — NOT for page length or layout, in the required output language>",
            "priority": "recommended | optional"
        }}
    ]
}}

注意：
1. 如果没有候选人画像或岗位信息，输出空数组
2. 当岗位名称较泛（如 Software Engineer / 软件工程师）而简历中有明确主技术栈时，必须生成追问以确认优化方向（示例：确认主要开发语言或技术栈）
3. 当岗位名称指定某技术栈（如 Java）而简历中缺少该栈证据时，必须生成 high 优先级追问
4. 当经历描述缺少量化数据（人数、规模、时长、性能、营收等）时，必须生成追问，主动询问用户是否有相关可验证数据；问题应明确举例（如用户数、提升比例、团队规模），并说明「若无相关数据可留空」；不得建议用户编造数据
5. 对每段与目标岗位相关的核心实习/项目经历，若缺量化描述，questions_to_ask 中至少包含 1 条 medium 优先级追问（非必填，用户可留空）
6. 当无法从简历判断与岗位的匹配方向时，questions_to_ask 至少包含 1 条 high 优先级问题
7. 当 type 为 missing_experience 的 gap 存在时，questions_to_ask 中必须包含对应追问，并在 question 中明确请用户用文字描述可补充的经历（公司/项目、职责、成果等）
8. experiences_to_remove 仅用于与目标岗位相关度极低或内容明显重复的经历（实习/项目/获奖/论文/技能等）；禁止因 A4 篇幅、页数、间距或排版原因建议删除任何条目
9. 教育经历（education）为必要模块，禁止列入 experiences_to_remove；篇幅不足由简历生成阶段通过 compact 间距、精简 bullet 字数、合并技能分组等方式处理，不得建议删除教育、联系方式等核心信息
10. 若 jd_experience_matches 中某条经历 relevance 为 very_low 或 jd_match_score < 0.35，应优先考虑列入 experiences_to_remove，并在 gaps 中补充 low_relevance 类型缺口（related_section_ids 引用 fact_id）
11. jd_experience_matches 中 relevance=high 的经历，优先在 questions_to_ask 中追问量化细节；relevance=very_low 的经历优先建议移除
12. experiences_to_remove 须引用候选人画像 facts 中的 fact_id（如有）；若无 id 则 fact_id 留空但 title 须可识别
13. 即使没有 gaps，若存在技术方向不确定性或关键经历缺量化信息，也应输出 questions_to_ask
14. 即使没有结果，也必须返回合法 JSON 对象

=== FINAL REMINDER ===
Re-read the MANDATORY OUTPUT LANGUAGE block at the top. Every gaps[].description, questions_to_ask[].question, questions_to_ask[].reason, and experiences_to_remove[].title/reason MUST use that language only.
"""
