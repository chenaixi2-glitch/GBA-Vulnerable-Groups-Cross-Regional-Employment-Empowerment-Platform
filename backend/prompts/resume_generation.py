"""简历内容生成 Prompt。"""

from prompts.resume_constraints import (
    RESUME_A4_ONE_PAGE_CONSTRAINTS,
    RESUME_EXPERIENCE_POLISH_GUIDELINES,
)

RESUME_GENERATION_PROMPT = """你是一个专业的简历内容生成专家。根据岗位需求和候选人画像，生成针对性的简历内容 JSON。

目标语言：{target_language_label}（language 字段设为 "{target_language}"）

{resume_output_language_instruction}

{RESUME_A4_ONE_PAGE_CONSTRAINTS}

{RESUME_EXPERIENCE_POLISH_GUIDELINES}

语言与格式要求：
- 简体中文简历（zh）：章节用简体中文标题；日期 YYYY.MM；教育信息放在 profile.education；若候选人画像 profile_basic.extras 含 photo_url，须在 profile.extras 中原样保留
- 繁體中文简历（zh-TW）：章节用繁體中文标题；日期 YYYY.MM；格式与简体类似但全部使用繁体字；保留 photo_url 规则与 zh 相同
- 英文简历（en）：章节用英文标题语义；日期 Mon YYYY；动词开头 bullet；Skills 紧凑列表；不写年龄性别等无关信息；不得包含照片
- 葡语简历（pt，澳门/欧洲葡语）：章节用葡语标题；日期 Mmm YYYY；遵循西式简历规范；不写年龄性别；不得包含照片；面向澳门及大湾区葡语雇主

目标岗位信息：
{job_json}

候选人画像：
{profile_json}

{edit_instruction}

机器协议：
- 返回且仅返回一个合法 JSON 对象
- 不要输出 Markdown、代码块、注释或额外说明
- 所有 key 必须使用双引号
- 所有字符串中的双引号必须转义

返回格式如下（仅为 JSON schema 示例，占位符语言不代表输出语言；实际所有正文字段须符合目标语言）：
{{
    "profile": {{
        "name": "姓名",
        "email": "邮箱",
        "phone": "电话",
        "city": "城市",
        "github": "GitHub 地址（如有）",
        "education": [
            {{
                "id": "edu_1",
                "school": "学校名称",
                "major": "专业",
                "degree": "学位",
                "start_date": "开始日期",
                "end_date": "结束日期"
            }}
        ]
    }},
    "summary": "一段针对目标岗位的个人总结（2-3句话）",
    "skills": [
        {{
            "id": "skill_1",
            "title": "技能分类名称",
            "content": "具体技能描述",
            "source_refs": [],
            "updated_at": ""
        }}
    ],
    "internships": [
        {{
            "id": "intern_1",
            "title": "公司名称 — 岗位名称（时间）",
            "content": "STAR 格式描述：情境、任务、行动、结果。仅使用画像中已有的量化数据增强说服力，无数据时用客观描述。",
            "source_refs": [],
            "updated_at": ""
        }}
    ],
    "projects": [
        {{
            "id": "proj_1",
            "title": "项目名称",
            "content": "STAR 格式描述：背景、职责、使用的技术、取得的成果。",
            "source_refs": [],
            "updated_at": ""
        }}
    ],
    "awards": [
        {{
            "id": "award_1",
            "title": "奖项名称",
            "content": "获奖描述",
            "source_refs": [],
            "updated_at": ""
        }}
    ],
    "papers": [],
    "language": "{target_language}"
}}

注意：
1. 不得捏造用户未提供的事实；量化数据必须来自候选人画像，缺数据时用客观描述替代，禁止编造数字
2. 根据 JD 的技术栈和关键词优化经历排序与措辞，使每段经历更贴合目标岗位
3. 项目和实习描述使用 STAR 格式，在画像有据时补充量化成果，突出与目标岗位相关的技能与产出
4. 技能根据 JD 要求的优先级排序
5. 篇幅须严格符合上文 A4 页数约束，宁可精简内容也不要超长
6. 所有正文字段须统一使用目标语言，禁止中英混用
7. 即使部分字段为空，也必须返回合法 JSON 对象
"""

RESUME_SECTION_UPDATE_PROMPT = """你是简历内容编辑专家。请根据用户的修改指令，只更新简历中受影响的部分。

{RESUME_A4_ONE_PAGE_CONSTRAINTS}

{RESUME_EXPERIENCE_POLISH_GUIDELINES}

当前简历语言：{target_language_label}

{resume_output_language_instruction}

当前简历内容：
{current_resume_json}

目标岗位信息：
{job_json}

用户修改指令：
{edit_instruction}

机器协议：
- 返回且仅返回一个合法 JSON 对象
- 不要输出 Markdown、代码块、注释或额外说明
- 所有 key 必须使用双引号
- 所有字符串中的双引号必须转义

请返回完整的简历内容 JSON（与原格式一致），只修改受影响的 section。

注意：
1. 不得捏造用户未提供的事实；优化经历时仅使用画像中已有的量化信息，禁止编造数字
2. 若指令涉及经历润色，须结合目标岗位 JD 调整措辞与排序，按行业惯用标准补充有据可查的量化表述
3. 保持未修改部分不变
4. 优化或修改后仍须符合上文 A4 页数约束，必要时缩减文字或合并条目
5. 修改后的内容须保持目标语言一致，禁止中英混用
6. 即使指令不明确，也必须返回合法 JSON 对象
"""
