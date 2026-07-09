"""DeepSeek-OCR 文档解析 — 通过 SiliconFlow OpenAI 兼容 API。"""

from __future__ import annotations

import base64
import json
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from config_loader import get_resume_parse_config
from log import get_logger

logger = get_logger("app")

_OCR_PROMPTS = {
    "free_ocr": "<|free_ocr|>Convert the document to markdown.",
    "grounding": "<|grounding|>Convert the document to markdown.",
}


def parse_pdf_bytes_with_ocr(data: bytes, filename: str = "") -> str:
    """使用 DeepSeek-OCR 解析 PDF 字节流，多页并行 OCR，以 --- 分隔。"""
    cfg = get_resume_parse_config()
    if not cfg.get("api_key"):
        raise RuntimeError("resume_parse API key is not configured (SILICONFLOW_API_KEY)")

    page_images = _pdf_to_png_base64_list(data, dpi=int(cfg.get("ocr_dpi", 200)))
    if not page_images:
        raise ValueError("PDF contains no renderable pages")

    mode = str(cfg.get("ocr_mode", "grounding")).strip().lower()
    prompt = _OCR_PROMPTS.get(mode, _OCR_PROMPTS["grounding"])
    workers = max(1, int(cfg.get("ocr_parallel_workers", 4)))

    page_texts: list[str | None] = [None] * len(page_images)
    with ThreadPoolExecutor(max_workers=min(workers, len(page_images))) as executor:
        futures = {
            executor.submit(
                _ocr_image_base64,
                image_b64,
                cfg,
                prompt=prompt,
                page_no=page_no,
                filename=filename,
            ): page_no
            for page_no, image_b64 in enumerate(page_images, start=1)
        }
        for future in as_completed(futures):
            page_no = futures[future]
            text = future.result()
            if text.strip():
                page_texts[page_no - 1] = text.strip()

    result = "\n\n---\n\n".join(text for text in page_texts if text)
    logger.info(
        "DeepSeek-OCR parsed PDF %s (%d pages, %d workers, %d chars)",
        filename or "(bytes)",
        len(page_images),
        min(workers, len(page_images)),
        len(result),
    )
    return result


def _pdf_to_png_base64_list(data: bytes, *, dpi: int = 200) -> list[str]:
    try:
        import fitz
    except ImportError as exc:
        raise RuntimeError("pymupdf is required for DeepSeek-OCR PDF parsing") from exc

    doc = fitz.open(stream=data, filetype="pdf")
    images: list[str] = []
    zoom = max(dpi, 72) / 72.0
    matrix = fitz.Matrix(zoom, zoom)
    for page in doc:
        pix = page.get_pixmap(matrix=matrix, alpha=False)
        images.append(base64.b64encode(pix.tobytes("png")).decode("ascii"))
    return images


def _ocr_image_base64(
    image_b64: str,
    cfg: dict[str, Any],
    *,
    prompt: str,
    page_no: int,
    filename: str,
) -> str:
    api_base = str(cfg.get("api_base", "")).rstrip("/")
    if not api_base:
        raise RuntimeError("resume_parse.api_base is not configured")

    url = f"{api_base}/chat/completions"
    body = {
        "model": cfg["model"],
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/png;base64,{image_b64}"},
                    },
                ],
            }
        ],
        "max_tokens": int(cfg.get("max_tokens", 8192)),
        "temperature": float(cfg.get("temperature", 0.0)),
    }

    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {cfg['api_key']}",
        },
        method="POST",
    )
    timeout = cfg.get("timeout") or 180
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"DeepSeek-OCR request failed for {filename or 'pdf'} page {page_no}: HTTP {exc.code} {detail}"
        ) from exc

    choices = payload.get("choices") or []
    if not choices:
        raise RuntimeError(f"DeepSeek-OCR returned no choices for {filename or 'pdf'} page {page_no}")

    message = choices[0].get("message") or {}
    content = message.get("content", "")
    if isinstance(content, list):
        parts = []
        for part in content:
            if isinstance(part, dict):
                parts.append(str(part.get("text", "")))
            else:
                parts.append(str(part))
        return "".join(parts).strip()
    return str(content).strip()
