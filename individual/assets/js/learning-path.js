/**
 * GBA Platform - Learning Path Generator
 * Two-step flow: gaps + resources → daily hours → timeline
 */

let learningPathData = null;
let timelineEditMode = false;
let learningPathSetup = null;
let learningPathLanguage = '';
let learningPathLanguageUserSelected = false;

function uiT(key, fallback, vars) {
    if (window.GBAI18n && window.GBAI18n.t) return window.GBAI18n.t(key, fallback, vars);
    let out = fallback;
    if (vars && out) Object.keys(vars).forEach((k) => { out = String(out).replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]); });
    return out;
}

document.addEventListener('DOMContentLoaded', () => {
    initializeLearningPath();
    initLearningPathLanguages();
});

function normalizeLearningPathLang(code) {
    if (typeof normalizeResumeLang === 'function') return normalizeResumeLang(code);
    return String(code || 'zh');
}

function learningPathLangDisplayLabel(code) {
    if (typeof window.GBAI18n !== 'undefined' && GBAI18n.resumeLangLabel) {
        return GBAI18n.resumeLangLabel(code);
    }
    return code;
}

function getDefaultLearningPathLang() {
    if (typeof apiClient !== 'undefined' && apiClient.getPageLanguage) {
        return apiClient.getPageLanguage();
    }
    if (typeof window.GBAI18n !== 'undefined' && GBAI18n.uiLangToApiLang) {
        return normalizeLearningPathLang(GBAI18n.uiLangToApiLang(GBAI18n.getLang()));
    }
    return 'zh';
}

function initLearningPathLanguages() {
    const defaultLang = getDefaultLearningPathLang();
    learningPathLanguage = defaultLang;
    syncLearningPathLanguageButtons();
    updateLearningPathLanguageStatus();
    window.addEventListener('gba:language-changed', () => {
        if (!learningPathLanguageUserSelected) {
            learningPathLanguage = getDefaultLearningPathLang();
            syncLearningPathLanguageButtons();
            updateLearningPathLanguageStatus();
        }
    });
}

function updateLearningPathLanguageStatus() {
    const el = document.getElementById('learning-path-language-status');
    if (!el) return;
    const lang = getSelectedLearningPathLanguage();
    const label = learningPathLangDisplayLabel(lang);
    if (learningPathLanguageUserSelected) {
        el.textContent = uiT('learningPath.contentLanguageSelected', 'Selected: {lang}', { lang: label });
        el.className = 'text-xs text-orange-700 mt-2 font-medium';
    } else {
        el.textContent = uiT('learningPath.contentLanguageDefault', 'Default from page language: {lang} — tap to confirm', { lang: label });
        el.className = 'text-xs text-gray-500 mt-2';
    }
}

function syncLearningPathLanguageButtons() {
    const active = normalizeLearningPathLang(learningPathLanguage || getDefaultLearningPathLang());
    document.querySelectorAll('[data-learning-path-lang]').forEach((btn) => {
        const code = normalizeLearningPathLang(btn.dataset.learningPathLang);
        const isActive = code === active;
        btn.classList.toggle('ring-2', isActive);
        btn.classList.toggle('ring-orange-400', isActive);
        btn.classList.toggle('bg-orange-50', isActive);
        const labelEl = btn.querySelector('.interview-lang-label');
        if (labelEl) labelEl.textContent = learningPathLangDisplayLabel(code);
    });
}

function getSelectedLearningPathLanguage() {
    return normalizeLearningPathLang(learningPathLanguage || getDefaultLearningPathLang());
}

async function selectLearningPathLanguage(language) {
    learningPathLanguage = normalizeLearningPathLang(language);
    learningPathLanguageUserSelected = true;
    syncLearningPathLanguageButtons();
    updateLearningPathLanguageStatus();
}

function initializeLearningPath() {
    apiClient.ensureSessionStarted();

    learningPathSetup = new CandidateJdSetup({
        parsedTextRows: 14,
        ids: {
            fileInput: 'learning-resume-file',
            profileText: 'profile-text',
            fileName: 'learning-file-name',
            fileInfo: 'learning-file-info',
            jdText: 'jd-text',
            jdSection: 'learning-jd-section',
            profileReviewSection: 'learning-profile-review',
            profileSaveStatus: 'learning-profile-save-status',
            profileApplyBtn: 'btn-learning-apply-profile',
            profileSaveBtn: 'btn-learning-save-profile',
            profileOverwriteBtn: 'btn-learning-overwrite-profile',
        },
        targetJobFields: {
            jdText: ['jd-text'],
            industry: ['industry-focus'],
            employerType: ['learning-employer-type'],
            experienceLevel: ['learning-experience-level'],
        },
        prereqIds: {
            profile: 'lp-prereq-profile',
            job: 'lp-prereq-job',
        },
        i18n: {
            profileRequired: ['learningPath.toast.profileRequired', 'Please upload a resume or paste profile text'],
            profileSuccess: ['learningPath.toast.profileSubmitted', 'Profile submitted successfully'],
            profileFailed: ['learningPath.toast.profileFailed', 'Failed to submit profile: {msg}'],
            jdRequired: ['learningPath.toast.jdRequired', 'Please paste a job description or complete target job fields'],
            jdSuccess: ['learningPath.toast.jdSubmitted', 'Job description submitted successfully'],
            jdFailed: ['learningPath.toast.jdFailed', 'Failed to submit JD: {msg}'],
        },
        buildProfileFallback: buildLearningProfileFallback,
        onPrerequisitesChange: updateLearningAnalyzeButton,
        onProfileSaved: () => bootstrapSavedProfileForLearningPath(),
    });
    learningPathSetup.init();

    bootstrapSavedProfileForLearningPath();

    document.querySelectorAll('input[name="daily-hours"]').forEach(radio => {
        radio.addEventListener('change', onDailyHoursChange);
    });
    const customInput = document.getElementById('custom-daily-hours');
    if (customInput) {
        customInput.addEventListener('input', updateProjectedWeeksHint);
    }
    updateSaveLoginHint();
}

function buildLearningProfileFallback() {
    const inputs = getFormInputs();
    const skills = inputs.currentSkillsText
        ? inputs.currentSkillsText.split(',').map(s => s.trim()).filter(Boolean)
        : [];
    const skillsLine = skills.length ? skills.join(', ') : 'Not specified';
    return [
        'Here is my candidate profile.',
        inputs.currentRole ? `Current role: ${inputs.currentRole}.` : '',
        `Current skills: ${skillsLine}.`,
        inputs.targetJob ? `Career goal: ${inputs.targetJob}.` : '',
    ].filter(Boolean).join(' ');
}

function updateLearningAnalyzeButton() {
    const btn = document.getElementById('btn-generate-path');
    if (!btn || !learningPathSetup) return;
    btn.disabled = !learningPathSetup.isReady();
}

async function bootstrapSavedProfileForLearningPath() {
    if (typeof SavedProfileBootstrap === 'undefined') return;

    await SavedProfileBootstrap.renderSavedRecordsPanel({
        sectionId: 'lp-saved-profiles-section',
        listId: 'lp-saved-profiles-list',
        emptyId: 'lp-saved-profiles-empty',
        currentPage: 'learning',
        onLoadInPlace: loadSavedProfileForLearningPath,
    });

    await SavedProfileBootstrap.restoreFromUrl({
        setup: learningPathSetup,
        bannerId: 'lp-saved-profile-banner',
        onRestored: () => updateLearningAnalyzeButton(),
    });
}

async function loadSavedProfileForLearningPath(recordId) {
    if (!recordId || typeof SavedProfileBootstrap === 'undefined') return;
    const url = SavedProfileBootstrap.buildPageUrl('demo-learning-path.html', recordId);
    if (SavedProfileBootstrap.getRecordIdFromUrl() === recordId) {
        await SavedProfileBootstrap.restoreFromUrl({
            recordId,
            setup: learningPathSetup,
            bannerId: 'lp-saved-profile-banner',
            onRestored: () => updateLearningAnalyzeButton(),
        });
        return;
    }
    window.location.href = url;
}

function clearLearningResumeFile() {
    learningPathSetup?.clearFile();
}

async function submitLearningProfile() {
    const inputs = getFormInputs();
    if (!inputs.targetJob) {
        Utils.showToast(uiT('learningPath.toast.targetJobRequired', 'Please enter your target job title'));
        return;
    }
    const skills = inputs.currentSkillsText
        ? inputs.currentSkillsText.split(',').map(s => s.trim()).filter(s => s)
        : [];
    if (!learningPathSetup?.getProfileText() && !learningPathSetup?.selectedFile
        && skills.length === 0 && !inputs.currentRole) {
        Utils.showToast(uiT('learningPath.toast.skillsRequired', 'Please provide current skills, role, or profile details'));
        return;
    }
    await learningPathSetup.submitProfile();
}

async function submitLearningJd() {
    const inputs = getFormInputs();
    if (!inputs.targetJob) {
        Utils.showToast(uiT('learningPath.toast.targetJobRequired', 'Please enter your target job title'));
        return;
    }
    await learningPathSetup.submitJd({ targetJobTitle: inputs.targetJob });
}

function updateSaveLoginHint() {
    const hint = document.getElementById('learning-path-save-login-hint');
    if (!hint || typeof apiClient === 'undefined') return;
    hint.classList.toggle('hidden', apiClient.isLoggedIn());
}

function getFormInputs() {
    if (typeof collectTargetJobContext === 'function') {
        const ctx = collectTargetJobContext({
            fields: {
                jdText: ['jd-text'],
                industry: ['industry-focus'],
                employerType: ['learning-employer-type'],
                experienceLevel: ['learning-experience-level'],
            },
        });
        return {
            targetJob: document.getElementById('target-job').value.trim(),
            currentRole: document.getElementById('current-role').value.trim(),
            industry: ctx.industry,
            industryLabel: ctx.industryLabel,
            employerType: ctx.employer_type,
            experienceLevel: ctx.experience_level,
            currentSkillsText: document.getElementById('current-skills').value.trim(),
            profileText: document.getElementById('profile-text')?.value.trim() || '',
            jdText: ctx.jd_text,
            targetContext: ctx,
        };
    }
    return {
        targetJob: document.getElementById('target-job').value.trim(),
        currentRole: document.getElementById('current-role').value.trim(),
        industry: document.getElementById('industry-focus').value,
        currentSkillsText: document.getElementById('current-skills').value.trim(),
        profileText: document.getElementById('profile-text')?.value.trim() || '',
        jdText: document.getElementById('jd-text')?.value.trim() || '',
    };
}

function validateFormInputs({ targetJob }) {
    if (!targetJob) {
        Utils.showToast(uiT('learningPath.toast.targetJobRequired', 'Please enter your target job title'));
        return false;
    }
    if (!learningPathSetup?.isReady()) {
        Utils.showToast(uiT('learningPath.toast.submitProfileJdFirst', 'Please submit your profile and job description first'));
        return false;
    }
    return true;
}

async function generateLearningPathAnalysis() {
    if (!learningPathLanguageUserSelected) {
        Utils.showToast(uiT('learningPath.toast.selectContentLanguageFirst', 'Please select content language first'));
        document.getElementById('learning-path-language-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }

    if (learningPathSetup?.profileDirty) {
        Utils.showToast(uiT('profileReview.applyBeforeAnalyze', 'Apply profile edits before running gap analysis'));
        document.getElementById('learning-profile-review')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }

    const inputs = getFormInputs();
    if (!validateFormInputs(inputs)) return;

    const currentSkills = inputs.currentSkillsText
        ? inputs.currentSkillsText.split(',').map(s => s.trim()).filter(s => s)
        : [];

    try {
        document.getElementById('assessment-section').classList.add('hidden');
        document.getElementById('loading-state').classList.remove('hidden');
        document.getElementById('loading-state').querySelector('p').textContent =
            uiT('learningPath.loadingDesc', 'AI is analyzing skill gaps and curating resources...');

        const response = await apiClient.generateLearningPathAnalysis({
            targetJob: inputs.targetJob,
            currentRole: inputs.currentRole,
            industry: inputs.industryLabel || inputs.industry,
            employerType: inputs.employerType || '',
            experienceLevel: inputs.experienceLevel || '',
            currentSkills,
            jdText: inputs.jdText,
            targetContext: inputs.targetContext,
            sessionReady: true,
            language: getSelectedLearningPathLanguage(),
        });

        learningPathData = processAnalysisResponse(response, {
            targetJob: inputs.targetJob,
            currentSkills,
        });

        document.getElementById('loading-state').classList.add('hidden');
        document.getElementById('learning-path-results').classList.remove('hidden');
        document.getElementById('empty-state').classList.add('hidden');
        document.getElementById('timeline-section').classList.add('hidden');

        displayOverview(learningPathData);
        displaySkillGaps(learningPathData.skillGaps);
        displayFollowUpQuestions(learningPathData.followUpQuestions);
        displayResources(learningPathData.resources);
        updateProjectedWeeksHint();

        Utils.showToast(uiT('learningPath.toast.gapCompleted', 'Skill gap analysis completed! Choose your daily study hours.'));
        document.getElementById('daily-hours-section').scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        document.getElementById('loading-state').classList.add('hidden');
        document.getElementById('assessment-section').classList.remove('hidden');
        Utils.showToast(uiT('learningPath.toast.gapFailed', 'Failed to analyze skill gaps: {msg}', { msg: error.message }));
        console.error('Learning path analysis error:', error);
    }
}

async function generateLearningPathTimeline() {
    if (!learningPathData) {
        Utils.showToast(uiT('learningPath.toast.runGapFirst', 'Please run skill gap analysis first'));
        return;
    }

    const dailyHours = getSelectedDailyHours();
    if (!dailyHours || dailyHours <= 0) {
        Utils.showToast(uiT('learningPath.toast.selectDailyHours', 'Please select a valid daily study duration'));
        return;
    }

    try {
        document.getElementById('btn-generate-timeline').disabled = true;
        document.getElementById('loading-state').classList.remove('hidden');
        document.getElementById('loading-state').querySelector('p').textContent =
            uiT('learningPath.loadingTimelineDesc', 'Building your personalized learning timeline...');

        const targetContext = typeof collectTargetJobContext === 'function'
            ? collectTargetJobContext({
                fields: {
                    jdText: ['jd-text'],
                    industry: ['industry-focus'],
                    employerType: ['learning-employer-type'],
                    experienceLevel: ['learning-experience-level'],
                },
            })
            : null;
        const response = await apiClient.generateLearningPathTimeline(
            dailyHours,
            targetContext,
            getSelectedLearningPathLanguage()
        );

        learningPathData.dailyHours = dailyHours;
        learningPathData.timeline = response.timeline || [];
        learningPathData.estimatedWeeks = calculateEstimatedWeeks(learningPathData.timeline)
            || computeWeeksFromHours(learningPathData.estimatedHours, dailyHours);

        document.getElementById('loading-state').classList.add('hidden');
        document.getElementById('timeline-section').classList.remove('hidden');
        document.getElementById('timeline-actions').classList.remove('hidden');
        timelineEditMode = false;
        setTimelineEditControls(false);

        displayOverview(learningPathData);
        displayTimeline(learningPathData.timeline);

        updateSaveLoginHint();
        Utils.showToast(uiT('learningPath.toast.timelineGenerated', 'Learning timeline generated!'));
        document.getElementById('timeline-section').scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        document.getElementById('loading-state').classList.add('hidden');
        Utils.showToast(uiT('learningPath.toast.timelineFailed', 'Failed to generate timeline: {msg}', { msg: error.message }));
        console.error('Timeline generation error:', error);
    } finally {
        document.getElementById('btn-generate-timeline').disabled = false;
    }
}

function getSelectedDailyHours() {
    const selected = document.querySelector('input[name="daily-hours"]:checked');
    if (!selected) return 2;

    if (selected.value === 'custom') {
        return parseFloat(document.getElementById('custom-daily-hours').value) || 0;
    }
    return parseFloat(selected.value);
}

function onDailyHoursChange(event) {
    const customInput = document.getElementById('custom-hours-input');
    if (event.target.value === 'custom') {
        customInput.classList.remove('hidden');
    } else {
        customInput.classList.add('hidden');
    }
    updateProjectedWeeksHint();
}

function updateProjectedWeeksHint() {
    const hint = document.getElementById('projected-weeks-hint');
    if (!hint || !learningPathData?.estimatedHours) return;

    const dailyHours = getSelectedDailyHours();
    if (!dailyHours) {
        hint.textContent = '';
        return;
    }

    const weeks = computeWeeksFromHours(learningPathData.estimatedHours, dailyHours);
    hint.textContent = uiT('learningPath.projectedWeeksHint', 'At {hours} hour(s) per day, you\'ll need approximately {weeks} week(s) to complete the plan.', { hours: dailyHours, weeks: weeks });

    if (!learningPathData.timeline?.length) {
        document.getElementById('estimated-weeks').textContent = weeks;
    }
}

function processAnalysisResponse(response, { targetJob, currentSkills }) {
    const skillGaps = mapGapAnalysisResults(response.gaps || []);
    const followUpQuestions = response.questions_to_ask || [];
    const resources = response.resources || [];
    const estimatedHours = response.estimated_total_hours
        || inferHoursFromResources(resources)
        || skillGaps.length * 20;

    return {
        targetJob,
        currentSkills,
        skillGaps,
        followUpQuestions,
        timeline: [],
        resources,
        estimatedHours,
        dailyHours: 0,
        totalSkills: skillGaps.length,
        estimatedWeeks: 0,
        confidenceScore: calculateConfidenceScore(skillGaps),
        triggeredAgents: response.triggered_agents || [],
    };
}

function inferHoursFromResources(resources) {
    const total = resources.reduce((sum, r) => sum + (r.duration_hours || 0), 0);
    return total > 0 ? Math.round(total) : 0;
}

function computeWeeksFromHours(totalHours, dailyHours) {
    if (!totalHours || !dailyHours) return 0;
    return Math.max(1, Math.ceil(totalHours / (dailyHours * 7)));
}

function mapGapAnalysisResults(gaps) {
    return gaps.map(gap => ({
        skill: gap.description || gap.type || 'Skill gap',
        type: gap.type || 'missing_skill',
        level_required: 'Required',
        level_current: 'Gap identified',
        priority: mapSeverityToPriority(gap.severity),
        severity: gap.severity || 'medium',
        description: gap.description || '',
        estimatedHours: gap.estimated_hours || 0,
    }));
}

function mapSeverityToPriority(severity) {
    switch (severity?.toLowerCase()) {
        case 'high':
            return 'High';
        case 'low':
            return 'Low';
        default:
            return 'Medium';
    }
}

function calculateEstimatedWeeks(timeline) {
    if (!timeline.length) return 0;
    const lastPhase = timeline[timeline.length - 1];
    const match = lastPhase.weeks.match(/(\d+)$/);
    return match ? parseInt(match[1], 10) : timeline.length * 6;
}

function calculateConfidenceScore(skillGaps) {
    const highPriorityCount = skillGaps.filter(g => g.priority === 'High').length;
    const baseScore = 85;
    const penalty = highPriorityCount * 5;
    return Math.max(baseScore - penalty, 50);
}

function displayOverview(data) {
    document.getElementById('total-skills').textContent = data.totalSkills;
    document.getElementById('estimated-hours').textContent = data.estimatedHours || 0;
    document.getElementById('estimated-weeks').textContent = data.estimatedWeeks || '—';
    document.getElementById('confidence-score').textContent = `${data.confidenceScore}%`;
}

function priorityLabel(priority) {
    const key = priority === 'High' ? 'learningPath.priorityHigh' : priority === 'Low' ? 'learningPath.priorityLow' : 'learningPath.priorityMedium';
    const fb = priority === 'High' ? 'High' : priority === 'Low' ? 'Low' : 'Medium';
    return uiT(key, fb);
}

function displaySkillGaps(skillGaps) {
    const container = document.getElementById('skill-gaps-container');

    if (!skillGaps.length) {
        container.innerHTML = `
            <div class="text-center py-8 text-gray-600">
                <i class="fas fa-check-circle text-green-500 text-3xl mb-3"></i>
                <p>${escapeHtml(uiT('learningPath.noSkillGaps', 'No significant skill gaps detected for your target role.'))}</p>
            </div>
        `;
        return;
    }

    container.innerHTML = skillGaps.map(gap => `
        <div class="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
            <div class="flex items-center justify-between mb-3">
                <h4 class="font-bold text-gray-900">${escapeHtml(gap.skill)}</h4>
                <span class="px-3 py-1 rounded-full text-xs font-medium ${getPriorityClass(gap.priority)}">
                    ${escapeHtml(uiT('learningPath.priorityLabel', '{priority} Priority', { priority: priorityLabel(gap.priority) }))}
                </span>
            </div>

            <p class="text-sm text-gray-600 mb-3">${escapeHtml(gap.description)}</p>

            <div class="grid grid-cols-3 gap-4 mb-3">
                <div>
                    <div class="text-xs text-gray-500 mb-1">${escapeHtml(uiT('learningPath.gapTypeLabel', 'Gap Type'))}</div>
                    <span class="skill-badge skill-current">
                        <i class="fas fa-tag text-xs"></i>
                        ${formatGapType(gap.type)}
                    </span>
                </div>
                <div>
                    <div class="text-xs text-gray-500 mb-1">${escapeHtml(uiT('learningPath.severityLabel', 'Severity'))}</div>
                    <span class="skill-badge skill-target">
                        <i class="fas fa-bullseye text-xs"></i>
                        ${gap.severity}
                    </span>
                </div>
                ${gap.estimatedHours ? `
                <div>
                    <div class="text-xs text-gray-500 mb-1">${escapeHtml(uiT('learningPath.estHoursLabel', 'Est. Hours'))}</div>
                    <span class="skill-badge skill-gap">
                        <i class="fas fa-clock text-xs"></i>
                        ${gap.estimatedHours}h
                    </span>
                </div>` : ''}
            </div>
        </div>
    `).join('');
}

function formatGapType(type) {
    return (type || 'missing_skill').replace(/_/g, ' ');
}

function displayFollowUpQuestions(questions) {
    const section = document.getElementById('follow-up-section');
    const container = document.getElementById('follow-up-container');
    if (!section || !container) return;

    if (!questions.length) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');
    container.innerHTML = questions.map((q, index) => `
        <div class="border border-orange-200 bg-orange-50 rounded-lg p-4">
            <div class="flex items-start gap-3">
                <span class="w-6 h-6 bg-orange-600 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">${index + 1}</span>
                <div>
                    <p class="font-medium text-gray-900">${q.question}</p>
                    ${q.reason ? `<p class="text-sm text-gray-600 mt-1">${q.reason}</p>` : ''}
                    ${q.priority ? `<span class="inline-block mt-2 text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">${q.priority} priority</span>` : ''}
                </div>
            </div>
        </div>
    `).join('');
}

function getPriorityClass(priority) {
    switch (priority?.toLowerCase()) {
        case 'high':
            return 'bg-red-100 text-red-800';
        case 'medium':
            return 'bg-yellow-100 text-yellow-800';
        case 'low':
            return 'bg-green-100 text-green-800';
        default:
            return 'bg-gray-100 text-gray-800';
    }
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function setTimelineEditControls(editing) {
    document.getElementById('btn-edit-timeline').classList.toggle('hidden', editing);
    document.getElementById('btn-apply-timeline').classList.toggle('hidden', !editing);
    document.getElementById('btn-cancel-timeline').classList.toggle('hidden', !editing);
}

function toggleTimelineEdit() {
    if (!learningPathData?.timeline?.length) {
        Utils.showToast(uiT('learningPath.toast.noTimeline', 'No timeline to edit'));
        return;
    }
    timelineEditMode = true;
    setTimelineEditControls(true);
    displayTimeline(learningPathData.timeline, true);
}

function cancelTimelineEdit() {
    timelineEditMode = false;
    setTimelineEditControls(false);
    displayTimeline(learningPathData.timeline, false);
}

function readTimelineFromForm() {
    const items = document.querySelectorAll('[data-timeline-phase]');
    return Array.from(items).map((el, index) => ({
        phase: index + 1,
        title: el.querySelector('[data-field="title"]')?.value.trim() || '',
        weeks: el.querySelector('[data-field="weeks"]')?.value.trim() || '',
        description: el.querySelector('[data-field="description"]')?.value.trim() || '',
        skills: (el.querySelector('[data-field="skills"]')?.value || '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean),
    }));
}

async function applyTimelineEdits() {
    const timeline = readTimelineFromForm();
    if (!timeline.length) {
        Utils.showToast(uiT('learningPath.toast.timelineEmpty', 'Timeline cannot be empty'));
        return;
    }
    if (timeline.some(p => !p.title || !p.weeks)) {
        Utils.showToast(uiT('learningPath.toast.phaseNeedsTitle', 'Each phase needs a title and week range'));
        return;
    }

    try {
        document.getElementById('btn-apply-timeline').disabled = true;
        const result = await apiClient.updateLearningPathTimeline(timeline);

        learningPathData.timeline = result.timeline || timeline;
        learningPathData.estimatedWeeks = result.estimated_weeks
            || calculateEstimatedWeeks(learningPathData.timeline);

        timelineEditMode = false;
        setTimelineEditControls(false);
        displayOverview(learningPathData);
        displayTimeline(learningPathData.timeline, false);
        Utils.showToast(uiT('learningPath.toast.timelineUpdated', 'Timeline updated'));
    } catch (error) {
        Utils.showToast(uiT('learningPath.toast.updateFailed', 'Failed to update timeline: {msg}', { msg: error.message }));
        console.error('Timeline update error:', error);
    } finally {
        document.getElementById('btn-apply-timeline').disabled = false;
    }
}

async function saveLearningPathToAccount() {
    if (!learningPathData?.timeline?.length) {
        Utils.showToast(uiT('learningPath.toast.generateTimelineFirst', 'Generate a timeline before saving'));
        return;
    }

    if (!apiClient.isLoggedIn()) {
        Utils.showToast(uiT('learningPath.toast.loginToSave', 'Please log in to save your learning path'));
        return;
    }

    try {
        document.getElementById('btn-save-plan').disabled = true;
        const result = await apiClient.saveLearningPathToAccount(learningPathData.recordId || '');

        learningPathData.recordId = result.record_id;
        const hint = document.getElementById('save-status-hint');
        hint.textContent = result.message || uiT('learningPath.toast.savedToAccount', 'Learning path saved to your account.');
        hint.classList.remove('hidden');
        updateSaveLoginHint();
        Utils.showToast(uiT('learningPath.toast.saved', 'Learning path saved!'));
    } catch (error) {
        Utils.showToast(uiT('learningPath.toast.saveFailed', 'Save failed: {msg}', { msg: error.message }));
        console.error('Save learning path error:', error);
    } finally {
        document.getElementById('btn-save-plan').disabled = false;
    }
}

function displayTimeline(timeline, editing = timelineEditMode) {
    const container = document.getElementById('timeline-container');

    if (!timeline.length) {
        container.innerHTML = '<p class="text-gray-600 text-sm">' + escapeHtml(uiT('learningPath.timelineEmptyHint', 'Timeline will appear after you choose daily study hours.')) + '</p>';
        return;
    }

    if (editing) {
        container.innerHTML = timeline.map((phase, index) => `
            <div class="timeline-item" data-timeline-phase="${index}">
                <div class="timeline-dot"></div>
                <div class="bg-gray-50 border border-blue-200 rounded-lg p-4 ml-4 space-y-3">
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-semibold text-blue-600 uppercase">${escapeHtml(uiT('learningPath.phaseLabel', 'Phase {n}', { n: phase.phase || index + 1 }))}</span>
                    </div>
                    <div>
                        <label class="block text-xs text-gray-500 mb-1">${escapeHtml(uiT('learningPath.editTitleLabel', 'Title'))}</label>
                        <input data-field="title" type="text" value="${escapeHtml(phase.title)}"
                            class="w-full border border-gray-300 rounded-lg p-2 text-sm">
                    </div>
                    <div>
                        <label class="block text-xs text-gray-500 mb-1">${escapeHtml(uiT('learningPath.editWeeksLabel', 'Weeks (e.g. 1-4)'))}</label>
                        <input data-field="weeks" type="text" value="${escapeHtml(phase.weeks)}"
                            class="w-full border border-gray-300 rounded-lg p-2 text-sm">
                    </div>
                    <div>
                        <label class="block text-xs text-gray-500 mb-1">${escapeHtml(uiT('learningPath.editDescLabel', 'Description'))}</label>
                        <textarea data-field="description" rows="2"
                            class="w-full border border-gray-300 rounded-lg p-2 text-sm">${escapeHtml(phase.description)}</textarea>
                    </div>
                    <div>
                        <label class="block text-xs text-gray-500 mb-1">${escapeHtml(uiT('learningPath.editSkillsLabel', 'Skills (comma-separated)'))}</label>
                        <input data-field="skills" type="text" value="${escapeHtml((phase.skills || []).join(', '))}"
                            class="w-full border border-gray-300 rounded-lg p-2 text-sm">
                    </div>
                </div>
            </div>
        `).join('');
        return;
    }

    container.innerHTML = timeline.map(phase => `
        <div class="timeline-item">
            <div class="timeline-dot"></div>
            <div class="bg-white border border-gray-200 rounded-lg p-4 ml-4">
                <div class="flex items-center justify-between mb-2">
                    <h4 class="font-bold text-gray-900">${escapeHtml(phase.title)}</h4>
                    <span class="text-sm text-gray-500">${escapeHtml(uiT('learningPath.weeksLabel', 'Weeks {weeks}', { weeks: phase.weeks }))}</span>
                </div>
                <p class="text-sm text-gray-600 mb-3">${escapeHtml(phase.description)}</p>
                <div class="flex flex-wrap gap-2">
                    ${(phase.skills || []).map(skill => `
                        <span class="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">
                            ${escapeHtml(skill)}
                        </span>
                    `).join('')}
                </div>
            </div>
        </div>
    `).join('');
}

function displayResources(resources) {
    const container = document.getElementById('resources-container');

    if (!resources.length) {
        container.innerHTML = '<p class="text-gray-600 text-sm">' + escapeHtml(uiT('learningPath.resourcesEmptyHint', 'Resources will appear once skill gaps are identified.')) + '</p>';
        return;
    }

    container.innerHTML = resources.map(resource => `
        <div class="resource-card resource-${resource.type}">
            <div class="flex items-start justify-between mb-2">
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <i class="fas ${getResourceIcon(resource.type)} text-lg"></i>
                        <span class="text-xs font-medium uppercase">${resource.type}</span>
                    </div>
                    <h4 class="font-bold text-gray-900 text-sm">${resource.title}</h4>
                    <p class="text-xs text-gray-500 mt-1">${resource.platform} · ${resource.duration || (resource.duration_hours ? resource.duration_hours + ' hours' : '')}</p>
                </div>
                <div class="flex items-center gap-1 text-yellow-500">
                    <i class="fas fa-star text-xs"></i>
                    <span class="text-xs font-medium">${resource.rating}</span>
                </div>
            </div>
            <a href="${resource.url}" target="_blank" class="inline-flex items-center text-sm text-blue-600 hover:text-blue-700 mt-2">
                ${escapeHtml(uiT('learningPath.viewResource', 'View Resource'))}
                <i class="fas fa-external-link-alt ml-1 text-xs"></i>
            </a>
        </div>
    `).join('');
}

function getResourceIcon(type) {
    const icons = {
        course: 'fa-graduation-cap',
        article: 'fa-newspaper',
        video: 'fa-play-circle',
        project: 'fa-code',
    };
    return icons[type] || 'fa-book';
}

function downloadLearningPlan() {
    if (!learningPathData) {
        Utils.showToast(uiT('learningPath.toast.nothingToDownload', 'No learning plan to download'));
        return;
    }

    let plan = `PERSONALIZED LEARNING PLAN\n`;
    plan += `==========================\n\n`;
    plan += `Target Position: ${learningPathData.targetJob}\n`;
    plan += `Estimated Study Hours: ${learningPathData.estimatedHours} hours\n`;
    if (learningPathData.dailyHours) {
        plan += `Daily Study Time: ${learningPathData.dailyHours} hours/day\n`;
    }
    plan += `Timeline: ${learningPathData.estimatedWeeks || 'TBD'} weeks\n`;
    plan += `Skills to Master: ${learningPathData.totalSkills}\n`;
    plan += `Success Probability: ${learningPathData.confidenceScore}%\n`;
    plan += `Analysis Engine: learning_path_agent\n\n`;

    plan += `SKILL GAPS:\n`;
    plan += `===========\n\n`;

    learningPathData.skillGaps.forEach((gap, index) => {
        plan += `${index + 1}. ${gap.skill}\n`;
        plan += `   Type: ${gap.type} | Severity: ${gap.severity}`;
        if (gap.estimatedHours) plan += ` | Est. ${gap.estimatedHours}h`;
        plan += `\n   ${gap.description}\n\n`;
    });

    if (learningPathData.followUpQuestions.length) {
        plan += `\nFOLLOW-UP QUESTIONS:\n`;
        plan += `====================\n\n`;
        learningPathData.followUpQuestions.forEach((q, index) => {
            plan += `${index + 1}. ${q.question}\n`;
            if (q.reason) plan += `   Reason: ${q.reason}\n`;
            plan += '\n';
        });
    }

    if (learningPathData.timeline.length) {
        plan += `\nLEARNING TIMELINE:\n`;
        plan += `=================\n\n`;

        learningPathData.timeline.forEach(phase => {
            plan += `${phase.title} (Weeks ${phase.weeks})\n`;
            plan += `Skills: ${phase.skills.join(', ')}\n\n`;
        });
    }

    const blob = new Blob([plan], { type: 'text/plain' });
    Utils.downloadFile(blob, `learning-plan-${Date.now()}.txt`);
    Utils.showToast(uiT('learningPath.toast.exportedTxt', 'Learning plan exported as TXT'));
}

function exportLearningPlanJson() {
    if (!learningPathData) {
        Utils.showToast(uiT('learningPath.toast.nothingToExport', 'No learning plan to export'));
        return;
    }

    const payload = {
        targetJob: learningPathData.targetJob,
        estimatedHours: learningPathData.estimatedHours,
        dailyHours: learningPathData.dailyHours,
        estimatedWeeks: learningPathData.estimatedWeeks,
        confidenceScore: learningPathData.confidenceScore,
        skillGaps: learningPathData.skillGaps,
        followUpQuestions: learningPathData.followUpQuestions,
        resources: learningPathData.resources,
        timeline: learningPathData.timeline,
        recordId: learningPathData.recordId || null,
        exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    Utils.downloadFile(blob, `learning-plan-${Date.now()}.json`);
    Utils.showToast(uiT('learningPath.toast.exportedJson', 'Learning plan exported as JSON'));
}

function refreshLearningPathLocalizedUI() {
    if (!learningPathData) return;
    displayOverview(learningPathData);
    displaySkillGaps(learningPathData.skillGaps || []);
    displayFollowUpQuestions(learningPathData.followUpQuestions || []);
    displayResources(learningPathData.resources || []);
    if (learningPathData.timeline && learningPathData.timeline.length) {
        displayTimeline(learningPathData.timeline);
    }
    updateProjectedWeeksHint();
}

window.addEventListener('gba:language-changed', refreshLearningPathLocalizedUI);
