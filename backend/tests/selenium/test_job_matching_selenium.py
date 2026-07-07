"""
Selenium E2E — 岗位匹配与平台投递。

依赖：静态站 :8080、Node 认证/岗位 API :3000（未启动时 conftest 会自动拉起）。

Usage:
  cd backend
  $env:EDGE_STARTUP_TIMEOUT="90"
  pytest tests/selenium/test_job_matching_selenium.py -v -s
"""

from __future__ import annotations

import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

from tests.selenium.findings import FindingsCollector
from tests.selenium.helpers import STATIC_BASE, check_node_api, dismiss_site_guide, wait_for_i18n
from tests.selenium.jobs_helpers import (
    application_list_contains,
    click_apply_on_platform,
    click_first_job_in_list,
    click_source_tab,
    detail_has_external_apply,
    job_list_count,
    login_hint_visible,
    open_jobs_database,
    open_my_applications,
    submit_application,
    wait_jobs_loaded,
)
from tests.selenium.user_helpers import (
    clear_auth_session,
    register_or_login_via_ui,
    vulnerable_profile,
)

SKIP_NODE = __import__("os").getenv("SKIP_NODE", "0") != "0"


@pytest.fixture(scope="function")
def jobs_page(page):
    if SKIP_NODE:
        pytest.skip("SKIP_NODE=1 — job tests require Node API")
    ok, msg = check_node_api()
    if not ok:
        pytest.skip(msg)
    clear_auth_session(page)
    yield page
    clear_auth_session(page)


@pytest.mark.selenium
class TestJobMatchingSmoke:
    """未登录：mock 岗位列表 + 登录提示。"""

    def test_jobs_page_logged_out_shows_mock_and_hint(self, jobs_page, findings: FindingsCollector):
        record_job_matching_findings(findings)
        open_jobs_database(jobs_page)
        assert job_list_count(jobs_page) >= 1, "未登录时应展示 mock 内部岗位"
        assert login_hint_visible(jobs_page), "未登录时应显示 #login-hint"


@pytest.mark.selenium
class TestJobMatchingAndApply:
    """登录用户：匹配列表 → 详情 → 投递 → 我的申请。"""

    def test_internal_match_select_and_apply(self, jobs_page, findings: FindingsCollector):
        profile = vulnerable_profile()
        register_or_login_via_ui(jobs_page, profile)

        open_jobs_database(jobs_page)
        assert job_list_count(jobs_page) >= 1, "登录后应加载真实匹配岗位"

        job_title = click_first_job_in_list(jobs_page)
        click_apply_on_platform(jobs_page)

        msg = submit_application(
            jobs_page,
            "Selenium E2E：我对该岗位的技能与地点匹配度较高，希望获得面试机会。",
            email=profile["email"],
            display_name=profile.get("name", "E2E Applicant"),
        )
        assert msg, "投递后应显示 #application-msg"
        assert (
            "Match score" in msg
            or "匹配" in msg
            or "score" in msg.lower()
            or "已投递" in msg
            or "already" in msg.lower()
        ), f"成功或已投递消息: {msg}"

        open_my_applications(jobs_page)
        needle = job_title.split("Company")[0].split("External")[0].strip()[:24]
        assert application_list_contains(jobs_page, needle), (
            f"我的申请应包含岗位「{job_title}」（匹配片段: {needle}）"
        )

    def test_source_tabs_internal_external_all(self, jobs_page):
        profile = vulnerable_profile()
        register_or_login_via_ui(jobs_page, profile)
        open_jobs_database(jobs_page)

        for source in ("internal", "external", "all"):
            click_source_tab(jobs_page, source)
            list_el = jobs_page.find_element(By.ID, "job-list")
            assert "text-red-600" not in (list_el.get_attribute("innerHTML") or ""), (
                f"切换 {source} 不应出现错误提示"
            )

        click_source_tab(jobs_page, "external")
        if job_list_count(jobs_page) >= 1:
            click_first_job_in_list(jobs_page)
            assert detail_has_external_apply(jobs_page), "外部岗详情应显示合作站投递按钮"

    def test_apply_page_requires_job_id(self, jobs_page):
        profile = vulnerable_profile()
        register_or_login_via_ui(jobs_page, profile)
        jobs_page.get(f"{STATIC_BASE}/individual/apply.html")
        wait_for_i18n(jobs_page)
        dismiss_site_guide(jobs_page)
        WebDriverWait(jobs_page, 10).until(
            EC.presence_of_element_located((By.ID, "role-title"))
        )
        title = jobs_page.find_element(By.ID, "role-title").text
        assert title, "无 jobId 时应提示选择岗位"


def record_job_matching_findings(findings: FindingsCollector) -> None:
    findings.add_once(
        id="JOBS-MOCK-FALLBACK",
        area="jobs",
        severity="info",
        title="未登录时 demo-jobs-database 使用 mock-api 内部岗位",
        detail="PlatformAPI 无 token 时 fallback 到 API.matchJobs；同时显示 #login-hint。",
        recommendation="E2E 分别覆盖 logged-out mock 与 logged-in Node /jobs/matched。",
        i18n_notes="jobs.loginHint* 键在四语 locale 中应齐全。",
    )
    findings.add_once(
        id="APPLY-FORM-REQUIRED",
        area="apply",
        severity="info",
        title="apply.html 姓名/邮箱为 HTML required 但未从登录资料预填",
        detail="仅 cover_message 参与 API；display name / email 为前端 required，空值会阻止 submit。",
        recommendation="登录后从 AuthAPI 或 gba_auth_user 预填，或移除未使用的 required 字段。",
        i18n_notes="E2E 需手动填写 required input 才能触发 PlatformAPI.JobsAPI.apply。",
    )
