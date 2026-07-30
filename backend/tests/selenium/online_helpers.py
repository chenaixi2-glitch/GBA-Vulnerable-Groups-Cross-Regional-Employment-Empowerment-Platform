"""Helpers for Selenium E2E against deployed production (e.g. https://gba-vulnerable-groups-cross-regional-employment-empowerment.com)."""

from __future__ import annotations

import json
import os
from typing import Any
from urllib.parse import urljoin, urlparse

import requests
from selenium.webdriver.common.by import By
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

from tests.selenium.helpers import (
    OUTPUT_DIR,
    dismiss_site_guide,
    sleep_brief,
    wait_for_i18n,
)

# Default production URL from deployment
PRODUCTION_BASE = os.getenv(
    "PRODUCTION_BASE",
    "https://gba-vulnerable-groups-cross-regional-employment-empowerment.com",
).rstrip("/")
IS_PRODUCTION_E2E = os.getenv("RUN_PRODUCTION_E2E", "1") != "0"

# Python LLM API 经 nginx 同域代理 /api（浏览器访问真实网址即可，无需额外端口）
PYTHON_API_BASE = os.getenv("PRODUCTION_PYTHON_API", f"{PRODUCTION_BASE}/api").rstrip("/")

PRODUCTION_FINDINGS_MD = OUTPUT_DIR / "selenium_production_findings.md"


def static_url(path: str = "") -> str:
    path = path.lstrip("/")
    return f"{PRODUCTION_BASE}/{path}" if path else PRODUCTION_BASE


def _url_ok(url: str, timeout: float = 8) -> bool:
    try:
        res = requests.get(url, timeout=timeout)
        return res.status_code == 200
    except requests.RequestException:
        return False


def check_production_static() -> tuple[bool, str]:
    if _url_ok(static_url("index.html")):
        return True, "ok"
    return False, f"Static site unreachable at {PRODUCTION_BASE}"


def check_production_python_api() -> tuple[bool, str]:
    if _url_ok(f"{PRODUCTION_BASE}/health"):
        return True, "ok"
    return False, f"Python API /health unreachable at {PRODUCTION_BASE}/health"


def check_production_node_api() -> tuple[bool, str]:
    """Node 认证 API 经同域 /api/auth/* 暴露（与浏览器行为一致，非 :3000 直连）。"""
    url = f"{PRODUCTION_BASE}/api/auth/group-types"
    try:
        res = requests.get(url, timeout=12)
        if res.status_code == 200:
            data = res.json()
            if data.get("success"):
                return True, "ok"
        return False, f"Node auth API returned {res.status_code} at {url}"
    except requests.RequestException as exc:
        return False, f"Node auth API unreachable at {url}: {exc}"


def check_production_services(*, require_node: bool = False) -> tuple[bool, str]:
    ok, msg = check_production_static()
    if not ok:
        return False, msg
    ok, msg = check_production_python_api()
    if not ok:
        return False, msg
    if require_node:
        return check_production_node_api()
    return True, "ok"


def inject_production_api_overrides(driver: WebDriver) -> None:
    """Inject API base + skip site guide before any page script runs."""
    script = (
        f"window.GBA_API_BASE_URL = {json.dumps(PYTHON_API_BASE)};"
        "try { ['home','individual','corporate'].forEach(function(p){"
        "localStorage.setItem('gba_site_guide_v1_'+p,'done');}); } catch(e) {}"
    )
    try:
        driver.execute_cdp_cmd(
            "Page.addScriptToEvaluateOnNewDocument",
            {"source": script},
        )
    except Exception:
        driver.execute_script(script)


def open_homepage(driver: WebDriver) -> None:
    driver.get(static_url("index.html"))
    wait_for_i18n(driver)
    dismiss_site_guide(driver)
    sleep_brief(0.5)


def click_hero_portal(driver: WebDriver, portal: str) -> str:
    """Click hero CTA for individual or corporate portal; return final URL."""
    selector = f'a.btn-hero[data-portal-target="{portal}"]'
    btn = WebDriverWait(driver, 15).until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, selector))
    )
    expected_fragment = "individual" if portal == "individual" else "corporate"
    href = btn.get_attribute("href") or ""
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", btn)
    dismiss_site_guide(driver)
    sleep_brief(0.3)
    driver.execute_script("arguments[0].click();", btn)
    WebDriverWait(driver, 20).until(lambda d: expected_fragment in d.current_url)
    return driver.current_url


def click_feature_link(driver: WebDriver, href_suffix: str) -> str:
    """Click a homepage feature-card link whose href contains href_suffix."""
    link = WebDriverWait(driver, 15).until(
        EC.element_to_be_clickable(
            (By.CSS_SELECTOR, f'#features a[href*="{href_suffix}"]')
        )
    )
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", link)
    link.click()
    WebDriverWait(driver, 20).until(lambda d: href_suffix.replace("/", "") in d.current_url.replace("/", ""))
    wait_for_i18n(driver)
    dismiss_site_guide(driver)
    return driver.current_url


def assert_url_on_production(url: str, expected_path_part: str) -> None:
    parsed = urlparse(url)
    assert PRODUCTION_BASE.rstrip("/") in f"{parsed.scheme}://{parsed.netloc}", (
        f"Expected production host, got {url}"
    )
    assert expected_path_part in parsed.path, f"Expected '{expected_path_part}' in {parsed.path}"


def collect_homepage_feature_hrefs(driver: WebDriver) -> dict[str, str]:
    """Read feature section links from homepage (no click)."""
    open_homepage(driver)
    mapping: dict[str, str] = {}
    keys = {
        "resume": "demo-resume-generator.html",
        "learning_path": "demo-learning-path.html",
        "interview": "demo-interview.html",
        "jobs": "demo-jobs-database.html",
        "post_job": "post-job.html",
        "company_profile": "company-profile.html",
    }
    for name, fragment in keys.items():
        els = driver.find_elements(By.CSS_SELECTOR, f'#features a[href*="{fragment}"]')
        if els:
            href = els[0].get_attribute("href") or ""
            mapping[name] = href
    return mapping


def enter_auth_from_homepage(driver: WebDriver, portal: str = "individual") -> None:
    """从首页真实点击入口进入对应端登录/注册页。"""
    open_homepage(driver)
    click_hero_portal(driver, portal)
    sleep_brief(0.8)
    if portal == "corporate":
        if "auth.html" not in driver.current_url:
            driver.get(static_url("corporate/auth.html"))
    else:
        if "auth.html" not in driver.current_url and "portal.html" not in driver.current_url:
            driver.get(static_url("individual/auth.html"))
    wait_for_i18n(driver)
    dismiss_site_guide(driver)


def record_production_env_findings(findings) -> None:
    from tests.selenium.findings import FindingsCollector

    assert isinstance(findings, FindingsCollector)
    findings.add_once(
        id="PROD-ENV-001",
        area="production",
        severity="info",
        title=f"线上 E2E 从真实网址进入: {PRODUCTION_BASE}",
        detail=(
            f"所有用例均通过 Selenium 打开 {PRODUCTION_BASE} 并模拟用户点击。"
            f" Python LLM 与 Node 认证均经同域 /api 代理（浏览器加载 node-api-base.js）。"
            f" 认证探针: {PRODUCTION_BASE}/api/auth/group-types"
        ),
        recommendation="若登录失败，检查 Nginx 是否将 /api/auth、/api/jobs 等路径反代到 Node，Python 路径反代到 FastAPI。",
        i18n_notes="本地开发仍使用 localhost:3000；线上使用 location.origin/api。",
    )
    node_ok, node_msg = check_production_node_api()
    if not node_ok:
        findings.add_once(
            id="PROD-NODE-001",
            area="production",
            severity="warning",
            title="线上 Node 认证 API（同域 /api/auth）不可达",
            detail=node_msg,
            recommendation="确认 Nginx 将 /api/auth|jobs|company|resumes|donations|legal-aid|stats 反代到 Node :3000。",
            i18n_notes="勿用 :3000 直连探测；与浏览器 resolveNodeApiBase() 行为一致。",
        )
