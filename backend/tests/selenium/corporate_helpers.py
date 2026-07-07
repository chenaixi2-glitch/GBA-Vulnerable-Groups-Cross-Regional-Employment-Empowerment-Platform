"""Selenium helpers for corporate portal flows (auth, post job, HR analytics, donation)."""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from typing import Any

from selenium.common.exceptions import TimeoutException
from selenium.webdriver.common.by import By
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import Select, WebDriverWait

from tests.selenium.helpers import click_by_id, dismiss_site_guide, sleep_brief, wait_for_i18n
from tests.selenium.online_helpers import static_url
from tests.selenium.user_helpers import TEST_PASSWORD, clear_auth_session, unique_email

CORP_TEST_PASSWORD = TEST_PASSWORD


def corporate_unique_email(prefix: str = "corp_e2e") -> str:
    return unique_email(prefix)


def corporate_profile(email: str | None = None, name: str | None = None) -> dict[str, Any]:
    return {
        "email": email or corporate_unique_email(),
        "password": CORP_TEST_PASSWORD,
        "name": name or "E2E Test Corp HR",
        "hr_title": "HR Manager",
    }


def open_corporate_auth(driver: WebDriver, tab: str = "login") -> None:
    suffix = "?tab=register" if tab == "register" else ""
    driver.get(static_url(f"corporate/auth.html{suffix}"))
    wait_for_i18n(driver)
    dismiss_site_guide(driver)
    sleep_brief(0.5)
    if tab == "register":
        click_by_id(driver, "auth-tab-register")
        WebDriverWait(driver, 5).until(
            lambda d: not d.find_element(By.ID, "auth-panel-register").get_attribute("hidden")
        )


def fill_corporate_register_form(driver: WebDriver, profile: dict[str, Any]) -> None:
    if profile.get("name"):
        driver.find_element(By.ID, "auth-register-name").send_keys(profile["name"])
    driver.find_element(By.ID, "auth-register-email").send_keys(profile["email"])
    driver.find_element(By.ID, "auth-register-password").send_keys(profile.get("password", CORP_TEST_PASSWORD))
    driver.find_element(By.ID, "auth-register-password2").send_keys(profile.get("password", CORP_TEST_PASSWORD))
    if profile.get("hr_title"):
        driver.find_element(By.ID, "auth-register-hr-title").send_keys(profile["hr_title"])


def register_corporate_via_ui(driver: WebDriver, profile: dict[str, Any]) -> str:
    open_corporate_auth(driver, tab="register")
    fill_corporate_register_form(driver, profile)
    click_by_id(driver, "auth-register-submit")
    WebDriverWait(driver, 25).until(
        lambda d: "company-profile.html" in d.current_url or "portal.html" in d.current_url
    )
    return profile["email"]


def register_or_login_corporate_via_ui(driver: WebDriver, profile: dict[str, Any]) -> str:
    open_corporate_auth(driver, tab="register")
    fill_corporate_register_form(driver, profile)
    click_by_id(driver, "auth-register-submit")
    try:
        WebDriverWait(driver, 15).until(
            lambda d: "company-profile.html" in d.current_url or "portal.html" in d.current_url
        )
        return profile["email"]
    except TimeoutException:
        clear_auth_session(driver)
    login_corporate_via_ui(driver, profile["email"], profile.get("password", CORP_TEST_PASSWORD))
    return profile["email"]


def login_corporate_via_ui(driver: WebDriver, email: str, password: str = CORP_TEST_PASSWORD) -> None:
    open_corporate_auth(driver, tab="login")
    driver.find_element(By.ID, "auth-login-email").clear()
    driver.find_element(By.ID, "auth-login-email").send_keys(email)
    driver.find_element(By.ID, "auth-login-password").clear()
    driver.find_element(By.ID, "auth-login-password").send_keys(password)
    click_by_id(driver, "auth-login-submit")
    WebDriverWait(driver, 25).until(lambda d: "portal.html" in d.current_url or "company-profile.html" in d.current_url)


def complete_company_profile_if_needed(driver: WebDriver, profile: dict[str, Any]) -> None:
    if "company-profile.html" not in driver.current_url:
        return
    wait_for_i18n(driver)
    dismiss_site_guide(driver)
    company_name = f"E2E Corp {uuid.uuid4().hex[:6]}"
    driver.find_element(By.ID, "company_name").send_keys(company_name)
    driver.find_element(By.ID, "industry").send_keys("Technology")
    driver.find_element(By.ID, "employee_count").send_keys("50-200")
    driver.find_element(By.ID, "description").send_keys("E2E test company for inclusive hiring in GBA.")
    driver.find_element(By.ID, "address").send_keys("Shenzhen, Guangdong")
    email_field = driver.find_element(By.ID, "contact_email")
    email_field.clear()
    email_field.send_keys(profile["email"])
    driver.find_element(By.ID, "contact_phone").send_keys("13800138000")
    click_by_id(driver, "save-btn")
    sleep_brief(2.0)
    msg = driver.find_element(By.ID, "form-msg")
    if "hidden" in (msg.get_attribute("class") or "") or not msg.text.strip():
        driver.get(static_url("corporate/portal.html"))
    else:
        driver.get(static_url("corporate/portal.html"))
    wait_for_i18n(driver)
    dismiss_site_guide(driver)


def open_corporate_portal(driver: WebDriver) -> None:
    driver.get(static_url("corporate/portal.html"))
    wait_for_i18n(driver)
    dismiss_site_guide(driver)
    sleep_brief(0.8)


def open_corporate_donation_page(driver: WebDriver) -> None:
    driver.get(static_url("corporate/donation-legal.html"))
    wait_for_i18n(driver)
    dismiss_site_guide(driver)
    WebDriverWait(driver, 15).until(
        EC.presence_of_element_located((By.ID, "donation-box-root"))
    )
    sleep_brief(1.0)


def open_post_job_page(driver: WebDriver) -> None:
    driver.get(static_url("corporate/post-job.html"))
    wait_for_i18n(driver)
    dismiss_site_guide(driver)
    WebDriverWait(driver, 15).until(
        EC.presence_of_element_located((By.ID, "post-job-form"))
    )


def fill_minimal_post_job_form(driver: WebDriver, *, title: str | None = None) -> str:
    job_title = title or f"E2E Inclusive Role {uuid.uuid4().hex[:6]}"
    driver.find_element(By.ID, "job-title").send_keys(job_title)
    Select(driver.find_element(By.ID, "department")).select_by_index(1)
    Select(driver.find_element(By.ID, "employment-type")).select_by_index(1)
    Select(driver.find_element(By.ID, "work-location")).select_by_index(1)
    driver.find_element(By.ID, "salary-min").send_keys("8000")
    driver.find_element(By.ID, "salary-max").send_keys("15000")
    deadline = (date.today() + timedelta(days=30)).isoformat()
    driver.find_element(By.ID, "deadline").send_keys(deadline)
    driver.find_element(By.ID, "job-summary").send_keys(
        "E2E test job posting for inclusive cross-regional employment platform validation."
    )
    driver.find_element(By.ID, "responsibilities").send_keys(
        "• Support recruitment operations\n• Collaborate with HR team\n• Review candidate applications"
    )
    return job_title


def advance_post_job_to_submit(driver: WebDriver) -> None:
    for _ in range(3):
        click_by_id(driver, "btn-next")
        sleep_brief(0.4)
    WebDriverWait(driver, 10).until(
        EC.element_to_be_clickable((By.ID, "btn-submit"))
    )


def submit_post_job_form(driver: WebDriver) -> None:
    advance_post_job_to_submit(driver)
    click_by_id(driver, "btn-submit")
    WebDriverWait(driver, 30).until(
        lambda d: "success-modal" in (d.find_element(By.ID, "success-modal").get_attribute("class") or "")
        or "my-jobs.html" in d.current_url
        or d.find_elements(By.CSS_SELECTOR, ".toast-success, [class*='toast']")
    )


def scroll_hr_team_performance(driver: WebDriver) -> None:
    section = WebDriverWait(driver, 15).until(
        EC.presence_of_element_located((By.ID, "hr-team-performance"))
    )
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", section)
    sleep_brief(1.0)


def hr_analytics_visible(driver: WebDriver) -> bool:
    scroll_hr_team_performance(driver)
    section = driver.find_element(By.ID, "hr-team-performance")
    if not section.is_displayed():
        return False
    table_body = driver.find_element(By.ID, "hr-team-table-body")
    return table_body.is_displayed()


def donate_corporate_via_ui(driver: WebDriver, amount: str = "10", message: str = "Production E2E corporate donation") -> None:
    open_corporate_donation_page(driver)
    form = driver.find_element(By.ID, "donation-form")
    if not form.is_displayed():
        raise RuntimeError("Corporate donation form hidden — may need login or premium access")
    preset = driver.find_element(By.CSS_SELECTOR, f'.donation-preset[data-amount="{amount}"]')
    preset.click()
    driver.find_element(By.ID, "donation-message").send_keys(message)
    driver.find_element(By.ID, "donation-submit").click()
    sleep_brief(2.0)
