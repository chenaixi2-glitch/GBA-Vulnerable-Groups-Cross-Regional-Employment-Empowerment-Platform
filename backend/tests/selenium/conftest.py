"""Pytest fixtures for Selenium E2E (Microsoft Edge)."""

from __future__ import annotations

import os
import threading
from pathlib import Path

import pytest
from selenium import webdriver
from selenium.webdriver.edge.options import Options as EdgeOptions

from tests.selenium.findings import FindingsCollector
from tests.selenium.helpers import (
    HEADLESS,
    OUTPUT_DIR,
    check_services,
    configure_chrome_downloads,
)
from tests.selenium.service_manager import ensure_services

# Edge uses Chromium prefs compatible with Chrome download config
BROWSER = os.getenv("SELENIUM_BROWSER", "edge").strip().lower()
PRODUCTION_BASE = os.getenv("PRODUCTION_BASE", "").strip()


def is_production_e2e() -> bool:
    return bool(os.getenv("PRODUCTION_BASE", "").strip()) or os.getenv("RUN_PRODUCTION_E2E", "0") != "0"


@pytest.fixture(scope="session")
def findings(request) -> FindingsCollector:
    collector = FindingsCollector()
    request.config._selenium_findings = collector
    return collector


@pytest.fixture(scope="session", autouse=True)
def _auto_start_services():
    """Session 开始时检测并启动静态站 / Python / Node（可通过 SKIP_AUTO_START=1 关闭）。"""
    if is_production_e2e() or os.getenv("SKIP_AUTO_START", "0") != "0":
        return
    ensure_services(need_python=True, need_node=True)


@pytest.fixture(scope="session")
def services_ok() -> bool:
    ok, _ = check_services()
    return ok


@pytest.fixture(scope="session")
def download_dir() -> Path:
    d = OUTPUT_DIR / "downloads"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _create_edge_driver(options: EdgeOptions, timeout: int = 120):
    """Start Edge with a wall-clock timeout (Selenium Manager first run can be slow)."""
    box: dict = {}

    def _start() -> None:
        try:
            driver_path = os.getenv("EDGE_DRIVER_PATH", "").strip()
            if driver_path:
                from selenium.webdriver.edge.service import Service

                box["driver"] = webdriver.Edge(service=Service(driver_path), options=options)
            else:
                box["driver"] = webdriver.Edge(options=options)
        except Exception as exc:  # noqa: BLE001
            box["error"] = exc

    thread = threading.Thread(target=_start, daemon=True)
    thread.start()
    thread.join(timeout)
    if thread.is_alive():
        raise TimeoutError(
            f"Microsoft Edge WebDriver did not start within {timeout}s. "
            "Install Edge or set EDGE_DRIVER_PATH."
        )
    if "error" in box:
        raise box["error"]
    return box["driver"]


@pytest.fixture(scope="session")
def driver(download_dir: Path):
    if BROWSER not in ("edge", "msedge", "microsoftedge"):
        pytest.skip(f"SELENIUM_BROWSER={BROWSER} not supported; use edge")

    options = EdgeOptions()
    if HEADLESS:
        options.add_argument("--headless=new")
    options.add_argument("--window-size=1440,900")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_experimental_option("prefs", configure_chrome_downloads(download_dir))
    options.add_experimental_option("excludeSwitches", ["enable-logging"])

    startup_timeout = int(os.getenv("EDGE_STARTUP_TIMEOUT", os.getenv("CHROME_STARTUP_TIMEOUT", "120")))
    try:
        drv = _create_edge_driver(options, timeout=startup_timeout)
    except (TimeoutError, OSError) as exc:
        pytest.skip(str(exc))
    drv.set_page_load_timeout(60)
    drv.implicitly_wait(2)
    yield drv
    drv.quit()


@pytest.fixture(scope="function")
def page(driver, services_ok):
    if is_production_e2e():
        yield driver
        return
    if not services_ok:
        pytest.skip("Static server or API not running — start static-server.js and backend main.py")
    yield driver


def pytest_sessionfinish(session, exitstatus):  # noqa: ARG001
    collector = getattr(session.config, "_selenium_findings", None)
    if collector is None:
        return
    report = collector.write_report(OUTPUT_DIR / "selenium_findings.md")
    collector.write_report(OUTPUT_DIR / "selenium_user_findings.md")
    collector.write_report(OUTPUT_DIR / "selenium_production_findings.md")
    print(f"\n[Selenium] Findings report: {report}")


@pytest.hookimpl(tryfirst=True)
def pytest_configure(config):
    config._selenium_findings = FindingsCollector()
    args = " ".join(str(a) for a in getattr(config, "args", []) or [])
    if "test_production_selenium" in args:
        os.environ.setdefault("RUN_PRODUCTION_E2E", "1")
        os.environ.setdefault("SKIP_AUTO_START", "1")
        os.environ.setdefault(
            "PRODUCTION_BASE",
            "https://gba-vulnerable-groups-cross-regional-employment-empowerment.com",
        )
