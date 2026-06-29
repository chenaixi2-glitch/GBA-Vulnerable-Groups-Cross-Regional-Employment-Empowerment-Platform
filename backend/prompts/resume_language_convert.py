"""中英文简历互转 Prompt — 含完整格式差异规范。"""

from prompts.resume_constraints import RESUME_A4_ONE_PAGE_CONSTRAINTS

RESUME_LANGUAGE_CONVERT_PROMPT = """你是跨境就业简历本地化专家。请将当前简历从 {source_language_label} 转换为 {target_language_label}，并严格遵循目标语言的简历惯例。

当前简历内容（JSON）：
{current_resume_json}

目标岗位信息（如有）：
{job_json}

{RESUME_A4_ONE_PAGE_CONSTRAINTS}

## 一、个人照片
### 中文简历（zh）
- 国企/事业单位/银行/教师/体制内/传统行业/行政岗：建议附正装证件照
- 互联网大厂/技术岗：可放可不放，放则加分
- 要求：白底/浅蓝底一寸证件照，置于右上角；不要自拍/生活照
- 若用户未提供照片，在 extras 中标注 has_photo=false，不要捏造 URL

### 英文简历（en）
- 欧美体系（美/英/加/澳）：严禁放照片（反歧视法规，放照片会被淘汰）
- 港澳台/新加坡/日韩外企/香港投行银行：金融/咨询/前台类可酌情保留专业证件照；纯海外校招一律无照片
- 转换到英文时移除 photo_url，不写照片相关信息

## 二、整体结构与排版
### 中文（zh）
- 标题：《XXX 个人简历》语义，姓名置顶大字
- 篇幅：应届生 1 页，3-5 年可 2 页（本系统默认 A4 单页，需精简）
- 联系方式：电话、邮箱、详细住址（省市区）、年龄、性别、籍贯、政治面貌（国内常规）
- 字体：宋体/微软雅黑，两端对齐，小标题加粗

### 英文（en）
- 无 "Resume/CV" 大字标题，姓名即最大标题
- 篇幅：一律 1 页封顶（10 年以下经验）
- 联系方式：仅手机号、邮箱、LinkedIn、城市（只写城市不写详细住址）
- 禁止：年龄、生日、性别、婚姻、籍贯、身高、民族、身份证号、政治面貌
- 字体：Arial/Calibri 风格，左对齐，行距 1.0-1.15

## 三、内容模块顺序
### 中文顺序
个人信息（含照片位）→ 教育经历 → 实习/工作 → 项目 → 技能证书 → 荣誉 → 自我评价

### 英文顺序（欧美标准）
姓名+联系方式 → Professional Summary（3-4 行，替代中文大段自我评价）
→ Work Experience（优先于教育）→ Education → Skills → Projects/Certifications/Awards（按需）

## 四、经历描述写法
- 中文：陈述句，职责+团队，动宾短句，可适度量化
- 英文：Action verb + task + quantified result（Managed X, improved Y by 20%）
- 英文禁止："hardworking, outgoing, 性格开朗、吃苦耐劳" 等主观堆砌

## 五、证书与语言
- 中文：CET-4/6、计算机等级、普通话、资格证直接罗列
- 英文：只写 IELTS/TOEFL/GRE 或 Fluent English；CET 海外不认可，转换时改为等效描述或省略

## 转换原则
1. 忠实转换已有事实，不得捏造
2. 根据目标语言调整结构、措辞、字段可见性，非逐字翻译
3. 转换后 language 设为 "{target_language}"
4. 缺失字段保持为空，并在 extras 中保留已知扩展信息（age/gender/native_place/political_status/photo_url 等）

机器协议：
- 返回且仅返回合法 JSON
- profile 可含 linkedin, address, extras 字段
- 根对象含 "language": "{target_language}"
"""
