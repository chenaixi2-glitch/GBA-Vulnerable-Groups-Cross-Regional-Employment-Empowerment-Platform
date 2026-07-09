/**
 * Resume language format checklist — inline markers on profile editor sections
 */

const CHECKLIST_SEVERITY_STYLES = {
    required: { ring: 'ring-red-300', border: 'border-red-300', badge: 'bg-red-100 text-red-800', icon: 'fa-circle-exclamation text-red-500' },
    recommended: { ring: 'ring-amber-300', border: 'border-amber-300', badge: 'bg-amber-100 text-amber-800', icon: 'fa-lightbulb text-amber-500' },
    warning: { ring: 'ring-orange-300', border: 'border-orange-300', badge: 'bg-orange-100 text-orange-800', icon: 'fa-triangle-exclamation text-orange-500' },
    ok: { ring: 'ring-green-300', border: 'border-green-300', badge: 'bg-green-100 text-green-800', icon: 'fa-check-circle text-green-500' },
};

const CHECKLIST_SEVERITY_LABELS = {
    zh: { required: '必填', recommended: '建议', warning: '注意', ok: '已满足' },
    'zh-TW': { required: '必填', recommended: '建議', warning: '注意', ok: '已滿足' },
    en: { required: 'Required', recommended: 'Recommended', warning: 'Warning', ok: 'OK' },
    pt: { required: 'Obrigatório', recommended: 'Recomendado', warning: 'Aviso', ok: 'OK' },
};

/** Map checklist field keys to profile editor DOM targets */
const FORMAT_CHECK_FIELD_TARGETS = {
    photo: '#profile-photo-section',
    name: '#profile-name',
    phone: '#profile-phone',
    email: '#profile-email',
    city: '#profile-city',
    address: '#profile-address',
    age: '#profile-age',
    gender: '#profile-gender',
    native_place: '#profile-native-place',
    political_status: '#profile-political-status',
    linkedin: '#profile-linkedin',
    visa_type: '#profile-visa-type',
    resident_type: '#profile-resident-type',
    experience_any: '#profile-editor-body',
    education: '[data-section-type="education"]',
    internships: '[data-section-type="internship"]',
    projects: '[data-section-type="project"]',
    skills: '[data-section-type="skill"]',
    awards: '[data-section-type="award"]',
    summary: '#profile-summary',
    volunteer: '[data-section-type="custom"]',
    metrics: '[data-section-type="internship"]',
    language_certs: '[data-section-type="skill"]',
    employer_type: '#profile-supplement-section',
    page_limit: '#profile-editor-body',
    wording: '[data-section-type="internship"]',
};

const FORMAT_CHECK_HINT_ROW_BG = {
    required: 'bg-red-50 border-red-200',
    recommended: 'bg-amber-50 border-amber-200',
    warning: 'bg-orange-50 border-orange-200',
};

/** Localize checklist item by stable id — never show raw backend label/message/suggestion. */
const CHECKLIST_ITEM_FALLBACKS = {
    zh_photo: { label: 'ID Photo', message: 'Simplified Chinese resumes require a formal ID photo', suggestion: 'Upload a 1-inch photo on white/light blue background' },
    zh_photo_strict: { label: 'ID Photo', message: 'Simplified Chinese resumes require a formal ID photo', suggestion: 'Upload a 1-inch photo on white/light blue background' },
    zh_name: { label: 'Name', message: 'Name is required at the top of a Chinese resume', suggestion: 'Fill in your name in basic info' },
    zh_phone: { label: 'Phone', message: 'Mobile number is required', suggestion: 'Format: 138 XXXX XXXX' },
    zh_email: { label: 'Email', message: 'Email is a standard contact on Chinese resumes', suggestion: 'e.g. xxx@163.com' },
    zh_address: { label: 'Address', message: 'Chinese resumes usually include full address', suggestion: 'e.g. XX District, Guangzhou, Guangdong' },
    zh_age: { label: 'Age', message: 'Age is commonly listed on Chinese resumes', suggestion: 'Add age in personal info' },
    zh_gender: { label: 'Gender', message: 'Gender is commonly listed on Chinese resumes', suggestion: 'Male / Female' },
    zh_native: { label: 'Native place', message: 'Native place is common on Chinese resumes', suggestion: 'e.g. Guangzhou, Guangdong' },
    zh_political: { label: 'Political status', message: 'Some employers may ask for political status', suggestion: 'Party member / League member / Non-party' },
    zh_political_strict: { label: 'Political status', message: 'SOE/public-sector roles often require political status', suggestion: 'Party member / League member / Non-party' },
    zh_education: { label: 'Education', message: 'Education follows personal info on Chinese resumes', suggestion: 'School, major, degree, dates' },
    zh_experience: { label: 'Work / Internship', message: 'Work or internship experience is optional but strengthens your profile', suggestion: 'Reverse chronological order with duties and results' },
    zh_experience_any: { label: 'Experience (at least one)', message: 'At least one of: internship, work, campus, or volunteer experience is required', suggestion: 'Add work/internship, project (campus), or other (volunteer) entries' },
    zh_projects: { label: 'Projects', message: 'Project experience is strongly recommended for tech roles', suggestion: 'Highlight stack and your contribution' },
    zh_skills: { label: 'Skills / Certificates', message: 'List skills and certifications', suggestion: 'e.g. CET-6, Computer Level 2, Python' },
    zh_awards: { label: 'Awards', message: 'Honors strengthen your profile', suggestion: 'List 2–4 key awards' },
    zh_summary: { label: 'Self introduction', message: 'Chinese resumes often include a self-introduction', suggestion: '2–4 sentences on strengths and role fit; avoid vague adjectives' },
    zh_foreign_employer: { label: 'Foreign employer (Chinese resume)', message: 'For foreign employers, Chinese resumes should be more results-oriented', suggestion: 'Highlight metrics, cross-cultural work, and languages' },
    zh_hmt_employer: { label: 'HK/Macau/TW employer (Chinese resume)', message: 'For HK/Macau/TW employers, focus on results over generic self-praise', suggestion: 'Highlight metrics and language skills (Cantonese/English/Mandarin)' },
    zh_npo_mission: { label: 'Volunteer / NGO', message: 'Non-profit roles value social mission and volunteer work', suggestion: 'Add NGO projects and community impact' },
    zh_soe_photo: { label: 'SOE/public ID photo', message: 'ID photo is almost mandatory for SOE/public-sector applications', suggestion: 'Add a formal 1-inch photo on white/light blue background' },
    en_no_photo_warn: { label: 'Profile photo', message: 'Western English resumes must not include a photo', suggestion: 'Remove the photo; professional headshots are optional only in some HK/SG finance roles' },
    en_no_photo_ok: { label: 'No profile photo', message: 'Meets Western English resume convention (no photo)', suggestion: '' },
    en_name: { label: 'Name (header)', message: 'Name is the largest header; do not use a big “Resume/CV” title', suggestion: 'FirstName LastName only' },
    en_phone: { label: 'Phone', message: 'Mobile number required', suggestion: 'Include country code if applicable' },
    en_email: { label: 'Email', message: 'Professional email required', suggestion: 'Use a clean address, not a nickname' },
    en_city: { label: 'City only', message: 'City is recommended; list city only, not full street address', suggestion: 'e.g. Guangzhou, China' },
    en_linkedin: { label: 'LinkedIn', message: 'LinkedIn URL is strongly recommended', suggestion: 'https://linkedin.com/in/yourname' },
    en_forbid_age: { label: 'Age', message: 'Age must not appear on Western English resumes', suggestion: 'Remove age from the resume' },
    en_forbid_gender: { label: 'Gender', message: 'Gender must not appear on Western English resumes', suggestion: 'Remove gender from the resume' },
    en_forbid_marital: { label: 'Marital status', message: 'Marital status must not appear on Western English resumes', suggestion: 'Remove marital status from the resume' },
    en_forbid_ethnicity: { label: 'Ethnicity / height / native place', message: 'Ethnicity, height, or native place should not appear', suggestion: 'Remove these fields from the resume' },
    en_forbid_political: { label: 'Political status / ID number', message: 'Political status or ID numbers must not appear', suggestion: 'Remove these fields from the resume' },
    en_forbid_dob: { label: 'Date of birth', message: 'Date of birth must not appear on Western English resumes', suggestion: 'Remove date of birth from the resume' },
    en_summary: { label: 'Professional Summary', message: 'A 3–4 line Professional Summary is recommended', suggestion: 'Summarize core skills and results; avoid vague traits like “hardworking”' },
    en_summary_long: { label: 'Summary too long', message: 'Keep the summary to 3–4 lines', suggestion: 'Trim to key selling points and keep the resume within the page limit' },
    en_experience: { label: 'Work Experience', message: 'Work or internship experience is optional but strengthens your profile', suggestion: 'Start bullets with action verbs and quantify results' },
    en_experience_any: { label: 'Experience (at least one)', message: 'At least one of: internship, work, campus, or volunteer experience is required', suggestion: 'Add work/internship, project (campus), or other (volunteer) entries' },
    en_quantified: { label: 'Quantified results', message: 'Experience bullets should use action verbs and metrics', suggestion: 'Action verb + task + measurable result' },
    en_education: { label: 'Education', message: 'Education follows work experience', suggestion: 'Degree in English, e.g. B.S. in Computer Science' },
    en_skills: { label: 'Skills', message: 'Skills section after experience, compact list', suggestion: 'Group by category, comma-separated' },
    en_lang_cert_cet: { label: 'Language certification', message: 'CET-4/6 has low recognition on Western English resumes', suggestion: 'Add IELTS/TOEFL if available, or write Fluent English' },
    en_lang_cert: { label: 'English proficiency', message: 'Note English proficiency on English resumes', suggestion: 'IELTS 7.0 / TOEFL 100 / Fluent English' },
    en_lang_cert_ok: { label: 'English proficiency', message: 'International language credentials are listed', suggestion: '' },
    en_one_page: { label: 'Page limit', message: 'Keep the English resume within the recommended page count', suggestion: 'Remove secondary content and stay concise' },
    en_no_subjective: { label: 'Subjective traits', message: 'Avoid subjective adjectives without evidence', suggestion: 'Replace with quantified outcomes and action verbs' },
    tw_no_photo_warn: { label: 'Profile photo', message: 'Traditional Chinese cross-border resumes should not include a photo', suggestion: 'Remove the photo; professional headshots are optional only in some HK/SG finance roles' },
    tw_no_photo_ok: { label: 'No profile photo', message: 'Meets cross-border resume convention (no photo)', suggestion: '' },
    tw_name: { label: 'Name', message: 'Name is the largest header on the resume', suggestion: 'FirstName LastName only — no big Resume/CV title' },
    tw_phone: { label: 'Phone', message: 'Mobile number required', suggestion: 'Include country code if applicable' },
    tw_email: { label: 'Email', message: 'Professional email required', suggestion: 'Use a clean address, not a nickname' },
    tw_city: { label: 'City', message: 'City is recommended on cross-border resumes', suggestion: 'e.g. Hong Kong / Guangzhou — not full street address' },
    tw_visa_type: { label: 'Visa type', message: 'Cross-border resumes require visa/stay status', suggestion: 'e.g. Employment visa / Home Return Permit' },
    tw_resident_type: { label: 'Resident type', message: 'Cross-border resumes require resident status', suggestion: 'e.g. HK permanent resident / Macau resident' },
    tw_linkedin: { label: 'LinkedIn', message: 'LinkedIn URL is strongly recommended', suggestion: 'https://linkedin.com/in/yourname' },
    tw_summary: { label: 'Professional Summary', message: 'A 3–4 line Professional Summary is recommended', suggestion: 'Summarize core skills and results; avoid vague traits' },
    tw_experience: { label: 'Work Experience', message: 'Work experience is optional but strengthens your profile', suggestion: 'Start bullets with action verbs and quantify results' },
    tw_experience_any: { label: 'Experience (at least one)', message: 'At least one of: internship, work, campus, or volunteer experience is required', suggestion: 'Add work/internship, project (campus), or other (volunteer) entries' },
    tw_education: { label: 'Education', message: 'Education section is required', suggestion: 'Degree in English, e.g. B.S. in Computer Science' },
    tw_one_page: { label: 'Page limit', message: 'Keep the resume within the recommended page count', suggestion: 'Remove secondary content and stay concise' },
};

/** Legacy field map — used only when item id is unknown */
const CHECKLIST_FIELD_I18N = {
    photo: { label: ['resume.checklist.photo', 'ID Photo'], message: ['resume.checklist.photoMsg', 'Profile photo for Chinese resumes'] },
    name: { label: ['resume.checklist.name', 'Name'], message: ['resume.checklist.nameMsg', 'Name is required in the resume header'] },
    phone: { label: ['resume.checklist.phone', 'Phone'], message: ['resume.checklist.phoneMsg', 'Mobile number is required'] },
    email: { label: ['resume.checklist.email', 'Email'], message: ['resume.checklist.emailMsg', 'Email is required'] },
    city: { label: ['resume.checklist.city', 'City'], message: ['resume.checklist.cityMsg', 'City only — no full street address for English resumes'] },
    address: { label: ['resume.checklist.address', 'Address'], message: ['resume.checklist.addressMsg', 'Chinese resumes usually include full address'] },
    age: { label: ['resume.checklist.age', 'Age'], message: ['resume.checklist.ageMsg', 'Age is commonly listed on Chinese resumes'] },
    gender: { label: ['resume.checklist.gender', 'Gender'], message: ['resume.checklist.genderMsg', 'Gender is commonly listed on Chinese resumes'] },
    native_place: { label: ['resume.checklist.nativePlace', 'Native place'], message: ['resume.checklist.nativePlaceMsg', 'Native place is common on Chinese resumes'] },
    political_status: { label: ['resume.checklist.politicalStatus', 'Political status'], message: ['resume.checklist.politicalStatusMsg', 'Political status may be required for SOE/public sector roles'] },
    linkedin: { label: ['resume.checklist.linkedin', 'LinkedIn'], message: ['resume.checklist.linkedinMsg', 'English resumes strongly recommend a LinkedIn URL'] },
    visa_type: { label: ['resume.checklist.visaType', 'Visa type'], message: ['resume.checklist.visaTypeMsg', 'Cross-border resumes require visa/stay status'] },
    resident_type: { label: ['resume.checklist.residentType', 'Resident type'], message: ['resume.checklist.residentTypeMsg', 'Cross-border resumes require resident status'] },
    experience_any: { label: ['resume.checklist.experienceAny', 'Experience (at least one)'], message: ['resume.checklist.experienceAnyMsg', 'At least one of internship, work, campus, or volunteer experience is required'] },
    education: { label: ['resume.checklist.education', 'Education'], message: ['resume.checklist.educationMsg', 'Education section is required'] },
    internships: { label: ['resume.checklist.work', 'Work / Internship'], message: ['resume.checklist.workMsg', 'Work or internship experience is required'] },
    projects: { label: ['resume.checklist.projects', 'Projects'], message: ['resume.checklist.projectsMsg', 'Project experience is recommended for tech roles'] },
    skills: { label: ['resume.checklist.skills', 'Skills / Certificates'], message: ['resume.checklist.skillsMsg', 'List skills and certifications'] },
    awards: { label: ['resume.checklist.awards', 'Awards'], message: ['resume.checklist.awardsMsg', 'Honors and awards strengthen your profile'] },
    summary: { label: ['resume.checklist.summary', 'Summary'], message: ['resume.checklist.summaryMsg', 'Add a professional summary or self-introduction'] },
    volunteer: { label: ['resume.checklist.volunteer', 'Volunteer / NGO'], message: ['resume.checklist.volunteerMsg', 'Non-profit roles value volunteer experience'] },
    metrics: { label: ['resume.checklist.metrics', 'Quantified results'], message: ['resume.checklist.metricsMsg', 'Use action verbs and measurable outcomes'] },
    language_certs: { label: ['resume.checklist.languageCerts', 'Language proficiency'], message: ['resume.checklist.languageCertsMsg', 'Note English proficiency or IELTS/TOEFL scores'] },
};

function resolveChecklistItemKey(item, checklist) {
    const id = item.id || '';
    const employer = checklist?.employer_type || '';
    const strict = employer === 'soe' || employer === 'public';

    if (id === 'zh_photo' && strict) return 'zh_photo_strict';
    if (id === 'zh_photo') return 'zh_photo_strict';
    if (id === 'zh_political' && strict) return 'zh_political_strict';
    if (id === 'en_no_photo') return item.severity === 'warning' ? 'en_no_photo_warn' : 'en_no_photo_ok';
    if (id === 'tw_no_photo') return item.severity === 'warning' ? 'tw_no_photo_warn' : 'tw_no_photo_ok';
    if (id === 'en_lang_cert') {
        if (item.severity === 'ok') return 'en_lang_cert_ok';
        if (item.severity === 'warning') return 'en_lang_cert_cet';
        return 'en_lang_cert';
    }
    return id;
}

function checklistItemPart(itemKey, part, fallback) {
    const key = `resume.checklistItems.${itemKey}.${part}`;
    const fb = CHECKLIST_ITEM_FALLBACKS[itemKey];
    const defaultText = (fb && fb[part]) || fallback || '';
    const translated = uiText(key, defaultText, null);
    // GBAI18n.t returns the key itself when lookup misses and fallback is empty — never show that.
    if (translated && translated !== key) return translated;
    return defaultText;
}

function localizeChecklistItem(item, checklist) {
    const itemKey = resolveChecklistItemKey(item, checklist);
    const label = checklistItemPart(itemKey, 'label', '');
    const message = checklistItemPart(itemKey, 'message', '');
    const suggestion = checklistItemPart(itemKey, 'suggestion', '');

    if (label || message || suggestion) {
        return {
            ...item,
            label: label || item.field || '',
            message,
            suggestion,
        };
    }

    const field = item.field || '';
    const texts = CHECKLIST_FIELD_I18N[field];
    if (!texts) {
        return { ...item, label: field || '', message: '', suggestion: '' };
    }
    return {
        ...item,
        label: uiText(texts.label[0], texts.label[1], null) || field,
        message: uiText(texts.message[0], texts.message[1], null) || '',
        suggestion: '',
    };
}

function buildLocalizedChecklistSummary(checklist) {
    const items = checklist.items || [];
    const required = items.filter((i) => i.missing && i.severity === 'required');
    const recommended = items.filter((i) => i.missing && i.severity === 'recommended');
    const warnings = items.filter((i) => i.missing && i.severity === 'warning');
    if (!required.length && !recommended.length && !warnings.length) {
        return uiText('resume.checklistComplete', 'Core sections look good! Double-check photo policy and one-page layout.');
    }
    const parts = [uiText('resume.checklistSummaryPrefix', 'Resume reminders:')];
    if (required.length) {
        parts.push(uiText('resume.checklistRequired', '{count} required: {labels}', {
            count: required.length,
            labels: required.slice(0, 5).map((i) => i.label).join(', '),
        }));
    }
    if (recommended.length) {
        parts.push(uiText('resume.checklistRecommended', '{count} recommended: {labels}', {
            count: recommended.length,
            labels: recommended.slice(0, 5).map((i) => i.label).join(', '),
        }));
    }
    if (warnings.length) {
        parts.push(uiText('resume.checklistWarnings', '{count} format warnings', { count: warnings.length }));
    }
    return parts.join(' ');
}

function localizeChecklist(checklist) {
    if (!checklist) return checklist;
    const items = (checklist.items || []).map((item) => localizeChecklistItem(item, checklist));
    return {
        ...checklist,
        items,
        summary: buildLocalizedChecklistSummary({ ...checklist, items }),
    };
}

const FORMAT_CHECK_SEVERITY_RANK = { required: 3, warning: 2, recommended: 1, ok: 0 };

function normalizeResumeLang(code) {
    if (window.GBAI18n && GBAI18n.normalizeResumeLang) return GBAI18n.normalizeResumeLang(code);
    const lower = String(code || 'zh').toLowerCase().replace('_', '-');
    if (lower === 'en') return 'en';
    if (lower === 'zh-tw') return 'zh-TW';
    if (lower === 'pt') return 'pt';
    return 'zh';
}

function isCjkResumeLang(code) {
    const lang = normalizeResumeLang(code);
    return lang === 'zh' || lang === 'zh-TW';
}

function resumeLangDisplayLabel(code) {
    if (window.GBAI18n && GBAI18n.resumeLangLabel) return GBAI18n.resumeLangLabel(code);
    const lang = normalizeResumeLang(code);
    return { zh: '简体中文', 'zh-TW': '繁體中文', en: 'English', pt: 'Português' }[lang] || lang;
}

function checklistSeverityLabels() {
    const uiLang = (window.GBAI18n && GBAI18n.getLang) ? GBAI18n.getLang() : 'en';
    const key = uiLang === 'zh-CN' ? 'zh' : uiLang === 'zh-TW' ? 'zh-TW' : uiLang;
    return CHECKLIST_SEVERITY_LABELS[key] || CHECKLIST_SEVERITY_LABELS.en;
}

function uiText(key, fallback, vars) {
    if (window.GBAI18n && GBAI18n.t) return GBAI18n.t(key, fallback, vars);
    var msg = fallback || key;
    if (vars) {
        Object.keys(vars).forEach(function (k) {
            msg = String(msg).replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
        });
    }
    return msg;
}

let lastChecklistData = null;
let lastRawChecklistData = null;

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function clearFormatCheckMarkers() {
    document.querySelectorAll('.format-check-target').forEach((el) => {
        el.classList.remove(
            'format-check-target',
            'ring-2',
            'ring-red-300',
            'ring-amber-300',
            'ring-orange-300',
            'border-red-300',
            'border-amber-300',
            'border-orange-300'
        );
        el.querySelectorAll('.format-check-inline-badge').forEach((badge) => badge.remove());
    });
    document.querySelectorAll('.format-check-inline-hint').forEach((hint) => hint.remove());

    const hints = document.getElementById('profile-format-hints');
    if (hints) {
        hints.classList.add('hidden');
        hints.innerHTML = '';
    }
}

function resolveFormatCheckTarget(item) {
    const field = item.field || '';
    const category = item.category || '';
    if (category === 'forbidden') {
        return document.getElementById('profile-summary') ? '#profile-summary' : '#profile-editor-body';
    }
    return FORMAT_CHECK_FIELD_TARGETS[field] || FORMAT_CHECK_FIELD_TARGETS[category] || null;
}

function getFormatCheckContainer(selector) {
    const el = document.querySelector(selector);
    if (!el) return null;
    if (el.matches('input, textarea, select')) {
        return el.parentElement;
    }
    return el;
}

function insertInlineHint(container, hintEl) {
    if (container.id === 'profile-photo-section') {
        container.appendChild(hintEl);
        return;
    }
    if (container.id === 'profile-supplement-section') {
        const intro = container.querySelector('p.text-xs');
        if (intro) {
            intro.insertAdjacentElement('afterend', hintEl);
            return;
        }
    }
    if (container.dataset && container.dataset.sectionType) {
        const headerRow = container.querySelector(':scope > .flex, :scope > div');
        if (headerRow) {
            headerRow.insertAdjacentElement('afterend', hintEl);
            return;
        }
    }
    const directInput = container.querySelector(':scope > input, :scope > textarea, :scope > select');
    if (directInput) {
        directInput.insertAdjacentElement('afterend', hintEl);
        return;
    }
    const nestedInput = container.querySelector('input, textarea, select');
    if (nestedInput) {
        nestedInput.insertAdjacentElement('afterend', hintEl);
        return;
    }
    const header = container.querySelector('h4');
    if (header) {
        header.insertAdjacentElement('afterend', hintEl);
        return;
    }
    container.appendChild(hintEl);
}

function appendInlineHint(container, item, labels) {
    if (!container || container.querySelector('.format-check-inline-hint')) return;

    const style = CHECKLIST_SEVERITY_STYLES[item.severity] || CHECKLIST_SEVERITY_STYLES.recommended;
    const severityLabel = labels[item.severity] || item.severity;
    const rowBg = FORMAT_CHECK_HINT_ROW_BG[item.severity] || FORMAT_CHECK_HINT_ROW_BG.recommended;

    const hint = document.createElement('div');
    hint.className = `format-check-inline-hint mt-1.5 flex items-start gap-2 p-2 rounded-lg border text-xs ${rowBg}`;
    hint.innerHTML = `
        <i class="fas ${style.icon} mt-0.5 shrink-0"></i>
        <div class="min-w-0">
            <span class="font-medium text-gray-900">${escapeHtml(item.label || '')}</span>
            <span class="ml-1 px-1.5 py-0.5 rounded ${style.badge}">${escapeHtml(severityLabel)}</span>
            ${item.message ? `<p class="text-gray-700 mt-0.5">${escapeHtml(item.message)}</p>` : ''}
            ${item.suggestion ? `<p class="text-gray-500 mt-0.5"><i class="fas fa-arrow-right mr-1"></i>${escapeHtml(item.suggestion)}</p>` : ''}
        </div>`;

    insertInlineHint(container, hint);

    const labelEl = container.querySelector('label');
    if (labelEl && !labelEl.querySelector('.format-check-inline-badge')) {
        const badge = document.createElement('span');
        badge.className = `format-check-inline-badge ml-2 px-2 py-0.5 rounded text-xs font-medium ${style.badge}`;
        badge.textContent = severityLabel;
        labelEl.appendChild(badge);
    }
}

function renderOrphanFormatHints(orphaned, labels) {
    const hintsEl = document.getElementById('profile-format-hints');
    if (!hintsEl || !orphaned.length) return;

    hintsEl.classList.remove('hidden');
    hintsEl.innerHTML = orphaned.map((item) => {
        const style = CHECKLIST_SEVERITY_STYLES[item.severity] || CHECKLIST_SEVERITY_STYLES.recommended;
        const rowBg = FORMAT_CHECK_HINT_ROW_BG[item.severity] || FORMAT_CHECK_HINT_ROW_BG.recommended;
        const severityLabel = labels[item.severity] || item.severity;
        return `
            <div class="flex items-start gap-2 p-2 mb-1 rounded-lg border ${rowBg}">
                <i class="fas ${style.icon} mt-0.5"></i>
                <div class="min-w-0">
                    <span class="font-medium text-sm text-gray-900">${escapeHtml(item.label)}</span>
                    <span class="ml-1 text-xs ${style.badge} px-1.5 py-0.5 rounded">${escapeHtml(severityLabel)}</span>
                    <p class="text-xs text-gray-700 mt-0.5">${escapeHtml(item.message)}</p>
                    ${item.suggestion ? `<p class="text-xs text-gray-500 mt-0.5"><i class="fas fa-arrow-right mr-1"></i>${escapeHtml(item.suggestion)}</p>` : ''}
                </div>
            </div>`;
    }).join('');
}

function applyFormatCheckToProfileEditor(checklist) {
    clearFormatCheckMarkers();
    const localized = localizeChecklist(checklist);
    if (!localized || !localized.items || !localized.items.length) return;

    if (typeof ProfileEditor !== 'undefined' && ProfileEditor.ensureMissingSlotsFromChecklist) {
        const slotsAdded = ProfileEditor.ensureMissingSlotsFromChecklist(localized);
        if (slotsAdded) {
            ProfileEditor.render();
            return applyFormatCheckToProfileEditor(localized);
        }
    }

    const profileSection = document.getElementById('profile-editor-section');
    if (!profileSection || profileSection.classList.contains('hidden')) return;

    const labels = checklistSeverityLabels();
    const actionable = localized.items.filter((item) => item.missing && item.severity !== 'ok');

    if (!actionable.length) {
        const hints = document.getElementById('profile-format-hints');
        if (hints) {
            hints.classList.remove('hidden');
            hints.innerHTML = `
                <div class="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                    <i class="fas fa-check-circle mr-2"></i>
                    ${escapeHtml(uiText(
                        'resume.checklistComplete',
                        'Core sections look good! Double-check photo policy and one-page layout.'
                    ))}
                </div>`;
        }
        return;
    }

    const targetBest = new Map();
    actionable.forEach((item) => {
        const selector = resolveFormatCheckTarget(item);
        if (!selector) return;
        const prev = targetBest.get(selector);
        const rank = FORMAT_CHECK_SEVERITY_RANK[item.severity] || 0;
        if (!prev || rank > (FORMAT_CHECK_SEVERITY_RANK[prev.severity] || 0)) {
            targetBest.set(selector, item);
        }
    });

    targetBest.forEach((item, selector) => {
        const container = getFormatCheckContainer(selector);
        if (!container) return;
        const style = CHECKLIST_SEVERITY_STYLES[item.severity] || CHECKLIST_SEVERITY_STYLES.recommended;
        container.classList.add('format-check-target', 'ring-2', style.ring, style.border);
        appendInlineHint(container, item, labels);
    });

    const orphaned = actionable.filter((item) => {
        const selector = resolveFormatCheckTarget(item);
        return !selector || !getFormatCheckContainer(selector);
    });
    renderOrphanFormatHints(orphaned, labels);
}

function draftHasAnyExperienceTrack(draft) {
    const modules = draft?.modules || [];
    const hasContent = (module) => String(module.content || module.title || '').trim();
    return modules.some((m) => m.type === 'internship' && hasContent(m))
        || modules.some((m) => m.type === 'project' && hasContent(m))
        || modules.some((m) => m.type === 'custom' && hasContent(m));
}

function draftHasPhoto(draft) {
    const extras = draft?.profile_basic?.extras || {};
    return !!(extras.photo_url || extras.has_photo === 'true');
}

function getRequiredMissingFromDraft(draft, language) {
    if (!draft) return [];
    const lang = normalizeResumeLang(language);
    const basic = draft.profile_basic || {};
    const extras = basic.extras || {};
    const missing = [];

    const push = (field, labelKey, fallback) => {
        missing.push({
            field,
            label: uiText(labelKey, fallback, null) || fallback,
            severity: 'required',
            missing: true,
        });
    };

    if (lang === 'zh') {
        if (!(basic.name || '').trim()) push('name', 'resume.checklist.name', 'Name');
        if (!(basic.phone || '').trim()) push('phone', 'resume.checklist.phone', 'Phone');
        if (!(basic.email || '').trim()) push('email', 'resume.checklist.email', 'Email');
        if (!draftHasPhoto(draft)) push('photo', 'resume.checklist.photo', 'ID Photo');
        const hasEdu = (draft.education || []).some(
            (e) => String(e.school || e.major || e.degree || '').trim()
        );
        if (!hasEdu) push('education', 'resume.checklist.education', 'Education');
        if (!draftHasAnyExperienceTrack(draft)) {
            push('experience_any', 'resume.checklist.experienceAny', 'Experience (at least one)');
        }
    } else if (lang === 'zh-TW') {
        if (!(basic.name || '').trim()) push('name', 'resume.checklist.name', 'Name');
        if (!(basic.phone || '').trim()) push('phone', 'resume.checklist.phone', 'Phone');
        if (!(basic.email || '').trim()) push('email', 'resume.checklist.email', 'Email');
        if (!(extras.visa_type || '').trim()) push('visa_type', 'resume.checklist.visaType', 'Visa type');
        if (!(extras.resident_type || '').trim()) push('resident_type', 'resume.checklist.residentType', 'Resident type');
        const hasEdu = (draft.education || []).some(
            (e) => String(e.school || e.major || e.degree || '').trim()
        );
        if (!hasEdu) push('education', 'resume.checklist.education', 'Education');
        if (!draftHasAnyExperienceTrack(draft)) {
            push('experience_any', 'resume.checklist.experienceAny', 'Experience (at least one)');
        }
    } else if (lang === 'en' || lang === 'pt') {
        if (!(basic.name || '').trim()) push('name', 'resume.checklist.name', 'Name');
        if (!(basic.phone || '').trim()) push('phone', 'resume.checklist.phone', 'Phone');
        if (!(basic.email || '').trim()) push('email', 'resume.checklist.email', 'Email');
        const hasEdu = (draft.education || []).some(
            (e) => String(e.school || e.major || e.degree || '').trim()
        );
        if (!hasEdu) push('education', 'resume.checklist.education', 'Education');
        if (!draftHasAnyExperienceTrack(draft)) {
            push('experience_any', 'resume.checklist.experienceAny', 'Experience (at least one)');
        }
    }

    return missing;
}

function getRequiredMissingFromChecklist(checklist) {
    const items = checklist?.items || [];
    return items.filter((item) => item.missing && item.severity === 'required');
}

function ensureEditViewForProfileNavigation() {
    if (typeof currentResumeView !== 'undefined' && currentResumeView === 'edit') return false;
    if (typeof setResumeView === 'function') {
        setResumeView('edit');
        return true;
    }
    document.getElementById('profile-editor-section')?.classList.remove('hidden');
    document.getElementById('resume-preview-section')?.classList.add('hidden');
    return true;
}

function scrollToChecklistField(item) {
    ensureEditViewForProfileNavigation();
    const selector = resolveFormatCheckTarget(item);
    if (!selector) {
        document.getElementById('profile-editor-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }
    const container = getFormatCheckContainer(selector);
    if (!container) {
        document.getElementById('profile-editor-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }
    container.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const focusable = container.querySelector('input:not([type="file"]), textarea, select, button');
    if (focusable && typeof focusable.focus === 'function') {
        setTimeout(() => focusable.focus({ preventScroll: true }), 300);
    }
}

function updateProfileContinueUi(checklist) {
    const section = document.getElementById('profile-continue-section');
    const banner = document.getElementById('profile-required-banner');
    const countEl = document.getElementById('profile-required-count');
    if (!section) return;

    const profileVisible = !document.getElementById('profile-editor-section')?.classList.contains('hidden');
    const jdHidden = document.getElementById('jd-section')?.classList.contains('hidden');
    section.classList.toggle('hidden', !profileVisible || !jdHidden);

    const required = getRequiredMissingFromChecklist(checklist || lastChecklistData);
    const missingCount = required.length;

    if (banner) {
        banner.classList.toggle('hidden', !profileVisible || !jdHidden || missingCount === 0);
    }
    if (countEl) {
        countEl.textContent = missingCount > 0
            ? uiText('resume.profileRequiredCount', '({count} remaining)', { count: missingCount })
            : '';
    }
}

async function refreshAndValidateRequiredFields() {
    if (typeof syncDraftBeforeGenerate === 'function') {
        await syncDraftBeforeGenerate();
    }
    const lang = normalizeResumeLang(
        typeof currentResumeLanguage !== 'undefined' ? currentResumeLanguage : 'zh'
    );
    const employerType = document.getElementById('employer-type-select')?.value || '';
    const draft = (typeof ProfileEditor !== 'undefined' && ProfileEditor.collectDraftFromForm)
        ? ProfileEditor.collectDraftFromForm()
        : (ProfileEditor?.draft || null);
    const localRequired = getRequiredMissingFromDraft(draft, lang);

    let checklist;
    try {
        checklist = await apiClient.getLanguageChecklist(lang, employerType);
    } catch (error) {
        console.warn('Checklist validation failed:', error.message);
        if (localRequired.length === 0) {
            return { valid: true, required: [], checklist: lastChecklistData };
        }
        return { valid: false, required: localRequired, checklist: lastChecklistData };
    }

    renderLanguageChecklistPanel(checklist);
    let required = getRequiredMissingFromChecklist(checklist);

    // Backend session may lag behind the editor — trust the live form when it satisfies rules.
    if (required.length && localRequired.length === 0) {
        if (draft && typeof apiClient.saveResumeDraft === 'function') {
            try {
                await apiClient.saveResumeDraft(draft);
                checklist = await apiClient.getLanguageChecklist(lang, employerType);
                renderLanguageChecklistPanel(checklist);
                required = getRequiredMissingFromChecklist(checklist);
            } catch (retryErr) {
                console.warn('Checklist re-validation failed:', retryErr.message);
            }
        }
        if (required.length && localRequired.length === 0) {
            required = [];
        }
    }

    updateProfileContinueUi(checklist);
    return { valid: required.length === 0, required, checklist };
}

function renderLanguageChecklistPanel(checklist) {
    lastRawChecklistData = checklist || null;
    const localized = localizeChecklist(checklist);
    lastChecklistData = localized || null;
    document.getElementById('language-checklist-section')?.classList.add('hidden');
    applyFormatCheckToProfileEditor(localized);
    updateProfileContinueUi(localized);
}

function syncResumeLanguageButtons() {
    document.querySelectorAll('[data-resume-lang]').forEach((btn) => {
        const code = normalizeResumeLang(btn.dataset.resumeLang);
        const labelEl = btn.querySelector('.resume-lang-label');
        if (labelEl) labelEl.textContent = resumeLangDisplayLabel(code);
        const isActive = code === normalizeResumeLang(currentResumeLanguage);
        btn.classList.toggle('ring-2', isActive);
        btn.classList.toggle('ring-blue-500', isActive);
        btn.classList.toggle('bg-blue-50', isActive);
    });
    document.querySelectorAll('[data-resume-translate]').forEach((btn) => {
        const target = normalizeResumeLang(btn.dataset.resumeTranslate);
        const labelEl = btn.querySelector('.resume-lang-label');
        if (labelEl) labelEl.textContent = resumeLangDisplayLabel(target);
        btn.disabled = target === normalizeResumeLang(currentResumeLanguage);
    });
}

async function refreshLanguageChecklist(language) {
    if (typeof syncDraftBeforeGenerate === 'function') {
        await syncDraftBeforeGenerate();
    }
    const lang = normalizeResumeLang(language || currentResumeLanguage || 'zh');
    const employerType = document.getElementById('employer-type-select')?.value || '';
    try {
        const checklist = await apiClient.getLanguageChecklist(lang, employerType);
        renderLanguageChecklistPanel(checklist);
        return checklist;
    } catch (error) {
        console.warn('Language checklist unavailable:', error.message);
        return null;
    }
}

async function onEmployerTypeSelected(employerType) {
    if (!employerType) return;

    try {
        const result = await apiClient.setEmployerType(employerType);
        if (result.language_checklist) {
            renderLanguageChecklistPanel(result.language_checklist);
        }
        const labelMap = {
            soe: uiText('resume.soe', 'State-owned enterprise'),
            public: uiText('resume.publicSector', 'Public sector'),
            foreign: uiText('resume.foreign', 'Foreign enterprise'),
            private: uiText('resume.private', 'Private enterprise'),
            npo: uiText('resume.npo', 'Non-profit (NPO/NGO)'),
            hmt: uiText('resume.hmt', 'HK/Macau/TW-funded'),
            other: uiText('resume.employerOther', 'Other'),
        };
        const label = labelMap[employerType] || employerType;
        const missing = result.language_checklist?.missing_count || 0;
        Utils.showToast(missing > 0
            ? uiText('resume.employerSelectedMissing', 'Selected {label} — {count} format reminder(s) in profile editor', { label: label, count: missing })
            : uiText('resume.employerSelected', 'Selected {label}', { label: label }));
    } catch (error) {
        console.warn('Employer type update failed:', error.message);
        await refreshLanguageChecklist(currentResumeLanguage);
    }
}

/** Pre-generation: persist target resume language and refresh format checklist. */
async function applyResumeLanguageSelection(language) {
    currentResumeLanguage = normalizeResumeLang(language);
    updateResumeLanguageBadge(currentResumeLanguage);
    if (typeof ProfileEditor !== 'undefined' && ProfileEditor.updatePhotoVisibility) {
        ProfileEditor.updatePhotoVisibility(currentResumeLanguage);
    }
    if (typeof ProfileEditor !== 'undefined' && ProfileEditor.draft) {
        ProfileEditor.render();
    }
    syncResumeLanguageButtons();

    try {
        if (typeof syncDraftBeforeGenerate === 'function') {
            await syncDraftBeforeGenerate({ required: false, showLoading: false });
        }
        const result = await apiClient.setResumeLanguage(currentResumeLanguage);
        renderLanguageChecklistPanel(result.language_checklist);
        const count = result.language_checklist?.missing_count || 0;
        if (count > 0) {
            Utils.showToast(uiText(
                'resume.langMissingItems',
                '{count} item(s) to review — see reminders in profile editor',
                { count: count }
            ));
        }
    } catch (error) {
        await refreshLanguageChecklist(currentResumeLanguage);
    }
}

function defaultResumeLanguageFromUi() {
    if (!window.GBAI18n) return 'zh';
    return GBAI18n.uiLangToApiLang(GBAI18n.getLang());
}

/** Refresh resume-language UI labels when page locale changes — never overwrite user-selected resume target. */
function refreshResumeLanguageUiOnPageLangChange() {
    if (typeof currentResumeLanguage === 'undefined') return;
    updateResumeLanguageBadge(currentResumeLanguage);
    syncResumeLanguageButtons();
}

window.addEventListener('gba:language-changed', () => {
    refreshResumeLanguageUiOnPageLangChange();
    syncResumeLanguageButtons();
    if (typeof updateResumeLanguageBadge === 'function' && typeof currentResumeLanguage !== 'undefined') {
        updateResumeLanguageBadge(currentResumeLanguage);
    }
    if (lastRawChecklistData) {
        applyFormatCheckToProfileEditor(localizeChecklist(lastRawChecklistData));
    } else if (lastChecklistData) {
        applyFormatCheckToProfileEditor(lastChecklistData);
    }
    if (window.GBAI18n && GBAI18n.applyResumeLangButtonLabels) {
        GBAI18n.applyResumeLangButtonLabels();
    }
});
