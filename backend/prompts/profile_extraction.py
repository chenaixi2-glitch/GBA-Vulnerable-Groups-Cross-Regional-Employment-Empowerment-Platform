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
        "school": "最高学历学校（如有，仅一所；多段学历请写入 facts）",
        "extras": {{
            "visa_type": "签证/逗留身份（如有，如 Student Visa / 工作签证）",
            "resident_type": "居留身份（如有，如 HK permanent resident）",
            "address": "详细住址（如有）",
            "age": "年龄（如有）",
            "gender": "性别（如有）",
            "native_place": "籍贯（如有）",
            "political_status": "政治面貌（如有）",
            "summary": "个人总结（如有）",
            "linkedin": "LinkedIn（如有）"
        }}
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

语言要求（最高优先级）：
{material_language_instruction}
- facts 中 content 的描述性文字须与用户材料保持同一语言，禁止在同一字段内中英混用
- 若材料为中文则 content 用中文；若为英文则 content 用英文；不要擅自翻译
- 上传说明、附件文件名、本提示语为中文，不影响上述语言要求
- JSON 的 key 仍使用英文

注意：
1. type 只能是: education, skill, project, internship, award, paper 之一
2. **每条经历/技能/项目/奖项/论文必须单独一条 fact**，禁止合并多条为一条；禁止把多段实习/工作写入同一条 fact 的 responsibilities
3. 若简历有 3 段工作经历，facts 中必须有 3 条 type=internship 的记录（与教育经历分条规则相同）
4. education 的 content JSON 格式：{{"school":"","major":"","degree":"","start_date":"","end_date":""}}，每所学校一条
5. skill 的 content：单个技能名称或 {{"skill":"","level":"","context":""}}，每个技能一条 fact
6. internship / project 的 content JSON：{{"title":"","company":"","role":"","start_date":"","end_date":"","tech_stack":[],"responsibilities":"","achievements":""}}，每段经历一条
7. award / paper 同理，每项一条
8. 签证类型、居留身份、年龄、性别、籍贯、政治面貌、住址、个人总结等**个人信息补充字段必须写入 profile_basic.extras**，禁止放入 facts（尤其不得标为 award / skill / custom）
9. 若材料出现 "Visa Status: Student Visa" 或「签证类型：学生签证」，应写入 extras.visa_type="Student Visa"（或对应中文值），不要创建 fact
10. 即使信息不足，也必须返回合法 JSON 对象；extras 中无值的 key 可省略
11. 保留已有画像中的信息，只添加或更新
12. 若用户明确列出 CONFIRMED_REMOVALS 要求删除的经历（按 fact_id 或 title），不得再输出或保留对应 fact
"""
