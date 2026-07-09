"""单条简历模块翻译 Prompt。"""

from prompts.resume_constraints import RESUME_A4_ONE_PAGE_CONSTRAINTS

RESUME_MODULE_TRANSLATE_PROMPT = """你是跨境就业简历本地化专家。请将下列单条简历模块从 {source_language_label} 转换为 {target_language_label}。

{resume_output_language_instruction}

目标岗位信息（如有）：
{job_json}

{RESUME_A4_ONE_PAGE_CONSTRAINTS}

待转换模块（JSON）：
{module_json}

转换原则：
1. 忠实转换已有事实，不得捏造
2. 根据目标语言简历惯例调整措辞（非逐字翻译）
3. module_json.fields 含全部字段（含非标准/未知 key，如 location、department、supervisor 等）
4. 必须翻译 translate_keys 列出的每一个文本字段，并在输出 fields 中返回对应 key
5. 输出 fields 须包含输入 fields 的全部 key（preserve_keys 原样保留，translate_keys 译为目标语言）
6. 不要翻译 start_date、end_date、date、tech_stack 等日期或技术栈字段
7. 若仅有 title/content：按原逻辑翻译 title 与 content
8. 所有描述性文字须使用目标语言，禁止中英混用
9. 保持 id 不变；fields 的 key 名保持英文不变

机器协议：
- 返回且仅返回合法 JSON 对象
- 格式：{{"id": "...", "fields": {{"company": "...", "role": "...", "location": "...", ...}}}}
- fields 必须覆盖输入中所有 key，不得遗漏未知字段
- 可同时返回 title/content（由 fields 推导）
"""

RESUME_EDUCATION_TRANSLATE_PROMPT = """你是跨境就业简历本地化专家。请将下列单条教育经历从 {source_language_label} 转换为 {target_language_label}。

{resume_output_language_instruction}

目标岗位信息（如有）：
{job_json}

{RESUME_A4_ONE_PAGE_CONSTRAINTS}

待转换教育经历（JSON）：
{module_json}

转换原则：
1. 忠实转换已有事实，不得捏造
2. fields 含全部字段（含非标准 key，如 honors、gpa_description 等）
3. 必须翻译 translate_keys 中每个文本字段；preserve_keys 原样保留
4. 输出 fields 须包含输入 fields 的全部 key，不得遗漏
5. 不要翻译 start_date、end_date
6. 保持 id 不变

机器协议：
- 返回且仅返回合法 JSON 对象
- 格式：{{"id": "...", "fields": {{"school": "...", "major": "...", "degree": "...", ...}}}}
- 兼容顶层 school/major/degree，但优先返回完整 fields
"""
