"""Resume layout helpers — language defaults and A4 compact settings."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from workflow.state import RenderConfig, ResumeContent

SECTION_LABELS: dict[str, dict[str, str]] = {
    "zh": {
        "profile": "基本信息",
        "summary": "自我评价",
        "education": "教育经历",
        "skills": "相关技能",
        "internships": "实习经历",
        "projects": "在校经历",
        "awards": "获奖经历",
        "papers": "论文",
    },
    "zh-TW": {
        "profile": "基本資料",
        "summary": "個人總結",
        "education": "教育經歷",
        "skills": "專業技能",
        "internships": "實習經歷",
        "projects": "項目經歷",
        "awards": "獲獎經歷",
        "papers": "論文",
    },
    "en": {
        "profile": "Contact",
        "summary": "Professional Summary",
        "education": "Education",
        "skills": "Skills",
        "internships": "Work Experience",
        "projects": "Projects",
        "awards": "Honors & Awards",
        "papers": "Publications",
    },
    "pt": {
        "profile": "Contactos",
        "summary": "Resumo Profissional",
        "education": "Formação Académica",
        "skills": "Competências",
        "internships": "Experiência Profissional",
        "projects": "Projectos",
        "awards": "Prémios e Distinções",
        "papers": "Publicações",
    },
}

SECTION_ORDER_BY_LANGUAGE: dict[str, list[str]] = {
    # 仅作 agent 缺省建议 / 冷启动回退，不由模板强制
    "zh": ["summary", "education", "internships", "projects", "skills", "awards"],
    "zh-TW": ["profile", "summary", "education", "internships", "projects", "skills", "awards"],
    "en": ["profile", "summary", "education", "internships", "projects", "skills", "awards"],
    "pt": ["profile", "summary", "education", "internships", "projects", "skills", "awards"],
}

ALL_RESUME_SECTIONS: tuple[str, ...] = (
    "profile", "summary", "education", "skills", "internships", "projects", "awards", "papers",
)


def default_section_order_for_language(language: str) -> list[str]:
    """语言相关的版块顺序建议 — 供 agent 缺省或冷启动使用，非模板硬编码。"""
    lang = normalize_language(language)
    return list(SECTION_ORDER_BY_LANGUAGE.get(lang, SECTION_ORDER_BY_LANGUAGE["en"]))


def _pin_contact_profile_first(order: list[str], language: str, *, has_profile: bool) -> list[str]:
    """en / pt / zh-TW 的 Contact(profile) 必须置顶；技能/荣誉不得排到姓名前面。"""
    if not has_profile or not order:
        return order
    lang = normalize_language(language)
    if lang not in ("en", "pt", "zh-TW"):
        return order
    rest = [s for s in order if s != "profile"]
    return ["profile", *rest]


def resolve_section_order(
    resume_content: "ResumeContent",
    language: str,
    explicit: list[str] | None = None,
) -> list[str]:
    """Agent 显式 section_order 优先；否则按有内容的版块 + 语言缺省建议推断。

    对 en/pt/zh-TW：无论 agent 如何排序，有内容的 profile（姓名/联系方式）始终置顶。
    """
    def _has(section: str) -> bool:
        if section == "profile":
            p = resume_content.profile
            return bool(
                p.name or p.email or p.phone or p.city
                or p.linkedin or p.github or getattr(p, "address", "")
            )
        if section == "summary":
            return bool((resume_content.summary or "").strip())
        if section == "education":
            return bool(resume_content.profile.education)
        if section == "skills":
            return bool(resume_content.skills)
        if section == "internships":
            return bool(resume_content.internships)
        if section == "projects":
            return bool(resume_content.projects)
        if section == "awards":
            return bool(resume_content.awards)
        if section == "papers":
            return bool(resume_content.papers)
        return False

    preferred = default_section_order_for_language(language)

    if explicit:
        cleaned = [s for s in explicit if s in ALL_RESUME_SECTIONS and _has(s)]
        if cleaned:
            # Agent 可能漏列有内容的版块（如 education）；按语言缺省顺序插回，避免掉到文末或丢失标题
            for section in preferred:
                if not _has(section) or section in cleaned:
                    continue
                pref_idx = preferred.index(section)
                # preferred 首位（通常是 profile）没有“更早邻居”时，必须插到开头，不能 append 到末尾
                insert_at = 0 if pref_idx == 0 else len(cleaned)
                for earlier in reversed(preferred[:pref_idx]):
                    if earlier in cleaned:
                        insert_at = cleaned.index(earlier) + 1
                        break
                cleaned.insert(insert_at, section)
            return _pin_contact_profile_first(
                cleaned, language, has_profile=_has("profile")
            )

    ordered = [s for s in preferred if _has(s)]
    for section in ALL_RESUME_SECTIONS:
        if _has(section) and section not in ordered:
            ordered.append(section)
    ordered = ordered or list(preferred)
    return _pin_contact_profile_first(ordered, language, has_profile=_has("profile"))

FONT_BY_LANGUAGE: dict[str, str] = {
    "zh": "Source Han Sans",
    "zh-TW": "Source Han Sans",
    "en": "Inter",
    "pt": "Inter",
}

VALID_RESUME_LANGUAGES: frozenset[str] = frozenset({"zh", "zh-TW", "en", "pt"})

LANGUAGE_LABELS: dict[str, str] = {
    "zh": "简体中文",
    "zh-TW": "繁體中文",
    "en": "English",
    "pt": "Português (Macau)",
}

EMPLOYER_TYPE_LABELS: dict[str, str] = {
    "soe": "国央企",
    "public": "体制内",
    "foreign": "外企",
    "private": "民企",
    "npo": "非营利社会组织",
    "hmt": "港澳台资企业",
    "other": "其他",
}

VALID_EMPLOYER_TYPES: frozenset[str] = frozenset(EMPLOYER_TYPE_LABELS.keys())


def normalize_employer_type(value: str | None) -> str:
    if not value:
        return ""
    raw = value.strip().lower()
    aliases = {
        "soe": "soe", "state-owned": "soe", "state_owned": "soe", "国央企": "soe", "国企": "soe", "央企": "soe",
        "public": "public", "government": "public", "体制内": "public", "事业单位": "public", "公务员": "public",
        "foreign": "foreign", "mnc": "foreign", "外企": "foreign", "外资": "foreign",
        "private": "private", "民企": "private", "民营企业": "private", "私营": "private",
        "npo": "npo", "ngo": "npo", "non-profit": "npo", "nonprofit": "npo", "非营利": "npo", "社会组织": "npo", "公益": "npo",
        "hmt": "hmt", "港澳台": "hmt", "港澳台资": "hmt", "港资": "hmt", "澳资": "hmt", "台资": "hmt",
        "other": "other", "其他": "other",
    }
    return aliases.get(raw, raw if raw in EMPLOYER_TYPE_LABELS else "")


def employer_type_label(value: str | None) -> str:
    key = normalize_employer_type(value)
    return EMPLOYER_TYPE_LABELS.get(key, value or "")


def normalize_language(language: str | None) -> str:
    if not language:
        return "en"
    raw = language.strip()
    lang = raw.lower().replace("_", "-")
    aliases = {
        "en": "en",
        "english": "en",
        "英文": "en",
        "英语": "en",
        "zh": "zh",
        "zh-cn": "zh",
        "zh-hans": "zh",
        "简体": "zh",
        "中文": "zh",
        "zh-tw": "zh-TW",
        "zh-hant": "zh-TW",
        "繁体": "zh-TW",
        "繁體": "zh-TW",
        "pt": "pt",
        "pt-pt": "pt",
        "pt-mo": "pt",
        "portuguese": "pt",
        "português": "pt",
        "portugues": "pt",
        "葡语": "pt",
        "葡語": "pt",
    }
    mapped = aliases.get(lang, raw if raw in VALID_RESUME_LANGUAGES else "en")
    return mapped if mapped in VALID_RESUME_LANGUAGES else "en"


def is_cjk_resume_language(language: str) -> bool:
    return normalize_language(language) in ("zh", "zh-TW")


def opposite_language(language: str) -> str:
    lang = normalize_language(language)
    if lang == "en":
        return "zh"
    if lang == "pt":
        return "en"
    return "en"


def language_label(language: str) -> str:
    return LANGUAGE_LABELS.get(normalize_language(language), normalize_language(language))


def jd_output_language_instruction(language: str) -> str:
    """Prompt fragment: require JD body in the target output language."""
    lang = normalize_language(language)
    label = language_label(lang)
    if lang == "en":
        return f"Write the entire job description in English ({label}). Use standard English JD structure and wording."
    if lang == "pt":
        return f"Write the entire job description in Portuguese ({label}), suitable for Macau/GBA cross-border hiring."
    if lang == "zh-TW":
        return f"请使用繁体中文（{label}）撰写整份岗位描述，包括岗位名称、职责、任职要求、加分项。"
    return f"请使用简体中文（{label}）撰写整份岗位描述，包括岗位名称、职责、任职要求、加分项。"


def resume_output_language_instruction(language: str) -> str:
    """Prompt fragment: require monolingual resume body text in the target language."""
    lang = normalize_language(language)
    label = language_label(lang)
    if lang == "en":
        return (
            f"Write ALL resume body text in English ({label}). "
            "This includes summary, item titles, bullet content, skill descriptions, "
            "education major/degree wording, role titles, and date formatting. "
            "Do NOT leave Chinese sentences or phrases in any field. "
            "If candidate profile facts are in Chinese, translate them into English first. "
            "Only keep untranslated: proper nouns (company/school names) and "
            "standard technical/professional terms (Python, AWS, Spring Boot). "
            "JSON keys remain English."
        )
    if lang == "pt":
        return (
            f"Escreva TODO o texto do currículo em português ({label}). "
            "Inclui resumo, títulos, bullets, competências, formação, cargos e datas. "
            "Não deixe frases em chinês ou inglês nos campos de texto. "
            "Traduza factos do perfil para português quando necessário. "
            "Mantenha sem tradução apenas nomes próprios e termos técnicos/profissionais "
            "consagrados (Python, AWS, Spring Boot). "
            "As chaves JSON permanecem em inglês."
        )
    if lang == "zh-TW":
        return (
            f"請使用繁體中文（{label}）撰寫簡歷全部正文，"
            "含個人總結、各模組標題、要點描述、技能說明、專業/學位/職位表述及日期格式。"
            "禁止在同一字段或相鄰句子中中英混用（如「負責 developed 後端」）。"
            "若候選人畫像為英文，須先翻譯為繁體中文再寫入，不得直接複製英文句子。"
            "僅保留不譯內容：專有名詞（公司名、學校名）及通用技術/專業術語（Python、React、AWS）。"
            "JSON 的 key 仍使用英文。"
        )
    return (
        f"请使用简体中文（{label}）撰写简历全部正文，"
        "包括个人总结、各模块标题、要点描述、技能说明、专业/学位/职位表述及日期格式。"
        "禁止在同一字段或相邻句子中中英混用（如「负责 developed 后端」）。"
        "若候选人画像为英文，须先翻译为简体中文再写入，不得直接复制英文句子。"
        "仅保留不译内容：专有名词（公司名、学校名）及通用技术/专业术语（Python、React、AWS）。"
        "JSON 的 key 仍使用英文。"
    )


def apply_a4_compact_render_config(config: "RenderConfig", language: str) -> "RenderConfig":
    """Apply entry-level single-page A4 defaults for a target language."""
    from tools.resume_page_policy import apply_render_config_for_experience

    return apply_render_config_for_experience(config, language, "entry")
