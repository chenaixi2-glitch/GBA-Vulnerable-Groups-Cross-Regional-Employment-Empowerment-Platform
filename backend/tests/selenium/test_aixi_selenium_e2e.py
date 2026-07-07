"""
Selenium E2E — 陈艾希测试数据真实点击流程

覆盖：简历 UI/简历语言切换、上传、导出、优化；面试题生成；三类面试模拟
（题库 / 自定义 / 交互式）；学习路线。

Usage (需先启动服务):
  Terminal 1: cd backend && python main.py
  Terminal 2: node static-server.js
  Terminal 3: cd backend && pip install -r requirements-selenium.txt
              pytest tests/selenium/test_aixi_selenium_e2e.py -v -s

Env:
  STATIC_BASE=http://127.0.0.1:8080
  API_BASE=http://127.0.0.1:8000
  SKIP_LLM=1          # 仅 UI/路由冒烟，不调 LLM（快）
  HEADLESS=0          # 显示浏览器
  SELENIUM_LLM_TIMEOUT=300
  EDGE_STARTUP_TIMEOUT=120   # Microsoft Edge WebDriver 启动超时

See also: tests/selenium/test_user_platform_selenium.py (auth, donation, legal aid, language)
"""

from __future__ import annotations

import time
from pathlib import Path

import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import Select, WebDriverWait

from tests.selenium.findings import FindingsCollector
from tests.selenium.helpers import (
    AIXI_DIR,
    LLM_TIMEOUT,
    OUTPUT_DIR,
    SKIP_LLM,
    STATIC_BASE,
    accept_alerts,
    click_by_id,
    dismiss_site_guide,
    first_available_resume,
    js_get_lang,
    js_resume_lang_badge,
    load_aixi_manifest,
    load_target_config,
    load_target_jd,
    newest_file_in,
    profile_photo_path,
    resolve_asset_path,
    send_file_to_input,
    sleep_brief,
    switch_ui_language,
    wait_for_i18n,
    wait_loading_hidden,
    wait_session_started,
)


def _record_preconditions(findings: FindingsCollector) -> None:
    manifest = load_aixi_manifest()
    missing = []
    external = []
    for item in manifest.get("resumeFiles", []):
        raw = item["path"]
        p = resolve_asset_path(raw)
        if not p.is_file():
            missing.append(str(item.get("label", p.name)))
        else:
            try:
                in_aixi = p.resolve().is_relative_to(AIXI_DIR.resolve())
            except ValueError:
                in_aixi = False
            if not in_aixi:
                external.append(f"{item.get('label', p.name)} → {p}")
    if missing:
        findings.add(
            id="DATA-001",
            area="test-data/aixi",
            severity="warning",
            title="简历文件缺失",
            detail=f"以下 manifest 条目无法解析: {', '.join(missing)}",
            recommendation="将简历复制到 test-data/aixi/ 并更新 resume-manifest.json 为相对路径。",
            i18n_notes="E2E 使用文件路径定位，label 可中英混排。",
        )
    if external:
        findings.add_once(
            id="DATA-003",
            area="test-data/aixi",
            severity="warning",
            title="简历文件未纳入 test-data/aixi 目录",
            detail="; ".join(external),
            recommendation="将 Chen_Aixi__Financial_Analyst.pdf 等三份简历复制到 test-data/aixi/，"
            "manifest 改为 `\"path\": \"Chen_Aixi__Financial_Analyst.pdf\"`，便于 CI 与他人复现。",
            i18n_notes="测试数据路径不应依赖开发者本机 D:\\简历\\；文档与 i18n 说明中应写清 test-data 布局。",
        )

    photo = profile_photo_path()
    if not photo.is_file():
        findings.add(
            id="DATA-002",
            area="test-data/aixi",
            severity="error",
            title="证件照缺失",
            detail=f"未找到 {photo}",
            recommendation="将 profile-photo.jpg 放入 test-data/aixi/",
            i18n_notes="resume.checklist.photo* 等 i18n 键与照片上传提示需在 zh-CN/en/pt 四套 locale 保持一致。",
        )

    # 静态代码审查项（未修复项继续记录）
    findings.add_once(
        id="I18N-UI-EXPORT-BTNS",
        area="resume-export",
        severity="info",
        title="导出按钮文案未 i18n",
        detail="demo-resume-generator.html 中 HTML/JSON/Markdown/DOCX/PDF 按钮为硬编码英文，无 data-i18n。",
        recommendation="为导出按钮增加 data-i18n=\"resume.exportHtml\" 等键，并在 zh-CN/zh-TW/pt locale 补全。",
        i18n_notes="Selenium 应用 #btn-export-html 等稳定 id，避免依赖可见英文文案。",
    )


def _open_resume_page(driver) -> None:
    driver.get(f"{STATIC_BASE}/individual/demo-resume-generator.html")
    wait_for_i18n(driver)
    dismiss_site_guide(driver)
    sleep_brief(0.8)


def _open_interview_page(driver) -> None:
    driver.get(f"{STATIC_BASE}/individual/demo-interview.html")
    wait_for_i18n(driver)
    dismiss_site_guide(driver)
    sleep_brief(0.8)


def _open_learning_path_page(driver) -> None:
    driver.get(f"{STATIC_BASE}/individual/demo-learning-path.html")
    wait_for_i18n(driver)
    dismiss_site_guide(driver)
    sleep_brief(0.8)


def _fill_learning_path_goals(driver) -> None:
    driver.find_element(By.ID, "target-job").send_keys("AI Application Development Engineer")
    driver.find_element(By.ID, "current-role").send_keys("Financial Analyst")
    driver.find_element(By.ID, "current-skills").send_keys("Python, Data Analysis, Finance")
    Select(driver.find_element(By.ID, "industry-focus")).select_by_value("tech")
    Select(driver.find_element(By.ID, "learning-employer-type")).select_by_value("private")
    Select(driver.find_element(By.ID, "learning-experience-level")).select_by_value("entry")
    driver.find_element(By.ID, "profile-text").send_keys(
        "E2E candidate profile: Python, data analysis, and finance experience."
    )


def _submit_learning_path_prerequisites(driver) -> None:
    click_by_id(driver, "btn-learning-submit-profile")
    wait_loading_hidden(driver)
    WebDriverWait(driver, LLM_TIMEOUT).until(
        EC.visibility_of_element_located((By.ID, "jd-text"))
    )
    jd_el = driver.find_element(By.ID, "jd-text")
    jd_el.clear()
    jd_el.send_keys(load_target_jd())
    click_by_id(driver, "btn-learning-submit-jd")
    wait_loading_hidden(driver)
    WebDriverWait(driver, 30).until(
        lambda d: not d.find_element(By.ID, "btn-generate-path").get_attribute("disabled")
    )


def _upload_and_analyze_resume(driver, resume_path: Path, findings: FindingsCollector) -> None:
    send_file_to_input(driver, "resume-file", resume_path)
    WebDriverWait(driver, 10).until(
        EC.visibility_of_element_located((By.ID, "file-info"))
    )
    btn = WebDriverWait(driver, 10).until(
        EC.element_to_be_clickable((By.ID, "btn-upload-resume"))
    )
    assert not btn.get_attribute("disabled"), "Analyze button should enable after file select"
    btn.click()

    # 覆盖确认弹窗（同 session 重复上传时）
    try:
        WebDriverWait(driver, 3).until(
            EC.visibility_of_element_located((By.ID, "upload-overwrite-modal"))
        )
        modal = driver.find_element(By.ID, "upload-overwrite-modal")
        if "hidden" not in (modal.get_attribute("class") or ""):
            click_by_id(driver, "btn-upload-confirm-overwrite")
    except Exception:
        pass

    if SKIP_LLM:
        return

    wait_loading_hidden(driver)
    WebDriverWait(driver, LLM_TIMEOUT).until(
        EC.visibility_of_element_located((By.ID, "profile-editor-section"))
    )
    sid = wait_session_started(driver, timeout=LLM_TIMEOUT)
    assert sid, "Session ID should appear after upload"


def _generate_profile_resume(driver, findings: FindingsCollector) -> None:
    if SKIP_LLM:
        return
    click_by_id(driver, "btn-view-preview")
    wait_loading_hidden(driver)
    WebDriverWait(driver, LLM_TIMEOUT).until(
        lambda d: d.execute_script("return !!window.resumeGenerated;")
    )
    preview = driver.find_element(By.ID, "resume-preview")
    assert preview.text.strip(), "Resume preview should have content"


def _click_resume_translate(driver, lang_code: str) -> None:
    btn = WebDriverWait(driver, 15).until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, f'[data-resume-translate="{lang_code}"]'))
    )
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", btn)
    btn.click()
    wait_loading_hidden(driver)


def _export_format(driver, format_label: str, download_dir: Path, findings: FindingsCollector) -> None:
    """Click export button by visible label (HTML/JSON/... — currently not i18n)."""
    since = time.time()
    buttons = driver.find_elements(
        By.XPATH,
        f"//button[contains(normalize-space(.), '{format_label}')]",
    )
    assert buttons, f"Export button '{format_label}' not found"
    buttons[0].click()

    # 未登录：直接导出；已登录：save modal
    try:
        WebDriverWait(driver, 3).until(
            EC.visibility_of_element_located((By.ID, "save-resume-modal"))
        )
        modal = driver.find_element(By.ID, "save-resume-modal")
        if "hidden" not in (modal.get_attribute("class") or ""):
            click_by_id(driver, "btn-export-only")
    except Exception:
        pass

    accept_alerts(driver)
    if SKIP_LLM:
        return

    sleep_brief(2)
    downloaded = newest_file_in(download_dir, since)
    if not downloaded:
        findings.add(
            id=f"EXP-{format_label}",
            area="resume-export",
            severity="warning",
            title=f"{format_label} 导出未检测到下载文件",
            detail="Selenium 点击导出后 download 目录无新文件（可能浏览器 headless 下载策略或 PDF 服务不可用）。",
            recommendation="在 export 成功时增加 data-testid 与 toast 回调；headless 下用 CDP Page.setDownloadBehavior 或改测 /api/export 二进制响应。",
            i18n_notes="resume.toast.exported / exportFailed 等键应在 en、zh-CN、zh-TW、pt 四套 locale 齐全；导出按钮文案建议加 data-i18n 避免仅英文 HTML/JSON 标签。",
        )


def _optimize_resume(driver, findings: FindingsCollector) -> None:
    if SKIP_LLM:
        return
    optimize_btn = WebDriverWait(driver, 10).until(
        EC.element_to_be_clickable(
            (By.XPATH, "//button[contains(@onclick, 'optimizeResume')]")
        )
    )
    optimize_btn.click()
    wait_loading_hidden(driver)
    # A4 badge or toast indicates success
    try:
        WebDriverWait(driver, LLM_TIMEOUT).until(
            lambda d: "hidden" not in (d.find_element(By.ID, "resume-a4-badge").get_attribute("class") or "")
            or len(d.find_element(By.ID, "resume-preview").text.strip()) > 50
        )
    except Exception as exc:
        findings.add(
            id="RES-OPT-001",
            area="resume-optimize",
            severity="warning",
            title="简历 A4 优化结果未能在超时内确认",
            detail=str(exc),
            recommendation="优化完成后给 #resume-a4-badge 设置明确 data-state=done；E2E 可监听 toast resume.toast.optimizedA4。",
            i18n_notes="resume.optimizeA4、resume.toast.optimizedA4、resume.toast.optimizeFailed 需四语一致；加载文案 resume.toast.optimizing 勿硬编码中文。",
        )


def _setup_interview_prerequisites(driver, resume_path: Path, findings: FindingsCollector) -> None:
    send_file_to_input(driver, "interview-resume-file", resume_path)
    WebDriverWait(driver, 10).until(
        EC.visibility_of_element_located((By.ID, "interview-file-info"))
    )
    click_by_id(driver, "interview-profile-text")  # focus away
    driver.find_element(
        By.XPATH,
        "//button[contains(@onclick, 'uploadInterviewProfile')]",
    ).click()

    if SKIP_LLM:
        return

    wait_loading_hidden(driver)
    WebDriverWait(driver, LLM_TIMEOUT).until(
        lambda d: "hidden" not in (d.find_element(By.ID, "interview-jd-section").get_attribute("class") or "")
    )

    jd = load_target_jd()
    driver.find_element(By.ID, "interview-jd-text").clear()
    driver.find_element(By.ID, "interview-jd-text").send_keys(jd)
    Select(driver.find_element(By.ID, "interview-employer-type")).select_by_value("private")
    Select(driver.find_element(By.ID, "interview-experience-level")).select_by_value("entry")

    driver.find_element(
        By.XPATH,
        "//button[contains(@onclick, 'submitInterviewJobDescription')]",
    ).click()
    wait_loading_hidden(driver)

    WebDriverWait(driver, LLM_TIMEOUT).until(
        lambda d: "hidden" not in (d.find_element(By.ID, "interview-resume-section").get_attribute("class") or "")
    )
    driver.find_element(
        By.XPATH,
        "//button[contains(@onclick, 'generateInterviewResume')]",
    ).click()
    wait_loading_hidden(driver)

    WebDriverWait(driver, LLM_TIMEOUT).until(
        lambda d: not d.find_element(By.ID, "btn-load-questions").get_attribute("disabled")
    )


def _fill_interview_job_fields(driver) -> None:
    cfg = load_target_config()
    title_input = driver.find_element(By.ID, "job-title")
    title_input.clear()
    title_input.send_keys("AI Application Development Engineer")
    Select(driver.find_element(By.ID, "job-industry")).select_by_value("tech")


@pytest.mark.selenium
class TestAixiSmoke:
    """不依赖 LLM 的页面与控件冒烟。"""

    def test_resume_page_controls(self, page, findings: FindingsCollector):
        _record_preconditions(findings)
        _open_resume_page(page)
        assert page.find_element(By.ID, "resume-file")
        assert page.find_element(By.ID, "btn-upload-resume")
        assert page.find_element(By.ID, "header-lang-slot")
        for lang in ("zh-CN", "en", "pt"):
            switch_ui_language(page, lang)
            assert js_get_lang(page) == lang
            html_lang = page.execute_script("return document.documentElement.lang;")
            if not html_lang:
                findings.add(
                    id="I18N-001",
                    area="i18n",
                    severity="info",
                    title="切换 UI 语言后 html[lang] 未同步",
                    detail=f"GBAI18n.getLang()={lang} 但 document.documentElement.lang 为空",
                    recommendation="在 GBAI18n.setLang 中同步 document.documentElement.lang = lang",
                    i18n_notes="利于屏幕阅读器与 SEO；locale 文件加载失败时应有 en fallback。",
                )

    def test_interview_modes_present(self, page):
        _open_interview_page(page)
        for mode in ("question_bank", "custom", "interactive"):
            tab = page.find_element(By.CSS_SELECTOR, f'[data-mode="{mode}"]')
            tab.click()
            assert "active" in tab.get_attribute("class")

    def test_interview_tones_present(self, page):
        _open_interview_page(page)
        for tone in ("professional", "friendly", "pressure"):
            el = page.find_element(By.CSS_SELECTOR, f'[data-tone="{tone}"]')
            el.click()
            assert "selected" in el.get_attribute("class")

    def test_learning_path_form(self, page):
        _open_learning_path_page(page)
        assert page.find_element(By.ID, "btn-generate-path")
        assert page.find_element(By.ID, "target-job")


@pytest.mark.selenium
class TestAixiResumeFlow:
    """简历：上传 → 生成 → 语言切换 → 导出 → 优化。"""

    def test_resume_upload_language_export_optimize(
        self, page, download_dir: Path, findings: FindingsCollector
    ):
        _record_preconditions(findings)
        label, resume_path = first_available_resume()
        _open_resume_page(page)

        # UI 语言切到简体中文
        switch_ui_language(page, "zh-CN")

        _upload_and_analyze_resume(page, resume_path, findings)

        if not SKIP_LLM:
            # 证件照
            photo = profile_photo_path()
            if photo.is_file():
                send_file_to_input(page, "profile-photo-input", photo)
                sleep_brief(1.5)
                img = page.find_element(By.ID, "profile-photo-img")
                if "hidden" in (img.get_attribute("class") or ""):
                    findings.add(
                        id="RES-PHOTO-001",
                        area="resume-photo",
                        severity="warning",
                        title="证件照上传后预览未显示",
                        detail=f"已选择 {photo.name}",
                        recommendation="检查 ProfileEditor.handlePhotoUpload 与 draft 同步；E2E 可断言 #profile-photo-img.src 非空。",
                        i18n_notes="resume.photoUploaded、resume.photo.invalidType 等键四语齐全；SOE 场景 checklist 文案区分 zh_photo / zh_photo_strict。",
                    )

            _generate_profile_resume(page, findings)

            # 简历语言切换：中文 → 英文
            before = js_resume_lang_badge(page)
            _click_resume_translate(page, "en")
            after = js_resume_lang_badge(page)
            if before == after and "en" not in after.lower():
                findings.add(
                    id="RES-LANG-001",
                    area="resume-language",
                    severity="warning",
                    title="简历语言切换后 badge 未更新为英文",
                    detail=f"before={before}, after={after}",
                    recommendation="translate 接口返回后确保 updateResumeLanguageBadge 被调用；badge 使用 data-active-lang 供测试读取。",
                    i18n_notes="resume-lang-label 应随 GBAI18n.getLang() 显示简体/繁体/葡语标签，勿仅英文 Simplified Chinese。",
                )

            # 切到预览 tab
            click_by_id(page, "btn-view-preview")

            # 导出 HTML / JSON
            for fmt in ("HTML", "JSON"):
                _export_format(page, fmt, download_dir, findings)

            _optimize_resume(page, findings)
        else:
            # SKIP_LLM：仍验证文件选择与按钮可点击
            findings.add(
                id="RUN-001",
                area="runner",
                severity="info",
                title="SKIP_LLM=1 — 跳过上传解析/生成/导出/优化 LLM 步骤",
                detail="设置 SKIP_LLM=0 并确保 backend + Redis + LLM 可用以跑完整链路。",
                recommendation="CI 可分 fast（SKIP_LLM=1）与 nightly（完整 LLM）两档。",
                i18n_notes="完整链路需验证各语言 UI 下 toast 与 loading 文案是否正确切换。",
            )


@pytest.mark.selenium
class TestAixiInterviewFlow:
    """面试：题生成 + 三类模拟（题库 / 自定义 / 交互式）。"""

    def test_interview_three_modes(self, page, findings: FindingsCollector):
        _record_preconditions(findings)
        _, resume_path = first_available_resume()
        _open_interview_page(page)
        switch_ui_language(page, "zh-CN")

        _setup_interview_prerequisites(page, resume_path, findings)
        _fill_interview_job_fields(page)

        if SKIP_LLM:
            findings.add(
                id="RUN-002",
                area="runner",
                severity="info",
                title="SKIP_LLM=1 — 跳过面试题生成与模拟",
                detail="前置步骤 UI 已验证。",
                recommendation="完整测试需 5–15 分钟 LLM 时间。",
                i18n_notes="interview.toast.*、mock.program* 键在四语 locale 中应对齐。",
            )
            return

        custom_questions = (
            "请介绍一下你最有成就感的项目\n"
            "你如何处理跨部门协作中的冲突？\n"
            "Describe a time you used data analysis to solve a business problem."
        )

        modes = [
            ("question_bank", "question-section", "题库模拟"),
            ("custom", "custom-questions-panel", "自定义题目"),
            ("interactive", "interactive-panel", "交互式多轮"),
        ]

        for mode, visible_id, label in modes:
            tab = page.find_element(By.CSS_SELECTOR, f'[data-mode="{mode}"]')
            tab.click()
            sleep_brief(0.3)

            if mode == "custom":
                ta = page.find_element(By.ID, "custom-questions-text")
                ta.clear()
                ta.send_keys(custom_questions)

            click_by_id(page, "btn-load-questions")
            wait_loading_hidden(page)

            if mode == "interactive":
                WebDriverWait(page, LLM_TIMEOUT).until(
                    lambda d: "hidden" not in (d.find_element(By.ID, visible_id).get_attribute("class") or "")
                )
                WebDriverWait(page, LLM_TIMEOUT).until(
                    lambda d: len(d.find_element(By.ID, "interactive-chat").find_elements(By.XPATH, "./*")) >= 1
                )
                page.find_element(By.ID, "interactive-answer-input").send_keys(
                    "我在跨境电商客服岗位使用 CRM 处理跨境订单，首响解决率提升约 18%。"
                )
                page.find_element(
                    By.XPATH,
                    "//div[@id='interactive-input-section']//button[contains(., 'Send') or contains(., '发送')]",
                ).click()
                wait_loading_hidden(page)
            else:
                try:
                    WebDriverWait(page, LLM_TIMEOUT).until(
                        lambda d: "hidden" not in (d.find_element(By.ID, visible_id).get_attribute("class") or "")
                    )
                except Exception as exc:
                    findings.add(
                        id=f"INT-{mode}-001",
                        area="interview",
                        severity="error",
                        title=f"{label} 启动失败",
                        detail=str(exc),
                        recommendation="检查 interview_agent / interactive API 与 prerequisite 状态。",
                        i18n_notes="失败 toast 应使用 interview.toast.questionsFailed 等 i18n 键，勿返回裸中文 API detail 给英文 UI。",
                    )
                    continue

            if mode == "question_bank":
                q_text = page.find_element(By.ID, "question-text").text.strip()
                if not q_text:
                    findings.add(
                        id="INT-QB-001",
                        area="interview",
                        severity="error",
                        title="题库模式未展示面试题",
                        detail="question-text 为空",
                        recommendation="确认 startInterviewSession 返回 interview_qa 数组。",
                        i18n_notes="题目语言应 respect getSelectedQuestionLanguage()；UI 切换语言后题面语言策略需在 i18n 文案中说明。",
                    )

        # 三种面试官语气（专业 / 友好 / 压力）— 题库模式下切换 tone 再生成
        for tone in ("professional", "friendly", "pressure"):
            page.find_element(By.CSS_SELECTOR, f'[data-tone="{tone}"]').click()
            page.find_element(By.CSS_SELECTOR, '[data-mode="question_bank"]').click()
            click_by_id(page, "btn-load-questions")
            wait_loading_hidden(page)
            try:
                WebDriverWait(page, LLM_TIMEOUT).until(
                    lambda d: "hidden" not in (d.find_element(By.ID, "question-section").get_attribute("class") or "")
                )
            except Exception as exc:
                findings.add(
                    id=f"INT-TONE-{tone}",
                    area="interview-tone",
                    severity="warning",
                    title=f"语气「{tone}」下列题库生成超时或失败",
                    detail=str(exc),
                    recommendation="确认 tone 参数传入 API；压力模式需更长 timeout。",
                    i18n_notes="interview.toneProfessional / toneFriendly / tonePressure 四语翻译；反馈语气与 UI 语言可独立配置时需 i18n 说明。",
                )


@pytest.mark.selenium
class TestAixiLearningPath:
    """学习路线生成。"""

    def test_learning_path_generate(self, page, findings: FindingsCollector):
        _open_learning_path_page(page)
        switch_ui_language(page, "en")
        _fill_learning_path_goals(page)

        if SKIP_LLM:
            assert page.find_element(By.ID, "btn-learning-submit-profile").is_displayed()
            target_val = page.find_element(By.ID, "target-job").get_attribute("value") or ""
            assert "AI Application" in target_val
            findings.add(
                id="RUN-003",
                area="runner",
                severity="info",
                title="SKIP_LLM=1 — 跳过学习路线 LLM 生成",
                detail="职业目标与 profile 表单已填写；JD 步骤需先提交 profile。",
                recommendation="SKIP_LLM=0 时走 profile → JD → generate 完整链路并断言 #learning-path-results。",
                i18n_notes="learningPath.* 键在 zh-CN/zh-TW/pt/en 中应对齐；employer type 下拉保留中英双语 option 时需统一 data-i18n。",
            )
            return

        _submit_learning_path_prerequisites(page)
        click_by_id(page, "btn-generate-path")

        wait_loading_hidden(page)
        try:
            WebDriverWait(page, LLM_TIMEOUT).until(
                lambda d: "hidden" not in (d.find_element(By.ID, "learning-path-results").get_attribute("class") or "")
            )
            gaps = page.find_elements(By.CSS_SELECTOR, "#skill-gaps-container > *")
            assert len(gaps) > 0, "Expected skill gaps"
        except Exception as exc:
            findings.add(
                id="LP-001",
                area="learning-path",
                severity="error",
                title="学习路线差距分析未展示",
                detail=str(exc),
                recommendation="检查 /api/learning-path gap 分析与前端 render。",
                i18n_notes="learningPath.toast.* 失败提示四语化；技能 gap 标签避免仅英文硬编码。",
            )
            return

        # 时间线
        page.find_element(By.CSS_SELECTOR, 'input[name="daily-hours"][value="2"]').click()
        click_by_id(page, "btn-generate-timeline")
        wait_loading_hidden(page)
        try:
            WebDriverWait(page, LLM_TIMEOUT).until(
                lambda d: "hidden" not in (d.find_element(By.ID, "timeline-section").get_attribute("class") or "")
            )
        except Exception as exc:
            findings.add(
                id="LP-002",
                area="learning-path",
                severity="warning",
                title="学习时间线生成失败",
                detail=str(exc),
                recommendation="检查 timeline API 与 daily-hours 参数。",
                i18n_notes="timeline 阶段标题若来自 LLM，应按用户 UI 语言生成（learningPath.outputLanguage 策略）。",
            )


def test_write_findings_report(findings: FindingsCollector):
    """Always emit findings markdown (even when other tests skip)."""
    _record_preconditions(findings)
    path = findings.write_report(OUTPUT_DIR / "selenium_findings.md")
    assert path.is_file()
