"""Resume export helpers — HTML → PDF, ResumeContent → DOCX."""

from __future__ import annotations

import io
import os
from pathlib import Path
from typing import TYPE_CHECKING

from tools.resume_layout import SECTION_LABELS, normalize_language

if TYPE_CHECKING:
    from workflow.state import ResumeContent

_TEMPLATE_DIR = Path(__file__).parent.parent / "templates"
_MSYS2_DLL_DIRS = (
    Path(r"C:\msys64\mingw64\bin"),
    Path(r"C:\msys64\ucrt64\bin"),
)


def _ensure_weasyprint_dll_path() -> None:
    """On Windows, point WeasyPrint to MSYS2 Pango DLLs when env is unset."""
    if os.name != "nt" or os.environ.get("WEASYPRINT_DLL_DIRECTORIES"):
        return
    for dll_dir in _MSYS2_DLL_DIRS:
        if (dll_dir / "libpango-1.0-0.dll").exists():
            os.environ["WEASYPRINT_DLL_DIRECTORIES"] = str(dll_dir)
            return


def html_to_pdf_bytes(html: str) -> bytes:
    """Convert resume HTML to PDF bytes via WeasyPrint."""
    _ensure_weasyprint_dll_path()
    from weasyprint import HTML

    return HTML(string=html, base_url=str(_TEMPLATE_DIR)).write_pdf()


def resume_content_to_docx_bytes(content: "ResumeContent") -> bytes:
    """Build a Word document from structured resume content."""
    from docx import Document
    from docx.shared import Pt

    lang = normalize_language(content.meta.language)
    labels = SECTION_LABELS.get(lang, SECTION_LABELS["zh"])
    doc = Document()
    normal = doc.styles["Normal"]
    normal.font.name = "Source Han Sans"
    normal.font.size = Pt(11)

    profile = content.profile
    title = doc.add_heading(profile.name or "Resume", level=0)
    title.runs[0].font.size = Pt(18)

    contact_parts = [
        profile.email,
        profile.phone,
        profile.city,
        profile.github,
        profile.linkedin,
        profile.address,
    ]
    contact = " | ".join(part for part in contact_parts if part)
    if contact:
        doc.add_paragraph(contact)

    for edu in profile.education:
        line = " · ".join(
            part for part in [edu.school, edu.major, edu.degree, f"{edu.start_date} - {edu.end_date}"] if part
        )
        if line:
            doc.add_paragraph(line)

    if content.summary:
        doc.add_heading(labels["summary"], level=1)
        doc.add_paragraph(content.summary)

    sections = [
        ("skills", content.skills),
        ("projects", content.projects),
        ("internships", content.internships),
        ("awards", content.awards),
        ("papers", content.papers),
    ]
    for key, items in sections:
        if not items:
            continue
        doc.add_heading(labels.get(key, key), level=1)
        for item in items:
            p = doc.add_paragraph()
            run = p.add_run(item.title)
            run.bold = True
            if item.content:
                doc.add_paragraph(item.content)

    buffer = io.BytesIO()
    doc.save(buffer)
    return buffer.getvalue()
