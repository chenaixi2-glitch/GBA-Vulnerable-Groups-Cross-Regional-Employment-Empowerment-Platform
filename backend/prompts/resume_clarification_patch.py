"""Incremental resume patch — update skills/summary from gap clarifications without full regen."""

RESUME_CLARIFICATION_PATCH_PROMPT = """你是简历内容增量更新专家。已有一份完整简历骨架；用户刚补充了缺口澄清。请仅更新 summary 与/或 skills（如本次澄清涉及），不要改写实习/项目经历正文。

目标语言：{target_language_label}
{resume_output_language_instruction}

当前 summary：
{current_summary}

当前 skills（JSON）：
{current_skills_json}

候选人画像中与技能相关的 facts（JSON）：
{skill_facts_json}

岗位信息（JSON）：
{job_json}

用户补充说明（CLARIFICATIONS）：
{clarifications}

编辑约束：
{edit_instruction}

机器协议：
- 返回且仅返回一个合法 JSON 对象
- 不要输出 Markdown、代码块、注释或额外说明
- 若澄清不影响 summary，设 update_summary=false 且 summary 为空字符串
- 若澄清不影响 skills，设 update_skills=false 且 skills 为空数组
- 禁止编造用户未提供的量化数字或成就
- skills 中每项保留已有 id（能对应时）；新增技能分配新 id（skill_<序号>）
- Skills 保持列表式：title=分类名，content=逗号分隔条目（可含熟练度，如 Python（熟练））；禁止段落润色
- 可补入画像中用户具备且 JD 需要的技能；禁止添加画像未体现的技能；不要把原有简洁条目扩写成描述

返回格式：
{{
    "update_summary": false,
    "summary": "",
    "update_skills": false,
    "skills": [
        {{
            "id": "skill_1",
            "title": "Languages",
            "content": "Python (Proficient), SQL",
            "source_refs": []
        }}
    ]
}}

语言要求：
- summary / skills 的 title 与 content 必须使用目标语言 {target_language_label}
- JSON 的 key 使用英文
"""
