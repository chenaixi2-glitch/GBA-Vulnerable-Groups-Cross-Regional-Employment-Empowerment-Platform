"""POST /api/export — 导出接口。"""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from auth.jwt import get_optional_user
from auth.session_access import ensure_session_access
from storage.redis_client import get_redis_client, RedisSessionStore
from workflow.state import CopilotState, Gap, InterviewQA, Job, Question
from log import get_logger

logger = get_logger("api")

router = APIRouter(prefix="/api", tags=["export"])


class ExportRequest(BaseModel):
    session_id: str
    format: str = "html"  # html / json / markdown / txt / md / pdf / docx
    target: str = "resume"  # resume / job / gaps / interview


class SessionExportRequest(BaseModel):
    session_id: str


def _build_response(content: str, media_type: str, filename: str) -> Response:
    from tools.resume_export import build_content_disposition

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": build_content_disposition(filename)},
    )


def _build_binary_response(content: bytes, media_type: str, filename: str) -> Response:
    from tools.resume_export import build_content_disposition

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": build_content_disposition(filename)},
    )


async def _load_session_state(session_id: str, request: Request) -> CopilotState:
    from api.chat import _aload_state

    user = get_optional_user(request)
    await ensure_session_access(session_id, user)

    client = await get_redis_client()
    store = RedisSessionStore(session_id, client)
    saved = await _aload_state(store)
    if not saved:
        raise HTTPException(status_code=404, detail="会话不存在")
    return CopilotState.model_validate(saved)


def _resume_export_filename(state: CopilotState, ext: str) -> str:
    from tools.resume_export import sanitize_export_filename

    name = None
    if state.resume_content_json and state.resume_content_json.profile.name:
        name = state.resume_content_json.profile.name
    return sanitize_export_filename(name, ext)


def _export_resume_pdf(state: CopilotState) -> tuple[bytes, str, str]:
    from tools.resume_export import WeasyPrintUnavailableError, html_to_pdf_bytes, weasyprint_available

    if not state.resume_html.html:
        raise HTTPException(status_code=404, detail="简历 HTML 尚未生成")
    if not weasyprint_available():
        raise HTTPException(status_code=503, detail=WeasyPrintUnavailableError.INSTALL_HINT)

    try:
        pdf_bytes = html_to_pdf_bytes(state.resume_html.html)
    except WeasyPrintUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("PDF export failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="PDF 导出失败，请稍后重试") from exc

    return pdf_bytes, "application/pdf", _resume_export_filename(state, "pdf")


def _export_resume_docx(state: CopilotState) -> tuple[bytes, str, str]:
    from tools.resume_export import resume_content_to_docx_bytes

    if state.resume_content_json is None:
        raise HTTPException(status_code=404, detail="简历内容尚未生成")

    try:
        docx_bytes = resume_content_to_docx_bytes(state.resume_content_json)
    except Exception as exc:
        logger.error("DOCX export failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="DOCX 导出失败，请稍后重试") from exc

    return (
        docx_bytes,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        _resume_export_filename(state, "docx"),
    )


def _export_job_json(job: Job) -> str:
    return json.dumps(job.model_dump(), ensure_ascii=False, indent=2)


def _bullet_lines(items: list[str]) -> list[str]:
    return [f"- {item}" for item in items] if items else ["- -"]


def _export_job_text(job: Job) -> str:
    sections = [
        "岗位解析",
        f"岗位名称: {job.title or '-'}",
        f"行业: {job.industry or '-'}",
        f"学历要求: {job.education_requirement or '-'}",
        f"经验要求: {job.experience_requirement or '-'}",
        "",
        "技术栈:",
        *_bullet_lines(job.tech_stack),
        "",
        "硬技能:",
        *_bullet_lines(job.hard_skills),
        "",
        "软技能:",
        *_bullet_lines(job.soft_skills),
        "",
        "职责:",
        *_bullet_lines(job.responsibilities),
        "",
        "关键词:",
        *_bullet_lines(job.keywords),
        "",
        "隐含偏好:",
        *_bullet_lines(job.implicit_preferences),
        "",
        "加分项:",
        *_bullet_lines(job.bonus_items),
    ]
    return "\n".join(sections)


def _export_job_markdown(job: Job) -> str:
    lines = [
        "# 岗位解析",
        "",
        f"- 岗位名称: {job.title or '-'}",
        f"- 行业: {job.industry or '-'}",
        f"- 学历要求: {job.education_requirement or '-'}",
        f"- 经验要求: {job.experience_requirement or '-'}",
        "",
        "## 技术栈",
        *_bullet_lines(job.tech_stack),
        "",
        "## 硬技能",
        *_bullet_lines(job.hard_skills),
        "",
        "## 软技能",
        *_bullet_lines(job.soft_skills),
        "",
        "## 职责",
        *_bullet_lines(job.responsibilities),
        "",
        "## 关键词",
        *_bullet_lines(job.keywords),
        "",
        "## 隐含偏好",
        *_bullet_lines(job.implicit_preferences),
        "",
        "## 加分项",
        *_bullet_lines(job.bonus_items),
    ]
    return "\n".join(lines)


def _export_gaps_json(gaps: list[Gap], questions: list[Question]) -> str:
    payload = {
        "gaps": [item.model_dump() for item in gaps],
        "questions_to_ask": [item.model_dump() for item in questions],
    }
    return json.dumps(payload, ensure_ascii=False, indent=2)


def _export_gaps_text(gaps: list[Gap], questions: list[Question]) -> str:
    lines = ["缺失信息与能力缺口", "", f"待补充信息: {len(questions)} 项"]
    if questions:
        for index, item in enumerate(questions, start=1):
            lines.extend([
                f"{index}. {item.question}",
                f"   优先级: {item.priority or '-'}",
                f"   目标字段: {item.target_field or '-'}",
                f"   原因: {item.reason or '-'}",
                f"   状态: {item.status or '-'}",
            ])
    else:
        lines.append("- 暂无待补充信息")

    lines.extend(["", f"能力缺口: {len(gaps)} 项"])
    if gaps:
        for index, item in enumerate(gaps, start=1):
            section_ids = ", ".join(item.related_section_ids) if item.related_section_ids else "-"
            lines.extend([
                f"{index}. {item.description or item.type}",
                f"   类型: {item.type or '-'}",
                f"   严重程度: {item.severity or '-'}",
                f"   关联 section: {section_ids}",
                f"   已解决: {'是' if item.resolved else '否'}",
            ])
    else:
        lines.append("- 暂无能力缺口")

    return "\n".join(lines)


def _export_gaps_markdown(gaps: list[Gap], questions: list[Question]) -> str:
    lines = ["# 缺失信息与能力缺口", "", "## 待补充信息"]
    if questions:
        for item in questions:
            lines.extend([
                f"- 问题: {item.question}",
                f"  原因: {item.reason or '-'}",
                f"  目标字段: {item.target_field or '-'}",
                f"  优先级: {item.priority or '-'}",
                f"  状态: {item.status or '-'}",
            ])
    else:
        lines.append("- 暂无待补充信息")

    lines.extend(["", "## 能力缺口"])
    if gaps:
        for item in gaps:
            lines.extend([
                f"- 描述: {item.description or item.type}",
                f"  类型: {item.type or '-'}",
                f"  严重程度: {item.severity or '-'}",
                f"  关联 section: {', '.join(item.related_section_ids) if item.related_section_ids else '-'}",
                f"  已解决: {'是' if item.resolved else '否'}",
            ])
    else:
        lines.append("- 暂无能力缺口")

    return "\n".join(lines)


def _export_interview_json(interview_qa: list[InterviewQA]) -> str:
    payload = {"interview_qa": [item.model_dump() for item in interview_qa]}
    return json.dumps(payload, ensure_ascii=False, indent=2)


def _export_interview_text(interview_qa: list[InterviewQA]) -> str:
    lines = ["面试问答", "", f"共 {len(interview_qa)} 道题"]
    if not interview_qa:
        lines.append("- 暂无面试问答")
        return "\n".join(lines)

    for index, item in enumerate(interview_qa, start=1):
        refs = ", ".join(item.source_refs) if item.source_refs else "-"
        lines.extend([
            "",
            f"Q{index}. {item.question}",
            f"类别: {item.category or '-'}",
            "参考答案:",
            item.answer or "-",
            f"来源引用: {refs}",
        ])
    return "\n".join(lines)


def _export_interview_markdown(interview_qa: list[InterviewQA]) -> str:
    lines = ["# 面试问答", "", f"共 {len(interview_qa)} 道题"]
    if not interview_qa:
        lines.extend(["", "- 暂无面试问答"])
        return "\n".join(lines)

    for index, item in enumerate(interview_qa, start=1):
        lines.extend([
            "",
            f"## Q{index}. {item.question}",
            f"- 类别: {item.category or '-'}",
            f"- 来源引用: {', '.join(item.source_refs) if item.source_refs else '-'}",
            "",
            "### 参考答案",
            item.answer or "-",
        ])
    return "\n".join(lines)


def _export_resume_json(state: CopilotState) -> str:
    if state.resume_content_json is None:
        raise HTTPException(status_code=404, detail="简历内容尚未生成")
    return json.dumps(state.resume_content_json.model_dump(), ensure_ascii=False, indent=2)


def _export_resume_markdown(state: CopilotState) -> str:
    if state.resume_content_json is None:
        raise HTTPException(status_code=404, detail="简历内容尚未生成")

    content = state.resume_content_json
    profile = content.profile
    lines = [
        "# 简历内容",
        "",
        "## 基本信息",
        f"- 姓名: {profile.name or '-'}",
        f"- 邮箱: {profile.email or '-'}",
        f"- 电话: {profile.phone or '-'}",
        f"- 城市: {profile.city or '-'}",
        f"- GitHub: {profile.github or '-'}",
        "",
        "## 个人总结",
        content.summary or "-",
    ]

    sections = [
        ("技能", content.skills),
        ("项目", content.projects),
        ("实习", content.internships),
        ("奖项", content.awards),
        ("论文", content.papers),
    ]
    for title, items in sections:
        lines.extend(["", f"## {title}"])
        if not items:
            lines.append("- -")
            continue
        for item in items:
            lines.extend([f"- {item.title}", f"  {item.content}"])
    return "\n".join(lines)


def _export_target(state: CopilotState, target: str, export_format: str) -> tuple[str, str, str]:
    normalized_target = (target or "resume").strip().lower()
    normalized_format = (export_format or "html").strip().lower()

    if normalized_target == "resume":
        if normalized_format == "html":
            if not state.resume_html.html:
                raise HTTPException(status_code=404, detail="简历 HTML 尚未生成")
            return state.resume_html.html, "text/html", _resume_export_filename(state, "html")
        if normalized_format == "json":
            return _export_resume_json(state), "application/json", _resume_export_filename(state, "json")
        if normalized_format in {"markdown", "md"}:
            return _export_resume_markdown(state), "text/markdown", _resume_export_filename(state, "md")
        if normalized_format == "pdf":
            raise HTTPException(
                status_code=400,
                detail="PDF 为二进制格式，请使用 POST /api/export/pdf 或 format=pdf 的统一导出接口",
            )
        if normalized_format == "docx":
            raise HTTPException(
                status_code=400,
                detail="DOCX 为二进制格式，请使用 POST /api/export/docx 或 format=docx 的统一导出接口",
            )
        raise HTTPException(status_code=400, detail=f"简历导出不支持格式: {export_format}")

    if normalized_target == "job":
        if state.job is None:
            raise HTTPException(status_code=404, detail="岗位解析尚未生成")
        if normalized_format == "json":
            return _export_job_json(state.job), "application/json", "job-analysis.json"
        if normalized_format == "txt":
            return _export_job_text(state.job), "text/plain", "job-analysis.txt"
        if normalized_format in {"markdown", "md"}:
            return _export_job_markdown(state.job), "text/markdown", "job-analysis.md"
        raise HTTPException(status_code=400, detail=f"岗位解析导出不支持格式: {export_format}")

    if normalized_target == "gaps":
        if not state.gaps and not state.questions_to_ask:
            raise HTTPException(status_code=404, detail="缺失信息尚未生成")
        if normalized_format == "json":
            return _export_gaps_json(state.gaps, state.questions_to_ask), "application/json", "gaps.json"
        if normalized_format == "txt":
            return _export_gaps_text(state.gaps, state.questions_to_ask), "text/plain", "gaps.txt"
        if normalized_format in {"markdown", "md"}:
            return _export_gaps_markdown(state.gaps, state.questions_to_ask), "text/markdown", "gaps.md"
        raise HTTPException(status_code=400, detail=f"缺失信息导出不支持格式: {export_format}")

    if normalized_target == "interview":
        if not state.interview_qa:
            raise HTTPException(status_code=404, detail="面试问答尚未生成")
        if normalized_format == "json":
            return _export_interview_json(state.interview_qa), "application/json", "interview-qa.json"
        if normalized_format == "txt":
            return _export_interview_text(state.interview_qa), "text/plain", "interview-qa.txt"
        if normalized_format in {"markdown", "md"}:
            return _export_interview_markdown(state.interview_qa), "text/markdown", "interview-qa.md"
        raise HTTPException(status_code=400, detail=f"面试问答导出不支持格式: {export_format}")

    raise HTTPException(status_code=400, detail=f"不支持的导出对象: {target}")


@router.post("/export")
async def export_resume(req: ExportRequest, request: Request):
    """导出简历、岗位解析、缺失信息或面试问答。"""
    state = await _load_session_state(req.session_id, request)
    normalized_target = (req.target or "resume").strip().lower()
    normalized_format = (req.format or "html").strip().lower()

    if normalized_target == "resume" and normalized_format == "pdf":
        content, media_type, filename = _export_resume_pdf(state)
        return _build_binary_response(content, media_type, filename)
    if normalized_target == "resume" and normalized_format == "docx":
        content, media_type, filename = _export_resume_docx(state)
        return _build_binary_response(content, media_type, filename)

    content, media_type, filename = _export_target(state, req.target, req.format)
    return _build_response(content, media_type, filename)


@router.post("/export/pdf")
async def export_resume_pdf(req: SessionExportRequest, request: Request):
    """导出简历 PDF（由 HTML 渲染）。"""
    state = await _load_session_state(req.session_id, request)
    pdf_bytes, media_type, filename = _export_resume_pdf(state)
    return _build_binary_response(pdf_bytes, media_type, filename)


@router.post("/export/docx")
async def export_resume_docx(req: SessionExportRequest, request: Request):
    """导出简历 DOCX（由结构化 JSON 生成）。"""
    state = await _load_session_state(req.session_id, request)
    docx_bytes, media_type, filename = _export_resume_docx(state)
    return _build_binary_response(docx_bytes, media_type, filename)


@router.get("/export/capabilities")
async def export_capabilities():
    """返回当前环境的导出能力（供前端判断是否可用服务端 PDF）。"""
    from tools.resume_export import weasyprint_available

    return {
        "pdf": weasyprint_available(),
        "docx": True,
        "formats": {
            "resume": ["html", "json", "markdown", "md", "pdf", "docx"],
            "job": ["json", "txt", "markdown", "md"],
            "gaps": ["json", "txt", "markdown", "md"],
            "interview": ["json", "txt", "markdown", "md"],
        },
    }
