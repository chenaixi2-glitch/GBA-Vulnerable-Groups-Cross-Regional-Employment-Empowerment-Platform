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
    address: '#profile-city',
    age: '#profile-basic-grid',
    gender: '#profile-basic-grid',
    native_place: '#profile-basic-grid',
    political_status: '#profile-basic-grid',
    linkedin: '#profile-basic-grid',
    education: '[data-section-type="education"]',
    internships: '[data-section-type="internship"]',
    projects: '[data-section-type="project"]',
    skills: '[data-section-type="skill"]',
    awards: '[data-section-type="award"]',
    summary: '[data-section-type="custom"]',
    volunteer: '[data-section-type="custom"]',
    metrics: '[data-section-type="internship"]',
    language_certs: '[data-section-type="skill"]',
};

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

function uiApiLang() {
    if (window.GBAI18n && GBAI18n.uiLangToApiLang) {
        return GBAI18n.uiLangToApiLang(GBAI18n.getLang());
    }
    return 'en';
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

    const hints = document.getElementById('profile-format-hints');
    if (hints) {
        hints.classList.add('hidden');
        hints.innerHTML = '';
    }
}

function resolveFormatCheckTarget(item) {
    const field = item.field || '';
    const category = item.category || '';
    return FORMAT_CHECK_FIELD_TARGETS[field] || FORMAT_CHECK_FIELD_TARGETS[category] || null;
}

function appendInlineBadge(container, item, labels) {
    if (!container || container.querySelector('.format-check-inline-badge')) return;
    const style = CHECKLIST_SEVERITY_STYLES[item.severity] || CHECKLIST_SEVERITY_STYLES.recommended;
    const severityLabel = labels[item.severity] || item.severity;
    const badge = document.createElement('span');
    badge.className = `format-check-inline-badge ml-2 px-2 py-0.5 rounded text-xs font-medium ${style.badge}`;
    badge.textContent = severityLabel;
    badge.title = item.message || item.label || '';

    const header = container.querySelector('h4, label');
    if (header) {
        header.appendChild(badge);
    } else {
        container.prepend(badge);
    }
}

function applyFormatCheckToProfileEditor(checklist) {
    clearFormatCheckMarkers();
    if (!checklist || !checklist.items || !checklist.items.length) return;

    const profileSection = document.getElementById('profile-editor-section');
    if (!profileSection || profileSection.classList.contains('hidden')) return;

    const lang = normalizeResumeLang(checklist.language || 'zh');
    const labels = CHECKLIST_SEVERITY_LABELS[uiApiLang()] || CHECKLIST_SEVERITY_LABELS.en;
    const actionable = checklist.items.filter((item) => item.missing && item.severity !== 'ok');

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
        const el = document.querySelector(selector);
        if (!el) return;
        const style = CHECKLIST_SEVERITY_STYLES[item.severity] || CHECKLIST_SEVERITY_STYLES.recommended;
        el.classList.add('format-check-target', 'ring-2', style.ring, style.border);
        appendInlineBadge(el, item, labels);
    });

    const hintsEl = document.getElementById('profile-format-hints');
    if (!hintsEl) return;

    hintsEl.classList.remove('hidden');
    const summary = checklist.summary
        ? `<p class="text-sm text-gray-700 mb-2">${escapeHtml(checklist.summary)}</p>`
        : '';

    hintsEl.innerHTML = summary + actionable.map((item) => {
        const style = CHECKLIST_SEVERITY_STYLES[item.severity] || CHECKLIST_SEVERITY_STYLES.recommended;
        const rowBg = item.severity === 'required' ? 'bg-red-50 border-red-200'
            : item.severity === 'warning' ? 'bg-orange-50 border-orange-200'
                : 'bg-amber-50 border-amber-200';
        const severityLabel = labels[item.severity] || item.severity;
        return `
            <div class="flex items-start gap-2 p-2 mb-1 rounded-lg border ${rowBg}">
                <i class="fas ${style.icon} mt-0.5"></i>
                <div class="min-w-0">
                    <span class="font-medium text-sm text-gray-900">${escapeHtml(item.label)}</span>
                    <span class="ml-1 text-xs ${style.badge} px-1.5 py-0.5 rounded">${severityLabel}</span>
                    <p class="text-xs text-gray-700 mt-0.5">${escapeHtml(item.message)}</p>
                    ${item.suggestion ? `<p class="text-xs text-gray-500 mt-0.5"><i class="fas fa-arrow-right mr-1"></i>${escapeHtml(item.suggestion)}</p>` : ''}
                </div>
            </div>`;
    }).join('');
}

function renderLanguageChecklistPanel(checklist) {
    lastChecklistData = checklist || null;
    document.getElementById('language-checklist-section')?.classList.add('hidden');
    applyFormatCheckToProfileEditor(checklist);
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

async function onResumeLanguageSelected(language) {
    currentResumeLanguage = normalizeResumeLang(language);
    updateResumeLanguageBadge(currentResumeLanguage);
    if (typeof ProfileEditor !== 'undefined' && ProfileEditor.updatePhotoVisibility) {
        ProfileEditor.updatePhotoVisibility(currentResumeLanguage);
    }
    syncResumeLanguageButtons();

    try {
        if (typeof syncDraftBeforeGenerate === 'function') {
            await syncDraftBeforeGenerate();
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

    document.getElementById('profile-editor-section')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function defaultResumeLanguageFromUi() {
    if (!window.GBAI18n) return 'zh';
    return GBAI18n.uiLangToApiLang(GBAI18n.getLang());
}

async function syncResumeLanguageFromUi(options = {}) {
    const { silent = true } = options;
    if (typeof currentResumeLanguage === 'undefined') return;

    const uiLang = defaultResumeLanguageFromUi();
    if (normalizeResumeLang(uiLang) === normalizeResumeLang(currentResumeLanguage)) {
        return;
    }

    currentResumeLanguage = uiLang;
    updateResumeLanguageBadge(currentResumeLanguage);
    if (typeof ProfileEditor !== 'undefined' && ProfileEditor.updatePhotoVisibility) {
        ProfileEditor.updatePhotoVisibility(currentResumeLanguage);
    }
    syncResumeLanguageButtons();

    try {
        if (typeof apiClient !== 'undefined' && apiClient.sessionId) {
            const result = await apiClient.syncSessionLanguageFromUi();
            if (result?.language_checklist) {
                renderLanguageChecklistPanel(result.language_checklist);
            } else {
                await refreshLanguageChecklist(currentResumeLanguage);
            }
        }
    } catch (error) {
        if (!silent) {
            console.warn('Resume language sync failed:', error.message);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (typeof currentResumeLanguage === 'undefined') return;
    currentResumeLanguage = defaultResumeLanguageFromUi();
    updateResumeLanguageBadge(currentResumeLanguage);
    syncResumeLanguageButtons();
});

window.addEventListener('gba:language-changed', () => {
    syncResumeLanguageFromUi({ silent: true });
    syncResumeLanguageButtons();
    if (typeof updateResumeLanguageBadge === 'function' && typeof currentResumeLanguage !== 'undefined') {
        updateResumeLanguageBadge(currentResumeLanguage);
    }
    if (lastChecklistData) {
        applyFormatCheckToProfileEditor(lastChecklistData);
    }
    if (window.GBAI18n && GBAI18n.applyResumeLangButtonLabels) {
        GBAI18n.applyResumeLangButtonLabels();
    }
});
