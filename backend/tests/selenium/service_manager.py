"""Detect and auto-start static / Python / Node services for Selenium E2E."""

from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

import requests

from tests.selenium.helpers import API_BASE, REPO_ROOT, STATIC_BASE

NODE_API_BASE = os.getenv("NODE_API_BASE", "http://127.0.0.1:3000")
SKIP_AUTO_START = os.getenv("SKIP_AUTO_START", "0") != "0"
SERVICE_STARTUP_TIMEOUT = int(os.getenv("SERVICE_STARTUP_TIMEOUT", "90"))

OUTPUT_DIR = Path(__file__).resolve().parents[1] / "output" / "selenium" / "services"
_procs: list[subprocess.Popen] = []


def _url_ok(url: str, timeout: float = 3) -> bool:
    try:
        res = requests.get(url, timeout=timeout)
        return res.status_code == 200
    except requests.RequestException:
        return False


def static_ok() -> bool:
    return _url_ok(f"{STATIC_BASE}/individual/demo-jobs-database.html")


def python_ok() -> bool:
    return _url_ok(f"{API_BASE}/health")


def node_ok() -> bool:
    return _url_ok(f"{NODE_API_BASE}/health")


def _spawn(cmd: list[str], cwd: Path, log_name: str, env: dict | None = None) -> subprocess.Popen:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    log_path = OUTPUT_DIR / log_name
    log_file = open(log_path, "a", encoding="utf-8")  # noqa: SIM115
    kwargs: dict = {
        "cwd": str(cwd),
        "stdout": log_file,
        "stderr": subprocess.STDOUT,
        "env": env or os.environ.copy(),
    }
    if sys.platform == "win32":
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        kwargs["start_new_session"] = True
    proc = subprocess.Popen(cmd, **kwargs)  # noqa: S603
    _procs.append(proc)
    return proc


def _wait_until(predicate, timeout: float, interval: float = 1.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(interval)
    return False


def ensure_static() -> tuple[bool, str]:
    if static_ok():
        return True, "static already running"
    if SKIP_AUTO_START:
        return False, f"Static server not running at {STATIC_BASE} (SKIP_AUTO_START=1)"
    env = {**os.environ, "PORT": "8080"}
    _spawn(["node", "static-server.js"], REPO_ROOT, "static-server.log", env=env)
    if _wait_until(static_ok, SERVICE_STARTUP_TIMEOUT):
        return True, "started static-server.js"
    return False, f"static-server.js did not become ready within {SERVICE_STARTUP_TIMEOUT}s"


def ensure_node() -> tuple[bool, str]:
    if node_ok():
        return True, "node api already running"
    if SKIP_AUTO_START:
        return False, f"Node API not running at {NODE_API_BASE} (SKIP_AUTO_START=1)"
    if sys.platform == "win32":
        cmd = ["cmd", "/c", "npm", "start"]
    else:
        cmd = ["npm", "start"]
    _spawn(cmd, REPO_ROOT / "server", "node-api.log")
    if _wait_until(node_ok, SERVICE_STARTUP_TIMEOUT):
        return True, "started server/ npm start"
    return False, f"Node API did not become ready within {SERVICE_STARTUP_TIMEOUT}s"


def ensure_python() -> tuple[bool, str]:
    if python_ok():
        return True, "python api already running"
    if SKIP_AUTO_START:
        return False, f"Python API not running at {API_BASE} (SKIP_AUTO_START=1)"
    _spawn([sys.executable, "main.py"], REPO_ROOT / "backend", "python-api.log")
    if _wait_until(python_ok, SERVICE_STARTUP_TIMEOUT):
        return True, "started backend main.py"
    return False, f"Python API did not become ready within {SERVICE_STARTUP_TIMEOUT}s"


def ensure_services(*, need_python: bool = True, need_node: bool = True) -> tuple[bool, str]:
    ok, msg = ensure_static()
    if not ok:
        return False, msg
    if need_node:
        ok, msg = ensure_node()
        if not ok:
            return False, msg
    if need_python:
        ok, msg = ensure_python()
        if not ok:
            return False, msg
    return True, "ok"
