/**
 * GBA Platform - Resume Profile Editor
 * Parsed items shown one-by-one; each entry stored separately in draft.modules / draft.education.
 */

function profileUiText(key, fallback, vars) {
    if (window.GBAI18n && GBAI18n.t) return GBAI18n.t(key, fallback, vars);
    var msg = fallback || key;
    if (vars) {
        Object.keys(vars).forEach(function (k) {
            msg = String(msg).replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
        });
    }
    return msg;
}

const ProfileEditor = {
    draft: null,
    saveTimer: null,
    maxPhotoBytes: 2 * 1024 * 1024,

    SECTION_ORDER: ['education', 'skill', 'internship', 'project', 'award', 'paper', 'custom'],

    SECTION_CONFIG: {
        education: { label: 'Education', icon: 'fa-graduation-cap', addLabel: 'Add education' },
        skill: { label: 'Skills', icon: 'fa-tools', addLabel: 'Add skill' },
        internship: { label: 'Work / Internship', icon: 'fa-briefcase', addLabel: 'Add experience' },
        project: { label: 'Projects', icon: 'fa-project-diagram', addLabel: 'Add project' },
        award: { label: 'Awards', icon: 'fa-trophy', addLabel: 'Add award' },
        paper: { label: 'Publications', icon: 'fa-book', addLabel: 'Add publication' },
        custom: { label: 'Other', icon: 'fa-folder', addLabel: 'Add section' },
    },

    init() {
        this.bindEvents();
        this.updatePhotoVisibility(typeof currentResumeLanguage !== 'undefined' ? currentResumeLanguage : 'zh');
    },

    bindEvents() {
        const container = document.getElementById('profile-editor-body');
        if (container) {
            container.addEventListener('input', () => this.scheduleSave());
            container.addEventListener('change', () => this.scheduleSave());
            container.addEventListener('click', (e) => {
                const removeModule = e.target.closest('[data-remove-module]');
                if (removeModule) {
                    this.removeModule(removeModule.dataset.removeModule);
                    return;
                }
                const removeEdu = e.target.closest('[data-remove-education]');
                if (removeEdu) {
                    this.removeEducation(removeEdu.dataset.removeEducation);
                    return;
                }
                const addBtn = e.target.closest('[data-add-type]');
                if (addBtn) {
                    const type = addBtn.dataset.addType;
                    if (type === 'education') {
                        this.addEducation();
                    } else {
                        this.addModule(type);
                    }
                }
            });
        }

        ['profile-name', 'profile-email', 'profile-phone', 'profile-city'].forEach((id) => {
            document.getElementById(id)?.addEventListener('input', () => this.scheduleSave());
        });

        document.getElementById('profile-photo-upload-btn')?.addEventListener('click', () => {
            document.getElementById('profile-photo-input')?.click();
        });
        document.getElementById('profile-photo-input')?.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (file) this.handlePhotoSelect(file);
            e.target.value = '';
        });
        document.getElementById('profile-photo-remove-btn')?.addEventListener('click', () => this.removePhoto());
    },

    ensureExtras() {
        if (!this.draft) this.draft = { profile_basic: {}, education: [], modules: [] };
        if (!this.draft.profile_basic) this.draft.profile_basic = {};
        if (!this.draft.profile_basic.extras) this.draft.profile_basic.extras = {};
        return this.draft.profile_basic.extras;
    },

    getPhotoUrl() {
        return (this.draft?.profile_basic?.extras?.photo_url || '').trim();
    },

    updatePhotoVisibility(language) {
        const section = document.getElementById('profile-photo-section');
        if (!section) return;
        const isCjk = typeof isCjkResumeLang === 'function'
            ? isCjkResumeLang(language)
            : (!language || !String(language).toLowerCase().startsWith('en'));
        section.classList.toggle('hidden', !isCjk);
    },

    renderPhotoPreview() {
        const photoUrl = this.getPhotoUrl();
        const img = document.getElementById('profile-photo-img');
        const placeholder = document.getElementById('profile-photo-placeholder');
        const removeBtn = document.getElementById('profile-photo-remove-btn');
        const status = document.getElementById('profile-photo-status');

        if (img && placeholder && removeBtn) {
            if (photoUrl) {
                img.src = photoUrl;
                img.classList.remove('hidden');
                placeholder.classList.add('hidden');
                removeBtn.classList.remove('hidden');
                if (status) status.textContent = profileUiText('resume.photoUploaded', 'Uploaded');
            } else {
                img.src = '';
                img.classList.add('hidden');
                placeholder.classList.remove('hidden');
                removeBtn.classList.add('hidden');
                if (status) status.textContent = '';
            }
        }
    },

    compressImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error(profileUiText('resume.photo.readFailed', 'Could not read image')));
            reader.onload = () => {
                const image = new Image();
                image.onerror = () => reject(new Error(profileUiText('resume.photo.invalidImage', 'Invalid image format')));
                image.onload = () => {
                    const maxW = 400;
                    const maxH = 520;
                    let { width, height } = image;
                    const ratio = Math.min(maxW / width, maxH / height, 1);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(image, 0, 0, width, height);

                    let quality = 0.88;
                    let dataUrl = canvas.toDataURL('image/jpeg', quality);
                    while (dataUrl.length > this.maxPhotoBytes * 1.37 && quality > 0.5) {
                        quality -= 0.08;
                        dataUrl = canvas.toDataURL('image/jpeg', quality);
                    }
                    resolve(dataUrl);
                };
                image.src = reader.result;
            };
            reader.readAsDataURL(file);
        });
    },

    async handlePhotoSelect(file) {
        if (!file.type.startsWith('image/')) {
            Utils.showToast(profileUiText('resume.photo.invalidType', 'Please upload a JPG, PNG, or WebP image'));
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            Utils.showToast(profileUiText('resume.photo.tooLarge', 'Image must be 5MB or smaller'));
            return;
        }

        try {
            const dataUrl = await this.compressImage(file);
            const extras = this.ensureExtras();
            extras.photo_url = dataUrl;
            extras.has_photo = 'true';
            this.renderPhotoPreview();
            await this.persistDraft();
            if (typeof refreshLanguageChecklist === 'function' && (typeof currentResumeLanguage === 'undefined' || currentResumeLanguage === 'zh')) {
                await refreshLanguageChecklist('zh');
            }
            Utils.showToast(profileUiText('resume.photo.uploaded', 'ID photo uploaded'));
        } catch (error) {
            Utils.showToast(profileUiText('resume.photo.uploadFailed', 'Photo upload failed: {msg}', { msg: error.message || profileUiText('common.retry', 'Please try again') }));
        }
    },

    async removePhoto() {
        const extras = this.ensureExtras();
        delete extras.photo_url;
        extras.has_photo = 'false';
        this.renderPhotoPreview();
        await this.persistDraft();
        if (typeof refreshLanguageChecklist === 'function' && (typeof currentResumeLanguage === 'undefined' || currentResumeLanguage === 'zh')) {
            await refreshLanguageChecklist('zh');
        }
        Utils.showToast(profileUiText('resume.photo.removed', 'ID photo removed'));
    },

    newId(prefix) {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    },

    parseEducationContent(content) {
        const text = (content || '').trim();
        if (!text) return { school: '', major: '', degree: '', start_date: '', end_date: '' };
        try {
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed === 'object') {
                return {
                    school: parsed.school || parsed.name || '',
                    major: parsed.major || '',
                    degree: parsed.degree || '',
                    start_date: parsed.start_date || parsed.start || '',
                    end_date: parsed.end_date || parsed.end || '',
                };
            }
        } catch (_) { /* plain text */ }
        return { school: text.split('\n')[0], major: '', degree: '', start_date: '', end_date: '' };
    },

    educationToContent(entry) {
        return JSON.stringify({
            school: entry.school || '',
            major: entry.major || '',
            degree: entry.degree || '',
            start_date: entry.start_date || '',
            end_date: entry.end_date || '',
        });
    },

    profileResponseToDraft(candidateProfile) {
        if (!candidateProfile) {
            return { profile_basic: {}, education: [], modules: [] };
        }

        const basic = { ...(candidateProfile.profile_basic || {}) };
        const education = [];
        const modules = [];

        (candidateProfile.facts || []).forEach((fact) => {
            const type = fact.type || 'custom';
            if (type === 'education') {
                education.push({
                    id: fact.id || this.newId('edu'),
                    ...this.parseEducationContent(fact.content),
                    is_custom: false,
                });
            } else {
                modules.push({
                    id: fact.id || this.newId('mod'),
                    type: type in this.SECTION_CONFIG ? type : 'custom',
                    title: this.inferTitle(fact.content, type),
                    content: fact.content || '',
                    is_custom: false,
                });
            }
        });

        if (basic.school && !education.length) {
            education.push({
                id: this.newId('edu'),
                school: basic.school,
                major: '',
                degree: '',
                start_date: '',
                end_date: '',
                is_custom: false,
            });
        }
        delete basic.school;

        return { profile_basic: basic, education, modules: this.normalizeModules(modules) };
    },

    normalizeModules(modules) {
        const result = [];
        modules.forEach((mod) => {
            if (mod.type === 'skill' && mod.content && mod.content.includes(',') && !mod.content.includes('\n')) {
                mod.content.split(',').map((s) => s.trim()).filter(Boolean).forEach((skill, idx) => {
                    result.push({
                        id: idx === 0 ? mod.id : this.newId('mod'),
                        type: 'skill',
                        title: skill,
                        content: skill,
                        is_custom: mod.is_custom || false,
                    });
                });
            } else {
                result.push(mod);
            }
        });
        return result;
    },

    inferTitle(content, type) {
        const text = (content || '').trim();
        if (!text) return (type || 'Section').replace(/^\w/, (c) => c.toUpperCase());
        try {
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed === 'object') {
                return parsed.title || parsed.name || parsed.company || parsed.skill || parsed.school || type || 'Section';
            }
        } catch (_) { /* plain text */ }
        return text.split('\n')[0].slice(0, 80);
    },

    addEducation() {
        if (!this.draft) this.draft = { profile_basic: {}, education: [], modules: [] };
        if (!this.draft.education) this.draft.education = [];
        this.draft.education.push({
            id: this.newId('edu'),
            school: '',
            major: '',
            degree: '',
            start_date: '',
            end_date: '',
            is_custom: true,
        });
        this.render();
        this.scheduleSave(true);
    },

    removeEducation(eduId) {
        if (!this.draft?.education) return;
        this.draft.education = this.draft.education.filter((e) => e.id !== eduId);
        this.render();
        this.scheduleSave(true);
    },

    addModule(type = 'custom') {
        if (!this.draft) this.draft = { profile_basic: {}, education: [], modules: [] };
        const cfg = this.SECTION_CONFIG[type] || this.SECTION_CONFIG.custom;
        this.draft.modules.push({
            id: this.newId('mod'),
            type: type in this.SECTION_CONFIG ? type : 'custom',
            title: type === 'skill' ? '' : `New ${cfg.label.replace(/s$/, '')}`,
            content: '',
            is_custom: true,
        });
        this.render();
        this.scheduleSave(true);
    },

    removeModule(moduleId) {
        if (!this.draft) return;
        this.draft.modules = this.draft.modules.filter((m) => m.id !== moduleId);
        this.render();
        this.scheduleSave(true);
    },

    collectDraftFromForm() {
        const extras = { ...(this.draft?.profile_basic?.extras || {}) };
        const basic = {
            name: document.getElementById('profile-name')?.value.trim() || '',
            email: document.getElementById('profile-email')?.value.trim() || '',
            phone: document.getElementById('profile-phone')?.value.trim() || '',
            city: document.getElementById('profile-city')?.value.trim() || '',
            extras,
        };

        const education = [];
        document.querySelectorAll('[data-education-id]').forEach((card) => {
            education.push({
                id: card.dataset.educationId,
                school: card.querySelector('[data-edu-school]')?.value.trim() || '',
                major: card.querySelector('[data-edu-major]')?.value.trim() || '',
                degree: card.querySelector('[data-edu-degree]')?.value.trim() || '',
                start_date: card.querySelector('[data-edu-start]')?.value.trim() || '',
                end_date: card.querySelector('[data-edu-end]')?.value.trim() || '',
                is_custom: card.dataset.isCustom === 'true',
            });
        });

        const modules = [];
        document.querySelectorAll('[data-module-id]').forEach((card) => {
            modules.push({
                id: card.dataset.moduleId,
                type: card.querySelector('[data-module-type]')?.value || 'custom',
                title: card.querySelector('[data-module-title]')?.value.trim() || '',
                content: card.querySelector('[data-module-content]')?.value.trim() || '',
                is_custom: card.dataset.isCustom === 'true',
            });
        });

        return { profile_basic: basic, education, modules };
    },

    scheduleSave(immediate = false) {
        if (this.saveTimer) clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => this.persistDraft(), immediate ? 200 : 1200);
        this.setSaveStatus(profileUiText('resume.saving', 'Saving…'));
    },

    async persistDraft() {
        if (!apiClient.sessionId) return;
        try {
            const draft = this.collectDraftFromForm();
            this.draft = draft;
            await apiClient.saveResumeDraft(draft);
            this.setSaveStatus(apiClient.isLoggedIn()
                ? profileUiText('resume.draftSaved', 'Saved (restorable for 12h)')
                : profileUiText('resume.draftSavedSession', 'Saved for this session'));
        } catch (error) {
            console.error('Draft save failed:', error);
            this.setSaveStatus(profileUiText('resume.draftSaveFailed', 'Save failed — edits kept locally'));
        }
    },

    setSaveStatus(text) {
        const el = document.getElementById('draft-save-status');
        if (el) el.textContent = text;
    },

    escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    },

    renderEducationCard(entry) {
        return `
        <div class="border border-gray-200 rounded-lg p-4 mb-2 bg-white" data-education-id="${entry.id}" data-is-custom="${entry.is_custom ? 'true' : 'false'}">
            <div class="flex items-start justify-between gap-2 mb-2">
                <span class="text-xs font-medium text-indigo-600 uppercase tracking-wide">Education entry</span>
                <button type="button" data-remove-education="${entry.id}" class="text-red-500 hover:text-red-700 p-1" title="Remove">
                    <i class="fas fa-trash-alt text-sm"></i>
                </button>
            </div>
            <div class="grid sm:grid-cols-2 gap-2">
                <div class="sm:col-span-2">
                    <label class="block text-xs text-gray-500 mb-1">School</label>
                    <input data-edu-school type="text" value="${this.escapeHtml(entry.school)}" class="w-full border border-gray-300 rounded-lg p-2 text-sm" placeholder="University / School name">
                </div>
                <div>
                    <label class="block text-xs text-gray-500 mb-1">Major</label>
                    <input data-edu-major type="text" value="${this.escapeHtml(entry.major)}" class="w-full border border-gray-300 rounded-lg p-2 text-sm" placeholder="Major / Field">
                </div>
                <div>
                    <label class="block text-xs text-gray-500 mb-1">Degree</label>
                    <input data-edu-degree type="text" value="${this.escapeHtml(entry.degree)}" class="w-full border border-gray-300 rounded-lg p-2 text-sm" placeholder="Bachelor / Master…">
                </div>
                <div>
                    <label class="block text-xs text-gray-500 mb-1">Start</label>
                    <input data-edu-start type="text" value="${this.escapeHtml(entry.start_date)}" class="w-full border border-gray-300 rounded-lg p-2 text-sm" placeholder="2019-09">
                </div>
                <div>
                    <label class="block text-xs text-gray-500 mb-1">End</label>
                    <input data-edu-end type="text" value="${this.escapeHtml(entry.end_date)}" class="w-full border border-gray-300 rounded-lg p-2 text-sm" placeholder="2023-06">
                </div>
            </div>
        </div>`;
    },

    renderModuleCard(module) {
        const typeOptions = Object.entries(this.SECTION_CONFIG)
            .filter(([k]) => k !== 'education')
            .map(([value, cfg]) => `<option value="${value}" ${module.type === value ? 'selected' : ''}>${cfg.label}</option>`)
            .join('');

        const showTitle = module.type !== 'skill';

        return `
        <div class="border border-gray-200 rounded-lg p-4 mb-2 bg-white" data-module-id="${module.id}" data-is-custom="${module.is_custom ? 'true' : 'false'}">
            <div class="flex items-start justify-between gap-2 mb-2">
                <select data-module-type class="border border-gray-300 rounded-lg p-1.5 text-xs bg-gray-50">${typeOptions}</select>
                <button type="button" data-remove-module="${module.id}" class="text-red-500 hover:text-red-700 p-1" title="Remove">
                    <i class="fas fa-trash-alt text-sm"></i>
                </button>
            </div>
            ${showTitle ? `
            <div class="mb-2">
                <label class="block text-xs text-gray-500 mb-1">Title</label>
                <input data-module-title type="text" value="${this.escapeHtml(module.title)}" class="w-full border border-gray-300 rounded-lg p-2 text-sm" placeholder="Company / Project name">
            </div>` : `<input data-module-title type="hidden" value="${this.escapeHtml(module.title)}">`}
            <div>
                <label class="block text-xs text-gray-500 mb-1">${module.type === 'skill' ? 'Skill' : 'Details'}</label>
                <textarea data-module-content rows="3" class="w-full border border-gray-300 rounded-lg p-2 text-sm" placeholder="${module.type === 'skill' ? 'e.g. Python, Advanced' : 'Role, achievements, technologies…'}">${this.escapeHtml(module.content)}</textarea>
            </div>
        </div>`;
    },

    renderSection(type, items, renderFn) {
        const cfg = this.SECTION_CONFIG[type];
        const cards = items.length
            ? items.map((item) => renderFn.call(this, item)).join('')
            : '<p class="text-xs text-gray-400 italic mb-2">No entries yet.</p>';

        return `
        <div class="mb-5" data-section-type="${type}">
            <div class="flex items-center justify-between mb-2 pb-1 border-b border-gray-200">
                <h4 class="font-semibold text-gray-800 flex items-center gap-2">
                    <i class="fas ${cfg.icon} text-gray-500"></i>
                    ${cfg.label}
                    <span class="text-xs font-normal text-gray-400">(${items.length})</span>
                </h4>
                <button type="button" data-add-type="${type}" class="text-xs text-blue-600 hover:text-blue-800 font-medium">
                    <i class="fas fa-plus mr-1"></i>${cfg.addLabel}
                </button>
            </div>
            ${cards}
        </div>`;
    },

    render() {
        const draft = this.draft || { profile_basic: {}, education: [], modules: [] };
        const basic = draft.profile_basic || {};

        const nameEl = document.getElementById('profile-name');
        const emailEl = document.getElementById('profile-email');
        const phoneEl = document.getElementById('profile-phone');
        const cityEl = document.getElementById('profile-city');
        if (nameEl) nameEl.value = basic.name || '';
        if (emailEl) emailEl.value = basic.email || '';
        if (phoneEl) phoneEl.value = basic.phone || '';
        if (cityEl) cityEl.value = basic.city || '';
        this.renderPhotoPreview();

        const body = document.getElementById('profile-editor-body');
        if (!body) return;

        const education = draft.education || [];
        const modulesByType = {};
        (draft.modules || []).forEach((m) => {
            const t = m.type in this.SECTION_CONFIG ? m.type : 'custom';
            if (!modulesByType[t]) modulesByType[t] = [];
            modulesByType[t].push(m);
        });

        let html = this.renderSection('education', education, this.renderEducationCard);
        this.SECTION_ORDER.filter((t) => t !== 'education').forEach((type) => {
            html += this.renderSection(type, modulesByType[type] || [], this.renderModuleCard);
        });

        body.innerHTML = html;

        const total = education.length + (draft.modules || []).length;
        const countEl = document.getElementById('profile-module-count');
        if (countEl) countEl.textContent = String(total);

        if (typeof applyFormatCheckToProfileEditor === 'function' && typeof lastChecklistData !== 'undefined' && lastChecklistData) {
            applyFormatCheckToProfileEditor(lastChecklistData);
        }
    },

    isDraftEmpty(draft) {
        if (!draft) return true;
        const basic = draft.profile_basic || {};
        const hasBasic = Boolean(basic.name || basic.email || basic.phone || basic.city);
        const hasEducation = (draft.education || []).some((entry) => entry.school || entry.major || entry.degree);
        const hasModules = (draft.modules || []).some((mod) => mod.content || mod.title);
        return !hasBasic && !hasEducation && !hasModules;
    },

    show(restored = false) {
        document.getElementById('empty-state')?.classList.add('hidden');
        document.getElementById('profile-editor-section')?.classList.remove('hidden');
        const hint = document.getElementById('profile-restored-hint');
        if (hint) hint.classList.toggle('hidden', !restored);
        document.getElementById('profile-editor-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    ensureDraftShape(draft) {
        if (!draft) return { profile_basic: {}, education: [], modules: [] };
        if (!draft.profile_basic) draft.profile_basic = {};
        if (!draft.profile_basic.extras) draft.profile_basic.extras = {};
        if (!draft.education) {
            draft.education = draft.profile_basic?.school
                ? [{ id: this.newId('edu'), school: draft.profile_basic.school, major: '', degree: '', start_date: '', end_date: '', is_custom: false }]
                : [];
            if (draft.profile_basic) delete draft.profile_basic.school;
        }
        if (!draft.modules) draft.modules = [];
        return draft;
    },

    async loadFromServer() {
        try {
            const result = await apiClient.getResumeDraft();
            if (result.session_id && result.session_id !== apiClient.sessionId) {
                apiClient.saveSessionId(result.session_id);
                Utils.updateSessionDisplay(result.session_id);
            }
            this.draft = this.ensureDraftShape(result.draft);
            this.render();
            this.show(result.restored);
            return true;
        } catch (error) {
            if (error.message && error.message.includes('404')) return false;
            console.warn('Could not restore draft:', error.message);
            return false;
        }
    },

    async initFromUpload(response) {
        if (!response?.candidate_profile) {
            throw new Error(profileUiText('resume.toast.uploadEmptyResponse', 'No profile data returned. Please try again or paste resume text.'));
        }

        const draft = this.ensureDraftShape(this.profileResponseToDraft(response.candidate_profile));
        if (this.isDraftEmpty(draft)) {
            throw new Error(profileUiText('resume.toast.uploadEmptyProfile', 'Could not extract resume details. Try pasting resume text directly.'));
        }

        this.draft = draft;
        this.render();
        this.show(false);

        try {
            await this.persistDraft();
        } catch (error) {
            console.warn('Draft save after upload failed:', error.message);
            this.setSaveStatus(profileUiText('resume.draftSaveFailed', 'Save failed — edits kept locally'));
        }

        document.getElementById('jd-section')?.classList.remove('hidden');
        if (typeof updateStepIndicator === 'function') {
            updateStepIndicator(1, 'completed');
            updateStepIndicator(2, 'active');
        }
    },
};

document.addEventListener('DOMContentLoaded', () => {
    ProfileEditor.init();
});

window.addEventListener('gba:language-changed', () => {
    ProfileEditor.renderPhotoPreview();
});
