"""Selenium helpers for job matching and application flows."""

from __future__ import annotations

from selenium.webdriver.common.by import By
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

from tests.selenium.helpers import (
    STATIC_BASE,
    dismiss_site_guide,
    sleep_brief,
    wait_for_i18n,
)
from tests.selenium.user_helpers import TEST_EMAIL, TEST_NAME


def open_jobs_database(driver: WebDriver) -> None:
    driver.get(f"{STATIC_BASE}/individual/demo-jobs-database.html")
    wait_for_i18n(driver)
    dismiss_site_guide(driver)
    wait_jobs_loaded(driver)


def wait_jobs_loaded(driver: WebDriver, timeout: int = 30) -> None:
    def _ready(d: WebDriver) -> bool:
        root = d.find_element(By.ID, "job-list")
        html = root.get_attribute("innerHTML") or ""
        if "fa-spinner" in html:
            return False
        return True

    WebDriverWait(driver, timeout).until(_ready)
    sleep_brief(0.3)


def job_list_count(driver: WebDriver) -> int:
    return len(driver.find_elements(By.CSS_SELECTOR, "#job-list button"))


def click_source_tab(driver: WebDriver, source: str) -> None:
    tab = WebDriverWait(driver, 10).until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, f'.source-tab[data-source="{source}"]'))
    )
    tab.click()
    wait_jobs_loaded(driver)


def click_first_job_in_list(driver: WebDriver) -> str:
    btn = WebDriverWait(driver, 15).until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, "#job-list button"))
    )
    btn.click()
    title_el = WebDriverWait(driver, 10).until(
        EC.presence_of_element_located((By.CSS_SELECTOR, "#detail h3"))
    )
    return title_el.text.strip().split("\n")[0]


def click_apply_on_platform(driver: WebDriver) -> None:
    link = WebDriverWait(driver, 10).until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, "#detail a[href*='apply.html']"))
    )
    link.click()
    WebDriverWait(driver, 15).until(lambda d: "apply.html" in d.current_url)


def wait_apply_form_ready(driver: WebDriver, timeout: int = 20) -> None:
    WebDriverWait(driver, timeout).until(lambda d: "apply.html" in d.current_url)
    WebDriverWait(driver, timeout).until(
        EC.visibility_of_element_located((By.ID, "application-form"))
    )


def submit_application(
    driver: WebDriver,
    cover_message: str,
    *,
    display_name: str = TEST_NAME,
    email: str = TEST_EMAIL,
) -> str:
    wait_apply_form_ready(driver)
    form = driver.find_element(By.ID, "application-form")
    inputs = form.find_elements(By.CSS_SELECTOR, "input[required]")
    for inp in inputs:
        if not (inp.get_attribute("value") or "").strip():
            inp_type = (inp.get_attribute("type") or "").lower()
            inp.send_keys(email if inp_type == "email" else display_name)
    cover = driver.find_element(By.ID, "cover_message")
    cover.clear()
    cover.send_keys(cover_message)
    driver.find_element(By.CSS_SELECTOR, "#application-form button[type='submit']").click()
    msg_el = WebDriverWait(driver, 20).until(
        EC.visibility_of_element_located((By.ID, "application-msg"))
    )
    return msg_el.text.strip()


def open_my_applications(driver: WebDriver) -> None:
    driver.get(f"{STATIC_BASE}/individual/my-applications.html")
    wait_for_i18n(driver)
    dismiss_site_guide(driver)
    wait_applications_loaded(driver)


def wait_applications_loaded(driver: WebDriver, timeout: int = 25) -> None:
    def _ready(d: WebDriver) -> bool:
        root = d.find_element(By.ID, "apps-list")
        html = root.get_attribute("innerHTML") or ""
        return "fa-spinner" not in html

    WebDriverWait(driver, timeout).until(_ready)
    sleep_brief(0.3)


def application_list_contains(driver: WebDriver, text: str) -> bool:
    return text in driver.find_element(By.ID, "apps-list").text


def login_hint_visible(driver: WebDriver) -> bool:
    hint = driver.find_element(By.ID, "login-hint")
    return "hidden" not in (hint.get_attribute("class") or "")


def apps_list_shows_login_prompt(driver: WebDriver) -> bool:
    """True when #apps-list shows the unauthenticated sign-in prompt (any UI language)."""
    root = driver.find_element(By.ID, "apps-list")
    text = root.text.lower()
    html = (root.get_attribute("innerHTML") or "").lower()
    if root.find_elements(By.CSS_SELECTOR, 'a[href*="auth.html"]'):
        return True
    markers = ("sign in", "log in", "login", "登录", "登入", "iniciar sessão", "iniciar sessao")
    return any(m in text for m in markers) or "auth.html" in html


def wait_apps_login_prompt(driver: WebDriver, timeout: int = 25) -> None:
    wait_applications_loaded(driver, timeout=timeout)
    WebDriverWait(driver, timeout).until(lambda d: apps_list_shows_login_prompt(d))


def detail_has_external_apply(driver: WebDriver) -> bool:
    try:
        driver.find_element(By.ID, "external-apply-btn")
        return True
    except Exception:
        return False
