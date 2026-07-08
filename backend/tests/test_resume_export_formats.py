"""简历优化 / 中英文互转后的 JSON、Markdown、DOCX 导出测试。"""

from __future__ import annotations

import json
import zipfile
from io import BytesIO
from pathlib import Path

import pytest

from api.export import (
    _export_resume_docx,
    _export_resume_json,
    _export_resume_markdown,
)
from tools.resume_export import html_to_docx_bytes
from workflow.state import CopilotState, ResumeContent

_FIXTURES = Path(__file__).resolve().parents[1] / "evaluation" / "resume_rag" / "fixtures" / "golden_cases.json"
_GOLDEN = json.loads(_FIXTURES.read_text(encoding="utf-8"))


def _state_from_resume(resume_dict: dict, html: str = "<div>resume</div>") -> CopilotState:
    content = ResumeContent.model_validate(resume_dict)
    return CopilotState(
        resume_content_json=content,
        resume_html={"html": html},
    )


def _zh_translated_from_en(en_resume: dict) -> dict:
    """模拟中英文互转后的中文简历结构。"""
    data = json.loads(json.dumps(en_resume))
    data["profile"]["name"] = "陈晓"
    data["profile"]["city"] = "深圳"
    data["summary"] = "具备 Python 与数据分析经验的经济学毕业生，正转向 AI 应用开发方向。"
    data["skills"] = [
        {
            "id": "skill_1",
            "title": "技术技能",
            "content": "Python、SQL、REST API、数据分析、Prompt 工程基础",
        }
    ]
    data["internships"] = [
        {
            "id": "intern_1",
            "title": "金融数据分析师实习生",
            "content": "使用 Python 脚本自动化 Excel 报表，将手工报表工作量降低 30%。",
        }
    ]
    data["projects"] = [
        {
            "id": "proj_1",
            "title": "合规 FAQ 聊天机器人原型",
            "content": "基于 Python 与 REST API 构建内部 FAQ 助手，探索 RAG 检索合规文档。",
        }
    ]
    data["meta"]["language"] = "zh"
    data["meta"]["target_role"] = "AI 应用开发工程师"
    return data


@pytest.fixture
def optimized_en_state() -> CopilotState:
    case = next(c for c in _GOLDEN if c["id"] == "aixi_ai_application_dev")
    html = Path(__file__).resolve().parents[2] / "test-data" / "alex-chen" / "resume-en.html"
    return _state_from_resume(case["resume_after"], html.read_text(encoding="utf-8"))


@pytest.fixture
def translated_zh_state(optimized_en_state: CopilotState) -> CopilotState:
    zh = _zh_translated_from_en(optimized_en_state.resume_content_json.model_dump())
    return _state_from_resume(zh, "<div><h1>陈晓</h1><p>中文简历</p></div>")


class TestOptimizedResumeExport:
    """简历优化完成后的导出。"""

    def test_json_contains_profile_and_meta(self, optimized_en_state: CopilotState):
        raw = _export_resume_json(optimized_en_state)
        data = json.loads(raw)
        assert data["profile"]["name"] == "Chen Aixi"
        assert data["meta"]["language"] == "en"
        assert data["meta"]["target_role"] == "AI Application Development Engineer"
        assert len(data["projects"]) >= 1

    def test_markdown_has_sections(self, optimized_en_state: CopilotState):
        md = _export_resume_markdown(optimized_en_state)
        assert "# 简历内容" in md
        assert "## 基本信息" in md
        assert "Chen Aixi" in md
        assert "## 项目" in md

    def test_docx_is_valid_word_file(self, optimized_en_state: CopilotState):
        docx_bytes, media_type, filename = _export_resume_docx(optimized_en_state)
        assert media_type.endswith("wordprocessingml.document")
        assert filename.endswith(".docx")
        assert docx_bytes[:2] == b"PK"
        with zipfile.ZipFile(BytesIO(docx_bytes)) as zf:
            names = zf.namelist()
            assert "word/document.xml" in names
            xml = zf.read("word/document.xml").decode("utf-8")
            assert "Alex Chen" in xml or "Chen" in xml or "Compliance" in xml

    def test_docx_via_tool_matches_api(self, optimized_en_state: CopilotState):
        api_bytes, _, _ = _export_resume_docx(optimized_en_state)
        tool_bytes = html_to_docx_bytes(optimized_en_state.resume_html.html)
        assert len(api_bytes) > 2000
        assert len(tool_bytes) > 2000
        for payload in (api_bytes, tool_bytes):
            with zipfile.ZipFile(BytesIO(payload)) as zf:
                xml = zf.read("word/document.xml").decode("utf-8")
                assert "Alex Chen" in xml or "Chen" in xml

    def test_docx_requires_html(self, optimized_en_state: CopilotState):
        state = CopilotState(
            resume_content_json=optimized_en_state.resume_content_json,
            resume_html={"html": ""},
        )
        with pytest.raises(Exception) as exc:
            _export_resume_docx(state)
        assert "HTML" in str(exc.value)


class TestTranslatedResumeExport:
    """中英文互转后的导出。"""

    def test_json_language_is_zh(self, translated_zh_state: CopilotState):
        data = json.loads(_export_resume_json(translated_zh_state))
        assert data["meta"]["language"] == "zh"
        assert data["profile"]["name"] == "陈晓"
        assert "Python" in data["skills"][0]["content"]

    def test_markdown_contains_chinese_content(self, translated_zh_state: CopilotState):
        md = _export_resume_markdown(translated_zh_state)
        assert "陈晓" in md
        assert "合规 FAQ" in md or "聊天机器人" in md
        assert "## 技能" in md

    def test_docx_contains_chinese_text(self, translated_zh_state: CopilotState):
        docx_bytes, _, filename = _export_resume_docx(translated_zh_state)
        assert filename.endswith(".docx")
        with zipfile.ZipFile(BytesIO(docx_bytes)) as zf:
            xml = zf.read("word/document.xml").decode("utf-8")
            assert "陈晓" in xml or "Python" in xml


class TestExportEdgeCases:
    def test_json_raises_when_no_content(self):
        state = CopilotState()
        with pytest.raises(Exception) as exc:
            _export_resume_json(state)
        assert "尚未生成" in str(exc.value)

    def test_markdown_format_alias(self, optimized_en_state: CopilotState):
        md = _export_resume_markdown(optimized_en_state)
        assert md.startswith("# 简历内容")

    def test_minimal_resume_docx(self):
        html = "<h1>Test User</h1><p>Brief summary</p><p>Python</p>"
        docx = html_to_docx_bytes(html)
        assert docx[:2] == b"PK"
        assert len(docx) > 2000
        with zipfile.ZipFile(BytesIO(docx)) as zf:
            xml = zf.read("word/document.xml").decode("utf-8")
            assert "Test User" in xml
