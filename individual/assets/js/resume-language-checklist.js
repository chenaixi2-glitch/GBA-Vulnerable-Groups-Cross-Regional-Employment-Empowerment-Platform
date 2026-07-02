/**
 * Resume language format checklist — display missing items per language rules
 */

const CHECKLIST_SEVERITY_STYLES = {
    required: { bg: 'bg-red-50', border: 'border-red-200', badge: 'bg-red-100 text-red-800', icon: 'fa-circle-exclamation text-red-500' },
    recommended: { bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-800', icon: 'fa-lightbulb text-amber-500' },
    warning: { bg: 'bg-orange-50', border: 'border-orange-200', badge: 'bg-orange-100 text-orange-800', icon: 'fa-triangle-exclamation text-orange-500' },
    ok: { bg: 'bg-green-50', border: 'border-green-200', badge: 'bg-green-100 text-green-800', icon: 'fa-check-circle text-green-500' },
};

const CHECKLIST_SEVERITY_LABELS = {
    zh: { required: '必填', recommended: '建议', warning: '注意', ok: '已满足' },
    'zh-TW': { required: '必填', recommended: '建議', warning: '注意', ok: '已滿足' },
    en: { required: 'Required', recommended: 'Recommended', warning: 'Warning', ok: 'OK' },
    pt: { required: 'Obrigatório', recommended: 'Recomendado', warning: 'Aviso', ok: 'OK' },
};

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

function checklistTitleSuffix(resumeLang, missingCount) {
    if (!missingCount) return '';
    return uiText(
        'resume.checklistMissing',
        ' — {lang}: {count} missing',
        { lang: resumeLangDisplayLabel(resumeLang), count: missingCount }
    );
}

function checklistCompleteMessage() {
    return uiText(
        'resume.checklistComplete',
        'Core sections look good! Double-check photo policy and one-page layout.'
    );
}

function renderLanguageChecklistPanel(checklist, containerId = 'language-checklist-content') {
    const container = document.getElementById(containerId);
    const section = document.getElementById('language-checklist-section');
    if (!container) return;

    if (!checklist || !checklist.items || checklist.items.length === 0) {
        container.innerHTML = '<p class="text-sm text-gray-500">' + uiText('resume.checklistUnavailable', 'No checklist available.') + '</p>';
        return;
    }

    lastChecklistData = checklist;
    const lang = normalizeResumeLang(checklist.language || 'zh');
    const labels = CHECKLIST_SEVERITY_LABELS[uiApiLang()] || CHECKLIST_SEVERITY_LABELS.en;
    const missing = checklist.missing_items || checklist.items.filter((i) => i.missing);
    const dyn = document.getElementById('language-checklist-dynamic');
    if (dyn) {
        dyn.textContent = checklistTitleSuffix(lang, missing.length);
    }

    if (section) section.classList.remove('hidden');

    const summaryHtml = checklist.summary
        ? `<p class="text-sm text-gray-700 mb-3 p-3 bg-slate-50 rounded-lg border border-slate-200">${escapeHtml(checklist.summary)}</p>`
        : '';

    const itemsToShow = missing.length > 0 ? missing : checklist.items.filter((i) => i.severity === 'warning' || i.severity === 'ok').slice(0, 6);

    if (missing.length === 0) {
        container.innerHTML = summaryHtml + `
            <div class="p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                <i class="fas fa-check-circle mr-2"></i>
                ${checklistCompleteMessage()}
            </div>`;
        return;
    }

    container.innerHTML = summaryHtml + itemsToShow.map((item) => {
        const style = CHECKLIST_SEVERITY_STYLES[item.severity] || CHECKLIST_SEVERITY_STYLES.recommended;
        const severityLabel = labels[item.severity] || item.severity;
        return `
            <div class="checklist-item ${style.bg} ${style.border} border rounded-lg p-3 mb-2">
                <div class="flex items-start gap-3">
                    <i class="fas ${style.icon} mt-0.5"></i>
                    <div class="flex-1 min-w-0">
                        <div class="flex flex-wrap items-center gap-2 mb-1">
                            <span class="font-semibold text-gray-900 text-sm">${escapeHtml(item.label)}</span>
                            <span class="px-2 py-0.5 rounded text-xs font-medium ${style.badge}">${severityLabel}</span>
                            ${item.category ? `<span class="text-xs text-gray-400">${escapeHtml(item.category)}</span>` : ''}
                        </div>
                        <p class="text-sm text-gray-700">${escapeHtml(item.message)}</p>
                        ${item.suggestion ? `<p class="text-xs text-gray-500 mt-1"><i class="fas fa-arrow-right mr-1"></i>${escapeHtml(item.suggestion)}</p>` : ''}
                    </div>
                </div>
            </div>`;
    }).join('');
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
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
            document.getElementById('language-checklist-section')?.classList.remove('hidden');
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
            ? uiText('resume.employerSelectedMissing', 'Selected {label} — {count} format reminder(s) below', { label: label, count: missing })
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
                '{count} item(s) to review — see checklist below',
                { count: count }
            ));
        }
    } catch (error) {
        await refreshLanguageChecklist(currentResumeLanguage);
    }

    document.getElementById('language-checklist-section')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
        renderLanguageChecklistPanel(lastChecklistData);
    }
    if (window.GBAI18n && GBAI18n.applyResumeLangButtonLabels) {
        GBAI18n.applyResumeLangButtonLabels();
    }
});
