"""Profile 提取 Prompt。"""

PROFILE_EXTRACTION_PROMPT = """你是一个候选人画像构建专家。请从以下用户提供的材料中提取结构化信息。

用户材料：
{material_text}

已有画像（如有）：
{existing_profile}

机器协议：
- 返回且仅返回一个合法 JSON 对象
- 不要输出 Markdown、代码块、注释或额外说明
- 所有 key 必须使用双引号
- 所有字符串中的双引号必须转义

返回格式如下，并将信息合并到已有画像中（增量更新，不覆盖已有数据）：
{{
    "profile_basic": {{
        "name": "姓名",
        "email": "邮箱",
        "phone": "电话",
        "city": "城市",
        "school": "最高学历学校（如有，仅一所；多段学历请写入 facts）"
    }},
    "facts": [
        {{
            "id": "fact_<type>_<序号>",
            "type": "education | skill | project | internship | award | paper",
            "content": "结构化描述（JSON 字符串，见下方说明）",
            "source_refs": ["material_<id>"],
            "updated_at": ""
        }}
    ]
}}

语言要求：
- facts 中 content 字段须与用户材料保持同一语言，禁止在同一字段内中英混用
- 若材料为中文则 content 用中文；若为英文则 content 用英文；不要擅自翻译
- JSON 的 key 仍使用英文

注意：
1. type 只能是: education, skill, project, internship, award, paper 之一
2. **每条经历/技能/项目必须单独一条 fact**，禁止合并多条为一条
3. education 的 content JSON 格式：{{"school":"","major":"","degree":"","start_date":"","end_date":""}}，每所学校一条
4. skill 的 content：单个技能名称或 {{"skill":"","level":"","context":""}}，每个技能一条 fact
5. internship / project 的 content JSON：{{"title":"","company":"","role":"","start_date":"","end_date":"","tech_stack":[],"responsibilities":"","achievements":""}}，每段经历一条
6. award / paper 同理，每项一条
7. 即使信息不足，也必须返回合法 JSON 对象
8. 保留已有画像中的信息，只添加或更新
9. 若用户明确列出 CONFIRMED_REMOVALS 要求删除的经历（按 fact_id 或 title），不得再输出或保留对应 fact
"""
