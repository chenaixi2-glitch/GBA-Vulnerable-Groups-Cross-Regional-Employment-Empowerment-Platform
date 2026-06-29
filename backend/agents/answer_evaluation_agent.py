"""Answer Evaluation Agent — structured feedback + LLM-as-judge for free-text answers."""

from __future__ import annotations

import json
import re
from typing import Any

from agents.json_contracts import AnswerEvaluationOutput, LLMJudgeRubricOutput
from models.llm import get_llm, get_judge_llm, ainvoke_json_with_schema
from prompts.answer_evaluation import ANSWER_EVALUATION_PROMPT, LLM_JUDGE_RUBRIC_PROMPT
from workflow.state import AnswerEvaluation, CopilotState, InterviewQA
from workflow.trace import append_trace, summarize_user_message
from log import get_logger

logger = get_logger("agent")

_EVALUATE_PATTERN = re.compile(
    r"evaluate\s+my\s+answer\s+to\s+question\s+(\S+)\s*:\s*(.+)",
    re.IGNORECASE | re.DOTALL,
)


def _parse_evaluation_request(user_message: str) -> tuple[str, str] | None:
    match = _EVALUATE_PATTERN.search(user_message.strip())
    if not match:
        return None
    question_id = match.group(1).strip().rstrip(".")
    user_answer = match.group(2).strip()
    return question_id, user_answer


def _find_interview_qa(state: CopilotState, question_id: str) -> InterviewQA | None:
    for qa in state.interview_qa:
        if qa.id == question_id:
            return qa
    return None


def _job_context(state: CopilotState) -> str:
    if state.job is None:
        return "（无岗位信息）"
    return state.job.model_dump_json(indent=2)


def _blend_score(primary_score: int, judge: LLMJudgeRubricOutput) -> int:
    """Blend primary evaluator score with judge rubric (weighted average)."""
    judge_avg = (judge.relevance + judge.groundedness + judge.actionability) / 3
    blended = round(primary_score * 0.5 + judge_avg * 0.5)
    return max(0, min(100, blended))


async def _run_llm_judge(
    question: str,
    reference_answer: str,
    user_answer: str,
    evaluation: AnswerEvaluationOutput,
) -> LLMJudgeRubricOutput:
    judge_llm = get_judge_llm()
    prompt = LLM_JUDGE_RUBRIC_PROMPT.format(
        question=question,
        reference_answer=reference_answer or "（无参考答案）",
        user_answer=user_answer,
        evaluation_json=json.dumps(
            {
                "score": evaluation.score,
                "strengths": evaluation.strengths,
                "improvements": evaluation.improvements,
                "suggestions": evaluation.suggestions,
            },
            ensure_ascii=False,
        ),
    )
    try:
        return await ainvoke_json_with_schema(
            judge_llm, prompt, LLMJudgeRubricOutput, logger, "LLM Judge"
        )
    except RuntimeError as exc:
        logger.warning("LLM Judge failed, using empty rubric: %s", exc)
        return LLMJudgeRubricOutput()


async def answer_evaluation_node_async(state: CopilotState) -> dict[str, Any]:
    """Evaluate a user's interview answer with structured output + LLM-as-judge."""
    logger.info("Answer Evaluation Agent started for session %s", state.session_id)

    parsed = _parse_evaluation_request(state.user_message)
    if parsed is None:
        return {
            "workflow_trace": append_trace(
                state,
                node="answer_evaluation_agent",
                status="skipped",
                input_summary=f"解析评估请求：{summarize_user_message(state.user_message)}",
                output_summary="无法解析评估请求，请使用格式：Evaluate my answer to question <id>: <your answer>",
            ),
        }

    question_id, user_answer = parsed
    qa = _find_interview_qa(state, question_id)
    if qa is None:
        return {
            "workflow_trace": append_trace(
                state,
                node="answer_evaluation_agent",
                status="skipped",
                input_summary=f"评估问题 {question_id}",
                output_summary=f"未找到问题 ID「{question_id}」，请先生成面试题。",
            ),
        }

    prompt = ANSWER_EVALUATION_PROMPT.format(
        question=qa.question,
        reference_answer=qa.answer or "（无参考答案）",
        user_answer=user_answer,
        job_context=_job_context(state),
    )
    llm = get_llm()
    try:
        evaluation = await ainvoke_json_with_schema(
            llm, prompt, AnswerEvaluationOutput, logger, "Answer Evaluation Agent"
        )
    except RuntimeError as exc:
        logger.error("Answer Evaluation Agent failed: %s", exc)
        return {
            "workflow_trace": append_trace(
                state,
                node="answer_evaluation_agent",
                status="failed",
                input_summary=f"评估问题 {question_id} 的回答",
                output_summary="答案评估失败：模型输出格式异常，请重试。",
                error=str(exc),
            ),
        }

    judge_scores = await _run_llm_judge(qa.question, qa.answer, user_answer, evaluation)
    evaluation.judge_scores = judge_scores
    evaluation.score = _blend_score(evaluation.score, judge_scores)

    answer_eval = AnswerEvaluation(
        question_id=question_id,
        user_answer=user_answer,
        score=evaluation.score,
        strengths=list(evaluation.strengths),
        improvements=list(evaluation.improvements),
        suggestions=list(evaluation.suggestions),
        judge_relevance=judge_scores.relevance,
        judge_groundedness=judge_scores.groundedness,
        judge_actionability=judge_scores.actionability,
        judge_rationale=judge_scores.rationale,
    )

    summary_parts = [
        f"综合得分 {evaluation.score}/100",
        f"Judge — 相关性 {judge_scores.relevance}，依据性 {judge_scores.groundedness}，可操作性 {judge_scores.actionability}",
    ]
    if evaluation.strengths:
        summary_parts.append(f"优点：{'; '.join(evaluation.strengths[:2])}")
    if evaluation.improvements:
        summary_parts.append(f"改进：{'; '.join(evaluation.improvements[:2])}")

    return {
        "last_answer_evaluation": answer_eval,
        "workflow_trace": append_trace(
            state,
            node="answer_evaluation_agent",
            input_summary=f"评估问题「{qa.question[:60]}…」的回答",
            output_summary=" | ".join(summary_parts),
            artifacts={
                "question_id": question_id,
                "score": evaluation.score,
                "judge_relevance": judge_scores.relevance,
                "judge_groundedness": judge_scores.groundedness,
                "judge_actionability": judge_scores.actionability,
            },
        ),
    }
