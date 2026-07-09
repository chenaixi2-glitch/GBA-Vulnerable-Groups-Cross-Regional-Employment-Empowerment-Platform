"""中英文简历格式差异检查 — 根据目标语言提醒缺失/不当内容。"""

from __future__ import annotations

import json
import re
from typing import Any

from tools.resume_layout import normalize_language, normalize_employer_type, employer_type_label, language_label, VALID_RESUME_LANGUAGES, is_cjk_resume_language
from tools.resume_page_policy import page_limit_for_tier, resolve_experience_tier
from workflow.state import CandidateProfile, CopilotState, ResumeContent

# ---- 检查项定义 ----

CheckItem = dict[str, Any]

_CJK_RE = re.compile(r"[\u4e00-\u9fff\u3400-\u4dbf]")
_LATIN_WORD_RE = re.compile(r"[a-zA-Z]{3,}")
_ENGLISH_VERB_RE = re.compile(
    r"\b(developed|implemented|designed|managed|led|built|created|responsible|achieved|improved|maintained)\b",
    re.IGNORECASE,
)
_TECH_TERMS = frozenset({
    "python", "java", "react", "mysql", "linux", "github", "spring", "docker", "kubernetes",
    "aws", "azure", "redis", "nginx", "vue", "node", "typescript", "javascript", "golang",
    "postgresql", "mongodb", "flutter", "swift", "kotlin", "pandas", "numpy", "tensorflow",
    "pytorch", "spark", "hadoop", "excel", "office", "html", "css", "api", "sql", "rest",
    "boot", "cloud", "linux", "unix", "macos", "windows", "android", "ios", "gitlab",
})


def _resume_body_lines(resume: ResumeContent | None) -> list[str]:
    lines: list[str] = []
    if not resume:
        return lines
    if resume.summary:
        lines.append(resume.summary)
    for section in (resume.skills, resume.internships, resume.projects, resume.awards, resume.papers):
        for item in section:
            if item.title:
                lines.append(item.title)
            if item.content:
                for chunk in re.split(r"[\n；;•·]", item.content):
                    chunk = chunk.strip()
                    if chunk:
                        lines.append(chunk)
    if resume.profile:
        for edu in resume.profile.education:
            for field in (edu.major, edu.degree):
                if field:
                    lines.append(field)
    return lines


def _line_has_cjk(text: str) -> bool:
    return bool(_CJK_RE.search(text))


def _line_has_english_prose(text: str) -> bool:
    stripped = text.strip()
    if not stripped:
        return False
    if _ENGLISH_VERB_RE.search(stripped):
        return True
    if not _line_has_cjk(stripped):
        return bool(_LATIN_WORD_RE.search(stripped))
    for chunk in _LATIN_WORD_RE.findall(stripped):
        if len(chunk) >= 5 and chunk.lower() not in _TECH_TERMS:
            return True
    return False


def _detect_language_mixing(resume: ResumeContent | None, lang: str) -> list[str]:
    if not resume:
        return []
    mixed: list[str] = []
    for line in _resume_body_lines(resume):
        if is_cjk_resume_language(lang):
            if _line_has_cjk(line) and _line_has_english_prose(line):
                mixed.append(line[:80])
        elif _line_has_cjk(line):
            mixed.append(line[:80])
    return mixed


def _check_language_mixing(resume: ResumeContent | None, lang: str) -> CheckItem:
    samples = _detect_language_mixing(resume, lang)
    if not samples:
        if is_cjk_resume_language(lang):
            return _ok_item(
                "lang_monolingual", "format", "language_consistency", "语言一致性",
                "正文语言与目标语言一致",
            )
        return _ok_item(
            "lang_monolingual", "format", "language_consistency", "Language consistency",
            "Body text matches target language",
        )
    preview = samples[0] + ("…" if len(samples[0]) >= 80 else "")
    if is_cjk_resume_language(lang):
        label = language_label(lang)
        return _warn_item(
            "lang_monolingual", "format", "language_consistency", "语言一致性",
            f"检测到 {len(samples)} 处中英文混用",
            f"请统一为{label}表述，例如：{preview}",
        )
    return _warn_item(
        "lang_monolingual", "format", "language_consistency", "Language consistency",
        f"Found {len(samples)} line(s) with Chinese in {language_label(lang)} resume",
        f"Translate or remove Chinese text, e.g.: {preview}",
    )


def _text_blob(state: CopilotState, resume: ResumeContent | None) -> str:
    parts: list[str] = []
    if resume:
        p = resume.profile
        parts.extend([p.name, p.email, p.phone, p.city, p.github, getattr(p, "linkedin", "") or ""])
        parts.extend(getattr(p, "address", "") or "")
        for key, val in (getattr(p, "extras", None) or {}).items():
            parts.append(f"{key}:{val}")
        parts.append(resume.summary or "")
        for section in (resume.skills, resume.internships, resume.projects, resume.awards, resume.papers):
            for item in section:
                parts.extend([item.title, item.content])
        for edu in p.education:
            parts.extend([edu.school, edu.major, edu.degree])
    if state.candidate_profile:
        pb = state.candidate_profile.profile_basic
        parts.extend([pb.name, pb.email, pb.phone, pb.city, pb.school])
        for key, val in (getattr(pb, "extras", None) or {}).items():
            parts.append(f"{key}:{val}")
        for mat in state.candidate_profile.materials:
            parts.append(mat.content)
        for fact in state.candidate_profile.facts:
            parts.append(fact.content)
    return "\n".join(p for p in parts if p)


def _has_pattern(text: str, patterns: list[str]) -> bool:
    lower = text.lower()
    for pat in patterns:
        if re.search(pat, lower, re.IGNORECASE):
            return True
    return False


def _profile_field(state: CopilotState, resume: ResumeContent | None, field: str) -> str:
    val = ""
    if resume and resume.profile:
        val = getattr(resume.profile, field, "") or ""
    if not val.strip() and state.candidate_profile:
        val = getattr(state.candidate_profile.profile_basic, field, "") or ""
    return val.strip()


def _profile_extra(state: CopilotState, resume: ResumeContent | None, key: str) -> str:
    if resume and resume.profile:
        extras = getattr(resume.profile, "extras", None) or {}
        val = str(extras.get(key, "") or "").strip()
        if val:
            return val
    if state.candidate_profile:
        extras = getattr(state.candidate_profile.profile_basic, "extras", None) or {}
        return str(extras.get(key, "") or "").strip()
    return ""


def _has_profile_photo(state: CopilotState, resume: ResumeContent | None, text: str) -> bool:
    photo_url = _profile_extra(state, resume, "photo_url")
    if photo_url:
        return True
    if _profile_extra(state, resume, "has_photo") == "true":
        return True
    return _has_pattern(text, [r"证件照", r"profile photo", r"headshot", r"\.jpg", r"\.png", r"照片"])


def _parse_education_fact_content(content: str) -> dict[str, str]:
    text = (content or "").strip()
    empty = {"school": "", "major": "", "degree": ""}
    if not text:
        return empty
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return {
                "school": str(parsed.get("school") or parsed.get("name") or ""),
                "major": str(parsed.get("major") or ""),
                "degree": str(parsed.get("degree") or ""),
            }
    except (json.JSONDecodeError, TypeError):
        pass
    return {"school": text.split("\n", 1)[0].strip(), "major": "", "degree": ""}


def _candidate_has_education(state: CopilotState) -> bool:
    cp = state.candidate_profile
    if not cp:
        return False
    if cp.profile_basic.school.strip():
        return True
    for fact in cp.facts:
        if fact.type != "education":
            continue
        parsed = _parse_education_fact_content(fact.content)
        if any(parsed.get(k) for k in ("school", "major", "degree")):
            return True
    return False


def _candidate_has_internship(state: CopilotState) -> bool:
    cp = state.candidate_profile
    if not cp:
        return False
    return any(f.type == "internship" and (f.content or "").strip() for f in cp.facts)


def _candidate_has_project(state: CopilotState) -> bool:
    cp = state.candidate_profile
    if not cp:
        return False
    return any(f.type == "project" and (f.content or "").strip() for f in cp.facts)


def _candidate_has_custom_module(state: CopilotState) -> bool:
    cp = state.candidate_profile
    if not cp:
        return False
    return any(f.type == "custom" and (f.content or "").strip() for f in cp.facts)


def _has_campus_experience(state: CopilotState, resume: ResumeContent | None, text: str) -> bool:
    if resume and resume.projects:
        return True
    if _candidate_has_project(state):
        return True
    return _has_pattern(
        text,
        [r"校内|社团|学生会|校园活动|學生會|社團|campus|student club|student council|student org"],
    )


def _has_volunteer_experience(state: CopilotState, resume: ResumeContent | None, text: str) -> bool:
    if _candidate_has_custom_module(state):
        return True
    return _has_pattern(text, [r"志愿|志願|公益|ngo|npo|volunteer|慈善|社会服务|社會服務"])


def _has_any_experience_track(state: CopilotState, resume: ResumeContent | None, text: str) -> bool:
    return (
        _has_work_experience(state, resume, text)
        or _has_campus_experience(state, resume, text)
        or _has_volunteer_experience(state, resume, text)
    )


def _candidate_has_skills(state: CopilotState) -> bool:
    cp = state.candidate_profile
    if not cp:
        return False
    return any(f.type == "skill" and (f.content or "").strip() for f in cp.facts)


def _has_education(state: CopilotState, resume: ResumeContent | None, text: str) -> bool:
    profile = resume.profile if resume else None
    if profile and profile.education:
        return True
    if _candidate_has_education(state):
        return True
    return _has_pattern(text, [r"university|college|bachelor|master|b\.s\.|b\.a\.|m\.s\.|education", r"大学|学院|本科|硕士|博士"])


def _has_work_experience(state: CopilotState, resume: ResumeContent | None, text: str) -> bool:
    if resume and resume.internships:
        return True
    if _candidate_has_internship(state):
        return True
    return _has_pattern(
        text,
        [
            r"intern|work experience|employment|present|20\d{2}[-–]|company| ltd| inc\.| co\.",
            r"实习|工作|任职|公司",
        ],
    )


def _has_professional_summary(state: CopilotState, resume: ResumeContent | None, text: str) -> bool:
    if resume and resume.summary:
        summary_len = len(resume.summary.strip())
        if 30 <= summary_len <= 400:
            return True
    summary_extra = _profile_extra(state, resume, "summary")
    extra_len = len(summary_extra.strip())
    # Profile-editor summary lives in extras — accept any non-trivial user input (≥10 chars).
    if 10 <= extra_len <= 400:
        return True
    if _has_pattern(
        text,
        [r"professional summary", r"profile summary", r"自我评价", r"personal summary", r"career summary", r"个人总结"],
    ):
        return True
    if state.candidate_profile:
        for mat in state.candidate_profile.materials:
            content = mat.content or ""
            if re.search(
                r"(?:professional summary|profile summary|自我评价|个人总结)[:\s\n]+.{20,}",
                content,
                re.I | re.S,
            ):
                return True
    return False


def _has_skills_section(state: CopilotState, resume: ResumeContent | None, text: str) -> bool:
    if resume and resume.skills:
        return True
    if _candidate_has_skills(state):
        return True
    return _has_pattern(text, [r"skills|skill set|technical skills", r"技能|skill|python|java|cet"])


def _item(
    item_id: str,
    category: str,
    field: str,
    label: str,
    severity: str,
    message: str,
    suggestion: str,
    present: bool,
) -> CheckItem:
    return {
        "id": item_id,
        "category": category,
        "field": field,
        "label": label,
        "severity": severity,
        "message": message,
        "suggestion": suggestion,
        "present": present,
        "missing": not present,
    }


def _missing_item(
    item_id: str,
    category: str,
    field: str,
    label: str,
    severity: str,
    message: str,
    suggestion: str,
) -> CheckItem:
    return _item(item_id, category, field, label, severity, message, suggestion, present=False)


def _ok_item(item_id: str, category: str, field: str, label: str, message: str) -> CheckItem:
    return _item(item_id, category, field, label, "ok", message, "", present=True)


def _warn_item(
    item_id: str,
    category: str,
    field: str,
    label: str,
    message: str,
    suggestion: str,
) -> CheckItem:
    return _item(item_id, category, field, label, "warning", message, suggestion, present=False)


def _employer_type(state: CopilotState) -> str:
    return normalize_employer_type(state.meta.employer_type if state.meta else "")


def check_resume_language_requirements(
    state: CopilotState,
    language: str,
    *,
    resume: ResumeContent | None = None,
) -> dict[str, Any]:
    """检查当前状态相对目标语言简历规范的缺失项与违规项。"""
    lang = normalize_language(language)
    resume = resume or state.resume_content_json
    text = _text_blob(state, resume)
    items: list[CheckItem] = []

    items.append(_check_language_mixing(resume, lang))

    if lang == "zh":
        items.extend(_check_chinese_resume(state, resume, text))
    elif lang == "zh-TW":
        page_limit = page_limit_for_tier(resolve_experience_tier(state))
        items.extend(_check_traditional_chinese_resume(state, resume, text, page_limit=page_limit))
    else:
        page_limit = page_limit_for_tier(resolve_experience_tier(state))
        items.extend(_check_english_resume(state, resume, text, page_limit=page_limit))

    missing = [i for i in items if i.get("missing")]
    warnings = [i for i in items if i.get("severity") == "warning" and i.get("missing")]
    required_missing = [i for i in missing if i.get("severity") == "required"]
    recommended_missing = [i for i in missing if i.get("severity") == "recommended"]

    return {
        "language": lang,
        "language_label": language_label(lang),
        "employer_type": _employer_type(state),
        "employer_type_label": employer_type_label(_employer_type(state)),
        "total_checks": len(items),
        "missing_count": len(missing),
        "required_missing_count": len(required_missing),
        "recommended_missing_count": len(recommended_missing),
        "warning_count": len(warnings),
        "items": items,
        "missing_items": missing,
        "summary": _build_summary(lang, required_missing, recommended_missing, warnings),
    }


def _build_summary(
    lang: str,
    required: list[CheckItem],
    recommended: list[CheckItem],
    warnings: list[CheckItem],
) -> str:
    if lang == "zh":
        if not required and not recommended and not warnings:
            return "中文简历核心内容已较完整，可继续优化措辞与排版。"
        parts = ["中文简历待补充提醒："]
        if required:
            parts.append(f"必填缺失 {len(required)} 项：" + "、".join(i["label"] for i in required[:5]))
        if recommended:
            parts.append(f"建议补充 {len(recommended)} 项：" + "、".join(i["label"] for i in recommended[:5]))
        if warnings:
            parts.append(f"格式注意 {len(warnings)} 项")
        return " ".join(parts)

    if lang == "zh-TW":
        if not required and not recommended and not warnings:
            return "繁體中文履歷核心內容已較完整，可繼續優化措辭與排版。"
        parts = ["繁體中文履歷待補充提醒："]
        if required:
            parts.append(f"必填缺失 {len(required)} 項：" + "、".join(i["label"] for i in required[:5]))
        if recommended:
            parts.append(f"建議補充 {len(recommended)} 項：" + "、".join(i["label"] for i in recommended[:5]))
        if warnings:
            parts.append(f"格式注意 {len(warnings)} 項")
        return " ".join(parts)

    resume_kind = "Portuguese (Macau)" if lang == "pt" else "English"
    if not required and not recommended and not warnings:
        return f"{resume_kind} resume core sections look complete. Keep it to one page."
    parts = [f"{resume_kind} resume reminders:"]
    if required:
        parts.append(f"{len(required)} required: " + ", ".join(i["label"] for i in required[:5]))
    if recommended:
        parts.append(f"{len(recommended)} recommended: " + ", ".join(i["label"] for i in recommended[:5]))
    if warnings:
        parts.append(f"{len(warnings)} format warnings")
    return " ".join(parts)


def _check_chinese_resume(
    state: CopilotState,
    resume: ResumeContent | None,
    text: str,
) -> list[CheckItem]:
    items: list[CheckItem] = []
    profile = resume.profile if resume else None
    employer = _employer_type(state)
    strict_cn = employer in ("soe", "public")

    # 照片 — 简体中文简历一律必填
    has_photo = _has_profile_photo(state, resume, text)
    items.append(
        _item("zh_photo", "photo", "photo", "证件照", "required",
              "简体中文简历需附正装证件照",
              "请上传白底/浅蓝底一寸证件照，置于简历右上角",
              has_photo)
    )

    # 基本信息
    name = _profile_field(state, resume, "name")
    items.append(_item("zh_name", "contact", "name", "姓名", "required", "姓名是中文简历顶部必填项", "请在基本信息中填写姓名", bool(name)))

    phone = _profile_field(state, resume, "phone")
    items.append(_item("zh_phone", "contact", "phone", "电话", "required", "国内简历需留手机号码", "格式：138 XXXX XXXX", bool(phone)))

    email = _profile_field(state, resume, "email")
    items.append(_item("zh_email", "contact", "email", "邮箱", "required", "邮箱是国内简历常规联系方式", "如 xxx@163.com", bool(email)))

    address = _profile_extra(state, resume, "address") or _profile_field(state, resume, "city")
    has_address = bool(address.strip()) and len(address.strip()) > 6
    items.append(_item("zh_address", "contact", "address", "住址", "recommended",
                        "中文简历通常写详细住址（省市区）", "例：广东省广州市 XX 区", has_address))

    has_age = bool(_profile_extra(state, resume, "age")) or _has_pattern(text, [r"\d{1,2}\s*岁", r"age\s*[:：]\s*\d", r"年龄"])
    items.append(_item("zh_age", "contact", "age", "年龄", "recommended", "国内常规简历建议注明年龄", "可在个人信息中补充年龄", has_age))

    has_gender = bool(_profile_extra(state, resume, "gender")) or _has_pattern(text, [r"性别", r"男|女", r"\bgender\b"])
    items.append(_item("zh_gender", "contact", "gender", "性别", "recommended", "国内常规简历建议注明性别", "男 / 女", has_gender))

    has_native = bool(_profile_extra(state, resume, "native_place")) or _has_pattern(text, [r"籍贯", r"native place"])
    items.append(_item("zh_native", "contact", "native_place", "籍贯", "recommended", "中文简历常见籍贯信息", "如：广东广州", has_native))

    has_political = bool(_profile_extra(state, resume, "political_status")) or _has_pattern(text, [r"政治面貌", r"党员", r"团员", r"群众"])
    political_severity = "required" if strict_cn else "recommended"
    items.append(_item("zh_political", "contact", "political_status", "政治面貌", political_severity,
                       "国企/事业单位/考公类岗位常需政治面貌" if strict_cn else "国内部分岗位会关注政治面貌",
                       "党员 / 团员 / 群众", has_political))

    # 教育经历
    has_edu = _has_education(state, resume, text)
    items.append(_item("zh_education", "content", "education", "教育经历", "required",
                      "中文简历教育经历通常紧跟个人信息", "学校、专业、学位、起止时间", has_edu))

    # 实习/工作 — 单项选填，但四类经历至少一项
    has_work = _has_work_experience(state, resume, text)
    items.append(_item("zh_experience", "content", "internships", "实习/工作经历", "recommended",
                      "可补充实习或工作经历以突出实践背景", "按时间倒序，描述职责与成果", has_work))

    has_any_exp = _has_any_experience_track(state, resume, text)
    items.append(_item("zh_experience_any", "content", "experience_any",
                      "实习/工作/校内/志愿经历（至少一项）", "required",
                      "需至少填写一类经历：实习、工作、校内活动或志愿服务",
                      "可添加实习/工作、项目（校内）、或其他（志愿）条目", has_any_exp))

    # 项目经历
    has_proj = bool(resume and resume.projects) or _has_pattern(text, [r"项目"])
    items.append(_item("zh_projects", "content", "projects", "项目经历", "recommended",
                      "技术/互联网岗位中文简历强烈建议有项目经历", "突出技术栈与个人贡献", has_proj))

    # 技能证书
    has_skills = _has_skills_section(state, resume, text)
    items.append(_item("zh_skills", "content", "skills", "技能/证书", "recommended",
                      "中文简历需列技能与证书（四六级、计算机、资格证等）", "如：CET-6、计算机二级、Python", has_skills))

    # 荣誉奖项
    has_awards = bool(resume and resume.awards) or _has_pattern(text, [r"奖|荣誉|award|奖学金"])
    items.append(_item("zh_awards", "content", "awards", "荣誉奖项", "recommended",
                      "中文简历可含奖学金、竞赛、荣誉称号", "按重要性列出 2-4 项", has_awards))

    # 自我评价
    has_summary = _has_professional_summary(state, resume, text) or (
        len(_profile_extra(state, resume, "summary").strip()) >= 20
    )
    items.append(_item("zh_summary", "content", "summary", "自我评价", "recommended",
                      "中文简历通常有自我评价段落", "2-4 句，突出优势与岗位匹配，避免空泛形容词堆砌", has_summary))

    # 格式提醒
    if employer == "foreign" or employer == "hmt":
        label = "港澳台资" if employer == "hmt" else "外企"
        items.append(_warn_item(f"zh_{employer}_employer", "format", "employer_type", f"{label}中文简历",
                                f"目标单位为{label}时，中文简历也应更结果导向、减少空泛自我评价",
                                "突出量化成果、跨文化/跨境协作与语言能力（粤语/英语/普通话）"))
    if employer == "npo":
        has_volunteer = _has_pattern(text, [r"志愿|公益|ngo|npo|非营利|社会服务|慈善"])
        items.append(_item("zh_npo_mission", "content", "volunteer", "公益/志愿经历", "recommended",
                           "非营利组织岗位重视社会使命与项目/志愿服务经历",
                           "补充 NGO 项目、志愿服务、社会影响力相关描述", has_volunteer))
    if employer in ("soe", "public") and not has_photo:
        items.append(_warn_item("zh_soe_photo", "photo", "photo", "国央企/体制内证件照",
                                "您选择了国央企/体制内方向，证件照几乎是硬性要求",
                                "请补充白底/浅蓝底正装一寸照"))

    return items


def _check_traditional_chinese_resume(
    state: CopilotState,
    resume: ResumeContent | None,
    text: str,
    *,
    page_limit: int = 1,
) -> list[CheckItem]:
    """繁體中文履歷：沿用英文/葡語版式規範，並加入跨境必填項。"""
    items: list[CheckItem] = []
    profile = resume.profile if resume else None

    has_photo = _has_profile_photo(state, resume, text)
    if has_photo:
        items.append(_warn_item("tw_no_photo", "forbidden", "photo", "個人照片",
                                "繁體中文跨境履歷不宜放個人照片（歐美規範）",
                                "請移除照片；港澳部分金融前台崗位可酌情保留專業證件照"))
    else:
        items.append(_ok_item("tw_no_photo", "forbidden", "photo", "無個人照片",
                              "符合跨境英文履歷慣例（不放照片）"))

    name = _profile_field(state, resume, "name")
    items.append(_item("tw_name", "contact", "name", "姓名", "required",
                      "履歷頂部以姓名為最大標題", "僅寫姓名，勿用大號 Resume/CV 標題", bool(name)))

    phone = _profile_field(state, resume, "phone")
    items.append(_item("tw_phone", "contact", "phone", "電話", "required",
                      "需留手機號碼", "可含國家/區號，如 +852 9123 4567", bool(phone)))

    email = _profile_field(state, resume, "email")
    items.append(_item("tw_email", "contact", "email", "郵箱", "required",
                      "需留專業郵箱", "使用正式郵箱地址，避免暱稱", bool(email)))

    city = _profile_field(state, resume, "city")
    items.append(_item("tw_city", "contact", "city", "城市", "recommended",
                      "建議填寫所在城市", "例：Hong Kong / 廣州 — 不需寫詳細住址", bool(city)))

    visa_type = _profile_extra(state, resume, "visa_type")
    items.append(_item("tw_visa_type", "contact", "visa_type", "簽證類型", "required",
                      "跨境就業履歷需標明簽證/逗留身份", "例：往來港澳通行證 / 人才簽證 / 工作簽證", bool(visa_type)))

    resident_type = _profile_extra(state, resume, "resident_type")
    items.append(_item("tw_resident_type", "contact", "resident_type", "居民類型", "required",
                      "跨境就業履歷需標明居民/居留身份", "例：香港永久居民 / 澳門居民 / 內地居民", bool(resident_type)))

    linkedin = getattr(profile, "linkedin", "") if profile else ""
    linkedin = linkedin or _profile_extra(state, resume, "linkedin")
    has_linkedin = bool(linkedin.strip()) or _has_pattern(text, [r"linkedin\.com"])
    items.append(_item("tw_linkedin", "contact", "linkedin", "LinkedIn", "recommended",
                      "建議附 LinkedIn 連結", "https://linkedin.com/in/yourname", has_linkedin))

    forbidden_patterns = [
        (r"\d{1,2}\s*岁|年齡|age\s*[:：]\s*\d{1,2}|years old", "tw_forbid_age", "age"),
        (r"性別|gender|male|female|男|女", "tw_forbid_gender", "gender"),
        (r"婚姻|marital|married|single|離異", "tw_forbid_marital", "marital_status"),
        (r"籍貫|民族|ethnicity|height|身高", "tw_forbid_ethnicity", "ethnicity"),
        (r"政治面貌|黨員|party member|身份證號", "tw_forbid_political", "political_id"),
        (r"birthday|出生|date of birth|dob", "tw_forbid_dob", "date_of_birth"),
    ]
    for pat, item_id, field in forbidden_patterns:
        if _has_pattern(text, [pat]):
            items.append(_warn_item(item_id, "forbidden", field, field, "", ""))

    has_summary = _has_professional_summary(state, resume, text)
    items.append(_item("tw_summary", "content", "summary", "Professional Summary", "recommended",
                      "建議用 3-4 行 Professional Summary 概括核心技能與成果",
                      "避免空泛形容詞堆砌，突出量化成果", has_summary))

    if resume and resume.summary and len(resume.summary.strip()) > (400 if page_limit <= 1 else 700):
        items.append(_warn_item("tw_summary_long", "format", "summary", "Summary 過長",
                                "Professional Summary 建議控制在 3-4 行",
                                f"刪減至核心賣點，整份履歷保持 {page_limit} 頁以內"))

    has_work = _has_work_experience(state, resume, text)
    items.append(_item("tw_experience", "content", "internships", "Work Experience", "recommended",
                      "可補充工作/實習經歷以突出實踐背景",
                      "動詞開頭 + 量化結果，如：Led X, improved Y by 20%", has_work))

    has_any_exp = _has_any_experience_track(state, resume, text)
    items.append(_item("tw_experience_any", "content", "experience_any",
                      "實習/工作/校內/志願經歷（至少一項）", "required",
                      "需至少填寫一類經歷：實習、工作、校內活動或志願服務",
                      "可添加實習/工作、項目（校內）、或其他（志願）條目", has_any_exp))

    has_quant = _has_pattern(text, [r"\d+\s*%", r"\d+\s*(users|clients|projects|k|m)", r"increased|reduced|improved|boosted|by \d"])
    items.append(_item("tw_quantified", "content", "metrics", "量化成果", "recommended",
                      "經歷描述建議動詞開頭並含量化數據", "Action verb + task + measurable result", has_quant))

    has_edu = _has_education(state, resume, text)
    items.append(_item("tw_education", "content", "education", "Education", "required",
                      "教育背景為核心模塊", "Degree in English, e.g. B.S. in Computer Science", has_edu))

    has_skills = _has_skills_section(state, resume, text)
    items.append(_item("tw_skills", "content", "skills", "Skills", "recommended",
                      "Skills 放在經歷之後，緊湊列表", "Group by category, comma-separated", has_skills))

    has_intl_lang = _has_pattern(text, [r"ielts|toefl|gre|gmat|fluent english|native english|bilingual|粵語|cantonese"])
    has_cet_only = _has_pattern(text, [r"cet[-\s]?[46]|四六級|六級"]) and not has_intl_lang
    if has_cet_only:
        items.append(_warn_item("tw_lang_cert", "content", "language_certs", "語言能力",
                                "跨境履歷中僅列 CET-4/6 認可度較低",
                                "如有雅思/托福成績請補充；否則寫 Fluent English / 粵語流利"))
    elif not has_intl_lang:
        items.append(_item("tw_lang_cert", "content", "language_certs", "語言能力", "recommended",
                           "建議標明英語/粵語能力", "IELTS 7.0 / TOEFL 100 / Fluent English / 粵語流利", False))
    else:
        items.append(_ok_item("tw_lang_cert", "content", "language_certs", "語言能力",
                              "已標註國際認可的語言能力"))

    page_label = "One page only" if page_limit <= 1 else f"Up to {page_limit} pages"
    page_hint = (
        f"繁體中文跨境履歷建議 {page_limit} 頁以內"
        if page_limit <= 1
        else f"繁體中文跨境履歷建議不超過 {page_limit} 頁 A4"
    )
    items.append(_item("tw_one_page", "format", "page_limit", page_label, "required", page_hint,
                      "刪減次要內容，保持簡潔", True))

    if _has_pattern(text, [r"性格開朗|吃苦耐勞|認真負責|team player personality|hardworking and honest"]):
        items.append(_warn_item("tw_no_subjective", "format", "wording", "主觀形容詞",
                                "避免 'hardworking, outgoing' 等主觀形容詞堆砌",
                                "改用量化成果和行為動詞描述"))

    return items


def _check_english_resume(
    state: CopilotState,
    resume: ResumeContent | None,
    text: str,
    *,
    page_limit: int = 1,
) -> list[CheckItem]:
    items: list[CheckItem] = []
    profile = resume.profile if resume else None

    # 禁止照片（欧美标准）
    has_photo = _has_profile_photo(state, resume, text)
    if has_photo:
        items.append(_warn_item("en_no_photo", "forbidden", "photo", "个人照片",
                                "欧美英文 Resume 严禁放照片（涉嫌歧视，会直接淘汰）",
                                "请移除照片；港澳台/新加坡金融前台类可酌情保留专业证件照"))
    else:
        items.append(_ok_item("en_no_photo", "forbidden", "photo", "无个人照片",
                              "符合欧美英文简历规范（不放照片）"))

    name = _profile_field(state, resume, "name")
    items.append(_item("en_name", "contact", "name", "Name (header)", "required",
                      "英文简历以姓名为页面最大标题，不写 Resume/CV 大字", "仅写 FirstName LastName", bool(name)))

    phone = _profile_field(state, resume, "phone")
    items.append(_item("en_phone", "contact", "phone", "Phone", "required", "Mobile number required", "Include country code if applicable", bool(phone)))

    email = _profile_field(state, resume, "email")
    items.append(_item("en_email", "contact", "email", "Email", "required", "Professional email required", "Use a clean address, not a nickname", bool(email)))

    city = _profile_field(state, resume, "city")
    items.append(_item("en_city", "contact", "city", "City only", "recommended",
                      "建议填写所在城市，不写详细住址", "e.g. Guangzhou, China — not full street address", bool(city)))

    linkedin = getattr(profile, "linkedin", "") if profile else ""
    linkedin = linkedin or _profile_extra(state, resume, "linkedin")
    has_linkedin = bool(linkedin.strip()) or _has_pattern(text, [r"linkedin\.com"])
    items.append(_item("en_linkedin", "contact", "linkedin", "LinkedIn", "recommended",
                      "英文简历强烈建议附 LinkedIn 链接", "https://linkedin.com/in/yourname", has_linkedin))

    # 禁止隐私字段
    forbidden_patterns = [
        (r"\d{1,2}\s*岁|年龄|age\s*[:：]\s*\d{1,2}|years old", "en_forbid_age", "age"),
        (r"性别|gender|male|female|男|女", "en_forbid_gender", "gender"),
        (r"婚姻|marital|married|single|离异", "en_forbid_marital", "marital_status"),
        (r"籍贯|民族|ethnicity|height|身高", "en_forbid_ethnicity", "ethnicity"),
        (r"政治面貌|党员|party member|身份证号", "en_forbid_political", "political_id"),
        (r"birthday|出生|date of birth|dob", "en_forbid_dob", "date_of_birth"),
    ]
    for pat, item_id, field in forbidden_patterns:
        if _has_pattern(text, [pat]):
            items.append(_warn_item(
                item_id, "forbidden", field, field,
                "",
                "",
            ))

    # Professional Summary
    has_summary = _has_professional_summary(state, resume, text)
    items.append(_item("en_summary", "content", "summary", "Professional Summary", "recommended",
                      "建议用 3-4 行 Professional Summary 概括核心技能与成果",
                      "避免空泛形容词堆砌，突出量化成果", has_summary))

    if resume and resume.summary and len(resume.summary.strip()) > (400 if page_limit <= 1 else 700):
        items.append(_warn_item("en_summary_long", "format", "summary", "Summary too long",
                                f"英文 Resume 的 Summary 建议控制在 {'3-4 行' if page_limit > 1 else '3-4 行（单页）'}",
                                f"删减至核心卖点，整份简历保持 {page_limit} 页以内"))

    # Work Experience before Education
    has_work = _has_work_experience(state, resume, text)
    items.append(_item("en_experience", "content", "internships", "Work Experience", "recommended",
                      "可补充工作/实习经历以突出实践背景",
                      "动词开头 + 量化结果，如：Led X, improved Y by 20%", has_work))

    has_any_exp = _has_any_experience_track(state, resume, text)
    items.append(_item("en_experience_any", "content", "experience_any",
                      "实习/工作/校内/志愿经历（至少一项）", "required",
                      "需至少填写一类经历：实习、工作、校内活动或志愿服务",
                      "可添加实习/工作、项目（校内）、或其他（志愿）条目", has_any_exp))

    # 量化描述检查
    has_quant = _has_pattern(text, [r"\d+\s*%", r"\d+\s*(users|clients|projects|k|m)", r"increased|reduced|improved|boosted|by \d"])
    items.append(_item("en_quantified", "content", "metrics", "Quantified results", "recommended",
                      "英文经历描述需动词开头并含量化数据", "Action verb + task + measurable result", has_quant))

    has_edu = _has_education(state, resume, text)
    items.append(_item("en_education", "content", "education", "Education", "required",
                      "教育背景放在 Work Experience 之后", "Degree in English, e.g. B.S. in Computer Science", has_edu))

    has_skills = _has_skills_section(state, resume, text)
    items.append(_item("en_skills", "content", "skills", "Skills", "recommended",
                      "Skills 放在经历之后，紧凑列表", "Group by category, comma-separated", has_skills))

    # 语言证书 — 英文简历用 IELTS/TOEFL，不是 CET
    has_intl_lang = _has_pattern(text, [r"ielts|toefl|gre|gmat|fluent english|native english|bilingual"])
    has_cet_only = _has_pattern(text, [r"cet[-\s]?[46]|四六级|六级"]) and not has_intl_lang
    if has_cet_only:
        items.append(_warn_item("en_lang_cert", "content", "language_certs", "Language certification",
                                "海外/欧美英文 Resume 中 CET-4/6 认可度低",
                                "如有雅思/托福成绩请补充；否则写 Fluent English / Professional working proficiency"))
    elif not has_intl_lang:
        items.append(_item("en_lang_cert", "content", "language_certs", "English proficiency", "recommended",
                           "英文 Resume 建议注明英语能力", "IELTS 7.0 / TOEFL 100 / Fluent English", False))
    else:
        items.append(_ok_item("en_lang_cert", "content", "language_certs", "English proficiency",
                              "已标注国际认可的语言能力"))

    page_label = "One page only" if page_limit <= 1 else f"Up to {page_limit} pages"
    page_hint = (
        f"英文 Resume 建议 {page_limit} 页以内（10 年以下经验）"
        if page_limit <= 1
        else f"英文 Resume 建议不超过 {page_limit} 页 A4（中级/资深候选人）"
    )
    items.append(_item("en_one_page", "format", "page_limit", page_label, "required", page_hint,
                      "删减次要内容，保持简洁", True))

    # 禁止主观自我评价式写法
    if _has_pattern(text, [r"性格开朗|吃苦耐劳|认真负责|team player personality|hardworking and honest"]):
        items.append(_warn_item("en_no_subjective", "format", "wording", "Subjective traits",
                                "英文 Resume 避免 'hardworking, outgoing' 等主观形容词堆砌",
                                "改用量化成果和行为动词描述"))

    return items
