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
            "title": "分类名（如 Languages / 编程语言）",
            "content": "Python（熟练）, SQL, Excel",
            "source_refs": [],
            "updated_at": ""
        }}
    ],
    "works": [
        {{
            "id": "work_1",
            "title": "公司名称 — 岗位名称（时间）",
            "content": "STAR 格式描述：情境、任务、行动、结果。仅使用画像中已有的量化数据增强说服力，无数据时用客观描述。",
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
    "language": "{target_language}",
    "section_order": ["根据目标岗位与候选人背景，列出要展示的版块 id，如 summary、education、works、internships、projects、skills、awards；英文/葡语须含 profile，有教育内容时必须单独列出 education（不得并入 profile）"]
}}

注意：
1. 不得捏造用户未提供的事实；量化数据必须来自候选人画像，缺数据时用客观描述替代，禁止编造数字
2. 根据 JD 的技术栈和关键词优化经历排序与措辞，使每段经历更贴合目标岗位
3. section_order 由你根据岗位匹配度决定正文版块先后；仅列出有内容的版块；education 与 profile 必须分开列出。英文/葡语/繁中：profile（姓名与联系方式）必须位于 section_order 第一位，禁止把 skills/awards 排到 profile 之前
4. 工作、实习与项目描述使用 STAR 格式，在画像有据时补充量化成果，突出与目标岗位相关的技能与产出
5. Skills 保持列表式、禁止段落润色：按类别合并为 ≤4 组；title=分类名；content=逗号分隔条目（技能名，可选带熟练度，如「Python（熟练）」/「Python (Proficient)」）。禁止使用场景长句或职责描述。可从画像中补入用户确实具备且 JD 需要的技能；禁止添加画像未体现的技能；画像已有简洁写法时只做归类、按 JD 排序与必要补全，不得扩写成段落
6. 篇幅须严格符合上文 A4 页数约束，宁可精简内容也不要超长
7. 所有正文字段须统一使用目标语言，禁止中英混用
8. works 仅放正式/兼职工作；internships 仅放实习；禁止把同一条经历同时写入两个版块
9. 即使部分字段为空，也必须返回合法 JSON 对象
"""

RESUME_SKELETON_PROMPT = """你是简历内容生成专家。这是分步生成的第 1 步：只生成轻量骨架 JSON。

目标语言：{target_language_label}（language 字段设为 "{target_language}"）

{resume_output_language_instruction}

硬性要求（输出必须极短，完成 token 预算约 4096，禁止写满）：
- 只生成：profile、summary、skills、awards、papers、language、section_order
- works、internships 与 projects 必须是空数组 []，不要写任何经历正文（后续步骤会单独润色）
- summary 最多 2 句
- Skills（列表式，禁止段落润色）：
  - 最多 4 组；title=分类名（如 Languages / Tools）；content=逗号分隔条目
  - 每条可以是技能名，或「技能名 + 熟练度」（如 Python（熟练）/ Python (Proficient)）；禁止使用场景长句或职责描述
  - 可从画像补入用户确实具备且 JD 需要的技能；禁止添加画像未体现的技能
  - 画像已是简洁写法时：归类 + 按 JD 排序 + 必要补全，不得扩写成段落
- awards/papers 仅在画像确有时填写，否则 []
- 不得捏造事实；禁止输出 Markdown 或解释

目标岗位（摘要）：
{job_json}

候选人画像（经历仅列出 id，正文勿展开）：
{profile_json}

{edit_instruction}

机器协议：仅返回一个合法 JSON 对象，例如：
{{
  "profile": {{
    "name": "",
    "email": "",
    "phone": "",
    "city": "",
    "github": "",
    "education": [],
    "extras": {{}}
  }},
  "summary": "",
  "skills": [{{"id": "skill_1", "title": "", "content": "", "source_refs": [], "updated_at": ""}}],
  "works": [],
  "internships": [],
  "projects": [],
  "awards": [],
  "papers": [],
  "language": "{target_language}",
  "section_order": ["summary", "education", "skills", "works", "internships", "projects"]
}}
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
5. 若改动 Skills：保持 title=分类、content=逗号分隔列表（可含熟练度）；禁止段落式润色；可补入画像中有且 JD 需要的技能，禁止虚构
6. 修改后的内容须保持目标语言一致，禁止中英混用
7. 即使指令不明确，也必须返回合法 JSON 对象
"""

# Compact on purpose: verbose A4/polish guideline dumps make small models overrun max_tokens.
RESUME_MODULE_SECTION_PROMPT = """你是简历润色助手。把下列经历改写成贴合目标岗位的「{section_label}」STAR 要点，输出紧凑 JSON。

目标语言：{target_language_label}（language="{target_language}"）
{resume_output_language_instruction}

硬性限制（必须遵守，避免超长输出）：
- 每条经历 content：最多 3 条 bullet；中文每条 ≤40 字；英文/葡语每条 ≤22 词
- 必须相对输入事实做措辞改写与岗位对齐，禁止原样照抄输入 content
- 禁止捏造公司名/项目名/未提供的岗位职责
- title 必须保留输入事实中的公司/项目名、岗位名称（role）、起止时间（start_date/end_date）；格式：公司 — 岗位（开始 – 结束）；缺哪项就省略哪项，不得丢弃已有字段
- 整份 JSON 必须完整可解析，预计 <800 tokens

{quantification_instruction}

目标岗位（摘要）：
{job_json}

候选人经历（仅可使用下列事实）：
{facts_json}

只返回合法 JSON（无 Markdown/解释）：
{{
  "items": [
    {{
      "id": "必须与输入 fact.id 完全一致",
      "title": "公司名称 — 岗位名称（开始 – 结束）",
      "content": "- bullet1\\n- bullet2",
      "source_refs": ["同一 fact.id"],
      "updated_at": ""
    }}
  ]
}}
"""
