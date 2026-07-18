/**
 * Restore saved profile records into session — shared by resume / interview / learning path.
 */
(function (global) {
    const PROFILE_PARAM = 'profile_record';

    function spT(key, fallback, vars) {
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

    function escapeHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /** Parse server UTC timestamps (naive MySQL DATETIME or ISO) into a Date. */
    function parseServerUtcDate(value) {
        if (!value) return null;
        const s = String(value).trim();
        if (!s) return null;
        if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) {
            const d = new Date(s);
            return Number.isNaN(d.getTime()) ? null : d;
        }
        const normalized = s.includes('T') ? s : s.replace(' ', 'T');
        const d = new Date(normalized + 'Z');
        return Number.isNaN(d.getTime()) ? null : d;
    }

    function formatSavedAtLocal(value) {
        const d = parseServerUtcDate(value);
        if (!d) return value ? String(value) : '';
        return d.toLocaleString(undefined, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    function getRecordIdFromUrl() {
        const params = new URLSearchParams(global.location?.search || '');
        return (params.get(PROFILE_PARAM) || '').trim();
    }

    function buildPageUrl(pagePath, recordId) {
        const base = new URL(pagePath, global.location.href);
        if (recordId) {
            base.searchParams.set(PROFILE_PARAM, recordId);
        } else {
            base.searchParams.delete(PROFILE_PARAM);
        }
        return base.pathname + base.search + base.hash;
    }

    function showLoadedBanner(recordName, bannerId = 'saved-profile-loaded-banner') {
        let banner = document.getElementById(bannerId);
        if (!banner) {
            banner = document.createElement('div');
            banner.id = bannerId;
            banner.className = 'mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800 flex items-start gap-2';
            const host = document.querySelector('main') || document.body;
            host.insertBefore(banner, host.firstChild);
        }
        banner.classList.remove('hidden');
        banner.innerHTML = `
            <i class="fas fa-check-circle mt-0.5 text-green-600"></i>
            <span>${escapeHtml(spT('savedProfile.loadedBanner', 'Loaded saved profile: {name}', {
                name: recordName || spT('savedProfile.unnamed', 'My resume'),
            }))}</span>`;
    }

    function applyToCandidateSetup(setup) {
        if (!setup) return;
        setup.profileReady = true;
        setup.updatePrerequisites();
        if (setup.config?.revealJdAfterProfile !== false && setup.config?.ids?.jdSection) {
            document.getElementById(setup.config.ids.jdSection)?.classList.remove('hidden');
        }
    }

    async function restoreRecord(recordId) {
        if (typeof apiClient === 'undefined') {
            throw new Error('API client not ready');
        }
        apiClient.ensureSessionStarted();
        if (!apiClient.isLoggedIn()) {
            throw new Error(spT('savedProfile.loginRequired', 'Please log in to use a saved profile'));
        }
        return apiClient.restoreSavedProfile(recordId);
    }

    async function restoreFromUrl(options = {}) {
        const recordId = options.recordId || getRecordIdFromUrl();
        if (!recordId) return null;

        const {
            setup = null,
            onRestored = null,
            showBanner = true,
            bannerId = 'saved-profile-loaded-banner',
            showToast = true,
        } = options;

        try {
            if (typeof Utils !== 'undefined' && Utils.showLoading) {
                Utils.showLoading(spT('resume.savedRecordLoading', 'Loading saved profile...'));
            }
            const result = await restoreRecord(recordId);
            applyToCandidateSetup(setup);
            if (setup && typeof setup.ingestProfileFromResponse === 'function') {
                setup.ingestProfileFromResponse(result, {
                    recordId: result.record_id || recordId,
                    recordName: result.record_name || '',
                });
            }
            if (typeof onRestored === 'function') {
                await onRestored(result);
            }
            if (showBanner) {
                showLoadedBanner(result.record_name, bannerId);
            }
            if (showToast && typeof Utils !== 'undefined') {
                Utils.showToast(spT('resume.savedRecordLoadedToast', 'Saved profile loaded'));
            }
            return result;
        } catch (error) {
            if (typeof Utils !== 'undefined') {
                Utils.showToast(spT('resume.savedRecordLoadFailed', 'Failed to load: {msg}', { msg: error.message }));
            }
            console.error('Saved profile restore failed:', error);
            return null;
        } finally {
            if (typeof Utils !== 'undefined' && Utils.hideLoading) {
                Utils.hideLoading();
            }
        }
    }

    function pageLinks(recordId, currentPage) {
        const pages = [
            { id: 'resume', path: 'demo-resume-generator.html', label: spT('savedProfile.openResume', 'Resume') },
            { id: 'interview', path: 'demo-interview.html', label: spT('savedProfile.openInterview', 'Interview') },
            { id: 'learning', path: 'demo-learning-path.html', label: spT('savedProfile.openLearning', 'Learning path') },
        ];
        return pages
            .filter((p) => p.id !== currentPage)
            .map((p) => `<a href="${escapeHtml(buildPageUrl(p.path, recordId))}"
                class="text-xs text-blue-600 hover:text-blue-800 hover:underline">${escapeHtml(p.label)}</a>`)
            .join('<span class="text-gray-300 mx-1">·</span>');
    }

    async function renderSavedRecordsPanel(options = {}) {
        const {
            sectionId,
            listId,
            emptyId,
            currentPage = '',
            onLoadInPlace = null,
        } = options;

        const section = sectionId ? document.getElementById(sectionId) : null;
        const list = listId ? document.getElementById(listId) : null;
        if (!list) return;

        if (typeof apiClient === 'undefined' || !apiClient.isLoggedIn()) {
            section?.classList.add('hidden');
            list.innerHTML = '';
            return;
        }

        section?.classList.remove('hidden');

        try {
            const result = await apiClient.getProfileSaveHistory(20);
            const records = result.records || [];
            const empty = emptyId ? document.getElementById(emptyId) : null;

            if (!records.length) {
                list.innerHTML = '';
                empty?.classList.remove('hidden');
                return;
            }

            empty?.classList.add('hidden');
            list.innerHTML = records.map((record) => {
                const name = record.record_name || record.candidate_name
                    || spT('resume.savedRecordUntitled', 'My resume');
                const savedAt = formatSavedAtLocal(record.saved_at);
                const links = pageLinks(record.id, currentPage);
                const loadBtn = onLoadInPlace
                    ? `<button type="button" data-sp-load="${escapeHtml(record.id)}"
                        class="shrink-0 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100">
                        ${escapeHtml(spT('resume.savedRecordLoad', 'Load'))}
                       </button>`
                    : '';
                return `
                    <div class="flex items-center justify-between gap-3 p-3 border border-gray-200 rounded-lg bg-gray-50/80">
                        <div class="min-w-0 flex-1">
                            <p class="text-sm font-medium text-gray-900 truncate">${escapeHtml(name)}</p>
                            <p class="text-xs text-gray-500 mt-0.5">${escapeHtml(savedAt)}</p>
                            ${links ? `<p class="text-xs mt-1">${links}</p>` : ''}
                        </div>
                        ${loadBtn}
                    </div>`;
            }).join('');

            list.querySelectorAll('[data-sp-load]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-sp-load');
                    if (onLoadInPlace) onLoadInPlace(id);
                });
            });
        } catch (error) {
            list.innerHTML = `<p class="text-xs text-red-600">${escapeHtml(spT('resume.savedRecordsLoadFailed', 'Could not load saved records. Please try again later.'))}</p>`;
            console.warn('Saved profile list failed:', error.message);
        }
    }

    global.SavedProfileBootstrap = {
        PROFILE_PARAM,
        getRecordIdFromUrl,
        buildPageUrl,
        restoreRecord,
        restoreFromUrl,
        applyToCandidateSetup,
        showLoadedBanner,
        renderSavedRecordsPanel,
        pageLinks,
    };
})(typeof window !== 'undefined' ? window : globalThis);
