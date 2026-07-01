"""Tests for resume PDF/DOCX export helpers."""

from __future__ import annotations

import pytest

from tools.resume_export import (
    WeasyPrintUnavailableError,
    build_content_disposition,
    count_pdf_pages_from_html,
    html_to_pdf_bytes,
    prepare_html_for_pdf,
    sanitize_export_filename,
    weasyprint_available,
)
from tests.fixtures.test_samples import SAMPLE_RESUME_HTML


class TestPrepareHtmlForPdf:
    def test_wraps_fragment_html(self):
        fragment = "<div><h1>Test</h1></div>"
        result = prepare_html_for_pdf(fragment)
        assert "<!DOCTYPE html>" in result or "<html" in result.lower()
        assert "Test" in result
        assert "WeasyPrint PDF overrides" in result

    def test_injects_css_into_existing_document(self):
        html = "<!DOCTYPE html><html><head></head><body><p>Hi</p></body></html>"
        result = prepare_html_for_pdf(html)
        assert result.count("WeasyPrint PDF overrides") == 1
        assert "Hi" in result

    def test_strips_dark_theme_class(self):
        html = '<html class="dark"><body class="dark"><p>x</p></body></html>'
        result = prepare_html_for_pdf(html)
        assert 'class="dark"' not in result

    def test_rejects_empty_html(self):
        with pytest.raises(ValueError, match="为空"):
            prepare_html_for_pdf("   ")


class TestSanitizeExportFilename:
    def test_uses_name_and_ext(self):
        assert sanitize_export_filename("陈晓 Alex", "pdf") == "陈晓 Alex.pdf"

    def test_strips_invalid_chars(self):
        assert sanitize_export_filename('bad<>name', "pdf") == "badname.pdf"

    def test_fallback_when_empty(self):
        assert sanitize_export_filename("", "pdf") == "resume.pdf"


class TestContentDisposition:
    def test_includes_utf8_filename_star(self):
        header = build_content_disposition("陈晓.pdf")
        assert "filename*=" in header
        assert "attachment" in header


@pytest.mark.skipif(not weasyprint_available(), reason="WeasyPrint native libs not installed")
class TestPdfGeneration:
    def test_html_to_pdf_produces_valid_pdf(self):
        html = prepare_html_for_pdf(SAMPLE_RESUME_HTML)
        pdf = html_to_pdf_bytes(html)
        assert pdf[:4] == b"%PDF"
        assert len(pdf) > 500

    def test_full_template_like_html(self):
        html = prepare_html_for_pdf(
            '<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8">'
            '<style>@page { size: A4; margin: 20mm; }</style></head>'
            "<body><h1>测试简历</h1><p>中文内容 PDF 导出</p></body></html>"
        )
        pdf = html_to_pdf_bytes(html)
        assert pdf[:4] == b"%PDF"

    def test_count_pdf_pages_short_html(self):
        html = prepare_html_for_pdf(
            '<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"></head>'
            "<body><p>短内容</p></body></html>"
        )
        pages = count_pdf_pages_from_html(html)
        assert pages == 1


class TestWeasyPrintUnavailable:
    def test_install_hint_is_actionable(self):
        assert "install-weasyprint" in WeasyPrintUnavailableError.INSTALL_HINT
