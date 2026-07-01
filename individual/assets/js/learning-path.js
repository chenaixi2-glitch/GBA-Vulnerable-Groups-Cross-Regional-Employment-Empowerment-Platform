/**
 * GBA Platform - Learning Path Generator
 * Two-step flow: gaps + resources → daily hours → timeline
 */

let learningPathData = null;
let timelineEditMode = false;

document.addEventListener('DOMContentLoaded', () => {
    initializeLearningPath();
});

function initializeLearningPath() {
    const sessionId = apiClient.loadSessionId();
    if (sessionId) {
        Utils.updateSessionDisplay(sessionId);
    } else {
        apiClient.generateSessionId();
        Utils.updateSessionDisplay(apiClient.sessionId);
    }

    document.querySelectorAll('input[name="daily-hours"]').forEach(radio => {
        radio.addEventListener('change', onDailyHoursChange);
    });
    const customInput = document.getElementById('custom-daily-hours');
    if (customInput) {
        customInput.addEventListener('input', updateProjectedWeeksHint);
    }
    updateSaveLoginHint();
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

function validateFormInputs({ targetJob, currentSkillsText, currentRole, profileText }) {
    if (!targetJob) {
        Utils.showToast('Please enter your target job title');
        return false;
    }

    const currentSkills = currentSkillsText
        ? currentSkillsText.split(',').map(s => s.trim()).filter(s => s)
        : [];

    if (!profileText && currentSkills.length === 0 && !currentRole) {
        Utils.showToast('Please provide current skills, role, or profile details');
        return false;
    }

    return true;
}

async function generateLearningPathAnalysis() {
    const inputs = getFormInputs();
    if (!validateFormInputs(inputs)) return;

    const currentSkills = inputs.currentSkillsText
        ? inputs.currentSkillsText.split(',').map(s => s.trim()).filter(s => s)
        : [];

    try {
        document.getElementById('assessment-section').classList.add('hidden');
        document.getElementById('loading-state').classList.remove('hidden');
        document.getElementById('loading-state').querySelector('p').textContent =
            'AI is analyzing skill gaps and curating resources...';

        const response = await apiClient.generateLearningPathAnalysis({
            targetJob: inputs.targetJob,
            currentRole: inputs.currentRole,
            industry: inputs.industryLabel || inputs.industry,
            employerType: inputs.employerType || '',
            experienceLevel: inputs.experienceLevel || '',
            currentSkills,
            profileText: inputs.profileText,
            jdText: inputs.jdText,
            targetContext: inputs.targetContext,
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

        Utils.showToast('Skill gap analysis completed! Choose your daily study hours.');
        document.getElementById('daily-hours-section').scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        document.getElementById('loading-state').classList.add('hidden');
        document.getElementById('assessment-section').classList.remove('hidden');
        Utils.showToast('Failed to analyze skill gaps: ' + error.message);
        console.error('Learning path analysis error:', error);
    }
}

async function generateLearningPathTimeline() {
    if (!learningPathData) {
        Utils.showToast('Please run skill gap analysis first');
        return;
    }

    const dailyHours = getSelectedDailyHours();
    if (!dailyHours || dailyHours <= 0) {
        Utils.showToast('Please select a valid daily study duration');
        return;
    }

    try {
        document.getElementById('btn-generate-timeline').disabled = true;
        document.getElementById('loading-state').classList.remove('hidden');
        document.getElementById('loading-state').querySelector('p').textContent =
            'Building your personalized learning timeline...';

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
        const response = await apiClient.generateLearningPathTimeline(dailyHours, targetContext);

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
        Utils.showToast('Learning timeline generated!');
        document.getElementById('timeline-section').scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        document.getElementById('loading-state').classList.add('hidden');
        Utils.showToast('Failed to generate timeline: ' + error.message);
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
    hint.textContent = `At ${dailyHours} hour(s) per day, you'll need approximately ${weeks} week(s) to complete the plan.`;

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

function displaySkillGaps(skillGaps) {
    const container = document.getElementById('skill-gaps-container');

    if (!skillGaps.length) {
        container.innerHTML = `
            <div class="text-center py-8 text-gray-600">
                <i class="fas fa-check-circle text-green-500 text-3xl mb-3"></i>
                <p>No significant skill gaps detected for your target role.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = skillGaps.map(gap => `
        <div class="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
            <div class="flex items-center justify-between mb-3">
                <h4 class="font-bold text-gray-900">${gap.skill}</h4>
                <span class="px-3 py-1 rounded-full text-xs font-medium ${getPriorityClass(gap.priority)}">
                    ${gap.priority} Priority
                </span>
            </div>

            <p class="text-sm text-gray-600 mb-3">${gap.description}</p>

            <div class="grid grid-cols-3 gap-4 mb-3">
                <div>
                    <div class="text-xs text-gray-500 mb-1">Gap Type</div>
                    <span class="skill-badge skill-current">
                        <i class="fas fa-tag text-xs"></i>
                        ${formatGapType(gap.type)}
                    </span>
                </div>
                <div>
                    <div class="text-xs text-gray-500 mb-1">Severity</div>
                    <span class="skill-badge skill-target">
                        <i class="fas fa-bullseye text-xs"></i>
                        ${gap.severity}
                    </span>
                </div>
                ${gap.estimatedHours ? `
                <div>
                    <div class="text-xs text-gray-500 mb-1">Est. Hours</div>
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
        Utils.showToast('No timeline to edit');
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
        Utils.showToast('Timeline cannot be empty');
        return;
    }
    if (timeline.some(p => !p.title || !p.weeks)) {
        Utils.showToast('Each phase needs a title and week range');
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
        Utils.showToast('Timeline updated');
    } catch (error) {
        Utils.showToast('Failed to update timeline: ' + error.message);
        console.error('Timeline update error:', error);
    } finally {
        document.getElementById('btn-apply-timeline').disabled = false;
    }
}

async function saveLearningPathToAccount() {
    if (!learningPathData?.timeline?.length) {
        Utils.showToast('Generate a timeline before saving');
        return;
    }

    if (!apiClient.isLoggedIn()) {
        Utils.showToast('Please log in to save your learning path');
        return;
    }

    try {
        document.getElementById('btn-save-plan').disabled = true;
        const result = await apiClient.saveLearningPathToAccount(learningPathData.recordId || '');

        learningPathData.recordId = result.record_id;
        const hint = document.getElementById('save-status-hint');
        hint.textContent = result.message || 'Learning path saved to your account.';
        hint.classList.remove('hidden');
        updateSaveLoginHint();
        Utils.showToast('Learning path saved!');
    } catch (error) {
        Utils.showToast('Save failed: ' + error.message);
        console.error('Save learning path error:', error);
    } finally {
        document.getElementById('btn-save-plan').disabled = false;
    }
}

function displayTimeline(timeline, editing = timelineEditMode) {
    const container = document.getElementById('timeline-container');

    if (!timeline.length) {
        container.innerHTML = '<p class="text-gray-600 text-sm">Timeline will appear after you choose daily study hours.</p>';
        return;
    }

    if (editing) {
        container.innerHTML = timeline.map((phase, index) => `
            <div class="timeline-item" data-timeline-phase="${index}">
                <div class="timeline-dot"></div>
                <div class="bg-gray-50 border border-blue-200 rounded-lg p-4 ml-4 space-y-3">
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-semibold text-blue-600 uppercase">Phase ${phase.phase || index + 1}</span>
                    </div>
                    <div>
                        <label class="block text-xs text-gray-500 mb-1">Title</label>
                        <input data-field="title" type="text" value="${escapeHtml(phase.title)}"
                            class="w-full border border-gray-300 rounded-lg p-2 text-sm">
                    </div>
                    <div>
                        <label class="block text-xs text-gray-500 mb-1">Weeks (e.g. 1-4)</label>
                        <input data-field="weeks" type="text" value="${escapeHtml(phase.weeks)}"
                            class="w-full border border-gray-300 rounded-lg p-2 text-sm">
                    </div>
                    <div>
                        <label class="block text-xs text-gray-500 mb-1">Description</label>
                        <textarea data-field="description" rows="2"
                            class="w-full border border-gray-300 rounded-lg p-2 text-sm">${escapeHtml(phase.description)}</textarea>
                    </div>
                    <div>
                        <label class="block text-xs text-gray-500 mb-1">Skills (comma-separated)</label>
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
                    <span class="text-sm text-gray-500">Weeks ${escapeHtml(phase.weeks)}</span>
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
        container.innerHTML = '<p class="text-gray-600 text-sm">Resources will appear once skill gaps are identified.</p>';
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
                View Resource
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
        Utils.showToast('No learning plan to download');
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
    Utils.showToast('Learning plan exported as TXT');
}

function exportLearningPlanJson() {
    if (!learningPathData) {
        Utils.showToast('No learning plan to export');
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
    Utils.showToast('Learning plan exported as JSON');
}
