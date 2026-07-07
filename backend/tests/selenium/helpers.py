"""Shared helpers for Selenium E2E tests."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

import requests
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.common.by import By
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

REPO_ROOT = Path(__file__).resolve().parents[3]
AIXI_DIR = REPO_ROOT / "test-data" / "aixi"
OUTPUT_DIR = Path(__file__).resolve().parents[1] / "output" / "selenium"

STATIC_BASE = os.getenv("STATIC_BASE", "http://127.0.0.1:8080")
API_BASE = os.getenv("API_BASE", "http://127.0.0.1:8000")
NODE_API_BASE = os.getenv("NODE_API_BASE", "http://127.0.0.1:3000")
SKIP_LLM = os.getenv("SKIP_LLM", "0") != "0"
HEADLESS = os.getenv("HEADLESS", "1") != "0"
LLM_TIMEOUT = int(os.getenv("SELENIUM_LLM_TIMEOUT", "300"))


def load_aixi_manifest() -> dict[str, Any]:
    return json.loads((AIXI_DIR / "resume-manifest.json").read_text(encoding="utf-8"))


def load_target_config() -> dict[str, Any]:
    return json.loads((AIXI_DIR / "target-config.json").read_text(encoding="utf-8"))


def load_target_jd() -> str:
    return (AIXI_DIR / "target-jd.txt").read_text(encoding="utf-8").strip()


def resolve_asset_path(raw_path: str) -> Path:
    """Resolve test asset: manifest absolute path → aixi dir basename → raw path."""
    p = Path(raw_path)
    if p.is_file():
        return p
    local = AIXI_DIR / p.name
    if local.is_file():
        return local
    return p


def first_available_resume() -> tuple[str, Path]:
    manifest = load_aixi_manifest()
    for item in manifest.get("resumeFiles", []):
        path = resolve_asset_path(item["path"])
        if path.is_file():
            return item.get("label", path.name), path
    raise FileNotFoundError(
        "No resume file found. Copy resumes into test-data/aixi/ or fix resume-manifest.json paths."
    )


def profile_photo_path() -> Path:
    manifest = load_aixi_manifest()
    photo = manifest.get("profilePhoto") or {}
    rel = photo.get("path", "profile-photo.jpg")
    return resolve_asset_path(str(AIXI_DIR / rel if not Path(rel).is_absolute() else rel))


def check_node_api() -> tuple[bool, str]:
    try:
        health = requests.get(f"{NODE_API_BASE}/health", timeout=5)
        if health.status_code != 200:
            return False, f"Node API health returned {health.status_code} at {NODE_API_BASE}"
    except requests.RequestException as exc:
        return False, f"Node API unreachable ({NODE_API_BASE}): {exc}"
    return True, "ok"


def check_services(*, require_node: bool = False) -> tuple[bool, str]:
    try:
        static = requests.get(f"{STATIC_BASE}/individual/demo-resume-generator.html", timeout=5)
        if static.status_code != 200:
            return False, f"Static server returned {static.status_code} at {STATIC_BASE}"
    except requests.RequestException as exc:
        return False, f"Static server unreachable ({STATIC_BASE}): {exc}"

    try:
        health = requests.get(f"{API_BASE}/health", timeout=5)
        if health.status_code != 200:
            return False, f"API health returned {health.status_code} at {API_BASE}"
    except requests.RequestException as exc:
        return False, f"API unreachable ({API_BASE}): {exc}"

    if require_node:
        ok, msg = check_node_api()
        if not ok:
            return False, msg

    return True, "ok"


def dismiss_site_guide(driver: WebDriver) -> None:
    driver.execute_script(
        """
        try {
          ['home', 'individual', 'corporate'].forEach(function (p) {
            localStorage.setItem('gba_site_guide_v1_' + p, 'done');
          });
        } catch (e) {}
        var overlay = document.getElementById('gba-guide-overlay');
        if (overlay) overlay.remove();
        document.body.classList.remove('gba-guide-active');
        var accessModal = document.getElementById('gba-access-modal');
        if (accessModal) accessModal.remove();
        var closeBtn = document.getElementById('gba-access-modal-close');
        if (closeBtn) closeBtn.click();
        """
    )


def dismiss_access_modal(driver: WebDriver) -> None:
    """Close platform access / donation gate modal if shown."""
    dismiss_site_guide(driver)
    try:
        close = driver.find_elements(By.ID, "gba-access-modal-close")
        if close and close[0].is_displayed():
            close[0].click()
            sleep_brief(0.3)
    except Exception:
        pass
    dismiss_site_guide(driver)


def wait_for_i18n(driver: WebDriver, timeout: int = 15) -> None:
    WebDriverWait(driver, timeout).until(
        lambda d: d.execute_script("return !!(window.GBAI18n && GBAI18n.getLang);")
    )


def switch_ui_language(driver: WebDriver, lang: str) -> None:
    """Click header language switcher (en | zh-CN | zh-TW | pt)."""
    toggle = WebDriverWait(driver, 10).until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, "#header-lang-slot .language-selector button"))
    )
    toggle.click()
    option = WebDriverWait(driver, 10).until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, f'.language-dropdown [data-lang="{lang}"]'))
    )
    option.click()
    WebDriverWait(driver, 10).until(
        lambda d: d.execute_script("return window.GBAI18n.getLang();") == lang
    )


def wait_loading_hidden(driver: WebDriver, timeout: int | None = None) -> None:
    timeout = timeout or LLM_TIMEOUT
    try:
        WebDriverWait(driver, 5).until(
            EC.visibility_of_element_located((By.ID, "loading-overlay"))
        )
    except TimeoutException:
        return
    WebDriverWait(driver, timeout).until(
        EC.invisibility_of_element_located((By.ID, "loading-overlay"))
    )


def click_by_id(driver: WebDriver, element_id: str) -> None:
    el = WebDriverWait(driver, 15).until(EC.element_to_be_clickable((By.ID, element_id)))
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", el)
    el.click()


def send_file_to_input(driver: WebDriver, input_id: str, file_path: Path) -> None:
    inp = WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.ID, input_id)))
    inp.send_keys(str(file_path.resolve()))


def js_get_lang(driver: WebDriver) -> str:
    return driver.execute_script("return window.GBAI18n && GBAI18n.getLang();") or ""


def js_resume_lang_badge(driver: WebDriver) -> str:
    return driver.execute_script(
        "var b=document.getElementById('resume-language-badge');"
        "return b ? (b.getAttribute('data-active-lang') || b.textContent || '') : '';"
    )


def wait_session_started(driver: WebDriver, timeout: int = 30) -> str:
    def _sid(d: WebDriver) -> bool:
        sid = d.find_element(By.ID, "session-id").text.strip()
        return sid not in ("", "Not started", "未开始")

    WebDriverWait(driver, timeout).until(_sid)
    return driver.find_element(By.ID, "session-id").text.strip()


def accept_alerts(driver: WebDriver) -> None:
    try:
        alert = driver.switch_to.alert
        alert.accept()
    except Exception:
        pass


def newest_file_in(dir_path: Path, since: float) -> Path | None:
    candidates = [p for p in dir_path.glob("*") if p.is_file() and p.stat().st_mtime >= since]
    if not candidates:
        return None
    return max(candidates, key=lambda p: p.stat().st_mtime)


def configure_chrome_downloads(download_dir: Path) -> dict[str, Any]:
    download_dir.mkdir(parents=True, exist_ok=True)
    return {
        "download.default_directory": str(download_dir.resolve()),
        "download.prompt_for_download": False,
        "download.directory_upgrade": True,
        "safebrowsing.enabled": True,
    }


def sleep_brief(seconds: float = 0.5) -> None:
    time.sleep(seconds)
