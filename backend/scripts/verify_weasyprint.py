"""Verify WeasyPrint can generate a PDF (run from backend/: python scripts/verify_weasyprint.py)."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from tools.resume_export import html_to_pdf_bytes, prepare_html_for_pdf, weasyprint_available  # noqa: E402


def main() -> int:
    sample = """
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"><style>
    body { font-family: sans-serif; padding: 24px; }
    h1 { color: #2563eb; }
    </style></head>
    <body>
    <h1>GBA Resume PDF Test</h1>
    <p>中文测试 · English test · 123</p>
    </body></html>
    """
    pdf = html_to_pdf_bytes(prepare_html_for_pdf(sample))
    if pdf[:4] != b"%PDF":
        print("FAIL: output is not a PDF")
        return 1
    if not weasyprint_available():
        print("WARN: WeasyPrint reported unavailable but PDF was generated")
    out = BACKEND_DIR / "log" / "weasyprint-test.pdf"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(pdf)
    print(f"OK: wrote {len(pdf)} bytes -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
