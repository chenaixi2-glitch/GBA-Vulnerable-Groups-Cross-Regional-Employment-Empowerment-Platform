"""Shared resume layout constraints — A4 page limits by experience tier."""

RESUME_EXPERIENCE_POLISH_GUIDELINES = """
## 经历润色与量化原则（必须严格遵守）
- 所有实习/工作/项目经历须结合目标岗位 JD 进行润色：优先展示与 JD 关键词、技能栈、职责要求最相关的成果，调整条目排序与措辞，弱化与目标岗位无关的细节
- 根据 user_target_context 中的行业、单位性质（外企/民企/港澳台资等）、经验等级，采用该行业惯用的简历表述风格（如技术岗突出技术栈与系统指标，业务岗突出流程优化与客户/营收成果，外企英文简历用动词开头 + 可衡量结果）
- 用户在 edit_instruction / 修改指令中可能显式指定 QUANTIFICATION_MODE（优先于默认规则）：
  - QUANTIFICATION_MODE=industry_standard：对仍缺少用户提供数字的经历，允许按目标行业/岗位/经验等级补充保守的、角色常见的量化表述（如团队规模、服务用户量级、时延/吞吐、流程效率提升的合理区间）；须优先使用用户已提供的真实数字；禁止捏造公司专属营收、独家奖项或不可核验的个人独占成就
  - QUANTIFICATION_MODE=none：对缺少用户提供数字的经历，必须生成无量化指标版本——仅用职责范围、协作对象、技术复杂度、业务影响等客观定性描述，禁止出现百分比、用户数、营收金额、性能提升幅度等编造数字
  - 未指定 QUANTIFICATION_MODE 时：量化表述须有据可查，仅使用候选人画像或用户澄清中已明确提供的数字、比例、规模、时长、人数、金额、排名等；可对原文中已有的模糊量词做适度明确化，但不得凭空编造具体数值；用户留空时用客观定性描述替代
- 每条经历采用 STAR 结构（情境-任务-行动-结果），英文用强动词开头，中文用动宾短句；结果优先写可验证产出，而非空泛形容词
- 不得捏造公司名、项目名、岗位职责、技术栈、获奖或任何用户未提供的事实（QUANTIFICATION_MODE=industry_standard 仅放宽「常见规模/效率类指标」的行业惯例补充，不放宽事实造假）
"""

_QUANT_MODE_INDUSTRY = """量化规则（QUANTIFICATION_MODE=industry_standard）— 必须严格执行：
- 优先使用用户/画像已提供的真实数字
- 对仍缺数字的每条经历，content 中至少写入 1 个保守、角色常见的量化指标（可用区间）
  技术岗示例：integrated ~8–12 APIs；cut cleanup time ~20–30%；served ~1k–5k daily ops；team of 3–5；p95 latency ~200ms
  业务/研究岗示例：reviewed ~20–50 documents/week；built ~5–10 slide decks；flagged ~3–5 compliance risks
- 禁止捏造公司专属营收、独家奖项或不可核验的个人独占成就
- 禁止整段只有定性空话；缺真实数字也要用上列量级区间补齐"""

_QUANT_MODE_NONE = """量化规则（QUANTIFICATION_MODE=none）：
- 优先使用用户/画像已提供的真实数字
- 缺数字时只用客观定性描述（范围、协作、技术复杂度、业务影响文字表述）
- 禁止出现编造的百分比、用户数、营收金额、性能提升幅度等"""

_QUANT_MODE_DEFAULT = """量化规则（默认）：
- 仅可使用画像或澄清中已明确提供的数字；无数据时用客观定性描述
- 禁止凭空编造具体数值"""


def resolution_quantification_instruction(edit_instruction: str = "") -> str:
    """Map edit_instruction QUANTIFICATION_MODE into a compact polish-prompt clause."""
    text = edit_instruction or ""
    if "QUANTIFICATION_MODE=industry_standard" in text:
        return _QUANT_MODE_INDUSTRY
    if "QUANTIFICATION_MODE=none" in text:
        return _QUANT_MODE_NONE
    return _QUANT_MODE_DEFAULT


RESUME_A4_ONE_PAGE_CONSTRAINTS = """
## 单页 A4 约束（必须严格遵守）
- 整份简历排版后必须完整落在一页 A4 纸内（210mm × 297mm），禁止溢出到第二页
- 内容过多时优先精简文字，而非堆叠段落
- 个人总结：中文不超过 2 句（每句 ≤40 字）；英文不超过 2 句（每句 ≤25 词）
- 每段实习/项目经历：最多 2-3 条要点；中文每条 ≤35 字；英文每条 ≤18 词
- 技能分组不超过 4 组，同类技能合并为逗号分隔列表
- 教育经历为必要模块，禁止为凑页数删除；篇幅不足时优先使用 compact 间距、缩短 bullet、合并技能分组
- 优先保留与目标岗位最相关的 2-3 段核心经历；仅低相关实习/项目可合并或省略，不得删除教育经历
- 获奖/论文可在空间紧张时精简为 1-2 条，但不得删除教育模块
- 使用动词开头的短句（英文）或动宾结构短句（中文），避免冗长从句
"""

RESUME_A4_MULTI_PAGE_CONSTRAINTS = """
## 多页 A4 约束（最多 2 页，必须严格遵守）
- 整份简历排版后不得超过 2 页 A4（210mm × 297mm），禁止超过 2 页
- 个人总结：中文 3-4 句（每句 ≤45 字）；英文 3-4 句（每句 ≤28 词）
- 每段工作/项目经历：最多 4-5 条要点；中文每条 ≤45 字；英文每条 ≤22 词
- 可保留 3-5 段核心经历，次要经历可合并标题或精简为 1-2 条
- 技能分组不超过 6 组，同类技能合并为逗号分隔列表
- 获奖/论文可保留 2-4 条与岗位相关的条目
- 资深候选人应突出领导力、跨团队成果与量化指标，但仍保持条目精炼
- 使用动词开头的短句（英文）或动宾结构短句（中文），避免冗长从句
"""

RESUME_PAGE_COMPRESS_PROMPT = """你是简历篇幅优化专家。当前简历经 PDF 渲染后为 {current_pages} 页，超出允许上限 {page_limit} 页。
请精简内容使其排版后不超过 {page_limit} 页 A4，同时保留与目标岗位最相关的核心成就与量化结果。

{resume_output_language_instruction}

{resume_page_constraints}

当前简历内容：
{current_resume_json}

目标岗位信息：
{job_json}

机器协议：
- 返回且仅返回一个合法 JSON 对象（与简历生成格式一致）
- 不要输出 Markdown、代码块、注释或额外说明
- 所有 key 必须使用双引号

精简策略（按优先级）：
1. 缩短 summary，删除空泛形容词
2. 使用更紧凑的 spacing_scale（compact）与较小字号；教育经历等必要模块必须保留
3. 合并或删除低相关次要经历/项目——仅可删除用户已在优化对话中确认同意的 experiences_to_remove 条目；未确认的经历必须保留；禁止删除教育经历
4. 每条经历减少 bullet 数量，保留最强成果
5. 合并技能分组，删除重复项
6. 不得捏造用户未提供的事实；压缩时保留已有量化数据，禁止为凑篇幅而编造数字
7. 精简时须保持当前目标语言一致，禁止引入中英混用
"""
