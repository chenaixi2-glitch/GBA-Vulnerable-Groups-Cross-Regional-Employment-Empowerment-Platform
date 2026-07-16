"""交互式面试 Prompt 记忆 — 类别加权滑动窗口 + 异类优先摘要压缩。

完整 `session.turns` 仍保留给前端；本模块只控制注入 LLM 的历史体积。
同类/近类相对当前题权重高，优先保留原文；远类权重低，优先折入摘要。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, Field

from config_loader import get_interview_memory_config
from log import get_logger
from models.llm import ainvoke_json_with_schema, get_llm
from workflow.state import InteractiveInterviewSession

logger = get_logger("interview_memory")

# 类别归一：遗留中文标签 → 标准英文标签
_CATEGORY_ALIASES: dict[str, str] = {
    "简历深挖与个人经历": "Resume deep dive & experience",
    "岗位认知与求职动机": "Role understanding & motivation",
    "职业规划与稳定性": "Career planning & stability",
    "职场软实力与团队协作": "Soft skills & teamwork",
    "压力应变与短板复盘": "Stress handling & self-reflection",
    "面试反向提问": "Candidate questions for interviewer",
    "专业技能与岗位匹配": "Professional skills & role fit",
    "项目实操与问题解决": "Hands-on projects & problem solving",
    "用户自定义": "User custom",
    "自定义题目": "Custom Questions",
    "追问": "Follow-up",
}

# 近类簇：同簇视为 near（权重介于 same 与 far 之间）
_CATEGORY_FAMILIES: dict[str, str] = {
    "Resume deep dive & experience": "experience",
    "Hands-on projects & problem solving": "experience",
    "Professional skills & role fit": "experience",
    "Role understanding & motivation": "motivation",
    "Career planning & stability": "motivation",
    "Soft skills & teamwork": "soft",
    "Stress handling & self-reflection": "soft",
    "Candidate questions for interviewer": "closing",
    "Follow-up": "follow_up",
    "User custom": "custom",
    "Custom Questions": "custom",
}


class InterviewHistoryCompressOutput(BaseModel):
    summary: str = ""
    covered_topics: list[str] = Field(default_factory=list)
    candidate_signals: list[str] = Field(default_factory=list)
    open_doubts: list[str] = Field(default_factory=list)


@dataclass
class QaBlock:
    index: int
    question_id: str
    category: str
    stage_index: int
    text: str


def _cfg() -> dict[str, Any]:
    cfg = get_interview_memory_config()
    return {
        "recent_qa_limit": int(cfg.get("recent_qa_limit", 6)),
        "compress_threshold": int(cfg.get("compress_threshold", 8)),
        "debrief_recent_qa_limit": int(cfg.get("debrief_recent_qa_limit", 12)),
        "max_block_chars": int(cfg.get("max_block_chars", 1000)),
        "summary_max_chars": int(cfg.get("summary_max_chars", 2500)),
        "same_category_weight": float(cfg.get("same_category_weight", 1.0)),
        "near_category_weight": float(cfg.get("near_category_weight", 0.55)),
        "far_category_weight": float(cfg.get("far_category_weight", 0.2)),
        "same_stage_bonus": float(cfg.get("same_stage_bonus", 0.15)),
        "recency_weight": float(cfg.get("recency_weight", 0.35)),
        "debrief_category_scale": float(cfg.get("debrief_category_scale", 0.25)),
    }


def _truncate(text: str, max_len: int) -> str:
    text = (text or "").strip()
    if len(text) <= max_len:
        return text
    return text[: max_len - 3] + "..."


def normalize_category(category: str) -> str:
    raw = (category or "").strip()
    if not raw:
        return ""
    if raw in _CATEGORY_ALIASES:
        return _CATEGORY_ALIASES[raw]
    lower_map = {k.lower(): v for k, v in _CATEGORY_ALIASES.items()}
    if raw.lower() in lower_map:
        return lower_map[raw.lower()]
    return raw


def _family(category: str) -> str:
    cat = normalize_category(category)
    return _CATEGORY_FAMILIES.get(cat, cat.lower() if cat else "")


def category_relatedness(anchor: str, other: str) -> float:
    """返回 1.0(同类) / 中档(近类) / 低档(远类)。无锚点时中性。"""
    cfg = _cfg()
    a = normalize_category(anchor)
    b = normalize_category(other)
    if not a:
        return cfg["near_category_weight"]
    if not b:
        return cfg["far_category_weight"]
    if a.lower() == b.lower():
        return cfg["same_category_weight"]
    fa, fb = _family(a), _family(b)
    if fa and fb and fa == fb:
        return cfg["near_category_weight"]
    return cfg["far_category_weight"]


def score_block(
    block: QaBlock,
    *,
    anchor_category: str = "",
    anchor_stage_index: int | None = None,
    total_blocks: int = 1,
    for_debrief: bool = False,
) -> float:
    """综合类别相关性、同阶段加成与时间新近度。"""
    cfg = _cfg()
    cat_score = category_relatedness(anchor_category, block.category)
    if for_debrief:
        cat_score = cat_score * cfg["debrief_category_scale"] + (1.0 - cfg["debrief_category_scale"]) * 0.5

    stage_bonus = 0.0
    if anchor_stage_index is not None and block.stage_index == anchor_stage_index:
        stage_bonus = cfg["same_stage_bonus"]
        if for_debrief:
            stage_bonus *= cfg["debrief_category_scale"]

    n = max(total_blocks, 1)
    recency = block.index / max(n - 1, 1) if n > 1 else 1.0
    return cat_score + stage_bonus + cfg["recency_weight"] * recency


def extract_qa_block_records(
    session: InteractiveInterviewSession,
    max_block_chars: int | None = None,
) -> list[QaBlock]:
    """从 turns 提取结构化问答块。"""
    cfg = _cfg()
    limit = max_block_chars if max_block_chars is not None else cfg["max_block_chars"]
    records: list[QaBlock] = []

    for turn in session.turns:
        if turn.turn_type == "answer":
            q_turn = next(
                (
                    t for t in session.turns
                    if t.question_id == turn.question_id
                    and t.role == "interviewer"
                    and t.turn_type in ("question", "follow_up", "opening")
                ),
                None,
            )
            if q_turn is None:
                q_turn = next(
                    (
                        t for t in session.turns
                        if t.question_id == turn.question_id and t.role == "interviewer"
                    ),
                    None,
                )
            q_text = _truncate(q_turn.content if q_turn else "(unknown question)", limit)
            a_text = _truncate(turn.content, limit)
            category = normalize_category(
                turn.category or (q_turn.category if q_turn else "") or ""
            )
            stage_index = turn.stage_index if turn.stage_index is not None else (
                q_turn.stage_index if q_turn else 0
            )
            cat_label = f" [{category}]" if category else ""
            records.append(QaBlock(
                index=len(records),
                question_id=turn.question_id or f"anon_{len(records)}",
                category=category,
                stage_index=int(stage_index or 0),
                text=f"Q{cat_label}: {q_text}\nA: {a_text}",
            ))
        elif turn.turn_type == "brief_feedback" and records:
            fb = _truncate(turn.content, limit)
            last = records[-1]
            if not turn.question_id or turn.question_id == last.question_id:
                last.text = last.text + f"\n[Feedback] {fb}"

    return records


def extract_qa_blocks(session: InteractiveInterviewSession, max_block_chars: int | None = None) -> list[str]:
    """兼容旧接口：仅返回文本块列表。"""
    return [b.text for b in extract_qa_block_records(session, max_block_chars)]


def _compressed_id_set(session: InteractiveInterviewSession, blocks: list[QaBlock]) -> set[str]:
    ids = {qid for qid in (session.history_compressed_question_ids or []) if qid}
    if ids:
        return ids
    # 兼容旧字段：按前 N 条视为已压缩
    count = max(0, min(session.history_compressed_qa_count, len(blocks)))
    return {b.question_id for b in blocks[:count]}


def _sync_compressed_fields(session: InteractiveInterviewSession, compressed_ids: set[str], blocks: list[QaBlock]) -> None:
    ordered = [b.question_id for b in blocks if b.question_id in compressed_ids]
    # 保留已压缩但不在当前 blocks 的 id（防御）
    extras = [qid for qid in session.history_compressed_question_ids if qid not in compressed_ids]
    session.history_compressed_question_ids = extras + ordered
    session.history_compressed_qa_count = len(session.history_compressed_question_ids)


def _rank_keep_blocks(
    blocks: list[QaBlock],
    *,
    keep: int,
    anchor_category: str,
    anchor_stage_index: int | None,
    for_debrief: bool,
    compressed_ids: set[str],
) -> list[QaBlock]:
    raw = [b for b in blocks if b.question_id not in compressed_ids]
    if not raw:
        return []
    total = len(blocks)
    ranked = sorted(
        raw,
        key=lambda b: (
            score_block(
                b,
                anchor_category=anchor_category,
                anchor_stage_index=anchor_stage_index,
                total_blocks=total,
                for_debrief=for_debrief,
            ),
            b.index,
        ),
        reverse=True,
    )
    selected = ranked[: max(1, keep)]
    return sorted(selected, key=lambda b: b.index)


def build_prompt_history(
    session: InteractiveInterviewSession,
    *,
    recent_limit: int | None = None,
    for_debrief: bool = False,
    anchor_category: str = "",
    anchor_stage_index: int | None = None,
) -> str:
    """组装注入 Prompt 的历史：摘要 + 按类别加权选出的原始 Q&A。"""
    cfg = _cfg()
    keep = recent_limit
    if keep is None:
        keep = cfg["debrief_recent_qa_limit"] if for_debrief else cfg["recent_qa_limit"]
    keep = max(1, int(keep))

    blocks = extract_qa_block_records(session)
    if not blocks and not session.history_summary:
        return "(no Q&A yet)"

    compressed_ids = _compressed_id_set(session, blocks)
    raw_blocks = [b for b in blocks if b.question_id not in compressed_ids]
    window = _rank_keep_blocks(
        blocks,
        keep=keep,
        anchor_category=anchor_category,
        anchor_stage_index=anchor_stage_index,
        for_debrief=for_debrief,
        compressed_ids=compressed_ids,
    )

    parts: list[str] = []
    if session.history_summary.strip():
        parts.append("【较早问答摘要】\n" + session.history_summary.strip())
    elif not compressed_ids and len(raw_blocks) > keep:
        skipped = len(raw_blocks) - keep
        parts.append(f"【说明】另有 {skipped} 组较低相关/较早问答已省略（等待摘要压缩）。")

    if window:
        label = "【加权保留问答】" if anchor_category and not for_debrief else "【最近问答】"
        parts.append(label + "\n" + "\n\n".join(b.text for b in window))

    return "\n\n".join(parts) if parts else "(no Q&A yet)"


def _merge_compress_result(
    session: InteractiveInterviewSession,
    result: InterviewHistoryCompressOutput,
    summary_max: int,
) -> None:
    pieces = [result.summary.strip()]
    if result.covered_topics:
        pieces.append("已覆盖：" + "；".join(t.strip() for t in result.covered_topics if t.strip()))
    if result.candidate_signals:
        pieces.append("信号：" + "；".join(s.strip() for s in result.candidate_signals if s.strip()))
    if result.open_doubts:
        pieces.append("待澄清：" + "；".join(d.strip() for d in result.open_doubts if d.strip()))

    new_chunk = "\n".join(p for p in pieces if p)
    if session.history_summary and new_chunk:
        session.history_summary = _truncate(session.history_summary.strip() + "\n" + new_chunk, summary_max)
    else:
        session.history_summary = _truncate(new_chunk or session.history_summary, summary_max)


async def maybe_compress_interview_history(
    session: InteractiveInterviewSession,
    *,
    anchor_category: str = "",
    anchor_stage_index: int | None = None,
    for_debrief: bool = False,
) -> bool:
    """未压缩 Q&A 超阈值时，优先将低权重（异类/较早）块折入摘要。

    不修改 session.turns。成功返回 True。
    """
    cfg = _cfg()
    threshold = cfg["compress_threshold"]
    keep = cfg["debrief_recent_qa_limit"] if for_debrief else cfg["recent_qa_limit"]
    summary_max = cfg["summary_max_chars"]

    blocks = extract_qa_block_records(session)
    compressed_ids = _compressed_id_set(session, blocks)
    raw = [b for b in blocks if b.question_id not in compressed_ids]
    if len(raw) <= threshold:
        return False

    protected = {
        b.question_id
        for b in _rank_keep_blocks(
            blocks,
            keep=keep,
            anchor_category=anchor_category,
            anchor_stage_index=anchor_stage_index,
            for_debrief=for_debrief,
            compressed_ids=compressed_ids,
        )
    }
    candidates = [b for b in raw if b.question_id not in protected]
    if not candidates:
        return False

    total = len(blocks)
    candidates.sort(
        key=lambda b: (
            score_block(
                b,
                anchor_category=anchor_category,
                anchor_stage_index=anchor_stage_index,
                total_blocks=total,
                for_debrief=for_debrief,
            ),
            b.index,
        )
    )
    need = len(raw) - keep
    to_compress = candidates[: max(0, need)]
    if not to_compress:
        return False

    # 压缩文本按时间序，便于摘要连贯
    to_compress_chrono = sorted(to_compress, key=lambda b: b.index)
    prompt = (
        "你是模拟面试历史压缩器。将较低优先级（多为已覆盖的异类/较早问答）合并进已有摘要，输出 JSON。\n\n"
        f"当前关注类别：{normalize_category(anchor_category) or '（复盘/无锚点）'}\n"
        f"已有摘要：\n{session.history_summary or '（无）'}\n\n"
        "待压缩问答：\n"
        + "\n\n".join(b.text for b in to_compress_chrono)
        + "\n\n"
        "要求：\n"
        "1. summary：连贯中文摘要，保留候选人关键经历主张、表现信号、已覆盖考察点、未澄清疑点；\n"
        "2. covered_topics：已覆盖主题短列表（尽量带上原类别名）；\n"
        "3. candidate_signals：亮点/风险短句；\n"
        "4. open_doubts：仍待追问的疑点；\n"
        "5. 不要编造未出现的事实。"
    )

    try:
        llm = get_llm()
        result = await ainvoke_json_with_schema(
            llm, prompt, InterviewHistoryCompressOutput, logger, "Interview Memory"
        )
        _merge_compress_result(session, result, summary_max)
        new_ids = compressed_ids | {b.question_id for b in to_compress}
        _sync_compressed_fields(session, new_ids, blocks)
        logger.info(
            "Compressed %d interview QA blocks by category weight (compressed=%d, total=%d, anchor=%s)",
            len(to_compress),
            len(session.history_compressed_question_ids),
            len(blocks),
            normalize_category(anchor_category) or "-",
        )
        return True
    except Exception as exc:
        logger.warning("Interview history compress failed: %s", exc)
        return False


async def maybe_compress_interview_history_safe(
    session: InteractiveInterviewSession,
    *,
    anchor_category: str = "",
    anchor_stage_index: int | None = None,
    for_debrief: bool = False,
) -> None:
    try:
        await maybe_compress_interview_history(
            session,
            anchor_category=anchor_category,
            anchor_stage_index=anchor_stage_index,
            for_debrief=for_debrief,
        )
    except Exception as exc:
        logger.warning("maybe_compress_interview_history_safe: %s", exc)
