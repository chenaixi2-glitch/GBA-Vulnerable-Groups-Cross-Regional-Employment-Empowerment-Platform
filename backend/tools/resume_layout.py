"""Resume layout helpers — language defaults and A4 compact settings."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from workflow.state import RenderConfig

SECTION_LABELS: dict[str, dict[str, str]] = {
    "zh": {
        "profile": "基本信息",
        "summary": "个人总结",
        "skills": "专业技能",
        "internships": "实习经历",
        "projects": "项目经历",
        "awards": "获奖经历",
        "papers": "论文",
    },
    "zh-TW": {
        "profile": "基本資料",
        "summary": "個人總結",
        "skills": "專業技能",
        "internships": "實習經歷",
        "projects": "項目經歷",
        "awards": "獲獎經歷",
        "papers": "論文",
    },
    "en": {
        "profile": "Contact",
        "summary": "Professional Summary",
        "skills": "Skills",
        "internships": "Work Experience",
        "projects": "Projects",
        "awards": "Honors & Awards",
        "papers": "Publications",
    },
    "pt": {
        "profile": "Contactos",
        "summary": "Resumo Profissional",
        "skills": "Competências",
        "internships": "Experiência Profissional",
        "projects": "Projectos",
        "awards": "Prémios e Distinções",
        "papers": "Publicações",
    },
}

SECTION_ORDER_BY_LANGUAGE: dict[str, list[str]] = {
    "zh": ["profile", "summary", "skills", "projects", "internships", "awards"],
    "zh-TW": ["profile", "summary", "skills", "projects", "internships", "awards"],
    "en": ["profile", "summary", "internships", "projects", "skills", "awards"],
    "pt": ["profile", "summary", "internships", "projects", "skills", "awards"],
}

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
        return "zh"
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
    mapped = aliases.get(lang, raw if raw in VALID_RESUME_LANGUAGES else "zh")
    return mapped if mapped in VALID_RESUME_LANGUAGES else "zh"


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
            "education major/degree wording, and date formatting. "
            "Do NOT leave Chinese sentences or phrases in any field. "
            "If candidate profile facts are in Chinese, translate them into English first. "
            "Proper nouns (company/school names) may stay unchanged; "
            "technical terms (Python, AWS) stay in English. JSON keys remain English."
        )
    if lang == "pt":
        return (
            f"Escreva TODO o texto do currículo em português ({label}). "
            "Inclui resumo, títulos, bullets, competências, formação e datas. "
            "Não deixe frases em chinês ou inglês nos campos de texto. "
            "Traduza factos do perfil para português quando necessário. "
            "Nomes próprios podem manter-se; termos técnicos (Python, AWS) em inglês. "
            "As chaves JSON permanecem em inglês."
        )
    if lang == "zh-TW":
        return (
            f"請使用繁體中文（{label}）撰寫簡歷全部正文，"
            "含個人總結、各模組標題、要點描述、技能說明、專業/學位表述及日期格式。"
            "禁止在同一字段或相鄰句子中中英混用（如「負責 developed 後端」）。"
            "若候選人畫像為英文，須先翻譯為繁體中文再寫入，不得直接複製英文句子。"
            "專有名詞（公司名、學校名）可保留原文；技能列表中的通用技術名（Python、React）可保留英文。"
            "JSON 的 key 仍使用英文。"
        )
    return (
        f"请使用简体中文（{label}）撰写简历全部正文，"
        "包括个人总结、各模块标题、要点描述、技能说明、专业/学位表述及日期格式。"
        "禁止在同一字段或相邻句子中中英混用（如「负责 developed 后端」）。"
        "若候选人画像为英文，须先翻译为简体中文再写入，不得直接复制英文句子。"
        "专有名词（公司名、学校名）可保留原文；技能列表中的通用技术名（Python、React）可保留英文。"
        "JSON 的 key 仍使用英文。"
    )


def apply_a4_compact_render_config(config: "RenderConfig", language: str) -> "RenderConfig":
    """Apply entry-level single-page A4 defaults for a target language."""
    from tools.resume_page_policy import apply_render_config_for_experience

    return apply_render_config_for_experience(config, language, "entry")
