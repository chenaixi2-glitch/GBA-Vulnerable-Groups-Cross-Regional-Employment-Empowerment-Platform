"""
导出格式验证脚本 — 简历优化 / 中英文互转后的 JSON、MD、DOCX。

Usage (from backend/):
  python tests/run_export_format_check.py

若后端已启动 (localhost:8000)，会额外尝试 HTTP 导出（需有效 session_id）。
"""

from __future__ import annotations

import json
import sys
import zipfile
from io import BytesIO
from pathlib import Path

import requests

_REPO = Path(__file__).resolve().parents[2]
_BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_BACKEND))

from api.export import _export_resume_docx, _export_resume_json, _export_resume_markdown  # noqa: E402
from tests.test_resume_export_formats import (  # noqa: E402
    _state_from_resume,
    _zh_translated_from_en,
)
from workflow.state import CopilotState  # noqa: E402

BASE_URL = "http://localhost:8000"
OUT_DIR = Path(__file__).resolve().parent / "output" / "export_formats"
_GOLDEN = json.loads(
    (_BACKEND / "evaluation" / "resume_rag" / "fixtures" / "golden_cases.json").read_text(encoding="utf-8")
)


def _load_states() -> tuple[CopilotState, CopilotState]:
    case = next(c for c in _GOLDEN if c["id"] == "aixi_ai_application_dev")
    html_path = _REPO / "test-data" / "alex-chen" / "resume-en.html"
    html = html_path.read_text(encoding="utf-8") if html_path.exists() else "<div>resume</div>"
    optimized = _state_from_resume(case["resume_after"], html)
    translated = _state_from_resume(_zh_translated_from_en(case["resume_after"]), "<div>中文简历</div>")
    return optimized, translated


def _save_local_exports(label: str, state: CopilotState) -> dict[str, bool]:
    results: dict[str, bool] = {}
    prefix = OUT_DIR / label

    json_text = _export_resume_json(state)
    json_path = prefix.with_suffix(".json")
    json_path.write_text(json_text, encoding="utf-8")
    parsed = json.loads(json_text)
    results["json"] = bool(parsed.get("profile", {}).get("name"))

    md_text = _export_resume_markdown(state)
    md_path = prefix.with_suffix(".md")
    md_path.write_text(md_text, encoding="utf-8")
    results["md"] = md_text.startswith("# 简历内容")

    docx_bytes, _, filename = _export_resume_docx(state)
    docx_path = OUT_DIR / f"{label}_{filename}"
    docx_path.write_bytes(docx_bytes)
    with zipfile.ZipFile(BytesIO(docx_bytes)) as zf:
        results["docx"] = "word/document.xml" in zf.namelist()

    print(f"  [{label}] json={json_path.name} md={md_path.name} docx={docx_path.name}")
    return results


def _try_api_export(session_id: str) -> None:
    print("\n[HTTP] 尝试 API 导出 (session_id 来自 E2E)...")
    for fmt in ("json", "markdown", "docx"):
        try:
            if fmt == "docx":
                r = requests.post(
                    f"{BASE_URL}/api/export/docx",
                    json={"session_id": session_id},
                    timeout=30,
                )
            else:
                r = requests.post(
                    f"{BASE_URL}/api/export",
                    json={"session_id": session_id, "format": fmt, "target": "resume"},
                    timeout=30,
                )
            ok = r.status_code == 200 and len(r.content) > 50
            print(f"  {'[OK]' if ok else '[FAIL]'} POST export {fmt}: status={r.status_code}, bytes={len(r.content)}")
        except Exception as exc:
            print(f"  [SKIP] POST export {fmt}: {exc}")


def main() -> int:
    print("=" * 60)
    print("  简历导出格式检查 — JSON / MD / DOCX")
    print("=" * 60)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    optimized, translated = _load_states()

    print("\n[1] 简历优化后导出 (英文)")
    opt_results = _save_local_exports("optimized_en", optimized)

    print("\n[2] 中英文互转后导出 (中文)")
    trans_results = _save_local_exports("translated_zh", translated)

    all_ok = all(opt_results.values()) and all(trans_results.values())
    print(f"\n  本地导出: {'PASS' if all_ok else 'FAIL'}")
    print(f"  输出目录: {OUT_DIR}")

    try:
        health = requests.get(f"{BASE_URL}/health", timeout=3)
        if health.status_code == 200:
            print(f"\n[OK] Backend 在线: {health.json()}")
            session_file = Path(__file__).resolve().parent / "output" / "aixi_resumes" / ".last_session"
            if session_file.exists():
                sid = session_file.read_text(encoding="utf-8").strip()
                if sid:
                    _try_api_export(sid)
            else:
                print("  [SKIP] 无 session_id — 先运行 python tests/test_aixi_resumes.py 生成会话")
        else:
            print("\n[SKIP] Backend 未就绪，跳过 HTTP 导出测试")
    except Exception:
        print("\n[SKIP] Backend 未启动 (localhost:8000)，仅完成本地导出验证")

    print("=" * 60)
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
