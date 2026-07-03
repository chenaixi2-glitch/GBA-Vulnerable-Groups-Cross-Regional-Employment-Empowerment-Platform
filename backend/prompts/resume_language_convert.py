"""简历多语言互转 Prompt — 含完整格式差异规范。"""

from prompts.resume_constraints import RESUME_A4_ONE_PAGE_CONSTRAINTS

RESUME_LANGUAGE_CONVERT_PROMPT = """你是跨境就业简历本地化专家。请将当前简历从 {source_language_label} 转换为 {target_language_label}，并严格遵循目标语言的简历惯例。

{resume_output_language_instruction}

当前简历内容（JSON）：
{current_resume_json}

目标岗位信息（如有）：
{job_json}

{RESUME_PAGE_CONSTRAINTS}

## 一、个人照片
### 简体中文/繁體中文简历（zh / zh-TW）
- 国企/事业单位/银行/教师/体制内/传统行业/行政岗：建议附正装证件照
- 互联网大厂/技术岗：可放可不放，放则加分
- 要求：白底/浅蓝底一寸证件照，置于右上角；不要自拍/生活照
- 若用户未提供照片，在 extras 中标注 has_photo=false，不要捏造 URL
- zh-TW 输出须全部使用繁體中文

### 英文/葡语简历（en / pt）
- 欧美/澳门西式体系：默认不放照片（反歧视/专业惯例）
- 转换到 en 或 pt 时移除 photo_url，不写照片相关信息

## 二、整体结构与排版
### 简体中文（zh）
- 标题：《XXX 个人简历》语义，姓名置顶大字
- 联系方式：电话、邮箱、详细住址（省市区）、年龄、性别、籍贯、政治面貌（国内常规）

### 繁體中文（zh-TW）
- 与 zh 结构相同，全部使用繁体字（如「個人履歷」「專業技能」）

### 英文（en）
- 无 "Resume/CV" 大字标题，姓名即最大标题
- 联系方式：仅手机号、邮箱、LinkedIn、城市（只写城市不写详细住址）
- 禁止：年龄、生日、性别、婚姻、籍贯、身高、民族、身份证号、政治面貌

### 葡语（pt，澳门/欧洲葡语）
- 与 en 类似的西式结构，使用欧洲葡语（Português europeu）
- 标题可用 "Curriculum Vitae" 或仅姓名；禁止年龄/性别/照片
- 面向澳门及大湾区葡语雇主场景

## 三、内容模块顺序
- zh / zh-TW：个人信息 → 教育 → 实习/工作 → 项目 → 技能 → 荣誉 → 自我评价
- en / pt：Contact → Summary → Work Experience → Education → Skills → Projects/Awards

## 四、经历描述写法
- zh / zh-TW：陈述句，动宾短句，可适度量化
- en / pt：Action verb + task + quantified result

## 转换原则
1. 忠实转换已有事实，不得捏造
2. 根据目标语言调整结构、措辞、字段可见性，非逐字翻译
3. 转换后全部正文字段须统一使用目标语言，禁止中英混用
4. 转换后 language 设为 "{target_language}"
5. 缺失字段保持为空，并在 extras 中保留已知扩展信息

机器协议：
- 返回且仅返回合法 JSON
- profile 可含 linkedin, address, extras 字段
- 根对象含 "language": "{target_language}"
"""