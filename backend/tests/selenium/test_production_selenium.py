"""
Selenium E2E — 线上环境（默认 http://120.77.249.179）

从真实网址首页进入，点击按钮跳转，再测试各功能页面。
逻辑参考 test_user_platform_selenium.py、test_job_matching_selenium.py、test_aixi_selenium_e2e.py。

Usage:
  cd backend
  pip install -r requirements-selenium.txt
  pytest tests/selenium/test_production_selenium.py -v -s

Env:
  PRODUCTION_BASE       线上站点根 URL（默认 http://120.77.249.179）
  PRODUCTION_PYTHON_API Python LLM API（默认 {PRODUCTION_BASE}/api，经 nginx 同域代理）
  SKIP_LLM=1            跳过 LLM 调用，仅 UI 冒烟
  HEADLESS=0            显示浏览器
"""

from __future__ import annotations

import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import Select, WebDriverWait

from tests.selenium.corporate_helpers import (
    complete_company_profile_if_needed,
    corporate_profile,
    donate_corporate_via_ui,
    fill_minimal_post_job_form,
    hr_analytics_visible,
    open_corporate_donation_page,
    open_post_job_page,
    register_or_login_corporate_via_ui,
    submit_post_job_form,
)
from tests.selenium.findings import FindingsCollector
from tests.selenium.helpers import (
    LLM_TIMEOUT,
    OUTPUT_DIR,
    SKIP_LLM,
    click_by_id,
    dismiss_access_modal,
    dismiss_site_guide,
    first_available_resume,
    load_target_jd,
    sleep_brief,
    switch_ui_language,
    wait_for_i18n,
    wait_loading_hidden,
)
from tests.selenium.jobs_helpers import (
    application_list_contains,
    click_apply_on_platform,
    click_first_job_in_list,
    job_list_count,
    open_my_applications,
    submit_application,
    wait_jobs_loaded,
)
from tests.selenium.online_helpers import (
    PRODUCTION_BASE,
    PRODUCTION_FINDINGS_MD,
    assert_url_on_production,
    check_production_node_api,
    check_production_services,
    click_feature_link,
    click_hero_portal,
    collect_homepage_feature_hrefs,
    enter_auth_from_homepage,
    inject_production_api_overrides,
    open_homepage,
    record_production_env_findings,
    static_url,
)
from tests.selenium.test_aixi_selenium_e2e import (
    _fill_learning_path_goals,
    _optimize_resume,
    _setup_interview_prerequisites,
    _submit_learning_path_prerequisites,
    _upload_and_analyze_resume,
)
from tests.selenium.user_helpers import (
    clear_auth_session,
    donate_via_ui,
    non_vulnerable_profile,
    register_or_login_via_ui,
    vulnerable_profile,
)

# Patch module-level STATIC_BASE used by imported helpers when running production tests
import tests.selenium.helpers as _helpers_mod
import tests.selenium.jobs_helpers as _jobs_mod
import tests.selenium.user_helpers as _user_mod
import tests.selenium.test_aixi_selenium_e2e as _aixi_mod

_helpers_mod.STATIC_BASE = PRODUCTION_BASE
_jobs_mod.STATIC_BASE = PRODUCTION_BASE
_user_mod.STATIC_BASE = PRODUCTION_BASE
_aixi_mod.STATIC_BASE = PRODUCTION_BASE


@pytest.fixture(scope="session")
def production_static_ok() -> bool:
    ok, _ = check_production_services()
    return ok


@pytest.fixture(scope="session")
def production_node_ok() -> bool:
    ok, _ = check_production_node_api()
    return ok


@pytest.fixture(scope="session", autouse=True)
def _inject_production_api(driver):
    inject_production_api_overrides(driver)


@pytest.fixture(scope="function")
def prod_page(page, production_static_ok):
    if not production_static_ok:
        pytest.skip(f"Production site unreachable at {PRODUCTION_BASE}")
    clear_auth_session(page)
    yield page
    clear_auth_session(page)


@pytest.mark.selenium
@pytest.mark.production
class TestProductionHomepageNavigation:
    """首页入口：点击按钮 → 验证跳转 URL。"""

    def test_homepage_loads(self, prod_page, findings: FindingsCollector):
        record_production_env_findings(findings)
        open_homepage(prod_page)
        assert "GBA" in prod_page.title or prod_page.find_element(By.TAG_NAME, "body")

    def test_hero_individual_portal_link(self, prod_page, findings: FindingsCollector):
        record_production_env_findings(findings)
        open_homepage(prod_page)
        url = click_hero_portal(prod_page, "individual")
        assert_url_on_production(url, "individual")

    def test_hero_corporate_portal_link(self, prod_page, findings: FindingsCollector):
        record_production_env_findings(findings)
        open_homepage(prod_page)
        url = click_hero_portal(prod_page, "corporate")
        assert_url_on_production(url, "corporate")

    def test_feature_card_links(self, prod_page, findings: FindingsCollector):
        record_production_env_findings(findings)
        hrefs = collect_homepage_feature_hrefs(prod_page)
        assert "resume" in hrefs, "Homepage should expose resume generator link"
        assert "post_job" in hrefs, "Homepage should expose post job link"

        routes = [
            ("demo-resume-generator.html", "individual"),
            ("demo-learning-path.html", "individual"),
            ("demo-interview.html", "individual"),
            ("demo-jobs-database.html", "individual"),
            ("post-job.html", "corporate"),
        ]
        for fragment, portal in routes:
            open_homepage(prod_page)
            url = click_feature_link(prod_page, fragment)
            assert_url_on_production(url, portal)
            assert fragment.split("/")[-1] in url


@pytest.mark.selenium
@pytest.mark.production
class TestProductionCorporate:
    """企业端：注册登录、发布岗位、HR 业绩统计、捐款。"""

    def test_corporate_register_login(self, prod_page, findings: FindingsCollector):
        record_production_env_findings(findings)
        enter_auth_from_homepage(prod_page, portal="corporate")
        profile = corporate_profile()
        register_or_login_corporate_via_ui(prod_page, profile)
        complete_company_profile_if_needed(prod_page, profile)

        WebDriverWait(prod_page, 15).until(
            lambda d: "portal.html" in d.current_url or "company-profile.html" in d.current_url
        )
        if "portal.html" not in prod_page.current_url:
            prod_page.get(static_url("corporate/portal.html"))
            wait_for_i18n(prod_page)

        logout_btn = prod_page.find_elements(By.ID, "portal-logout-btn")
        assert logout_btn, "Corporate portal should show logout after login"

    def test_post_job(self, prod_page, findings: FindingsCollector):
        record_production_env_findings(findings)
        enter_auth_from_homepage(prod_page, portal="corporate")
        profile = corporate_profile()
        register_or_login_corporate_via_ui(prod_page, profile)
        complete_company_profile_if_needed(prod_page, profile)

        open_post_job_page(prod_page)
        job_title = fill_minimal_post_job_form(prod_page)
        try:
            submit_post_job_form(prod_page)
        except Exception as exc:
            findings.add_once(
                id="PROD-CORP-JOB-001",
                area="production-corporate",
                severity="error",
                title="线上发布岗位失败",
                detail=str(exc),
                recommendation="确认 Node API 可达且企业账号已完善公司资料。",
                i18n_notes="postJob.* / corporate.saveJobFailed 四语齐全。",
            )
            raise
        assert job_title, "Job title should be set"

    def test_hr_team_performance_analytics(self, prod_page, findings: FindingsCollector):
        record_production_env_findings(findings)
        enter_auth_from_homepage(prod_page, portal="corporate")
        profile = corporate_profile()
        register_or_login_corporate_via_ui(prod_page, profile)
        complete_company_profile_if_needed(prod_page, profile)
        prod_page.get(static_url("corporate/portal.html#dashboard"))
        wait_for_i18n(prod_page)
        dismiss_site_guide(prod_page)
        sleep_brief(1.0)

        assert hr_analytics_visible(prod_page), "#hr-team-performance section should be visible"
        dashboard = prod_page.find_element(By.ID, "dashboard")
        assert dashboard.is_displayed()

        table_body = prod_page.find_element(By.ID, "hr-team-table-body")
        if not table_body.text.strip():
            findings.add_once(
                id="PROD-HR-EMPTY",
                area="production-corporate",
                severity="info",
                title="HR 业绩表格暂无数据",
                detail="新注册企业可能尚无团队成员统计数据。",
                recommendation="发布岗位并处理申请后应出现 HR 行数据。",
                i18n_notes="corpPortal.hrCol* 键四语齐全。",
            )

    def test_corporate_donation(self, prod_page, findings: FindingsCollector):
        record_production_env_findings(findings)
        enter_auth_from_homepage(prod_page, portal="corporate")
        profile = corporate_profile()
        register_or_login_corporate_via_ui(prod_page, profile)
        complete_company_profile_if_needed(prod_page, profile)

        open_corporate_donation_page(prod_page)
        form = prod_page.find_element(By.ID, "donation-form")
        if not form.is_displayed():
            findings.add_once(
                id="PROD-CORP-DON-HIDDEN",
                area="production-corporate",
                severity="warning",
                title="企业捐款表单未显示",
                detail="可能已捐款或 access 接口异常。",
                recommendation="检查 /donations/access 与 donation-box.js 企业端分支。",
                i18n_notes="donationLegal.introCorporate 说明付费功能范围。",
            )
            pytest.skip("Corporate donation form not visible")

        try:
            donate_corporate_via_ui(prod_page, amount="10", message="Production Selenium E2E")
        except RuntimeError as exc:
            findings.add_once(
                id="PROD-CORP-DON-001",
                area="production-corporate",
                severity="error",
                title="企业端捐款 UI 不可用",
                detail=str(exc),
                recommendation="确认 Node donations API 与前端表单联动。",
                i18n_notes="donation.requiresDonationCorporate 文案四语一致。",
            )
            raise


@pytest.mark.selenium
@pytest.mark.production
class TestProductionIndividual:
    """个人端：注册登录、简历优化、投递岗位、面试模拟、学习路线、捐款。"""

    def test_individual_register_login(self, prod_page, findings: FindingsCollector):
        record_production_env_findings(findings)
        enter_auth_from_homepage(prod_page, portal="individual")
        profile = vulnerable_profile()
        register_or_login_via_ui(prod_page, profile)
        WebDriverWait(prod_page, 15).until(
            EC.element_to_be_clickable((By.ID, "portal-logout-btn"))
        )
        assert prod_page.find_element(By.ID, "portal-logout-btn").is_displayed()

    def test_resume_optimize(self, prod_page, findings: FindingsCollector):
        record_production_env_findings(findings)
        open_homepage(prod_page)
        click_feature_link(prod_page, "demo-resume-generator.html")
        dismiss_access_modal(prod_page)
        assert prod_page.find_element(By.ID, "resume-file")
        assert prod_page.find_element(By.ID, "btn-upload-resume")

        try:
            _, resume_path = first_available_resume()
        except FileNotFoundError as exc:
            pytest.skip(str(exc))

        enter_auth_from_homepage(prod_page, portal="individual")
        register_or_login_via_ui(prod_page, vulnerable_profile())
        click_feature_link(prod_page, "demo-resume-generator.html")
        dismiss_access_modal(prod_page)
        switch_ui_language(prod_page, "zh-CN")
        dismiss_access_modal(prod_page)
        _upload_and_analyze_resume(prod_page, resume_path, findings)

        if SKIP_LLM:
            findings.add_once(
                id="PROD-RES-SKIP",
                area="production-individual",
                severity="info",
                title="SKIP_LLM=1 — 跳过简历解析与 A4 优化",
                detail="设置 SKIP_LLM=0 以测试完整 LLM 链路。",
                recommendation="线上 Python API 经 nginx /api 代理，需注入 GBA_API_BASE_URL。",
                i18n_notes="resume.toast.* 四语齐全。",
            )
            return

        _optimize_resume(prod_page, findings)
        preview = prod_page.find_element(By.ID, "resume-preview")
        assert len(preview.text.strip()) > 20, "Resume preview should have content after optimize"

    def test_job_apply(self, prod_page, findings: FindingsCollector):
        record_production_env_findings(findings)
        enter_auth_from_homepage(prod_page, portal="individual")
        profile = vulnerable_profile()
        register_or_login_via_ui(prod_page, profile)

        open_homepage(prod_page)
        click_feature_link(prod_page, "demo-jobs-database.html")
        wait_jobs_loaded(prod_page)
        if job_list_count(prod_page) < 1:
            findings.add_once(
                id="PROD-JOBS-EMPTY",
                area="production-individual",
                severity="warning",
                title="登录后岗位列表为空",
                detail="可能尚无企业发布岗位或匹配 API 异常。",
                recommendation="先跑企业端 test_post_job 再重试投递测试。",
                i18n_notes="jobs.loadFailed / loginHint 四语齐全。",
            )
            pytest.skip("No jobs available for apply test")

        job_title = click_first_job_in_list(prod_page)
        click_apply_on_platform(prod_page)
        msg = submit_application(
            prod_page,
            "Production E2E：我对该岗位技能匹配，希望获得面试机会。",
            email=profile["email"],
            display_name=profile.get("name", "E2E Applicant"),
        )
        assert msg, "Apply form should show result message"

        open_my_applications(prod_page)
        needle = job_title.split("Company")[0].split("External")[0].strip()[:24]
        if not application_list_contains(prod_page, needle):
            findings.add_once(
                id="PROD-APPLY-LIST",
                area="production-individual",
                severity="warning",
                title="我的申请列表未立即显示刚投递岗位",
                detail=f"needle={needle!r}, job_title={job_title!r}",
                recommendation="投递成功后刷新 apps-list 或增加等待。",
                i18n_notes="applications.empty / applied 文案四语齐全。",
            )

    def test_interview_simulation(self, prod_page, findings: FindingsCollector):
        record_production_env_findings(findings)
        try:
            _, resume_path = first_available_resume()
        except FileNotFoundError as exc:
            pytest.skip(str(exc))

        open_homepage(prod_page)
        click_feature_link(prod_page, "demo-interview.html")
        switch_ui_language(prod_page, "zh-CN")
        _setup_interview_prerequisites(prod_page, resume_path, findings)

        if SKIP_LLM:
            findings.add_once(
                id="PROD-INT-SKIP",
                area="production-individual",
                severity="info",
                title="SKIP_LLM=1 — 跳过面试题生成",
                detail="前置 UI 与 JD 填写已完成。",
                recommendation="SKIP_LLM=0 时点击 btn-load-questions 断言 question-section 可见。",
                i18n_notes="interview.toast.* 四语齐全。",
            )
            return

        prod_page.find_element(By.CSS_SELECTOR, '[data-mode="question_bank"]').click()
        click_by_id(prod_page, "btn-load-questions")
        wait_loading_hidden(prod_page)
        WebDriverWait(prod_page, LLM_TIMEOUT).until(
            lambda d: "hidden"
            not in (d.find_element(By.ID, "question-section").get_attribute("class") or "")
        )
        q_text = prod_page.find_element(By.ID, "question-text").text.strip()
        assert q_text, "Question bank mode should display interview question"

    def test_learning_path_generate(self, prod_page, findings: FindingsCollector):
        record_production_env_findings(findings)
        open_homepage(prod_page)
        click_feature_link(prod_page, "demo-learning-path.html")
        switch_ui_language(prod_page, "zh-CN")
        _fill_learning_path_goals(prod_page)

        if SKIP_LLM:
            assert prod_page.find_element(By.ID, "btn-learning-submit-profile").is_displayed()
            target_val = prod_page.find_element(By.ID, "target-job").get_attribute("value") or ""
            assert "AI Application" in target_val
            findings.add_once(
                id="PROD-LP-SKIP",
                area="production-individual",
                severity="info",
                title="SKIP_LLM=1 — 跳过学习路线 LLM 生成",
                detail="职业目标与 profile 表单已填写；JD 步骤需先提交 profile。",
                recommendation="SKIP_LLM=0 时走 profile → JD → generate 完整链路并断言 #learning-path-results。",
                i18n_notes="learningPath.* 四语齐全。",
            )
            return

        _submit_learning_path_prerequisites(prod_page)
        click_by_id(prod_page, "btn-generate-path")

        wait_loading_hidden(prod_page)
        WebDriverWait(prod_page, LLM_TIMEOUT).until(
            lambda d: "hidden"
            not in (d.find_element(By.ID, "learning-path-results").get_attribute("class") or "")
        )
        gaps = prod_page.find_elements(By.CSS_SELECTOR, "#skill-gaps-container > *")
        assert len(gaps) > 0, "Learning path should show skill gaps"

    def test_individual_donation(self, prod_page, findings: FindingsCollector):
        record_production_env_findings(findings)
        enter_auth_from_homepage(prod_page, portal="individual")
        donor = non_vulnerable_profile()
        register_or_login_via_ui(prod_page, donor)

        try:
            donate_via_ui(prod_page, amount="10", message="Production Selenium E2E donation")
        except RuntimeError as exc:
            findings.add_once(
                id="PROD-IND-DON-001",
                area="production-individual",
                severity="error",
                title="个人端捐款失败",
                detail=str(exc),
                recommendation="确认 Node donations API 与 getPlatformAccess。",
                i18n_notes="donation.requiresDonationIndividual 四语一致。",
            )
            raise

        history = prod_page.find_elements(By.ID, "donation-history")
        if history and "hidden" not in (history[0].get_attribute("class") or ""):
            items = prod_node_page.find_elements(By.CSS_SELECTOR, "#donation-history-list li")
            assert len(items) >= 1, "Donation history should list at least one entry"


def test_production_findings_report(findings: FindingsCollector):
    record_production_env_findings(findings)
    path = findings.write_report(PRODUCTION_FINDINGS_MD)
    assert path.is_file()
