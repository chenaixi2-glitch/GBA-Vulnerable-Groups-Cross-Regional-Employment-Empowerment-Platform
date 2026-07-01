/**
 * Resume language format checklist — display missing items per zh/en rules
 */

const CHECKLIST_SEVERITY_STYLES = {
    required: { bg: 'bg-red-50', border: 'border-red-200', badge: 'bg-red-100 text-red-800', icon: 'fa-circle-exclamation text-red-500' },
    recommended: { bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-800', icon: 'fa-lightbulb text-amber-500' },
    warning: { bg: 'bg-orange-50', border: 'border-orange-200', badge: 'bg-orange-100 text-orange-800', icon: 'fa-triangle-exclamation text-orange-500' },
    ok: { bg: 'bg-green-50', border: 'border-green-200', badge: 'bg-green-100 text-green-800', icon: 'fa-check-circle text-green-500' },
};

const CHECKLIST_SEVERITY_LABELS = {
    zh: { required: '必填', recommended: '建议', warning: '注意', ok: '已满足' },
    en: { required: 'Required', recommended: 'Recommended', warning: 'Warning', ok: 'OK' },
};

function renderLanguageChecklistPanel(checklist, containerId = 'language-checklist-content') {
    const container = document.getElementById(containerId);
    const section = document.getElementById('language-checklist-section');
    if (!container) return;

    if (!checklist || !checklist.items || checklist.items.length === 0) {
        container.innerHTML = '<p class="text-sm text-gray-500">No checklist available.</p>';
        return;
    }

    const lang = (checklist.language || 'zh').startsWith('en') ? 'en' : 'zh';
    const labels = CHECKLIST_SEVERITY_LABELS[lang];
    const missing = checklist.missing_items || checklist.items.filter((i) => i.missing);
    const title = document.getElementById('language-checklist-title');
    if (title) {
        title.textContent = lang === 'zh'
            ? `中文简历格式检查（缺失 ${missing.length} 项）`
            : `English Resume Checklist (${missing.length} missing)`;
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
                ${lang === 'zh' ? '核心内容已较完整！请继续确认照片、排版等细节。' : 'Core sections look good! Double-check photo policy and one-page layout.'}
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

async function refreshLanguageChecklist(language) {
    const lang = language || currentResumeLanguage || 'zh';
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
            soe: '国央企',
            public: '体制内',
            foreign: '外企',
            private: '民企',
            npo: '非营利社会组织',
            hmt: '港澳台资企业',
            other: '其他',
        };
        const label = labelMap[employerType] || employerType;
        const missing = result.language_checklist?.missing_count || 0;
        Utils.showToast(missing > 0
            ? `已选择${label}，请查看下方 ${missing} 项格式提醒`
            : `已选择${label}`);
    } catch (error) {
        console.warn('Employer type update failed:', error.message);
        await refreshLanguageChecklist(currentResumeLanguage);
    }
}

async function onResumeLanguageSelected(language) {
    currentResumeLanguage = language.startsWith('en') ? 'en' : 'zh';
    updateResumeLanguageBadge(currentResumeLanguage);
    if (typeof ProfileEditor !== 'undefined' && ProfileEditor.updatePhotoVisibility) {
        ProfileEditor.updatePhotoVisibility(currentResumeLanguage);
    }

    document.querySelectorAll('[data-resume-lang]').forEach((btn) => {
        const isActive = btn.dataset.resumeLang === currentResumeLanguage;
        btn.classList.toggle('ring-2', isActive);
        btn.classList.toggle('ring-blue-500', isActive);
        btn.classList.toggle('bg-blue-50', isActive);
    });

    try {
        if (typeof syncDraftBeforeGenerate === 'function') {
            await syncDraftBeforeGenerate();
        }
        const result = await apiClient.setResumeLanguage(currentResumeLanguage);
        renderLanguageChecklistPanel(result.language_checklist);
        const count = result.language_checklist?.missing_count || 0;
        if (count > 0) {
            const msg = currentResumeLanguage === 'zh'
                ? `中文简历还有 ${count} 项建议补充，请查看下方清单`
                : `${count} item(s) to add for English resume — see checklist below`;
            Utils.showToast(msg);
        }
    } catch (error) {
        await refreshLanguageChecklist(currentResumeLanguage);
    }

    document.getElementById('language-checklist-section')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
