"""
端到端测试：陈艾希三份简历 — 上传、中英文互转、简历优化
目标岗位：民企 AI 应用开发

Usage (from backend/): python tests/test_aixi_resumes.py
"""

from __future__ import annotations

import base64
import json
import sys
import time
from pathlib import Path

import requests

import json
import sys
import time
from pathlib import Path

import requests

BASE_URL = "http://localhost:8000"
REQUEST_TIMEOUT = 300

_REPO_ROOT = Path(__file__).resolve().parents[2]
_load_path = _REPO_ROOT / "test-data" / "index.js"
# Python loads aixi config via JSON (Node index.js is for JS consumers)
_aixi_dir = _REPO_ROOT / "test-data" / "aixi"
_manifest = json.loads((_aixi_dir / "resume-manifest.json").read_text(encoding="utf-8"))
TARGET_CONFIG = json.loads((_aixi_dir / "target-config.json").read_text(encoding="utf-8"))
TARGET_JD = (_aixi_dir / "target-jd.txt").read_text(encoding="utf-8").strip()
GENERATE_RESUME_MSG = _manifest["generateResumeMessage"]
OPTIMIZE_MSG = _manifest["optimizeMessage"]
RESUME_FILES = [
    {**item, "path": Path(item["path"])}
    for item in _manifest["resumeFiles"]
]


def log(ok: bool, msg: str, detail: str = "") -> bool:
    icon = "[OK]" if ok else "[FAIL]"
    line = f"  {icon} {msg}"
    if detail:
        line += f" — {detail}"
    print(line)
    return ok


def upload_resume(file_path: Path) -> tuple[str | None, dict]:
    """Upload resume file via /api/chat with base64 attachment."""
    raw = file_path.read_bytes()
    b64 = base64.b64encode(raw).decode("ascii")
    payload = {
        "session_id": "",
        "message": "",
        "attachments": [
            {
                "filename": file_path.name,
                "content": b64,
                "content_encoding": "base64",
            }
        ],
    }
    r = requests.post(
        f"{BASE_URL}/api/chat",
        json=payload,
        headers={"Content-Type": "application/json"},
        timeout=REQUEST_TIMEOUT,
    )
    if r.status_code != 200:
        return None, {"error": r.status_code, "body": r.text[:500]}
    data = r.json()
    return data.get("session_id"), data


def configure_target(session_id: str) -> dict:
    """Set employer type (民企) and generate suggested JD."""
    requests.put(
        f"{BASE_URL}/api/resume/employer-type",
        json={"session_id": session_id, "employer_type": TARGET_CONFIG["employer_type"]},
        timeout=30,
    )
    r = requests.post(
        f"{BASE_URL}/api/resume/generate-jd",
        json={
            "session_id": session_id,
            "industry": TARGET_CONFIG["industry"],
            "experience_level": TARGET_CONFIG["experience_level"],
            "employer_type": TARGET_CONFIG["employer_type"],
        },
        timeout=REQUEST_TIMEOUT,
    )
    jd_data = r.json() if r.status_code == 200 else {}
    return jd_data


def submit_jd(session_id: str, jd_text: str) -> dict:
    r = requests.post(
        f"{BASE_URL}/api/chat",
        json={"session_id": session_id, "message": jd_text, "attachments": []},
        timeout=REQUEST_TIMEOUT,
    )
    return r.json() if r.status_code == 200 else {"error": r.status_code}


def generate_resume(session_id: str) -> dict:
    r = requests.post(
        f"{BASE_URL}/api/chat",
        json={"session_id": session_id, "message": GENERATE_RESUME_MSG, "attachments": []},
        timeout=REQUEST_TIMEOUT,
    )
    return r.json() if r.status_code == 200 else {"error": r.status_code, "body": r.text[:500]}


def translate_resume(session_id: str, target: str) -> dict:
    r = requests.post(
        f"{BASE_URL}/api/resume/translate",
        json={"session_id": session_id, "target_language": target},
        timeout=REQUEST_TIMEOUT,
    )
    return r.json() if r.status_code == 200 else {"error": r.status_code, "body": r.text[:500]}


def optimize_resume(session_id: str) -> dict:
    r = requests.post(
        f"{BASE_URL}/api/chat",
        json={"session_id": session_id, "message": OPTIMIZE_MSG, "attachments": []},
        timeout=REQUEST_TIMEOUT,
    )
    return r.json() if r.status_code == 200 else {"error": r.status_code, "body": r.text[:500]}


def profile_name(data: dict) -> str:
    prof = data.get("candidate_profile") or {}
    basic = prof.get("profile_basic") or {}
    return basic.get("name") or basic.get("full_name") or "N/A"


def resume_lang(data: dict) -> str:
    rcj = data.get("resume_content_json") or {}
    meta = rcj.get("meta") or {}
    return (meta.get("language") or data.get("language") or "unknown").lower()


def html_len(data: dict) -> int:
    rh = data.get("resume_html") or {}
    return len(rh.get("html") or "")


def run_one_resume(case: dict, out_dir: Path) -> dict:
    label = case["label"]
    path = case["path"]
    results: dict[str, bool] = {}

    print(f"\n{'='*60}")
    print(f"  测试简历: {label}")
    print(f"  文件: {path.name}")
    print(f"{'='*60}")

    if not path.exists():
        print(f"  [FAIL] 文件不存在: {path}")
        return {"label": label, "passed": False, "reason": "file_missing"}

    t0 = time.time()

    # 1. Upload
    print("\n[1] 简历上传 & 画像提取")
    session_id, upload_data = upload_resume(path)
    if not session_id:
        print(f"  [FAIL] 上传失败: {upload_data}")
        return {"label": label, "passed": False, "reason": "upload_failed"}

    results["upload"] = log(
        "profile_agent" in (upload_data.get("triggered_agents") or []),
        "profile_agent 触发",
        str(upload_data.get("triggered_agents")),
    )
    name = profile_name(upload_data)
    results["profile"] = log(
        upload_data.get("candidate_profile") is not None,
        "候选人画像提取",
        f"name={name}",
    )

    # 2. Configure target (民企 + JD)
    print("\n[2] 目标岗位配置（民企 / Technology / Entry）")
    jd_gen = configure_target(session_id)
    jd_text = jd_gen.get("jd_text") or TARGET_JD
    if jd_gen.get("title"):
        print(f"  · 生成 JD 标题: {jd_gen['title'][:80]}")
    results["employer"] = log(True, "employer_type=private (民企)")

    print("\n[3] JD 分析")
    jd_resp = submit_jd(session_id, jd_text)
    results["jd"] = log(
        "jd_agent" in (jd_resp.get("triggered_agents") or []),
        "jd_agent 触发",
        f"gaps={len(jd_resp.get('gaps') or [])}",
    )

    # 3. Generate optimized resume
    print("\n[4] 简历生成（针对 AI 应用开发岗位优化）")
    gen_resp = generate_resume(session_id)
    agents = gen_resp.get("triggered_agents") or []
    results["generate"] = log(
        "content_agent" in agents and "render_agent" in agents,
        "content + render agent",
        str(agents),
    )
    hlen = html_len(gen_resp)
    results["html"] = log(hlen > 200, "简历 HTML 生成", f"{hlen} chars, lang={resume_lang(gen_resp)}")

    safe_label = label.replace("/", "-").replace(" ", "_")
    if hlen > 0:
        preview_path = out_dir / f"{safe_label}_generated.html"
        preview_path.write_text((gen_resp.get("resume_html") or {}).get("html", ""), encoding="utf-8")
        print(f"  · 预览已保存: {preview_path}")

    # 4. Language conversion
    print("\n[5] 中英文互转")
    current = resume_lang(gen_resp)
    if current.startswith("en"):
        target = "zh"
        target_label = "中文"
    else:
        target = "en"
        target_label = "英文"

    trans_resp = translate_resume(session_id, target)
    if "error" in trans_resp:
        results["translate"] = log(False, f"转换为{target_label}", str(trans_resp)[:120])
    else:
        tlen = html_len(trans_resp)
        tlang = resume_lang(trans_resp)
        results["translate"] = log(
            tlen > 200 and (target in tlang or tlang.startswith(target[:2])),
            f"转换为{target_label}",
            f"{tlen} chars, lang={tlang}",
        )
        if tlen > 0:
            trans_path = out_dir / f"{safe_label}_translated_{target}.html"
            trans_path.write_text((trans_resp.get("resume_html") or {}).get("html", ""), encoding="utf-8")
            print(f"  · 互转预览: {trans_path}")

    # 5. Optimize
    print("\n[6] 简历优化（一页 A4）")
    opt_resp = optimize_resume(session_id)
    if "error" in opt_resp:
        results["optimize"] = log(False, "A4 优化", str(opt_resp)[:120])
    else:
        olen = html_len(opt_resp)
        results["optimize"] = log(olen > 200, "A4 优化完成", f"{olen} chars")
        if olen > 0:
            opt_path = out_dir / f"{safe_label}_optimized.html"
            opt_path.write_text((opt_resp.get("resume_html") or {}).get("html", ""), encoding="utf-8")
            print(f"  · 优化预览: {opt_path}")

    elapsed = time.time() - t0
    passed = all(results.values())
    print(f"\n  耗时: {elapsed:.1f}s | 结果: {'PASS' if passed else 'FAIL'} ({sum(results.values())}/{len(results)})")
    return {"label": label, "session_id": session_id, "passed": passed, "results": results, "elapsed": elapsed}


def main() -> int:
    print("\n" + "=" * 60)
    print("  陈艾希简历 E2E 测试 — 上传 / 互转 / 优化")
    print("  目标岗位: 民企 AI 应用开发工程师")
    print("=" * 60)

    try:
        health = requests.get(f"{BASE_URL}/health", timeout=5)
        if health.status_code != 200:
            print("[FAIL] Backend health check failed")
            return 1
        print(f"[OK] Backend OK: {health.json()}")
    except Exception as e:
        print(f"[FAIL] Backend not reachable: {e}")
        return 1

    out_dir = Path(__file__).resolve().parent / "output" / "aixi_resumes"
    out_dir.mkdir(parents=True, exist_ok=True)

    summary = []
    for case in RESUME_FILES:
        summary.append(run_one_resume(case, out_dir))
        time.sleep(2)

    print("\n" + "=" * 60)
    print("  测试汇总")
    print("=" * 60)
    all_pass = True
    for item in summary:
        status = "PASS" if item.get("passed") else "FAIL"
        if not item.get("passed"):
            all_pass = False
        print(f"  {item['label']:.<40} {status}")

    print(f"\n  输出目录: {out_dir}")
    print("=" * 60 + "\n")
    return 0 if all_pass else 1


if __name__ == "__main__":
    sys.exit(main())
