"""HTML 简历渲染引擎 — 将 ResumeContent + RenderConfig → HTML 字符串。"""

from __future__ import annotations

import html
import re
from pathlib import Path
from typing import TYPE_CHECKING

from tools.resume_layout import SECTION_LABELS, normalize_language

if TYPE_CHECKING:
    from workflow.state import ResumeContent, RenderConfig

from log import get_logger

logger = get_logger("app")

_TEMPLATE_DIR = Path(__file__).parent.parent / "templates"


def _esc(text: str) -> str:
    return html.escape(str(text or ""), quote=True)


def _format_zh_date(value: str) -> str:
    text = (value or "").strip()
    if not text:
        return ""
    return text.replace("-", ".")


def _content_to_bullets_html(content: str) -> str:
    text = (content or "").strip()
    if not text:
        return ""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    bullet_lines = []
    plain_lines = []
    for line in lines:
        cleaned = re.sub(r"^[\-•●▪]\s*", "", line).strip()
        if re.match(r"^[\-•●▪]", line) or len(lines) > 1:
            bullet_lines.append(cleaned)
        else:
            plain_lines.append(cleaned)
    if bullet_lines:
        items = "".join(f"<li>{_esc(item)}</li>" for item in bullet_lines if item)
        return f'<ul class="zh-bullets">{items}</ul>'
    return f"<p>{_esc(text)}</p>"


def render_resume_html(content: "ResumeContent", config: "RenderConfig") -> str:
    """根据简历内容和渲染配置生成 HTML 字符串。"""
    template_path = _TEMPLATE_DIR / f"{config.template_id}.html"
    if not template_path.exists():
        template_path = _TEMPLATE_DIR / "default.html"

    template = template_path.read_text(encoding="utf-8")
    lang = normalize_language(config.language or content.meta.language)
    variables = (
        _build_zh_template_variables(content, config, lang)
        if config.template_id == "default_zh"
        else _build_template_variables(content, config)
    )

    html_out = template
    for key, value in variables.items():
        html_out = html_out.replace(f"{{{{{key}}}}}", str(value))

    logger.info("Resume HTML rendered with template=%s lang=%s", config.template_id, lang)
    return html_out


def _build_template_variables(content: "ResumeContent", config: "RenderConfig") -> dict:
    """构建模板替换变量。"""
    lang = normalize_language(config.language or content.meta.language)
    labels = SECTION_LABELS.get(lang, SECTION_LABELS["zh"])

    # CSS 变量
    margin = config.page_margin
    spacing = {"compact": 0.75, "standard": 1.0, "relaxed": 1.2}.get(config.spacing_scale, 1.0)

    css_vars = f"""
        --font-family: '{config.font_family}', sans-serif;
        --font-size: {config.font_size}px;
        --line-height: {config.line_height};
        --margin-top: {margin.top}px;
        --margin-right: {margin.right}px;
        --margin-bottom: {margin.bottom}px;
        --margin-left: {margin.left}px;
        --spacing-scale: {spacing};
    """

    # Profile section
    profile = content.profile
    extras = getattr(profile, "extras", None) or {}
    photo_url = (extras.get("photo_url") or extras.get("photo_data") or "").strip()
    photo_html = ""
    if lang == "zh" and photo_url:
        photo_html = f'<img class="profile-photo" src="{photo_url}" alt="证件照" />'

    edu_html = ""
    for edu in profile.education:
        edu_html += f'<div class="edu-item"><span class="edu-school">{edu.school}</span>'
        edu_html += f'<span class="edu-detail">{edu.major} · {edu.degree} · {edu.start_date} - {edu.end_date}</span></div>'

    # Section HTML generators
    def _render_items(items, section_class: str) -> str:
        parts = []
        for item in items:
            # 处理 content 中的换行
            formatted_content = item.content.replace("\n", "<br>")
            parts.append(
                f'<div class="item {section_class}-item">'
                f'<h3 class="item-title">{item.title}</h3>'
                f'<div class="item-content">{formatted_content}</div>'
                f'</div>'
            )
        return "\n".join(parts)

    education_label = labels.get("education") or SECTION_LABELS["en"]["education"]

    # 按 section_order 排列（education 独立成节，不再嵌在 profile 内）
    sections_html_map = {
        "profile": f"""
            <section class="section section-profile">
                <h2>{labels["profile"]}</h2>
                <div class="profile-header">
                    <div class="profile-main">
                        <div class="profile-info">
                            <span class="name">{profile.name}</span>
                            <span class="contact">{profile.email} | {profile.phone} | {profile.city}</span>
                            {'<span class="linkedin">' + profile.linkedin + '</span>' if getattr(profile, 'linkedin', '') else ''}
                            {'<span class="github">' + profile.github + '</span>' if profile.github else ''}
                        </div>
                    </div>
                    {photo_html}
                </div>
            </section>
        """,
        "summary": f"""
            <section class="section section-summary">
                <h2>{labels["summary"]}</h2>
                <p>{content.summary}</p>
            </section>
        """ if content.summary else "",
        "education": f"""
            <section class="section section-education">
                <h2>{education_label}</h2>
                <div class="education">{edu_html}</div>
            </section>
        """ if edu_html else "",
        "skills": f"""
            <section class="section section-skills">
                <h2>{labels["skills"]}</h2>
                {_render_items(content.skills, 'skill')}
            </section>
        """ if content.skills else "",
        "internships": f"""
            <section class="section section-internships">
                <h2>{labels["internships"]}</h2>
                {_render_items(content.internships, 'internship')}
            </section>
        """ if content.internships else "",
        "projects": f"""
            <section class="section section-projects">
                <h2>{labels["projects"]}</h2>
                {_render_items(content.projects, 'project')}
            </section>
        """ if content.projects else "",
        "awards": f"""
            <section class="section section-awards">
                <h2>{labels["awards"]}</h2>
                {_render_items(content.awards, 'award')}
            </section>
        """ if content.awards else "",
        "papers": f"""
            <section class="section section-papers">
                <h2>{labels["papers"]}</h2>
                {_render_items(content.papers, 'paper')}
            </section>
        """ if content.papers else "",
    }

    # 根据 section_order 和 visibility_map 排列
    ordered_sections = []
    for section_name in config.section_order:
        if config.visibility_map.get(section_name, True) is False:
            continue
        html = sections_html_map.get(section_name, "")
        if html:
            ordered_sections.append(html)

    # 添加 section_order 中没有列出但存在内容的 section
    for section_name, html in sections_html_map.items():
        if section_name not in config.section_order and html:
            if config.visibility_map.get(section_name, True) is not False:
                ordered_sections.append(html)

    layout_class = "double-column" if config.layout_mode == "double-column" else "single-column"
    dense_class = "dense" if config.dense_mode else ""
    theme_class = config.theme

    return {
        "CSS_VARIABLES": css_vars,
        "LAYOUT_CLASS": layout_class,
        "DENSE_CLASS": dense_class,
        "THEME_CLASS": theme_class,
        "HTML_LANG": lang,
        "SECTIONS_HTML": "\n".join(ordered_sections),
        "NAME": profile.name,
        "TARGET_ROLE": content.meta.target_role,
    }


def _build_zh_template_variables(content: "ResumeContent", config: "RenderConfig", lang: str) -> dict:
    """简体中文/繁体中文校园简历版式 — 参考陈艾希中山大学经济学简历。"""
    labels = SECTION_LABELS.get(lang, SECTION_LABELS["zh"])
    profile = content.profile
    extras = getattr(profile, "extras", None) or {}

    margin = config.page_margin
    spacing = {"compact": 0.75, "standard": 1.0, "relaxed": 1.2}.get(config.spacing_scale, 1.0)
    css_vars = f"""
        --font-family: '{config.font_family}', sans-serif;
        --font-size: {config.font_size}px;
        --line-height: {config.line_height};
        --margin-top: {margin.top}px;
        --margin-right: {margin.right}px;
        --margin-bottom: {margin.bottom}px;
        --margin-left: {margin.left}px;
        --spacing-scale: {spacing};
    """

    photo_url = (extras.get("photo_url") or extras.get("photo_data") or "").strip()
    # data: URLs must not be HTML-escaped — escaping breaks base64 src attributes
    photo_html = f'<img class="profile-photo" src="{photo_url}" alt="证件照" />' if photo_url else ""

    edu_parts = []
    for edu in profile.education:
        start = _format_zh_date(edu.start_date)
        end = _format_zh_date(edu.end_date)
        date_range = f"{start}-{end}" if start and end else (start or end)
        head = "  ".join(part for part in [
            date_range,
            edu.major,
            f"| {edu.degree}" if edu.degree else "",
            edu.school,
        ] if part)
        edu_parts.append(
            f'<div class="zh-edu-entry"><div class="zh-edu-head">{_esc(head)}</div></div>'
        )
    education_html = "\n".join(edu_parts)

    def _render_zh_items(items) -> str:
        parts = []
        for item in items:
            body = _content_to_bullets_html(item.content)
            parts.append(
                f'<div class="zh-entry">'
                f'<div class="zh-entry-head">{_esc(item.title)}</div>'
                f'<div class="zh-entry-body">{body}</div>'
                f'</div>'
            )
        return "\n".join(parts)

    def _render_zh_skills(items) -> str:
        if not items:
            return ""
        if len(items) == 1 and "\n" not in (items[0].content or "") and "•" not in (items[0].content or ""):
            return _content_to_bullets_html(items[0].content)
        parts = []
        for item in items:
            label = (item.title or "").strip()
            body = (item.content or "").strip()
            line = f"{label}：{body}" if label and body and label.lower() not in ("skills", "技能", "相关技能") else (body or label)
            if line:
                parts.append(f"<li>{_esc(line)}</li>")
        return f'<ul class="zh-bullets">{"".join(parts)}</ul>' if parts else ""

    footer_parts = []
    if extras.get("age"):
        footer_parts.append(f"<span>年龄：{_esc(extras['age'])}</span>")
    if profile.phone:
        footer_parts.append(f"<span>电话：{_esc(profile.phone)}</span>")
    if profile.city:
        footer_parts.append(f"<span>现居：{_esc(profile.city)}</span>")
    if profile.email:
        footer_parts.append(f"<span>邮箱：{_esc(profile.email)}</span>")
    if extras.get("gender") and not footer_parts:
        footer_parts.append(f"<span>性别：{_esc(extras['gender'])}</span>")

    sections_html_map = {
        "summary": f"""
            <section class="section section-summary">
                <h2>{labels["summary"]}</h2>
                {_content_to_bullets_html(content.summary)}
            </section>
        """ if content.summary else "",
        "education": f"""
            <section class="section section-education">
                <h2>{labels["education"]}</h2>
                {education_html}
            </section>
        """ if education_html else "",
        "internships": f"""
            <section class="section section-internships">
                <h2>{labels["internships"]}</h2>
                {_render_zh_items(content.internships)}
            </section>
        """ if content.internships else "",
        "projects": f"""
            <section class="section section-projects">
                <h2>{labels["projects"]}</h2>
                {_render_zh_items(content.projects)}
            </section>
        """ if content.projects else "",
        "skills": f"""
            <section class="section section-skills">
                <h2>{labels["skills"]}</h2>
                {_render_zh_skills(content.skills)}
            </section>
        """ if content.skills else "",
        "awards": f"""
            <section class="section section-awards">
                <h2>{labels["awards"]}</h2>
                {_render_zh_items(content.awards)}
            </section>
        """ if content.awards else "",
        "papers": f"""
            <section class="section section-papers">
                <h2>{labels["papers"]}</h2>
                {_render_zh_items(content.papers)}
            </section>
        """ if content.papers else "",
    }

    ordered_sections = []
    for section_name in config.section_order:
        if section_name == "profile":
            continue
        if config.visibility_map.get(section_name, True) is False:
            continue
        block = sections_html_map.get(section_name, "")
        if block:
            ordered_sections.append(block)

    for section_name, block in sections_html_map.items():
        if section_name in ("profile", *config.section_order):
            continue
        if config.visibility_map.get(section_name, True) is False:
            continue
        if block:
            ordered_sections.append(block)

    dense_class = "dense" if config.dense_mode else ""

    return {
        "CSS_VARIABLES": css_vars,
        "DENSE_CLASS": dense_class,
        "THEME_CLASS": config.theme,
        "HTML_LANG": lang,
        "SECTIONS_HTML": "\n".join(ordered_sections),
        "NAME": _esc(profile.name),
        "PHOTO_HTML": photo_html,
        "CONTACT_FOOTER": "\n".join(footer_parts),
        "TARGET_ROLE": content.meta.target_role,
    }
