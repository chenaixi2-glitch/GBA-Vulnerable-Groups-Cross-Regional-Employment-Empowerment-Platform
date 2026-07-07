/**
 * Shared resume/profile + JD upload flow (learning path, interview, etc.)
 */
(function (global) {
    const VALID_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'];
    const MAX_FILE_BYTES = 10 * 1024 * 1024;

    function cjsT(key, fallback, vars) {
        if (global.GBAI18n && global.GBAI18n.t) {
            return global.GBAI18n.t(key, fallback, vars);
        }
        let out = fallback || key;
        if (vars && out) {
            Object.keys(vars).forEach((k) => {
                out = String(out).replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
            });
        }
        return out;
    }

    function setPrerequisiteIcon(elementId, ready) {
        const element = document.getElementById(elementId);
        if (!element) return;
        const icon = element.querySelector('.prereq-icon');
        if (icon) {
            icon.className = ready
                ? 'prereq-icon fas fa-check-circle text-green-500'
                : 'prereq-icon fas fa-circle text-gray-300';
        }
    }

    class CandidateJdSetup {
        constructor(config) {
            this.config = {
                showLoading: true,
                revealJdAfterProfile: true,
                requireJdText: false,
                parsedTextRows: 12,
                ...config,
            };
            this.selectedFile = null;
            this.profileReady = false;
            this.jobReady = false;
            this.loadedRecordId = '';
            this.loadedRecordName = '';
            this.profileDirty = false;
        }

        init() {
            const fileInput = document.getElementById(this.config.ids.fileInput);
            if (fileInput && !fileInput.dataset.cjsBound) {
                fileInput.dataset.cjsBound = '1';
                fileInput.addEventListener('change', (event) => this.handleFileSelect(event));
            }

            const profileTextEl = document.getElementById(this.config.ids.profileText);
            if (profileTextEl && !profileTextEl.dataset.cjsBound) {
                profileTextEl.dataset.cjsBound = '1';
                profileTextEl.addEventListener('input', () => {
                    this.profileDirty = true;
                    if (profileTextEl.value.trim()) {
                        this.clearFile(false);
                    }
                });
            }

            this.bindReviewButtons();
            this.updatePrerequisites();
            this.updateSaveUi();
        }

        bindReviewButtons() {
            const ids = this.config.ids || {};
            const bind = (id, handler) => {
                const el = document.getElementById(id);
                if (el && !el.dataset.cjsBound) {
                    el.dataset.cjsBound = '1';
                    el.addEventListener('click', handler);
                }
            };
            if (ids.profileApplyBtn) bind(ids.profileApplyBtn, () => this.applyProfileEdits());
            if (ids.profileSaveBtn) bind(ids.profileSaveBtn, () => this.saveProfileToAccount(false));
            if (ids.profileOverwriteBtn) bind(ids.profileOverwriteBtn, () => this.saveProfileToAccount(true));
        }

        handleFileSelect(event) {
            const file = event.target.files?.[0];
            if (!file) return;

            const ext = '.' + file.name.split('.').pop().toLowerCase();
            if (!VALID_EXTENSIONS.includes(ext)) {
                Utils.showToast(cjsT(
                    'resume.toast.invalidFileType',
                    'Unsupported file format. Please upload PDF, DOCX, TXT, or MD'
                ));
                return;
            }
            if (file.size > MAX_FILE_BYTES) {
                Utils.showToast(cjsT('resume.toast.fileTooLarge', 'File too large. Maximum size is 10MB'));
                return;
            }

            this.selectedFile = file;
            this.profileDirty = false;
            this.loadedRecordId = '';
            this.loadedRecordName = '';
            const profileTextEl = document.getElementById(this.config.ids.profileText);
            if (profileTextEl) profileTextEl.value = '';
            this.hideProfileReview();

            const fileNameEl = document.getElementById(this.config.ids.fileName);
            const fileInfoEl = document.getElementById(this.config.ids.fileInfo);
            if (fileNameEl) fileNameEl.textContent = file.name;
            if (fileInfoEl) fileInfoEl.classList.remove('hidden');
            this.updateSaveUi();
        }

        clearFile(clearInput = true) {
            this.selectedFile = null;
            if (clearInput) {
                const fileInput = document.getElementById(this.config.ids.fileInput);
                if (fileInput) fileInput.value = '';
            }
            const fileInfoEl = document.getElementById(this.config.ids.fileInfo);
            if (fileInfoEl) fileInfoEl.classList.add('hidden');
        }

        getProfileText() {
            return document.getElementById(this.config.ids.profileText)?.value.trim() || '';
        }

        getJdText() {
            return document.getElementById(this.config.ids.jdText)?.value.trim() || '';
        }

        getTargetContext(jdOverride) {
            if (typeof collectTargetJobContext !== 'function') return null;
            return collectTargetJobContext({
                fields: this.config.targetJobFields,
                jdTextOverride: jdOverride ?? this.getJdText(),
            });
        }

        fillProfileTextarea(source) {
            const el = document.getElementById(this.config.ids.profileText);
            if (!el || typeof ProfileTextUtils === 'undefined') return;
            let text = '';
            if (typeof source === 'string') {
                text = source;
            } else if (source?.draft) {
                text = ProfileTextUtils.draftToDisplayText(source.draft);
            } else if (source?.candidate_profile) {
                text = ProfileTextUtils.candidateProfileToDisplayText(source.candidate_profile);
            } else {
                text = ProfileTextUtils.candidateProfileToDisplayText(source);
            }
            if (!text) return;
            el.value = text;
            el.rows = this.config.parsedTextRows || 12;
            this.profileDirty = false;
            this.showProfileReview();
        }

        showProfileReview() {
            const sectionId = this.config.ids.profileReviewSection;
            if (sectionId) {
                document.getElementById(sectionId)?.classList.remove('hidden');
            }
            this.updateSaveUi();
        }

        hideProfileReview() {
            const sectionId = this.config.ids.profileReviewSection;
            if (sectionId) {
                document.getElementById(sectionId)?.classList.add('hidden');
            }
        }

        setSaveStatus(message) {
            const el = document.getElementById(this.config.ids.profileSaveStatus);
            if (el) {
                el.textContent = message || '';
                el.classList.toggle('hidden', !message);
            }
        }

        updateSaveUi() {
            const loggedIn = typeof apiClient !== 'undefined' && apiClient.isLoggedIn();
            const hasText = Boolean(this.getProfileText());
            const saveBtn = document.getElementById(this.config.ids.profileSaveBtn);
            const overwriteBtn = document.getElementById(this.config.ids.profileOverwriteBtn);
            if (saveBtn) saveBtn.classList.toggle('hidden', !loggedIn);
            if (overwriteBtn) {
                const show = loggedIn && Boolean(this.loadedRecordId) && hasText;
                overwriteBtn.classList.toggle('hidden', !show);
            }
        }

        promptRecordName(defaultName) {
            const fallback = defaultName || cjsT('resume.savedRecordUntitled', 'My resume');
            const input = window.prompt(
                cjsT('resume.savedRecordNamePrompt', 'Enter a name for this saved profile:'),
                fallback
            );
            if (input === null) return null;
            const trimmed = input.trim();
            return trimmed || fallback;
        }

        ingestProfileFromResponse(response, meta = {}) {
            if (!response) return;
            if (meta.recordId) {
                this.loadedRecordId = meta.recordId;
                this.loadedRecordName = meta.recordName || '';
            }
            if (response.candidate_profile) {
                this.fillProfileTextarea(response.candidate_profile);
            } else if (response.draft) {
                this.fillProfileTextarea({ draft: response.draft });
            }
        }

        updatePrerequisites() {
            const { prereqIds } = this.config;
            if (prereqIds?.profile) setPrerequisiteIcon(prereqIds.profile, this.profileReady);
            if (prereqIds?.job) setPrerequisiteIcon(prereqIds.job, this.jobReady);
            this.config.onPrerequisitesChange?.(this);
        }

        isReady() {
            return this.profileReady && this.jobReady;
        }

        async applyProfileEdits() {
            const text = this.getProfileText();
            if (!text) {
                Utils.showToast(cjsT('profileReview.applyNeedsText', 'Please enter or paste profile text first'));
                return null;
            }

            if (this.config.showLoading) {
                Utils.showLoading(cjsT('profileReview.applyingEdits', 'Applying profile edits...'));
            }

            try {
                const response = await apiClient.submitProfileText(text, { replaceProfile: true });
                if (!response?.candidate_profile) {
                    throw new Error(cjsT('resume.toast.uploadEmptyProfile', 'Could not extract resume details.'));
                }
                this.profileReady = true;
                this.profileDirty = false;
                this.fillProfileTextarea(response.candidate_profile);
                if (this.config.revealJdAfterProfile && this.config.ids.jdSection) {
                    document.getElementById(this.config.ids.jdSection)?.classList.remove('hidden');
                }
                this.updatePrerequisites();
                this.config.onProfileReady?.(response);
                this.setSaveStatus(cjsT('profileReview.appliedStatus', 'Profile synced to session'));
                Utils.showToast(cjsT('profileReview.appliedToast', 'Profile edits applied'));
                return response;
            } catch (error) {
                Utils.showToast(cjsT('profileReview.applyFailed', 'Failed to apply edits: {msg}', { msg: error.message }));
                throw error;
            } finally {
                if (this.config.showLoading) Utils.hideLoading();
            }
        }

        async saveProfileToAccount(overwrite = false) {
            if (!apiClient.isLoggedIn()) {
                Utils.showToast(cjsT('errors.loginToSaveProfile', 'Please log in to save your profile to the website'));
                return null;
            }
            if (!this.getProfileText()) {
                Utils.showToast(cjsT('resume.toast.noProfileToSave', 'No profile data to save yet'));
                return null;
            }

            try {
                if (this.profileDirty) {
                    await this.applyProfileEdits();
                }
                Utils.showLoading(cjsT('resume.toast.savingProfile', 'Saving profile to your account...'));
                let draft;
                try {
                    const draftResult = await apiClient.getResumeDraft();
                    draft = draftResult.draft;
                } catch (_) {
                    draft = null;
                }
                if (!draft) {
                    await this.applyProfileEdits();
                    const draftResult = await apiClient.getResumeDraft();
                    draft = draftResult.draft;
                }
                if (!draft) {
                    throw new Error(cjsT('resume.toast.noProfileToSave', 'No profile data to save yet'));
                }

                let recordName = '';
                let recordId = '';
                if (overwrite && this.loadedRecordId) {
                    recordId = this.loadedRecordId;
                    recordName = this.loadedRecordName || this.promptRecordName('') || '';
                } else {
                    recordName = this.promptRecordName(
                        (draft.profile_basic && draft.profile_basic.name) || this.loadedRecordName
                    );
                    if (recordName === null) return null;
                }

                const result = await apiClient.saveProfileToAccount(draft, recordName, recordId);
                if (!overwrite) {
                    this.loadedRecordId = result.record_id || '';
                    this.loadedRecordName = result.record_name || recordName;
                }
                this.setSaveStatus(cjsT('resume.profileSavedNamed', 'Saved as "{name}"', {
                    name: result.record_name || recordName,
                }));
                Utils.showToast(cjsT('resume.toast.profileSaved', 'Profile saved to your account'));
                this.updateSaveUi();
                this.config.onProfileSaved?.(result);
                return result;
            } catch (error) {
                Utils.showToast(cjsT('resume.toast.profileSaveFailed', 'Save failed: {msg}', { msg: error.message }));
                throw error;
            } finally {
                Utils.hideLoading();
            }
        }

        async submitProfile() {
            const i18n = this.config.i18n || {};
            const profileText = this.getProfileText();
            const fallback = typeof this.config.buildProfileFallback === 'function'
                ? this.config.buildProfileFallback()
                : '';
            const material = profileText || fallback;

            if (!this.selectedFile && !material.trim()) {
                Utils.showToast(cjsT(
                    i18n.profileRequired?.[0] || 'interview.toast.uploadOrPaste',
                    i18n.profileRequired?.[1] || 'Please upload a resume or paste profile text'
                ));
                return null;
            }

            const loadingMsg = cjsT(
                i18n.profileLoading?.[0] || 'resume.toast.uploadingResume',
                i18n.profileLoading?.[1] || 'Uploading resume...'
            );

            if (this.config.showLoading) Utils.showLoading(loadingMsg);

            try {
                let response;
                if (this.selectedFile) {
                    response = await apiClient.uploadResume(this.selectedFile);
                } else {
                    response = await apiClient.submitProfileText(material);
                }

                this.profileReady = Boolean(response?.candidate_profile);
                if (!this.profileReady) {
                    throw new Error(cjsT(
                        'resume.toast.uploadEmptyProfile',
                        'Could not extract resume details. Try pasting resume text directly.'
                    ));
                }

                this.ingestProfileFromResponse(response);
                this.loadedRecordId = '';
                this.loadedRecordName = '';

                if (this.config.revealJdAfterProfile && this.config.ids.jdSection) {
                    document.getElementById(this.config.ids.jdSection)?.classList.remove('hidden');
                }

                this.updatePrerequisites();
                this.config.onProfileReady?.(response);

                if (this.config.showLoading) Utils.hideLoading();
                Utils.showToast(cjsT(
                    i18n.profileSuccess?.[0] || 'interview.toast.profileUploaded',
                    i18n.profileSuccess?.[1] || 'Profile uploaded successfully'
                ));
                return response;
            } catch (error) {
                if (this.config.showLoading) Utils.hideLoading();
                Utils.showToast(cjsT(
                    i18n.profileFailed?.[0] || 'interview.toast.profileFailed',
                    i18n.profileFailed?.[1] || 'Failed to upload profile: {msg}',
                    { msg: error.message }
                ));
                throw error;
            }
        }

        async submitJd(options = {}) {
            const i18n = this.config.i18n || {};
            const jdText = options.jdText ?? this.getJdText();
            const targetJobTitle = options.targetJobTitle ?? '';
            const ctx = this.getTargetContext(jdText);

            if (this.profileDirty) {
                Utils.showToast(cjsT('profileReview.applyBeforeJd', 'Apply profile edits before submitting JD'));
                return null;
            }

            if (this.config.requireJdText && !jdText) {
                Utils.showToast(cjsT(
                    i18n.jdRequired?.[0] || 'interview.toast.pasteJd',
                    i18n.jdRequired?.[1] || 'Please paste the target job description or fill in target job fields'
                ));
                return null;
            }

            if (!jdText && !ctx?.industry && !ctx?.employer_type && !ctx?.experience_level && !targetJobTitle) {
                Utils.showToast(cjsT(
                    i18n.jdRequired?.[0] || 'interview.toast.pasteJd',
                    i18n.jdRequired?.[1] || 'Please paste the target job description or fill in target job fields'
                ));
                return null;
            }

            if (this.config.showLoading) {
                Utils.showLoading(cjsT(
                    i18n.jdLoading?.[0] || 'resume.toast.analyzingJd',
                    i18n.jdLoading?.[1] || 'Analyzing job description...'
                ));
            }

            try {
                const jobPayload = jdText || ctx?.jd_text || targetJobTitle;
                const response = await apiClient.submitJobDescription(jobPayload, ctx);
                this.jobReady = true;
                this.updatePrerequisites();
                this.config.onJobReady?.(response, ctx);

                if (this.config.showLoading) Utils.hideLoading();
                Utils.showToast(cjsT(
                    i18n.jdSuccess?.[0] || 'interview.toast.jdSubmitted',
                    i18n.jdSuccess?.[1] || 'Job description submitted successfully'
                ));
                return response;
            } catch (error) {
                if (this.config.showLoading) Utils.hideLoading();
                Utils.showToast(cjsT(
                    i18n.jdFailed?.[0] || 'interview.toast.jdFailed',
                    i18n.jdFailed?.[1] || 'Failed to submit job description: {msg}',
                    { msg: error.message }
                ));
                throw error;
            }
        }
    }

    global.CandidateJdSetup = CandidateJdSetup;
})(typeof window !== 'undefined' ? window : globalThis);
