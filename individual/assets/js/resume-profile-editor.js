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
    savedRecords: [],
    polishingFactIds: [],
    translatingModuleIds: [],
    rePolishingModuleIds: [],

    SECTION_ORDER: ['education', 'skill', 'internship', 'project', 'award', 'paper', 'custom'],

    getSectionConfig() {
        return {
            education: {
                label: profileUiText('resume.profileEditor.sectionEducation', 'Education'),
                icon: 'fa-graduation-cap',
                addLabel: profileUiText('resume.profileEditor.addEducation', 'Add education'),
            },
            skill: {
                label: profileUiText('resume.profileEditor.sectionSkills', 'Skills'),
                icon: 'fa-tools',
                addLabel: profileUiText('resume.profileEditor.addSkill', 'Add skill'),
            },
            internship: {
                label: profileUiText('resume.profileEditor.sectionWork', 'Work / Internship'),
                icon: 'fa-briefcase',
                addLabel: profileUiText('resume.profileEditor.addExperience', 'Add experience'),
            },
            project: {
                label: profileUiText('resume.profileEditor.sectionProjects', 'Projects'),
                icon: 'fa-project-diagram',
                addLabel: profileUiText('resume.profileEditor.addProject', 'Add project'),
            },
            award: {
                label: profileUiText('resume.profileEditor.sectionAwards', 'Awards'),
                icon: 'fa-trophy',
                addLabel: profileUiText('resume.profileEditor.addAward', 'Add award'),
            },
            paper: {
                label: profileUiText('resume.profileEditor.sectionPublications', 'Publications'),
                icon: 'fa-book',
                addLabel: profileUiText('resume.profileEditor.addPublication', 'Add publication'),
            },
            custom: {
                label: profileUiText('resume.profileEditor.sectionOther', 'Other'),
                icon: 'fa-folder',
                addLabel: profileUiText('resume.profileEditor.addSection', 'Add section'),
            },
        };
    },

    getResumeLang() {
        if (typeof currentResumeLanguage !== 'undefined') return currentResumeLanguage;
        if (typeof defaultResumeLanguageFromUi === 'function') return defaultResumeLanguageFromUi();
        return 'zh';
    },

    _missingSlotsKey: '',

    hasModuleType(type) {
        return (this.draft?.modules || []).some((m) => m.type === type);
    },

    ensureMissingSlotsFromChecklist(checklist) {
        if (!checklist?.items || !this.draft) return false;
        const key = checklist.items.map((i) => `${i.id}:${i.missing ? 1 : 0}`).join('|');
        if (this._missingSlotsKey === key) return false;
        this._missingSlotsKey = key;

        const missingFields = new Set(
            checklist.items
                .filter((item) => item.missing && item.severity !== 'ok')
                .map((item) => item.field || item.category)
        );
        let changed = false;

        const ensureSection = (field, fn) => {
            if (!missingFields.has(field)) return;
            fn();
            changed = true;
        };

        ensureSection('education', () => {
            if (!(this.draft.education || []).length) this.addEducation(true);
        });
        ensureSection('internships', () => {
            if (!this.hasModuleType('internship')) this.addModule('internship', true);
        });
        ensureSection('projects', () => {
            if (!this.hasModuleType('project')) this.addModule('project', true);
        });
        ensureSection('skills', () => {
            if (!this.hasModuleType('skill')) this.addModule('skill', true);
        });
        ensureSection('awards', () => {
            if (!this.hasModuleType('award')) this.addModule('award', true);
        });
        ensureSection('experience_any', () => {
            if (!this.hasModuleType('internship')) this.addModule('internship', true);
        });
        ensureSection('volunteer', () => {
            if (!this.hasModuleType('custom')) this.addModule('custom', true);
        });

        return changed;
    },

    init() {
        this.bindEvents();
        this.updatePhotoVisibility(typeof currentResumeLanguage !== 'undefined' ? currentResumeLanguage : 'zh');
        this.updateSaveUi();
        if (typeof apiClient !== 'undefined' && apiClient.isLoggedIn()) {
            this.loadSavedRecords();
        }
    },

    bindEvents() {
        const container = document.getElementById('profile-editor-body');
        if (container) {
            container.addEventListener('input', (e) => {
            const translated = e.target.closest('.profile-field-translated');
            if (translated) {
                translated.classList.remove('profile-field-translated');
                translated.removeAttribute('data-translated-from');
                translated.removeAttribute('title');
                const label = translated.closest('div')?.querySelector('label')
                    || translated.parentElement?.querySelector('label');
                label?.querySelector('.profile-translated-badge')?.remove();
            }
        });
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
                    return;
                }
                const translateBtn = e.target.closest('[data-translate-module]');
                if (translateBtn) {
                    this.translateModule(translateBtn.dataset.translateModule, translateBtn.dataset.moduleKind || 'module');
                    return;
                }
                const polishBtn = e.target.closest('[data-polish-module]');
                if (polishBtn) {
                    this.polishModule(polishBtn.dataset.polishModule);
                }
            });
        }

        ['profile-name', 'profile-email', 'profile-phone', 'profile-city'].forEach((id) => {
            document.getElementById(id)?.addEventListener('input', () => this.scheduleSave());
        });

        const supplementSection = document.getElementById('profile-supplement-section');
        if (supplementSection) {
            supplementSection.addEventListener('input', () => this.scheduleSave());
            supplementSection.addEventListener('change', () => this.scheduleSave());
        }

        document.getElementById('profile-translation-review-confirm')?.addEventListener('click', () => {
            this.confirmTranslationReview();
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

        document.getElementById('profile-saved-records-list')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-restore-profile-record]');
            if (btn) {
                this.restoreSavedRecord(btn.dataset.restoreProfileRecord);
            }
        });

        document.getElementById('profile-saved-records-refresh')?.addEventListener('click', () => {
            if (typeof apiClient !== 'undefined' && apiClient.invalidateBackendProbe) {
                apiClient.invalidateBackendProbe();
            }
            this.loadSavedRecords();
        });
        document.getElementById('btn-save-profile')?.addEventListener('click', () => {
            this.saveToAccount();
        });
    },

    formatSavedAt(iso) {
        if (!iso) return '';
        try {
            const d = new Date(iso);
            if (Number.isNaN(d.getTime())) return String(iso);
            return d.toLocaleString(undefined, {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch (_e) {
            return String(iso);
        }
    },

    defaultRecordName() {
        const name = (this.draft?.profile_basic?.name || '').trim();
        if (name) {
            return profileUiText('resume.savedRecordDefaultName', '{name} — resume', { name });
        }
        return profileUiText('resume.savedRecordUntitled', 'My resume');
    },

    promptRecordName() {
        const defaultName = this.defaultRecordName();
        const input = window.prompt(
            profileUiText('resume.savedRecordNamePrompt', 'Enter a name for this saved profile:'),
            defaultName
        );
        if (input === null) return null;
        const trimmed = input.trim();
        return trimmed || defaultName;
    },

    _isSavedRecordsAuthError(error) {
        if (typeof apiClient !== 'undefined' && typeof apiClient._isAuthLoginRequiredError === 'function') {
            return apiClient._isAuthLoginRequiredError(error);
        }
        const msg = String((error && error.message) || '');
        return /401|Unauthorized|请先登录|需要登录/i.test(msg);
    },

    async loadSavedRecords() {
        const section = document.getElementById('profile-saved-records-section');
        const refreshBtn = document.getElementById('profile-saved-records-refresh');
        if (!section) return;
        if (typeof apiClient === 'undefined' || !apiClient.isLoggedIn()) {
            section.classList.add('hidden');
            this.savedRecords = [];
            this.renderSavedRecordsPanel();
            return;
        }
        if (refreshBtn) refreshBtn.disabled = true;
        const list = document.getElementById('profile-saved-records-list');
        if (list && !this.savedRecords.length) {
            list.innerHTML = `<p class="text-xs text-gray-500">${this.escapeHtml(profileUiText('resume.savedRecordsLoading', 'Loading saved profiles…'))}</p>`;
        }
        try {
            const result = await apiClient.getProfileSaveHistory(20);
            this.savedRecords = result.records || [];
            section.classList.remove('hidden');
            this.renderSavedRecordsPanel();
        } catch (error) {
            console.warn('Could not load saved profile records:', error.message);
            if (this._isSavedRecordsAuthError(error)) {
                section.classList.add('hidden');
                this.savedRecords = [];
                list.innerHTML = '';
                return;
            }
            section.classList.remove('hidden');
            this.renderSavedRecordsPanel(true);
        } finally {
            if (refreshBtn) refreshBtn.disabled = false;
        }
    },

    renderSavedRecordsPanel(loadFailed = false) {
        const list = document.getElementById('profile-saved-records-list');
        const empty = document.getElementById('profile-saved-records-empty');
        if (!list) return;

        if (loadFailed) {
            list.innerHTML = `<p class="text-xs text-red-600">${this.escapeHtml(profileUiText('resume.savedRecordsLoadFailed', 'Could not load saved records. Please try again later.'))}</p>`;
            if (empty) empty.classList.add('hidden');
            return;
        }

        if (!this.savedRecords.length) {
            list.innerHTML = '';
            if (empty) empty.classList.remove('hidden');
            return;
        }

        if (empty) empty.classList.add('hidden');
        list.innerHTML = this.savedRecords.map((record) => {
            const name = record.record_name || record.candidate_name || profileUiText('resume.savedRecordUntitled', 'My resume');
            const savedAt = this.formatSavedAt(record.saved_at);
            const subtitle = record.candidate_name && record.candidate_name !== name
                ? `${this.escapeHtml(record.candidate_name)} · ${this.escapeHtml(savedAt)}`
                : this.escapeHtml(savedAt);
            const crossLinks = typeof SavedProfileBootstrap !== 'undefined'
                ? SavedProfileBootstrap.pageLinks(record.id, 'resume')
                : '';
            return `
                <div class="flex items-center justify-between gap-3 p-3 border border-gray-200 rounded-lg bg-gray-50/80">
                    <div class="min-w-0 flex-1">
                        <p class="text-sm font-medium text-gray-900 truncate">${this.escapeHtml(name)}</p>
                        <p class="text-xs text-gray-500 mt-0.5">${subtitle}</p>
                        ${crossLinks ? `<p class="text-xs mt-1">${crossLinks}</p>` : ''}
                    </div>
                    <button type="button" data-restore-profile-record="${this.escapeHtml(record.id)}"
                        class="shrink-0 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100">
                        ${this.escapeHtml(profileUiText('resume.savedRecordLoad', 'Load'))}
                    </button>
                </div>`;
        }).join('');
    },

    async restoreSavedRecord(recordId) {
        if (!recordId) return;
        if (!apiClient.isLoggedIn()) {
            Utils.showToast(profileUiText('errors.loginToSaveProfile', 'Please log in to save your profile to the website'));
            return;
        }
        try {
            Utils.showLoading(profileUiText('resume.savedRecordLoading', 'Loading saved profile...'));
            const result = await apiClient.restoreSavedProfile(recordId);
            this.draft = this.ensureDraftShape(result.draft);
            this._missingSlotsKey = '';
            this.render({ preserveDraft: true });
            this.show(false);
            this.setSaveStatus(profileUiText('resume.savedRecordLoaded', 'Loaded saved profile into editor'));
            if (typeof refreshLanguageChecklist === 'function') {
                await refreshLanguageChecklist(this.getResumeLang());
            }
            if (typeof showUploadResultsPanel === 'function') {
                showUploadResultsPanel();
            }
            if (typeof updateProfileContinueUi === 'function') {
                updateProfileContinueUi(typeof lastChecklistData !== 'undefined' ? lastChecklistData : null);
            }
            Utils.hideLoading();
            Utils.showToast(profileUiText('resume.savedRecordLoadedToast', 'Saved profile loaded'));
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast(profileUiText('resume.savedRecordLoadFailed', 'Failed to load: {msg}', { msg: error.message }));
        }
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
        const lang = typeof normalizeResumeLang === 'function'
            ? normalizeResumeLang(language)
            : String(language || 'zh');
        const showPhoto = lang === 'zh';
        section.classList.toggle('hidden', !showPhoto);
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
            if (typeof refreshLanguageChecklist === 'function') {
                await refreshLanguageChecklist(this.getResumeLang());
            }
            if (typeof resumeGenerated !== 'undefined' && resumeGenerated && typeof ensureResumePreviewRendered === 'function') {
                await ensureResumePreviewRendered();
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
        if (typeof refreshLanguageChecklist === 'function') {
            await refreshLanguageChecklist(this.getResumeLang());
        }
        if (typeof resumeGenerated !== 'undefined' && resumeGenerated && typeof ensureResumePreviewRendered === 'function') {
            await ensureResumePreviewRendered();
        }
        Utils.showToast(profileUiText('resume.photo.removed', 'ID photo removed'));
    },

    newId(prefix) {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    },

    parseEducationContent(content) {
        return ResumeProfileFields.parseFactContent('education', content);
    },

    parseModuleContent(content, title = '') {
        return ResumeProfileFields.parseFactContent('custom', content, title);
    },

    educationToContent(entry) {
        const fields = ResumeProfileFields.getEntryFields('education', entry);
        return ResumeProfileFields.fieldsToFactContent('education', fields);
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
                const fields = ResumeProfileFields.parseFactContent('education', fact.content || '');
                education.push({
                    id: fact.id || this.newId('edu'),
                    ...fields,
                    fields,
                    is_custom: false,
                });
            } else {
                const modType = type in this.getSectionConfig() ? type : 'custom';
                const fields = ResumeProfileFields.parseFactContent(modType, fact.content || '');
                const derived = ResumeProfileFields.deriveTitleContent(modType, fields);
                modules.push({
                    id: fact.id || this.newId('mod'),
                    type: modType,
                    title: derived.title,
                    content: derived.content,
                    fields,
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
            const fields = ResumeProfileFields.getEntryFields(mod.type, mod);
            if (mod.type === 'skill' && fields.skill && String(fields.skill).includes(',') && !String(fields.skill).includes('\n')) {
                String(fields.skill).split(',').map((s) => s.trim()).filter(Boolean).forEach((skill, idx) => {
                    const splitFields = { ...fields, skill };
                    const derived = ResumeProfileFields.deriveTitleContent('skill', splitFields);
                    result.push({
                        id: idx === 0 ? mod.id : this.newId('mod'),
                        type: 'skill',
                        title: derived.title,
                        content: derived.content,
                        fields: splitFields,
                        is_custom: mod.is_custom || false,
                    });
                });
            } else {
                const derived = ResumeProfileFields.deriveTitleContent(mod.type, fields);
                result.push({
                    ...mod,
                    title: mod.title || derived.title,
                    content: mod.content || derived.content,
                    fields,
                });
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

    addEducation(silent = false) {
        if (!this.draft) this.draft = { profile_basic: {}, education: [], modules: [] };
        if (!this.draft.education) this.draft.education = [];
        this.draft.education.push({
            id: this.newId('edu'),
            ...ResumeProfileFields.defaultFieldsForType('education'),
            fields: ResumeProfileFields.defaultFieldsForType('education'),
            is_custom: true,
        });
        this.render({ preserveDraft: true });
        this.scheduleSave(true);
    },

    removeEducation(eduId) {
        if (!this.draft?.education) return;
        this.draft.education = this.draft.education.filter((e) => e.id !== eduId);
        this.render({ preserveDraft: true });
        this.scheduleSave(true);
    },

    addModule(type = 'custom', silent = false) {
        if (!this.draft) this.draft = { profile_basic: {}, education: [], modules: [] };
        const cfg = this.getSectionConfig()[type] || this.getSectionConfig().custom;
        const fields = ResumeProfileFields.defaultFieldsForType(type);
        const derived = ResumeProfileFields.deriveTitleContent(type, fields);
        this.draft.modules.push({
            id: this.newId('mod'),
            type: type in this.getSectionConfig() ? type : 'custom',
            title: derived.title,
            content: derived.content,
            fields,
            is_custom: true,
        });
        this.render({ preserveDraft: true });
        this.scheduleSave(true);
    },

    removeModule(moduleId) {
        if (!this.draft) return;
        this.draft.modules = this.draft.modules.filter((m) => m.id !== moduleId);
        this.render({ preserveDraft: true });
        this.scheduleSave(true);
    },

    collectDraftFromForm() {
        const extras = { ...(this.draft?.profile_basic?.extras || {}) };
        const supplementFieldMap = {
            'profile-address': 'address',
            'profile-age': 'age',
            'profile-gender': 'gender',
            'profile-native-place': 'native_place',
            'profile-political-status': 'political_status',
            'profile-linkedin': 'linkedin',
            'profile-summary': 'summary',
            'profile-visa-type': 'visa_type',
            'profile-resident-type': 'resident_type',
        };
        Object.entries(supplementFieldMap).forEach(([id, extraKey]) => {
            const el = document.getElementById(id);
            if (!el) return;
            const val = el.value.trim();
            if (val) extras[extraKey] = val;
            else delete extras[extraKey];
        });

        const basic = {
            name: document.getElementById('profile-name')?.value.trim() || '',
            email: document.getElementById('profile-email')?.value.trim() || '',
            phone: document.getElementById('profile-phone')?.value.trim() || '',
            city: document.getElementById('profile-city')?.value.trim() || '',
            extras,
        };

        const education = [];
        document.querySelectorAll('[data-education-id]').forEach((card) => {
            const fields = ResumeProfileFields.collectFieldsFromCard(card);
            education.push({
                id: card.dataset.educationId,
                ...fields,
                fields,
                is_custom: card.dataset.isCustom === 'true',
            });
        });

        const modules = [];
        document.querySelectorAll('[data-module-id]').forEach((card) => {
            const type = card.querySelector('[data-module-type]')?.value || 'custom';
            const fields = ResumeProfileFields.collectFieldsFromCard(card);
            const derived = ResumeProfileFields.deriveTitleContent(type, fields);
            modules.push({
                id: card.dataset.moduleId,
                type,
                title: derived.title,
                content: derived.content,
                fields,
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
                ? profileUiText('resume.draftSaved', 'Auto-saved (session)')
                : profileUiText('resume.draftSavedSession', 'Auto-saved for this session'));
            if (typeof onProfileDraftSaved === 'function') {
                onProfileDraftSaved();
            }
        } catch (error) {
            console.error('Draft save failed:', error);
            this.setSaveStatus(profileUiText('resume.draftSaveFailed', 'Save failed — edits kept locally'));
        }
    },

    setSaveStatus(text) {
        const el = document.getElementById('draft-save-status');
        if (el) el.textContent = text;
    },

    updateSaveUi() {
        const loggedIn = typeof apiClient !== 'undefined' && apiClient.isLoggedIn();
        const loginHint = document.getElementById('profile-save-login-hint');
        const saveBtn = document.getElementById('btn-save-profile');
        if (loginHint) loginHint.classList.toggle('hidden', loggedIn);
        if (saveBtn) {
            saveBtn.disabled = !loggedIn;
            saveBtn.classList.toggle('opacity-50', !loggedIn);
            saveBtn.classList.toggle('cursor-not-allowed', !loggedIn);
        }
        if (!loggedIn) {
            const section = document.getElementById('profile-saved-records-section');
            if (section) section.classList.add('hidden');
        }
    },

    applyRestoredHint(source) {
        const hint = document.getElementById('profile-restored-hint');
        const textEl = document.getElementById('profile-restored-hint-text');
        if (!hint || !textEl) return;
        if (source === 'mysql') {
            textEl.textContent = profileUiText(
                'resume.draftRestoredMysql',
                'Restored from your saved account profile — persists after refresh.'
            );
        } else {
            textEl.textContent = profileUiText(
                'resume.draftRestored',
                'Your draft was restored from your last session (available for 12 hours while logged in).'
            );
        }
    },

    async saveToAccount() {
        if (!apiClient.isLoggedIn()) {
            Utils.showToast(profileUiText('errors.loginToSaveProfile', 'Please log in to save your profile to the website'));
            return;
        }
        if (!document.getElementById('profile-editor-section') || document.getElementById('profile-editor-section').classList.contains('hidden')) {
            Utils.showToast(profileUiText('resume.toast.noProfileToSave', 'No profile data to save yet'));
            return;
        }

        const recordName = this.promptRecordName();
        if (recordName === null) return;

        try {
            Utils.showLoading(profileUiText('resume.toast.savingProfile', 'Saving profile to your account...'));
            const draft = this.collectDraftFromForm();
            this.draft = draft;
            const result = await apiClient.saveProfileToAccount(draft, recordName);
            this.setSaveStatus(profileUiText('resume.profileSavedNamed', 'Saved as “{name}”', {
                name: result.record_name || recordName,
            }));
            Utils.hideLoading();
            Utils.showToast(profileUiText('resume.toast.profileSaved', 'Profile saved to your account'));
            await this.loadSavedRecords();
            if (typeof onProfileDraftSaved === 'function') {
                onProfileDraftSaved();
            }
            return result;
        } catch (error) {
            Utils.hideLoading();
            Utils.showToast(profileUiText('resume.toast.profileSaveFailed', 'Save failed: {msg}', { msg: error.message }));
            console.error('Profile save error:', error);
        }
    },

    escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    },

    normalizeCompareText(value) {
        return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
    },

    captureDraftSnapshot() {
        const draft = this.collectDraftFromForm();
        return JSON.parse(JSON.stringify(draft));
    },

    clearTranslationHighlights() {
        document.querySelectorAll('.profile-field-translated').forEach((el) => {
            el.classList.remove('profile-field-translated');
            el.removeAttribute('data-translated-from');
            el.removeAttribute('title');
        });
        document.querySelectorAll('.profile-translated-badge').forEach((badge) => badge.remove());
        const banner = document.getElementById('profile-translation-review-banner');
        if (banner) banner.classList.add('hidden');
    },

    confirmTranslationReview() {
        this.clearTranslationHighlights();
    },

    markTranslatedInput(inputEl, previousValue) {
        if (!inputEl) return;
        inputEl.classList.add('profile-field-translated');
        inputEl.setAttribute('data-translated-from', previousValue || '');
        inputEl.title = profileUiText(
            'resume.profileEditor.translatedFieldHint',
            'Auto-translated — please review: was "{original}"',
            { original: previousValue || '' }
        );

        const label = inputEl.closest('div')?.querySelector('label')
            || inputEl.parentElement?.querySelector('label');
        if (label && !label.querySelector('.profile-translated-badge')) {
            const badge = document.createElement('span');
            badge.className = 'profile-translated-badge ml-2 px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800';
            badge.textContent = profileUiText('resume.profileEditor.translatedBadge', 'Translated — review');
            label.appendChild(badge);
        }
    },

    applyTranslationHighlights(beforeSnapshot, afterDraft) {
        this.clearTranslationHighlights();
        if (!beforeSnapshot || !afterDraft) return 0;

        const beforeBasic = beforeSnapshot.profile_basic || {};
        const afterBasic = afterDraft.profile_basic || {};
        let changedCount = 0;

        const compareScalar = (selector, beforeVal, afterVal) => {
            const beforeNorm = this.normalizeCompareText(beforeVal);
            const afterNorm = this.normalizeCompareText(afterVal);
            if (!afterNorm || beforeNorm === afterNorm) return;
            const el = document.querySelector(selector);
            if (!el) return;
            this.markTranslatedInput(el, beforeVal);
            changedCount += 1;
        };

        compareScalar('#profile-name', beforeBasic.name, afterBasic.name);

        const beforeEdu = beforeSnapshot.education || [];
        const afterEdu = afterDraft.education || [];
        afterEdu.forEach((entry, index) => {
            const prev = beforeEdu.find((e) => e.id === entry.id) || beforeEdu[index] || {};
            const card = document.querySelector(`[data-education-id="${entry.id}"]`)
                || document.querySelectorAll('[data-education-id]')[index];
            if (!card) return;
            const prevFields = ResumeProfileFields.getEntryFields('education', prev);
            const nextFields = ResumeProfileFields.getEntryFields('education', entry);
            Object.keys(nextFields).forEach((key) => {
                const beforeVal = prevFields[key] || '';
                const afterVal = nextFields[key] || '';
                const beforeNorm = this.normalizeCompareText(Array.isArray(beforeVal) ? beforeVal.join(', ') : beforeVal);
                const afterNorm = this.normalizeCompareText(Array.isArray(afterVal) ? afterVal.join(', ') : afterVal);
                if (!afterNorm || beforeNorm === afterNorm) return;
                const input = card.querySelector(`[data-field-key="${key}"]`);
                if (input) {
                    this.markTranslatedInput(input, Array.isArray(beforeVal) ? beforeVal.join(', ') : beforeVal);
                    changedCount += 1;
                }
            });
        });

        const beforeModules = beforeSnapshot.modules || [];
        const afterModules = afterDraft.modules || [];
        afterModules.forEach((mod, index) => {
            const prev = beforeModules.find((m) => m.id === mod.id) || beforeModules[index] || {};
            const card = document.querySelector(`[data-module-id="${mod.id}"]`)
                || document.querySelectorAll('[data-module-id]')[index];
            if (!card) return;
            const prevFields = ResumeProfileFields.getEntryFields(mod.type, prev);
            const nextFields = ResumeProfileFields.getEntryFields(mod.type, mod);
            Object.keys(nextFields).forEach((key) => {
                const beforeVal = prevFields[key] || '';
                const afterVal = nextFields[key] || '';
                const beforeNorm = this.normalizeCompareText(Array.isArray(beforeVal) ? beforeVal.join(', ') : beforeVal);
                const afterNorm = this.normalizeCompareText(Array.isArray(afterVal) ? afterVal.join(', ') : afterVal);
                if (!afterNorm || beforeNorm === afterNorm) return;
                const input = card.querySelector(`[data-field-key="${key}"]`);
                if (input) {
                    this.markTranslatedInput(input, Array.isArray(beforeVal) ? beforeVal.join(', ') : beforeVal);
                    changedCount += 1;
                }
            });
        });

        const banner = document.getElementById('profile-translation-review-banner');
        if (banner && changedCount > 0) {
            banner.classList.remove('hidden');
            const textEl = document.getElementById('profile-translation-review-text');
            if (textEl) {
                textEl.textContent = profileUiText(
                    'resume.profileEditor.translationReviewBanner',
                    '{count} field(s) were auto-translated. Highlighted fields need your review.',
                    { count: changedCount }
                );
            }
        }

        return changedCount;
    },

    resumeContentJsonToDraft(resumeContentJson) {
        if (!resumeContentJson) return null;
        const profile = resumeContentJson.profile || {};
        const extras = { ...(profile.extras || {}) };
        if (resumeContentJson.summary) extras.summary = resumeContentJson.summary;
        if (profile.linkedin) extras.linkedin = profile.linkedin;
        if (profile.address) extras.address = profile.address;
        if (profile.github) extras.github = profile.github;

        const education = (profile.education || []).map((entry) => {
            const fields = ResumeProfileFields.getEntryFields('education', entry);
            return {
                id: entry.id || this.newId('edu'),
                ...fields,
                fields,
                is_custom: false,
            };
        });

        const modules = [];
        const pushSection = (items, type) => {
            (items || []).forEach((item) => {
                const fields = ResumeProfileFields.parseFactContent(type, item.content || '', item.title || '');
                modules.push({
                    id: item.id || this.newId('mod'),
                    type,
                    title: item.title || '',
                    content: item.content || '',
                    fields,
                    is_custom: false,
                });
            });
        };
        pushSection(resumeContentJson.skills, 'skill');
        pushSection(resumeContentJson.internships, 'internship');
        pushSection(resumeContentJson.projects, 'project');
        pushSection(resumeContentJson.awards, 'award');
        pushSection(resumeContentJson.papers, 'paper');

        return {
            profile_basic: {
                name: profile.name || '',
                email: profile.email || '',
                phone: profile.phone || '',
                city: profile.city || '',
                extras,
            },
            education,
            modules: this.normalizeModules(modules),
        };
    },

    syncDraftFromResumeContent(resumeContentJson, options = {}) {
        const { beforeSnapshot = null, polishingFactIds = [] } = options;
        const mapped = this.resumeContentJsonToDraft(resumeContentJson);
        if (!mapped) return 0;

        this.polishingFactIds = Array.isArray(polishingFactIds) ? polishingFactIds.slice() : [];
        this.draft = this.ensureDraftShape(mapped);
        this.render({ preserveDraft: true });
        if (typeof refreshLanguageChecklist === 'function') {
            refreshLanguageChecklist(this.getResumeLang());
        }
        const changed = this.applyTranslationHighlights(beforeSnapshot, this.draft);
        this.scheduleSave(true);
        return changed;
    },

    renderSupplementSection() {
        const container = document.getElementById('profile-supplement-section');
        if (!container) return;

        const extras = this.draft?.profile_basic?.extras || {};
        const lang = typeof normalizeResumeLang === 'function'
            ? normalizeResumeLang(this.getResumeLang())
            : this.getResumeLang();
        const isZh = lang === 'zh';
        const isZhTw = lang === 'zh-TW';

        const field = (id, labelKey, labelFallback, placeholderKey, placeholderFallback, value, fullWidth) => `
            <div class="${fullWidth ? 'sm:col-span-2' : ''}">
                <label class="block text-xs font-medium text-gray-500 mb-1" for="${id}">${profileUiText(labelKey, labelFallback)}</label>
                <input id="${id}" type="text" value="${this.escapeHtml(value)}" class="w-full border border-gray-300 rounded-lg p-2 text-sm" placeholder="${this.escapeHtml(profileUiText(placeholderKey, placeholderFallback))}">
            </div>`;

        const summaryField = `
            <div class="sm:col-span-2">
                <label class="block text-xs font-medium text-gray-500 mb-1" for="profile-summary">${profileUiText(
                    isZhTw ? 'resume.profileEditor.professionalSummary' : 'resume.profileEditor.summary',
                    isZhTw ? 'Professional Summary' : 'Self introduction'
                )}</label>
                <textarea id="profile-summary" rows="3" class="w-full border border-gray-300 rounded-lg p-2 text-sm" placeholder="${this.escapeHtml(profileUiText(
                    isZhTw ? 'resume.profileEditor.professionalSummaryPlaceholder' : 'resume.profileEditor.summaryPlaceholder',
                    isZhTw ? '3–4 lines summarizing core skills and results' : '2–4 sentences highlighting strengths and role fit'
                ))}">${this.escapeHtml(extras.summary || '')}</textarea>
            </div>`;

        let fieldsHtml = '';
        if (isZh) {
            fieldsHtml = [
                field('profile-address', 'resume.profileEditor.address', 'Full address', 'resume.profileEditor.addressPlaceholder', 'Province, city, district', extras.address || '', true),
                field('profile-age', 'resume.profileEditor.age', 'Age', 'resume.profileEditor.agePlaceholder', 'e.g. 24', extras.age || '', false),
                field('profile-gender', 'resume.profileEditor.gender', 'Gender', 'resume.profileEditor.genderPlaceholder', 'Male / Female', extras.gender || '', false),
                field('profile-native-place', 'resume.profileEditor.nativePlace', 'Native place', 'resume.profileEditor.nativePlacePlaceholder', 'e.g. Guangzhou, Guangdong', extras.native_place || '', false),
                field('profile-political-status', 'resume.profileEditor.politicalStatus', 'Political status', 'resume.profileEditor.politicalStatusPlaceholder', 'Party member / League member / Non-party', extras.political_status || '', false),
                summaryField,
            ].join('');
        } else if (isZhTw) {
            fieldsHtml = [
                field('profile-visa-type', 'resume.profileEditor.visaType', 'Visa type', 'resume.profileEditor.visaTypePlaceholder', 'e.g. Employment visa / Home Return Permit', extras.visa_type || '', false),
                field('profile-resident-type', 'resume.profileEditor.residentType', 'Resident type', 'resume.profileEditor.residentTypePlaceholder', 'e.g. HK permanent resident / Macau resident', extras.resident_type || '', false),
                field('profile-linkedin', 'resume.profileEditor.linkedin', 'LinkedIn', 'resume.profileEditor.linkedinPlaceholder', 'https://linkedin.com/in/yourname', extras.linkedin || '', true),
                summaryField,
            ].join('');
        } else {
            fieldsHtml = [
                field('profile-linkedin', 'resume.profileEditor.linkedin', 'LinkedIn', 'resume.profileEditor.linkedinPlaceholder', 'https://linkedin.com/in/yourname', extras.linkedin || '', true),
                summaryField,
            ].join('');
        }

        container.innerHTML = `
            <div class="p-4 border border-amber-100 bg-amber-50/40 rounded-lg">
                <h4 class="font-semibold text-gray-800 text-sm mb-1">${profileUiText('resume.profileEditor.supplementTitle', 'Additional profile fields')}</h4>
                <p class="text-xs text-gray-500 mb-3">${profileUiText('resume.profileEditor.supplementHint', 'See inline reminders next to each field that needs attention.')}</p>
                <div class="grid sm:grid-cols-2 gap-3">${fieldsHtml}</div>
            </div>`;
    },

    canShowModuleActions() {
        return typeof resumeGenerated !== 'undefined' && resumeGenerated;
    },

    isPolishableModuleType(type) {
        return type === 'internship' || type === 'project';
    },

    renderModuleActionButtons(moduleId, moduleType, options = {}) {
        if (!this.canShowModuleActions()) return '';
        const { isPolishing = false, isTranslating = false, isRePolishing = false } = options;
        const busy = isPolishing || isTranslating || isRePolishing;
        const translateLabel = isTranslating
            ? profileUiText('resume.profileEditor.translating', 'Translating…')
            : profileUiText('resume.profileEditor.translateModule', 'Translate');
        const polishLabel = (isPolishing || isRePolishing)
            ? profileUiText('resume.profileEditor.polishing', 'Polishing…')
            : profileUiText('resume.profileEditor.polishModule', 'Polish');
        const showPolish = this.isPolishableModuleType(moduleType);
        const polishBtn = showPolish ? `
            <button type="button" data-polish-module="${moduleId}" class="text-xs px-2 py-1 rounded border border-amber-300 text-amber-800 hover:bg-amber-50 disabled:opacity-50" ${busy ? 'disabled' : ''}>
                <i class="fas fa-magic mr-1"></i>${this.escapeHtml(polishLabel)}
            </button>` : '';
        return `
            <div class="flex items-center gap-1 flex-wrap">
                <button type="button" data-translate-module="${moduleId}" data-module-kind="module" class="text-xs px-2 py-1 rounded border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50" ${busy ? 'disabled' : ''}>
                    <i class="fas fa-language mr-1"></i>${this.escapeHtml(translateLabel)}
                </button>
                ${polishBtn}
            </div>`;
    },

    updateDraftEntryFields(moduleId, kind, fields) {
        if (!this.draft || !fields) return;
        if (kind === 'education') {
            const entry = (this.draft.education || []).find((e) => e.id === moduleId);
            if (!entry) return;
            Object.assign(entry, fields);
            entry.fields = { ...fields };
            return;
        }
        const mod = (this.draft.modules || []).find((m) => m.id === moduleId);
        if (!mod) return;
        mod.fields = { ...fields };
        const derived = ResumeProfileFields.deriveTitleContent(mod.type, fields);
        mod.title = derived.title;
        mod.content = derived.content;
    },

    markTranslatedFieldChanges(card, beforeFields, afterFields) {
        if (!card) return;
        Object.keys(afterFields || {}).forEach((key) => {
            const beforeVal = beforeFields[key];
            const afterVal = afterFields[key];
            const beforeNorm = this.normalizeCompareText(Array.isArray(beforeVal) ? beforeVal.join(', ') : String(beforeVal || ''));
            const afterNorm = this.normalizeCompareText(Array.isArray(afterVal) ? afterVal.join(', ') : String(afterVal || ''));
            if (!afterNorm || beforeNorm === afterNorm) return;
            const input = card.querySelector(`[data-field-key="${key}"]`);
            if (input) {
                this.markTranslatedInput(input, Array.isArray(beforeVal) ? beforeVal.join(', ') : String(beforeVal || ''));
            }
        });
    },

    async translateModule(moduleId, kind = 'module') {
        if (typeof guardAiTaskRetry === 'function' && !guardAiTaskRetry()) return;
        if (typeof beginAiTaskAttempt === 'function') beginAiTaskAttempt();
        if (this.translatingModuleIds.includes(moduleId)) return;

        const lang = this.getResumeLang();
        let payload;
        if (kind === 'education') {
            const card = document.querySelector(`[data-education-id="${moduleId}"]`);
            if (!card) return;
            const fields = ResumeProfileFields.collectFieldsFromCard(card);
            payload = {
                module_id: moduleId,
                module_type: 'education',
                school: fields.school || '',
                major: fields.major || '',
                degree: fields.degree || '',
                fields,
                target_language: lang,
            };
        } else {
            const card = document.querySelector(`[data-module-id="${moduleId}"]`);
            if (!card) return;
            const moduleType = card.querySelector('[data-module-type]')?.value || 'custom';
            const fields = ResumeProfileFields.collectFieldsFromCard(card);
            const derived = ResumeProfileFields.deriveTitleContent(moduleType, fields);
            payload = {
                module_id: moduleId,
                module_type: moduleType,
                title: derived.title,
                content: derived.content,
                fields,
                target_language: lang,
            };
        }

        this.translatingModuleIds.push(moduleId);
        this.render({ preserveDraft: true });
        try {
            if (typeof syncDraftBeforeGenerate === 'function') {
                await syncDraftBeforeGenerate({ required: false, showLoading: false });
            } else {
                await this.persistDraft();
            }
            const response = await apiClient.translateResumeModule(payload);
            const result = response.module || {};
            const moduleType = kind === 'education' ? 'education' : (payload.module_type || 'custom');
            const mergedFields = ResumeProfileFields.applyApiResultToFields(moduleType, payload.fields || {}, result);
            this.updateDraftEntryFields(moduleId, kind, mergedFields);
            this.render({ preserveDraft: true });
            const card = kind === 'education'
                ? document.querySelector(`[data-education-id="${moduleId}"]`)
                : document.querySelector(`[data-module-id="${moduleId}"]`);
            this.markTranslatedFieldChanges(card, payload.fields || {}, mergedFields);
            this.scheduleSave(true);
            Utils.showToast(profileUiText('resume.profileEditor.moduleTranslated', 'Module translated — please review'));
        } catch (error) {
            Utils.showAiTaskErrorToast(
                error,
                'resume.profileEditor.moduleTranslateFailed',
                'Module translation failed: {msg}',
                { msg: error.message }
            );
        } finally {
            this.translatingModuleIds = this.translatingModuleIds.filter((id) => id !== moduleId);
            this.render({ preserveDraft: true });
        }
    },

    async polishModule(moduleId) {
        if (typeof guardAiTaskRetry === 'function' && !guardAiTaskRetry()) return;
        if (typeof beginAiTaskAttempt === 'function') beginAiTaskAttempt();
        if (this.rePolishingModuleIds.includes(moduleId) || (this.polishingFactIds || []).includes(moduleId)) return;

        const card = document.querySelector(`[data-module-id="${moduleId}"]`);
        if (!card) return;
        const moduleType = card.querySelector('[data-module-type]')?.value || '';
        if (!this.isPolishableModuleType(moduleType)) return;

        const fields = ResumeProfileFields.collectFieldsFromCard(card);
        const derived = ResumeProfileFields.deriveTitleContent(moduleType, fields);
        const payload = {
            module_id: moduleId,
            module_type: moduleType,
            title: derived.title,
            content: derived.content,
            fields,
        };

        this.rePolishingModuleIds.push(moduleId);
        this.render({ preserveDraft: true });
        try {
            const response = await apiClient.polishResumeModule(payload);
            const result = response.module || {};
            const currentFields = ResumeProfileFields.collectFieldsFromCard(card);
            const mergedFields = ResumeProfileFields.applyApiResultToFields(moduleType, currentFields, result);
            this.updateDraftEntryFields(moduleId, 'module', mergedFields);
            this.render({ preserveDraft: true });
            const refreshedCard = document.querySelector(`[data-module-id="${moduleId}"]`);
            ResumeProfileFields.applyFieldsToCard(refreshedCard, mergedFields);
            this.scheduleSave(true);
            Utils.showToast(profileUiText('resume.profileEditor.modulePolished', 'Module polished — please review'));
        } catch (error) {
            Utils.showAiTaskErrorToast(
                error,
                'resume.profileEditor.modulePolishFailed',
                'Module polish failed: {msg}',
                { msg: error.message }
            );
        } finally {
            this.rePolishingModuleIds = this.rePolishingModuleIds.filter((id) => id !== moduleId);
            this.render({ preserveDraft: true });
        }
    },

    renderEducationCard(entry) {
        const isTranslating = (this.translatingModuleIds || []).includes(entry.id);
        const fields = ResumeProfileFields.getEntryFields('education', entry);
        const actionButtons = this.canShowModuleActions() ? `
            <div class="flex items-center gap-1">
                <button type="button" data-translate-module="${entry.id}" data-module-kind="education" class="text-xs px-2 py-1 rounded border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50" ${isTranslating ? 'disabled' : ''}>
                    <i class="fas fa-language mr-1"></i>${this.escapeHtml(isTranslating
                        ? profileUiText('resume.profileEditor.translating', 'Translating…')
                        : profileUiText('resume.profileEditor.translateModule', 'Translate'))}
                </button>
            </div>` : '';
        const readonlyAttr = isTranslating ? 'readonly' : '';
        return `
        <div class="border border-gray-200 rounded-lg p-4 mb-2 bg-white" data-education-id="${entry.id}" data-is-custom="${entry.is_custom ? 'true' : 'false'}">
            <div class="flex items-start justify-between gap-2 mb-2">
                <span class="text-xs font-medium text-indigo-600 uppercase tracking-wide">${profileUiText('resume.profileEditor.educationEntry', 'Education entry')}</span>
                <div class="flex items-center gap-2">
                    ${actionButtons}
                    <button type="button" data-remove-education="${entry.id}" class="text-red-500 hover:text-red-700 p-1" title="${this.escapeHtml(profileUiText('resume.profileEditor.remove', 'Remove'))}" ${isTranslating ? 'disabled' : ''}>
                        <i class="fas fa-trash-alt text-sm"></i>
                    </button>
                </div>
            </div>
            ${ResumeProfileFields.renderFieldsGrid('education', fields, this.escapeHtml.bind(this), readonlyAttr)}
        </div>`;
    },

    renderModuleCard(module) {
        const sectionConfig = this.getSectionConfig();
        const typeOptions = Object.entries(sectionConfig)
            .filter(([k]) => k !== 'education')
            .map(([value, cfg]) => `<option value="${value}" ${module.type === value ? 'selected' : ''}>${cfg.label}</option>`)
            .join('');

        const isPolishing = (this.polishingFactIds || []).includes(module.id);
        const isTranslating = (this.translatingModuleIds || []).includes(module.id);
        const isRePolishing = (this.rePolishingModuleIds || []).includes(module.id);
        const moduleBusy = isPolishing || isTranslating || isRePolishing;
        const busyLabel = isTranslating
            ? profileUiText('resume.profileEditor.translating', 'Translating…')
            : profileUiText('resume.profileEditor.polishing', 'Polishing…');
        const cardClass = moduleBusy
            ? 'border border-amber-200 rounded-lg p-4 mb-2 bg-amber-50/40'
            : 'border border-gray-200 rounded-lg p-4 mb-2 bg-white';
        const readonlyAttr = moduleBusy ? 'readonly' : '';
        const actionButtons = this.renderModuleActionButtons(module.id, module.type, {
            isPolishing,
            isTranslating,
            isRePolishing,
        });
        const fields = ResumeProfileFields.getEntryFields(module.type, module);

        return `
        <div class="${cardClass}" data-module-id="${module.id}" data-is-custom="${module.is_custom ? 'true' : 'false'}" data-polishing="${moduleBusy ? 'true' : 'false'}">
            <div class="flex items-start justify-between gap-2 mb-2">
                <div class="flex items-center gap-2 flex-wrap">
                    <select data-module-type class="border border-gray-300 rounded-lg p-1.5 text-xs bg-gray-50" ${moduleBusy ? 'disabled' : ''}>${typeOptions}</select>
                    ${moduleBusy ? `<span class="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full animate-pulse">${this.escapeHtml(busyLabel)}</span>` : ''}
                </div>
                <div class="flex items-center gap-2">
                    ${actionButtons}
                    <button type="button" data-remove-module="${module.id}" class="text-red-500 hover:text-red-700 p-1" title="${this.escapeHtml(profileUiText('resume.profileEditor.remove', 'Remove'))}" ${moduleBusy ? 'disabled' : ''}>
                        <i class="fas fa-trash-alt text-sm"></i>
                    </button>
                </div>
            </div>
            ${ResumeProfileFields.renderFieldsGrid(module.type, fields, this.escapeHtml.bind(this), readonlyAttr)}
        </div>`;
    },

    renderSection(type, items, renderFn) {
        const cfg = this.getSectionConfig()[type];
        const cards = items.length
            ? items.map((item) => renderFn.call(this, item)).join('')
            : `<p class="text-xs text-gray-400 italic mb-2">${profileUiText('resume.profileEditor.noEntries', 'No entries yet — add one below or fill the empty slot.')}</p>`;

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

    render(options = {}) {
        const preserveDraft = Boolean(options.preserveDraft);
        if (!preserveDraft && document.querySelector('[data-education-id], [data-module-id], #profile-summary')) {
            this.draft = this.collectDraftFromForm();
        }

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
        this.renderSupplementSection();
        this.renderPhotoPreview();
        this.updatePhotoVisibility(this.getResumeLang());

        const body = document.getElementById('profile-editor-body');
        if (!body) return;

        const education = draft.education || [];
        const modulesByType = {};
        (draft.modules || []).forEach((m) => {
            const t = m.type in this.getSectionConfig() ? m.type : 'custom';
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
        const hasEducation = (draft.education || []).some((entry) => {
            const fields = ResumeProfileFields.getEntryFields('education', entry);
            return fields.school || fields.major || fields.degree;
        });
        const hasModules = (draft.modules || []).some((mod) => {
            const fields = ResumeProfileFields.getEntryFields(mod.type, mod);
            return Object.values(fields).some((v) => (Array.isArray(v) ? v.length : String(v || '').trim()));
        });
        return !hasBasic && !hasEducation && !hasModules;
    },

    show(restored = false) {
        document.getElementById('empty-state')?.classList.add('hidden');
        const hint = document.getElementById('profile-restored-hint');
        if (hint) hint.classList.toggle('hidden', !restored);
        this.updateSaveUi();
        if (typeof setResumeView === 'function') {
            setResumeView(typeof currentResumeView !== 'undefined' ? currentResumeView : 'edit', { scroll: true });
        } else {
            document.getElementById('profile-editor-section')?.classList.remove('hidden');
            document.getElementById('profile-editor-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        if (typeof updateResumeViewSwitcher === 'function') {
            updateResumeViewSwitcher();
        }
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
            this.render({ preserveDraft: true });
            this.applyRestoredHint(result.source);
            this.show(result.restored);
            this.updateSaveUi();
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
        this._missingSlotsKey = '';
        this.clearTranslationHighlights();
        this.render({ preserveDraft: true });
        this.show(false);
        this.updateSaveUi();
        if (typeof apiClient !== 'undefined' && apiClient.isLoggedIn()) {
            this.loadSavedRecords();
        }
        document.getElementById('profile-restored-hint')?.classList.add('hidden');

        if (typeof updateProfileContinueUi === 'function') {
            updateProfileContinueUi(typeof lastChecklistData !== 'undefined' ? lastChecklistData : null);
        }

        try {
            await this.persistDraft();
        } catch (error) {
            console.warn('Draft save after upload failed:', error.message);
            this.setSaveStatus(profileUiText('resume.draftSaveFailed', 'Save failed — edits kept locally'));
        }
    },
};

function onPageReady(fn) {
    if (window.GBAPageBootstrap && typeof GBAPageBootstrap.runWhenReady === 'function') {
        GBAPageBootstrap.runWhenReady(fn);
    } else if (window.GBAI18n && typeof GBAI18n.initLanguage === 'function') {
        GBAI18n.initLanguage().then(fn);
    } else {
        fn();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    onPageReady(() => {
        ProfileEditor.init();
    });
});

window.addEventListener('gba:language-changed', () => {
    ProfileEditor.renderPhotoPreview();
    if (ProfileEditor.draft) {
        ProfileEditor.render();
    }
});
