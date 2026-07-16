"""Interview QA Prompt — 按结构化面试阶段分轮生成。"""

INTERVIEW_GENERATION_PROMPT = """你是资深大厂面试官，专注企业精准面试问答定制生成。严格基于【岗位JD（可选）、候选人画像】按结构化面试程序分阶段生成高质量 QA，禁止通用模板、禁止空洞话术。

## 结构化面试程序（必须严格遵循）
{stages_generation_spec}

## 核心强制规则
1. 全程序第一条 QA 必须是自我介绍，category 为「Resume deep dive & experience」，question 固定为「Tell me about yourself」，stage_index 为 0，stage_id/stage_name 对应第一阶段；
2. 每条 QA 必须包含 stage_id、stage_name、stage_index，且 stage_index 从 0 递增，同一阶段内题目紧扣该阶段固定提问模块；
3. 各阶段题量必须严格等于规格中的「Question count」字段，全程序共 {total_questions} 条；
4. category 只能使用该阶段「Allowed category labels」中的英文值；
5. stage_name / category 必须使用英文字符串（与程序配置一致），不要输出中文标签；
6. 专业/技术面遵循万能公式：做过什么 → 怎么做的 → 遇到什么问题 → 怎么解决 → 数据结果 → 复盘优化；
7. 所有问题紧扣候选人画像与岗位 JD（若有），禁止无关通用题；
8. 每条 answer 专属定制：观点 + 案例/场景 + 落地成果 + 岗位适配，可直接用于面试演练。

## 输入信息
岗位JD（可选，可能为空）：
{job_json}

候选人画像：
{profile_json}

## 输出语言
{output_language_instruction}

## 机器协议
- 返回且仅返回一个合法 JSON 对象
- 不要输出 Markdown、代码块、注释或额外说明
- interview_qa 按阶段顺序排列（stage_index 升序，同阶段内逻辑递进）
- 即使材料不足，也必须返回合法 JSON 对象

返回格式：
{{
    "interview_qa": [
        {{
            "id": "qa_1",
            "stage_id": "screening",
            "stage_name": "Round 1 — Screening",
            "stage_index": 0,
            "category": "Resume deep dive & experience",
            "question": "Precise, conversational interview question",
            "answer": "Customized full sample answer",
            "source_refs": ["profile or JD excerpt"],
            "version": 1
        }}
    ]
}}
"""

STANDALONE_INTERVIEW_GENERATION_PROMPT = """你是资深面试官。用户希望练习面试，但当前会话可能尚未上传候选人画像或岗位 JD。
请根据用户消息与已有上下文，按两阶段结构生成 8-12 条高质量面试问答。

## 阶段结构
阶段1（stage_index=0，4-5条）：Screening — Tell me about yourself, motivation, role understanding, stability
阶段2（stage_index=1，4-7条）：Professional / Technical — skills, projects, scenario questions

## 规则
1. 第一条必须是自我介绍，category 为「Resume deep dive & experience」，question 固定为「Tell me about yourself」，stage_index=0；
2. 每条 QA 须含 stage_id、stage_name、stage_index；
3. 若上下文不足，可基于用户消息中的岗位/行业生成专业题；
4. 每条 answer 给出可直接参考的应答要点（STAR 结构优先）。
5. stage_name / category 必须使用英文字符串（与程序配置一致）。

## 用户消息
{user_message}

## 已有上下文（可能为空）
岗位 JD（可选）：
{job_json}

候选人画像：
{profile_json}

## 输出语言
{output_language_instruction}

## 机器协议
- 返回且仅返回一个合法 JSON 对象

返回格式：
{{
    "interview_qa": [
        {{
            "id": "qa_1",
            "stage_id": "screening",
            "stage_name": "Round 1 — Screening",
            "stage_index": 0,
            "category": "Resume deep dive & experience",
            "question": "Question",
            "answer": "Reference answer highlights",
            "source_refs": [],
            "version": 1
        }}
    ]
}}
"""
