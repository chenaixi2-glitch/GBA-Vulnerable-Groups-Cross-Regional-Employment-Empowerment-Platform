"""
Selenium E2E — 用户平台功能：语言切换、注册登录、法律服务求援/提供、捐款箱。

还需 Node 认证/业务 API（默认 :3000）:
  cd server && npm start

Usage:
  pytest tests/selenium/test_user_platform_selenium.py -v -s
  SKIP_NODE=1   # 跳过依赖 Node API 的用例
"""

from __future__ import annotations

import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import Select, WebDriverWait

from tests.selenium.findings import FindingsCollector
from tests.selenium.helpers import (
    OUTPUT_DIR,
    STATIC_BASE,
    dismiss_site_guide,
    js_get_lang,
    sleep_brief,
    switch_ui_language,
    wait_for_i18n,
)
from tests.selenium.jobs_helpers import wait_apps_login_prompt
from tests.selenium.user_helpers import (
    click_legal_aid_tab,
    TEST_PASSWORD,
    check_node_api,
    clear_auth_session,
    donate_via_ui,
    login_via_ui,
    non_vulnerable_profile,
    offer_legal_help_on_first_open_request,
    open_auth_page,
    open_donation_legal_page,
    record_user_platform_static_findings,
    register_or_login_via_ui,
    register_via_ui,
    submit_legal_aid_request,
    switch_home_language,
    unique_email,
    vulnerable_profile,
)

SKIP_NODE = __import__("os").getenv("SKIP_NODE", "0") != "0"


@pytest.fixture(scope="session")
def node_ok() -> bool:
    if SKIP_NODE:
        return False
    ok, _ = check_node_api()
    return ok


@pytest.fixture(scope="function")
def user_page(page, node_ok):
    if not node_ok:
        pytest.skip("Node API not running — start server/ with npm start (or set SKIP_NODE=1)")
    clear_auth_session(page)
    yield page
    clear_auth_session(page)


@pytest.mark.selenium
class TestUserLanguageSwitching:
    """多页面 UI 语言切换（真实点击）。"""

    def test_home_index_language(self, page, findings: FindingsCollector):
        record_user_platform_static_findings(findings)
        for lang in ("zh-CN", "en", "pt"):
            switch_home_language(page, lang)
            assert js_get_lang(page) == lang

    def test_auth_page_language(self, page, findings: FindingsCollector):
        record_user_platform_static_findings(findings)
        page.get(f"{STATIC_BASE}/individual/auth.html")
        wait_for_i18n(page)
        dismiss_site_guide(page)
        for lang in ("zh-TW", "zh-CN", "en"):
            switch_ui_language(page, lang)
            assert js_get_lang(page) == lang
            heading = page.find_element(By.ID, "auth-heading").text.strip()
            assert heading, "Auth heading should not be empty after language switch"

    def test_donation_legal_language(self, page, findings: FindingsCollector):
        record_user_platform_static_findings(findings)
        open_donation_legal_page(page)
        switch_ui_language(page, "zh-CN")
        hero = page.find_element(By.CSS_SELECTOR, "main h1").text.strip()
        assert hero
        switch_ui_language(page, "pt")
        assert js_get_lang(page) == "pt"

    def test_portal_language(self, page, findings: FindingsCollector):
        record_user_platform_static_findings(findings)
        page.get(f"{STATIC_BASE}/individual/portal.html")
        wait_for_i18n(page)
        dismiss_site_guide(page)
        switch_ui_language(page, "zh-CN")
        assert js_get_lang(page) == "zh-CN"


@pytest.mark.selenium
class TestUserAuth:
    """注册与登录（UI 点击）。"""

    def test_register_and_login(self, user_page, findings: FindingsCollector):
        record_user_platform_static_findings(findings)
        driver = user_page
        profile = vulnerable_profile()
        email = register_or_login_via_ui(driver, profile)

        clear_auth_session(driver)
        login_via_ui(driver, email, TEST_PASSWORD)

        WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.ID, "portal-logout-btn"))
        )
        assert driver.find_element(By.ID, "portal-logout-btn").is_displayed()

    def test_register_validation_password_mismatch(self, user_page, findings: FindingsCollector):
        record_user_platform_static_findings(findings)
        open_auth_page(user_page, tab="register")
        user_page.find_element(By.ID, "auth-register-email").send_keys(unique_email("bad"))
        user_page.find_element(By.ID, "auth-register-password").send_keys("PassA123!")
        user_page.find_element(By.ID, "auth-register-password2").send_keys("PassB456!")
        user_page.find_element(By.ID, "auth-register-age").send_keys("25")
        Select(user_page.find_element(By.ID, "auth-register-gender")).select_by_value("male")
        user_page.find_element(By.ID, "auth-register-income").send_keys("10000")
        user_page.find_element(By.ID, "auth-register-submit").click()

        err = WebDriverWait(user_page, 5).until(
            EC.visibility_of_element_located((By.ID, "auth-register-error"))
        )
        assert err.text.strip(), "Should show password mismatch error"
        assert "portal.html" not in user_page.current_url

    def test_login_wrong_password(self, user_page, findings: FindingsCollector):
        record_user_platform_static_findings(findings)
        profile = vulnerable_profile()
        register_or_login_via_ui(user_page, profile)
        clear_auth_session(user_page)

        open_auth_page(user_page, tab="login")
        user_page.find_element(By.ID, "auth-login-email").send_keys(profile["email"])
        user_page.find_element(By.ID, "auth-login-password").send_keys("WrongPassword!")
        user_page.find_element(By.ID, "auth-login-submit").click()

        err = WebDriverWait(user_page, 10).until(
            EC.visibility_of_element_located((By.ID, "auth-login-error"))
        )
        assert err.text.strip()


@pytest.mark.selenium
class TestLegalAidAndDonation:
    """法律服务求援、法律服务提供、捐款箱。"""

    def test_legal_aid_request_and_offer_help(self, user_page, findings: FindingsCollector):
        record_user_platform_static_findings(findings)
        driver = user_page

        # 弱势群体用户 — 提交法律诉求
        vuln = vulnerable_profile()
        register_or_login_via_ui(driver, vuln)
        open_donation_legal_page(driver)

        vuln_notice = driver.find_elements(By.ID, "donation-vulnerable-notice")
        if vuln_notice and vuln_notice[0].is_displayed():
            pass  # 弱势群体应看到免捐提示
        else:
            findings.add_once(
                id="DON-VULN-UI",
                area="donation",
                severity="warning",
                title="弱势群体注册后未显示免捐提示",
                detail="预期 #donation-vulnerable-notice 可见且 #donation-form 隐藏",
                recommendation="检查 DonationBox.loadDonationBoxData 与 access.is_vulnerable。",
                i18n_notes="donation.vulnerableNotice 四语翻译需含 {types} 占位符。",
            )

        submit_legal_aid_request(
            driver,
            title="跨境就业劳动合同咨询（E2E）",
            description="我在大湾区跨境就业遇到合同条款不清晰的问题，希望获得劳动法方面的指导，至少十个字以上。",
        )

        # 切换到「我的诉求」确认已提交
        click_legal_aid_tab(driver, "mine")
        mine_panel = driver.find_element(By.ID, "la-panel-mine")
        assert "跨境就业" in mine_panel.text or "E2E" in mine_panel.text

        clear_auth_session(driver)

        # 非弱势群体 — 提供法律帮助
        helper = non_vulnerable_profile()
        register_via_ui(driver, helper)
        open_donation_legal_page(driver)
        offer_legal_help_on_first_open_request(
            driver,
            note="我可以提供大湾区跨境就业劳动合同方面的初步法律咨询与材料审阅（E2E 测试）。",
        )

        click_legal_aid_tab(driver, "assigned")
        assigned_panel = driver.find_element(By.ID, "la-panel-assigned")
        assert assigned_panel.text.strip()

    def test_donation_box(self, user_page, findings: FindingsCollector):
        record_user_platform_static_findings(findings)
        driver = user_page
        donor = non_vulnerable_profile()
        register_via_ui(driver, donor)

        try:
            donate_via_ui(driver, amount="10", message="Selenium E2E 爱心捐款")
        except RuntimeError as exc:
            findings.add_once(
                id="DON-FORM-001",
                area="donation",
                severity="error",
                title="非弱势群体捐款表单不可用",
                detail=str(exc),
                recommendation="确认 getPlatformAccess 对未捐款用户 requires_donation=true 且表单可见。",
                i18n_notes="donation.requiresDonationIndividual 文案四语一致。",
            )
            raise

        history = driver.find_elements(By.ID, "donation-history")
        if history and "hidden" not in (history[0].get_attribute("class") or ""):
            items = driver.find_elements(By.CSS_SELECTOR, "#donation-history-list li")
            assert len(items) >= 1, "Donation history should list at least one entry"
        else:
            findings.add_once(
                id="DON-HIST-001",
                area="donation",
                severity="info",
                title="捐款成功后历史列表未立即展示",
                detail="可刷新页面或等待 loadDonationBoxData 完成。",
                recommendation="捐款成功后显式展开 #donation-history；E2E 可 reload 后断言。",
                i18n_notes="donation.myHistory 键四语齐全。",
            )

    def test_vulnerable_cannot_donate(self, user_page, findings: FindingsCollector):
        record_user_platform_static_findings(findings)
        driver = user_page
        vuln = vulnerable_profile()
        register_or_login_via_ui(driver, vuln)
        open_donation_legal_page(driver)

        form = driver.find_element(By.ID, "donation-form")
        if form.is_displayed():
            findings.add_once(
                id="DON-VULN-BLOCK",
                area="donation",
                severity="error",
                title="弱势群体仍可看到捐款表单",
                detail="后端应拒绝 POST /donations；前端应隐藏 #donation-form。",
                recommendation="对齐 donations.controller 与 donation-box.js 的 is_vulnerable 分支。",
                i18n_notes="donation.vulnerableFree / vulnerableNotice 提示应替代表单。",
            )


@pytest.mark.selenium
class TestOtherUserPages:
    """其他与用户相关的页面（需登录或基础冒烟）。"""

    def test_profile_page_after_login(self, user_page, findings: FindingsCollector):
        record_user_platform_static_findings(findings)
        profile = vulnerable_profile()
        register_or_login_via_ui(user_page, profile)
        user_page.get(f"{STATIC_BASE}/individual/profile.html")
        wait_for_i18n(user_page)
        dismiss_site_guide(user_page)

        email_field = WebDriverWait(user_page, 10).until(
            EC.presence_of_element_located((By.ID, "profile-email"))
        )
        assert profile["email"] in (email_field.get_attribute("value") or "")

    def test_my_applications_requires_login_message(self, page, findings: FindingsCollector):
        record_user_platform_static_findings(findings)
        clear_auth_session(page)
        page.get(f"{STATIC_BASE}/individual/my-applications.html")
        wait_for_i18n(page)
        dismiss_site_guide(page)
        wait_apps_login_prompt(page)

    def test_my_applications_logged_in(self, user_page, findings: FindingsCollector):
        record_user_platform_static_findings(findings)
        register_or_login_via_ui(user_page, vulnerable_profile())
        user_page.get(f"{STATIC_BASE}/individual/my-applications.html")
        wait_for_i18n(user_page)
        sleep_brief(1.5)
        apps_list = user_page.find_element(By.ID, "apps-list").text
        assert "login" not in apps_list.lower() or "暂无" in apps_list or "No " in apps_list or len(apps_list) > 20

    def test_my_resume_page_loads(self, page, findings: FindingsCollector):
        record_user_platform_static_findings(findings)
        page.get(f"{STATIC_BASE}/individual/my-resume.html")
        wait_for_i18n(page)
        dismiss_site_guide(page)
        assert page.find_element(By.TAG_NAME, "main") or page.find_element(By.TAG_NAME, "body")


def test_user_platform_findings_report(findings: FindingsCollector):
    record_user_platform_static_findings(findings)
    path = findings.write_report(OUTPUT_DIR / "selenium_user_findings.md")
    assert path.is_file()
