"""Selenium helpers for auth, donation, legal aid, and user pages."""

from __future__ import annotations

import time
import uuid
from typing import Any

import requests
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.common.by import By
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import Select, WebDriverWait

from tests.selenium.helpers import (
    STATIC_BASE,
    click_by_id,
    dismiss_site_guide,
    js_get_lang,
    sleep_brief,
    switch_ui_language,
    wait_for_i18n,
)

NODE_API_BASE = __import__("os").getenv("NODE_API_BASE", "http://127.0.0.1:3000")
TEST_EMAIL = __import__("os").getenv("SELENIUM_TEST_EMAIL", "u1234567@connect.hku.hk")
TEST_NAME = __import__("os").getenv("SELENIUM_TEST_NAME", "陈艾希")
TEST_PASSWORD = "SeleniumTestPass123!"


def check_node_api() -> tuple[bool, str]:
    try:
        res = requests.get(f"{NODE_API_BASE}/health", timeout=5)
        if res.status_code != 200:
            return False, f"Node API health returned {res.status_code}"
        return True, "ok"
    except requests.RequestException as exc:
        return False, f"Node API unreachable ({NODE_API_BASE}): {exc}"


def unique_email(prefix: str = "selenium") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}@gba-e2e.test"


def clear_auth_session(driver: WebDriver) -> None:
    driver.execute_script(
        """
        try {
          localStorage.removeItem('gba_auth_user');
          localStorage.removeItem('gba_auth_token');
        } catch (e) {}
        """
    )


def open_auth_page(driver: WebDriver, tab: str = "login") -> None:
    suffix = "?tab=register" if tab == "register" else ""
    driver.get(f"{STATIC_BASE}/individual/auth.html{suffix}")
    wait_for_i18n(driver)
    dismiss_site_guide(driver)
    sleep_brief(0.5)
    if tab == "register":
        click_by_id(driver, "auth-tab-register")
        WebDriverWait(driver, 5).until(
            lambda d: not d.find_element(By.ID, "auth-panel-register").get_attribute("hidden")
        )


def fill_register_form(driver: WebDriver, profile: dict[str, Any]) -> None:
    email = profile["email"]
    driver.find_element(By.ID, "auth-register-email").send_keys(email)
    driver.find_element(By.ID, "auth-register-password").send_keys(profile.get("password", TEST_PASSWORD))
    driver.find_element(By.ID, "auth-register-password2").send_keys(profile.get("password", TEST_PASSWORD))
    if profile.get("name"):
        driver.find_element(By.ID, "auth-register-name").send_keys(profile["name"])

    driver.find_element(By.ID, "auth-register-age").clear()
    driver.find_element(By.ID, "auth-register-age").send_keys(str(profile["age"]))
    Select(driver.find_element(By.ID, "auth-register-gender")).select_by_value(profile["gender"])
    Select(driver.find_element(By.ID, "auth-register-disability")).select_by_value(
        profile.get("disability", "none")
    )
    driver.find_element(By.ID, "auth-register-gap").clear()
    driver.find_element(By.ID, "auth-register-gap").send_keys(str(profile.get("career_gap", 0)))
    driver.find_element(By.ID, "auth-register-income").clear()
    driver.find_element(By.ID, "auth-register-income").send_keys(str(profile["income"]))


def register_via_ui(driver: WebDriver, profile: dict[str, Any]) -> str:
    open_auth_page(driver, tab="register")
    fill_register_form(driver, profile)
    click_by_id(driver, "auth-register-submit")
    WebDriverWait(driver, 20).until(lambda d: "portal.html" in d.current_url)
    return profile["email"]


def register_or_login_via_ui(driver: WebDriver, profile: dict[str, Any]) -> str:
    """注册固定测试账号；若邮箱已存在则直接登录（便于重复跑 E2E）。"""
    open_auth_page(driver, tab="register")
    fill_register_form(driver, profile)
    click_by_id(driver, "auth-register-submit")
    try:
        WebDriverWait(driver, 12).until(lambda d: "portal.html" in d.current_url)
        return profile["email"]
    except TimeoutException:
        clear_auth_session(driver)
    login_via_ui(driver, profile["email"], profile.get("password", TEST_PASSWORD))
    return profile["email"]


def login_via_ui(driver: WebDriver, email: str, password: str = TEST_PASSWORD) -> None:
    open_auth_page(driver, tab="login")
    driver.find_element(By.ID, "auth-login-email").clear()
    driver.find_element(By.ID, "auth-login-email").send_keys(email)
    driver.find_element(By.ID, "auth-login-password").clear()
    driver.find_element(By.ID, "auth-login-password").send_keys(password)
    click_by_id(driver, "auth-login-submit")
    WebDriverWait(driver, 20).until(lambda d: "portal.html" in d.current_url)


def logout_via_portal(driver: WebDriver) -> None:
    driver.get(f"{STATIC_BASE}/individual/portal.html")
    wait_for_i18n(driver)
    dismiss_site_guide(driver)
    btn = WebDriverWait(driver, 10).until(
        EC.element_to_be_clickable((By.ID, "portal-logout-btn"))
    )
    btn.click()
    sleep_brief(0.5)
    clear_auth_session(driver)


def switch_home_language(driver: WebDriver, lang: str) -> None:
    """index.html uses #language-toggle-btn instead of header-lang-slot."""
    driver.get(f"{STATIC_BASE}/index.html")
    wait_for_i18n(driver)
    dismiss_site_guide(driver)
    toggle = WebDriverWait(driver, 10).until(
        EC.element_to_be_clickable((By.ID, "language-toggle-btn"))
    )
    toggle.click()
    option = WebDriverWait(driver, 10).until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, f'#language-dropdown [data-lang="{lang}"]'))
    )
    option.click()
    WebDriverWait(driver, 10).until(lambda d: js_get_lang(d) == lang)


def open_donation_legal_page(driver: WebDriver) -> None:
    driver.get(f"{STATIC_BASE}/individual/donation-legal.html")
    wait_for_i18n(driver)
    dismiss_site_guide(driver)
    WebDriverWait(driver, 15).until(
        EC.presence_of_element_located((By.ID, "donation-box-root"))
    )
    WebDriverWait(driver, 15).until(
        EC.presence_of_element_located((By.ID, "legal-aid-root"))
    )
    sleep_brief(1.0)


def click_legal_aid_tab(driver: WebDriver, tab: str) -> None:
    """Click legal-aid tab; sticky header can intercept normal clicks in headless mode."""
    tab_el = WebDriverWait(driver, 10).until(
        EC.presence_of_element_located((By.CSS_SELECTOR, f'#legal-aid-root [data-tab="{tab}"]'))
    )
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", tab_el)
    sleep_brief(0.2)
    driver.execute_script("arguments[0].click();", tab_el)
    sleep_brief(0.5)


def submit_legal_aid_request(driver: WebDriver, title: str, description: str) -> None:
    click_legal_aid_tab(driver, "submit")
    sleep_brief(0.3)

    WebDriverWait(driver, 15).until(
        EC.presence_of_element_located((By.ID, "la-submit-form"))
    )
    WebDriverWait(driver, 15).until(
        lambda d: len(Select(d.find_element(By.ID, "la-category")).options) > 0
    )
    Select(driver.find_element(By.ID, "la-category")).select_by_index(0)
    driver.find_element(By.ID, "la-title").send_keys(title)
    driver.find_element(By.ID, "la-description").send_keys(description)
    driver.find_element(By.ID, "la-phone").send_keys("13800138000")
    driver.find_element(By.ID, "la-email").send_keys("legal-aid@gba-e2e.test")
    driver.find_element(By.CSS_SELECTOR, "#la-submit-form button[type='submit']").click()

    WebDriverWait(driver, 20).until(
        EC.visibility_of_element_located((By.ID, "legal-aid-toast"))
    )
    sleep_brief(1.5)


def offer_legal_help_on_first_open_request(driver: WebDriver, note: str) -> None:
    click_legal_aid_tab(driver, "open")

    accept_btn = WebDriverWait(driver, 15).until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, ".la-accept-btn"))
    )
    accept_btn.click()

    WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.ID, "accept-note")))
    driver.find_element(By.ID, "accept-contact").send_keys("helper@gba-e2e.test / WeChat: gba_helper")
    driver.find_element(By.ID, "accept-note").send_keys(note)
    driver.find_element(By.ID, "accept-confirm").click()

    WebDriverWait(driver, 15).until(
        EC.visibility_of_element_located((By.ID, "legal-aid-toast"))
    )
    sleep_brief(1.0)


def donate_via_ui(driver: WebDriver, amount: str = "10", message: str = "E2E test donation") -> None:
    open_donation_legal_page(driver)
    amount_input = WebDriverWait(driver, 10).until(
        EC.presence_of_element_located((By.ID, "donation-amount"))
    )
    form = driver.find_element(By.ID, "donation-form")
    if not form.is_displayed():
        raise RuntimeError("Donation form hidden — user may be vulnerable (cannot donate)")

    preset = driver.find_element(By.CSS_SELECTOR, f'.donation-preset[data-amount="{amount}"]')
    preset.click()
    driver.find_element(By.ID, "donation-message").send_keys(message)
    driver.find_element(By.ID, "donation-submit").click()
    sleep_brief(2.0)


def vulnerable_profile(email: str | None = None, name: str | None = None) -> dict[str, Any]:
    return {
        "email": email or TEST_EMAIL,
        "password": TEST_PASSWORD,
        "name": name or TEST_NAME,
        "age": 50,
        "gender": "female",
        "disability": "none",
        "career_gap": 2,
        "income": 5000,
    }


def non_vulnerable_profile(email: str | None = None) -> dict[str, Any]:
    return {
        "email": email or unique_email("donor"),
        "password": TEST_PASSWORD,
        "name": "E2E Donor User",
        "age": 32,
        "gender": "male",
        "disability": "none",
        "career_gap": 0,
        "income": 20000,
    }


def record_user_platform_static_findings(findings) -> None:
    """Known issues — record only, no code fix."""
    from tests.selenium.findings import FindingsCollector

    assert isinstance(findings, FindingsCollector)

    findings.add_once(
        id="HTML-AUTH-001",
        area="auth",
        severity="warning",
        title="individual/auth.html 结构异常：footer 位于 head 内",
        detail="<footer> 出现在 </head> 之前，可能导致部分浏览器渲染/可访问性异常。",
        recommendation="将 footer 移至 body 末尾，与 portal.html 等页面保持一致。",
        i18n_notes="footer 内 data-i18n 键仍有效，但 SEO/屏幕阅读器顺序可能错乱。",
    )
    findings.add_once(
        id="I18N-DONATION-PRESET",
        area="donation",
        severity="info",
        title="捐款快捷金额按钮为硬编码 ¥10/50/100/500",
        detail="donation-box.js 动态渲染的 preset 按钮无 data-i18n。",
        recommendation="改用 data-i18n 或 aria-label；测试使用 #donation-amount 与 .donation-preset[data-amount]。",
        i18n_notes="葡语/英文 UI 下货币符号仍显示 ¥，若面向澳门用户可考虑 MOP 文案策略。",
    )
    findings.add_once(
        id="I18N-LEGAL-TABS",
        area="legal-aid",
        severity="info",
        title="法律服务 Tab 文案由 JS laT() 渲染",
        detail="语言切换触发 gba:language-changed 会重建 DOM，Selenium 需在切换语言后重新定位 tab。",
        recommendation="为 .la-tab 增加 data-tab 稳定 selector（已有）；切换 UI 语言后等待 LegalAidUI re-init。",
        i18n_notes="legal.tabSubmit / tabOpen 等键需在 zh-CN、zh-TW、pt、en fallback 齐全。",
    )
    findings.add_once(
        id="API-MSG-I18N",
        area="auth-donation",
        severity="info",
        title="Node API 部分错误信息为中文原文",
        detail="如「您属于弱势群体…无需捐款」依赖 GBAI18n.tApiMessage 映射。",
        recommendation="扩展 EN_API_MESSAGES / locale apiMessages 段；E2E 在英文 UI 下断言翻译后的 toast。",
        i18n_notes="auth.errors.networkDetailed 等前端 fallback 在四语 locale 中应一致。",
    )
