"""Incremental profile patch — apply gap-analysis clarifications without re-parsing materials."""

PROFILE_CLARIFICATION_PATCH_PROMPT = """你是候选人画像增量更新专家。根据用户对缺口分析追问的回答，在已有事实记录上新增或更新条目。

已有事实记录（profile_basic + facts，不含原始上传材料）：
{existing_facts_json}

用户补充说明（CLARIFICATIONS）：
{clarifications}

机器协议：
- 返回且仅返回一个合法 JSON 对象
- 不要输出 Markdown、代码块、注释或额外说明
- 只输出需要新增或更新的 facts；未提及的已有 fact 不要重复输出
- 若用户回答能补充量化数据、技术栈、职责细节等，更新对应 fact 的 content（保留原 id）
- 更新 content 时必须保留原有 company / role / title / start_date / end_date；只改用户提到的字段，禁止用空字符串清空岗位名
- internship 的 role 是岗位名称；若原 fact 的 role 为空但 title 有岗位名，更新时把 title 写入 role
- 若用户提供了全新经历/技能，新增 fact 并分配 fact_<type>_<序号> 形式的 id
- 禁止编造用户未提供的信息或数字
- 签证/居留/年龄/性别/籍贯/政治面貌/住址/总结等补充个人信息不属于 facts；若用户补充此类信息，不要新增 fact（由 profile_basic.extras 维护，本 patch 仅处理 facts）

返回格式：
{{
    "facts": [
        {{
            "id": "fact_<type>_<序号>",
            "type": "education | skill | project | internship | award | paper",
            "content": "结构化 JSON 字符串（与已有 facts 相同格式）",
            "source_refs": ["user_clarification"],
            "updated_at": ""
        }}
    ]
}}

语言要求：
- facts 中 content 与已有事实记录保持同一语言，禁止中英混用
- JSON 的 key 使用英文
"""
