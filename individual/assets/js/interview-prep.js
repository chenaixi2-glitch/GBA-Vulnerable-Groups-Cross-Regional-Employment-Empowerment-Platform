/**
 * GBA Platform - Interview Preparation
 * Prerequisites for interview_agent: job, candidate_profile, resume_content_json
 */

let interviewSession = {
    questions: [],
    stages: [],
    currentQuestionIndex: 0,
    answers: [],
    jobTitle: '',
    tone: 'professional',
    programVersion: 'quick',
    programLabel: '',
    questionLanguage: '',
    feedbackLanguage: '',
};

/** 交互式多轮模拟面试状态 */
let interactiveSession = {
    active: false,
    status: 'idle',
    roundCount: 0,
    maxRounds: 10,
    programVersion: 'quick',
    specializedFocus: '',
    programLabel: '',
    jobTrack: '',
    currentStageIndex: 0,
    stages: [],
    turns: [],
    debrief: null,
    savedRecordId: null,
    savePromptDismissed: false,
};

function uiT(key, fallback, vars) {
    if (window.GBAI18n && window.GBAI18n.t) return window.GBAI18n.t(key, fallback, vars);
    let s = fallback;
    if (vars && s) {
        Object.keys(vars).forEach((k) => {
            s = String(s).replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
        });
    }
    return s;
}

/** 面试程序版本配置（与后端 interview_program.py 对齐） */
function getInterviewProgramPreviews() {
    return {
        quick: {
            label: uiT('mock.programQuick', 'Quick (~30 min)'),
            stages: [
                uiT('mock.stageQuick1', 'Screening + final combined (5 rounds)'),
                uiT('mock.stageQuick2', 'Professional / technical (8 rounds)'),
            ],
        },
        full: {
            label: uiT('mock.programFull', 'Full (~60 min)'),
            stages: [
                uiT('mock.stageFull1', 'Round 1 — screening (5 rounds)'),
                uiT('mock.stageFull2', 'Round 2 — professional / technical (8 rounds)'),
                uiT('mock.stageFull3', 'Round 3 — director / HR final (4 rounds)'),
            ],
        },
        specialized: {
            technical: { label: uiT('mock.stageSpecializedTechnical', 'Specialized — technical (10 rounds)') },
            final_negotiation: { label: uiT('mock.stageSpecializedNegotiation', 'Specialized — final negotiation (6 rounds)') },
            resume_deep_dive: { label: uiT('mock.stageSpecializedResume', 'Specialized — resume deep dive (8 rounds)') },
        },
    };
}

let interviewMode = 'question_bank'; // question_bank | custom | interactive

let interviewPrerequisites = {
    profileReady: false,
    jobReady: false,
    resumeReady: false,
};

let interviewResumeFile = null;

document.addEventListener('DOMContentLoaded', () => {
    initializeInterviewPrep();
    setupInteractiveSaveModal();
    selectProgramVersion('quick');
    initInterviewLanguages();
});

function normalizeInterviewLang(code) {
    if (typeof normalizeResumeLang === 'function') return normalizeResumeLang(code);
    return String(code || 'zh');
}

function resumeLangDisplayLabel(code) {
    if (typeof window.GBAI18n !== 'undefined' && GBAI18n.resumeLangLabel) {
        return GBAI18n.resumeLangLabel(code);
    }
    return code;
}

function getDefaultInterviewLang() {
    if (typeof apiClient !== 'undefined' && apiClient.getPageLanguage) {
        return apiClient.getPageLanguage();
    }
    if (typeof window.GBAI18n !== 'undefined' && GBAI18n.uiLangToApiLang) {
        return normalizeInterviewLang(GBAI18n.uiLangToApiLang(GBAI18n.getLang()));
    }
    return 'zh';
}

function initInterviewLanguages() {
    const defaultLang = getDefaultInterviewLang();
    interviewSession.questionLanguage = defaultLang;
    interviewSession.feedbackLanguage = defaultLang;
    syncQuestionLanguageButtons();
    syncFeedbackLanguageButtons();
    window.addEventListener('gba:language-changed', () => {
        syncQuestionLanguageButtons();
        syncFeedbackLanguageButtons();
        if (typeof selectInterviewMode === 'function') selectInterviewMode(interviewMode);
        updateInteractiveSaveButton();
    });
}

function selectQuestionLanguage(language) {
    interviewSession.questionLanguage = normalizeInterviewLang(language);
    syncQuestionLanguageButtons();
}

function selectFeedbackLanguage(language) {
    interviewSession.feedbackLanguage = normalizeInterviewLang(language);
    syncFeedbackLanguageButtons();
}

function syncLangButtonGroup(selector, activeLang) {
    const active = normalizeInterviewLang(activeLang);
    document.querySelectorAll(selector).forEach((btn) => {
        const code = normalizeInterviewLang(btn.dataset.interviewLang);
        const labelEl = btn.querySelector('.interview-lang-label');
        if (labelEl) labelEl.textContent = resumeLangDisplayLabel(code);
        const isActive = code === active;
        btn.classList.toggle('ring-2', isActive);
        btn.classList.toggle('ring-purple-500', isActive);
        btn.classList.toggle('bg-purple-50', isActive);
    });
}

function syncQuestionLanguageButtons() {
    syncLangButtonGroup('[data-question-lang]', interviewSession.questionLanguage || getDefaultInterviewLang());
}

function syncFeedbackLanguageButtons() {
    syncLangButtonGroup('[data-feedback-lang]', interviewSession.feedbackLanguage || getDefaultInterviewLang());
}

function getSelectedQuestionLanguage() {
    return normalizeInterviewLang(interviewSession.questionLanguage || getDefaultInterviewLang());
}

function getSelectedFeedbackLanguage() {
    return normalizeInterviewLang(interviewSession.feedbackLanguage || getDefaultInterviewLang());
}

function initializeInterviewPrep() {
    apiClient.ensureSessionStarted();

    setupInputValidation();
    updatePrerequisiteStatus();
}

function setupInputValidation() {
    const jobTitleInput = document.getElementById('job-title');
    const startButton = document.getElementById('btn-load-questions');

    jobTitleInput.addEventListener('input', updateStartButtonState);
}

function updateStartButtonState() {
    const jobTitleInput = document.getElementById('job-title');
    const startButton = document.getElementById('btn-load-questions');
    const hasValue = jobTitleInput.value.trim().length > 0;
    const ready = interviewPrerequisites.profileReady
        && interviewPrerequisites.jobReady
        && interviewPrerequisites.resumeReady;

    startButton.disabled = !(hasValue && ready);
}

function updatePrerequisiteStatus() {
    setPrerequisiteItem('prereq-profile', interviewPrerequisites.profileReady);
    setPrerequisiteItem('prereq-job', interviewPrerequisites.jobReady);
    setPrerequisiteItem('prereq-resume', interviewPrerequisites.resumeReady);
    updateStartButtonState();
}

function setPrerequisiteItem(elementId, ready) {
    const element = document.getElementById(elementId);
    if (!element) return;

    const icon = element.querySelector('.prereq-icon');
    if (icon) {
        icon.className = ready
            ? 'prereq-icon fas fa-check-circle text-green-500'
            : 'prereq-icon fas fa-circle text-gray-300';
    }
}

function handleInterviewFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        interviewResumeFile = file;
        document.getElementById('interview-file-name').textContent = file.name;
        document.getElementById('interview-file-info').classList.remove('hidden');
    }
}

function clearInterviewFile() {
    interviewResumeFile = null;
    document.getElementById('interview-resume-file').value = '';
    document.getElementById('interview-file-info').classList.add('hidden');
}

async function uploadInterviewProfile() {
    const profileText = document.getElementById('interview-profile-text').value.trim();

    if (!interviewResumeFile && !profileText) {
        Utils.showToast(uiT('interview.toast.uploadOrPaste', 'Please upload a resume or paste profile text'));
        return;
    }

    try {
        Utils.showLoading('Analyzing your profile...');

        let response;
        if (interviewResumeFile) {
            response = await apiClient.uploadResume(interviewResumeFile);
        } else {
            response = await apiClient.submitProfileText(profileText);
        }

        interviewPrerequisites.profileReady = true;
        updatePrerequisiteStatus();

        document.getElementById('interview-jd-section').classList.remove('hidden');
        Utils.hideLoading();
        Utils.showToast(uiT('interview.toast.profileUploaded', 'Profile uploaded successfully'));
        console.log('Profile agent response:', response);
    } catch (error) {
        Utils.hideLoading();
        Utils.showToast(uiT('interview.toast.profileFailed', 'Failed to upload profile: {msg}', { msg: error.message }));
        console.error('Profile upload error:', error);
    }
}

async function submitInterviewJobDescription() {
    const jdText = document.getElementById('interview-jd-text').value.trim();
    const targetContext = typeof collectTargetJobContext === 'function' ? collectTargetJobContext({
        fields: {
            jdText: ['interview-jd-text'],
            industry: ['job-industry'],
            employerType: ['interview-employer-type'],
            experienceLevel: ['interview-experience-level'],
        },
        jdTextOverride: jdText,
    }) : null;

    if (!jdText && !targetContext?.industry && !targetContext?.employer_type && !targetContext?.experience_level) {
        Utils.showToast(uiT('interview.toast.pasteJd', 'Please paste the target job description or fill in target job fields'));
        return;
    }

    try {
        Utils.showLoading('Analyzing job description...');

        const response = await apiClient.submitJobDescription(jdText || targetContext?.jd_text || document.getElementById('job-title').value.trim(), targetContext);
        interviewPrerequisites.jobReady = true;
        updatePrerequisiteStatus();

        document.getElementById('interview-resume-section').classList.remove('hidden');
        Utils.hideLoading();
        Utils.showToast(uiT('interview.toast.jdSubmitted', 'Job description submitted successfully'));
        console.log('JD agent response:', response);
    } catch (error) {
        Utils.hideLoading();
        Utils.showToast(uiT('interview.toast.jdFailed', 'Failed to submit job description: {msg}', { msg: error.message }));
        console.error('JD submission error:', error);
    }
}

async function generateInterviewResume() {
    try {
        Utils.showLoading('Generating tailored resume content...');
        const targetContext = typeof collectTargetJobContext === 'function' ? collectTargetJobContext({
            fields: {
                jdText: ['interview-jd-text'],
                industry: ['job-industry'],
                employerType: ['interview-employer-type'],
                experienceLevel: ['interview-experience-level'],
            },
        }) : null;

        const response = await apiClient.generateResume(
            'Please generate a customized resume based on my experience and target position',
            targetContext
        );

        if (response.resume_content_json) {
            interviewPrerequisites.resumeReady = true;
            updatePrerequisiteStatus();
            Utils.hideLoading();
            Utils.showToast(uiT('interview.toast.resumeReady', 'Resume content ready for interview generation'));
        } else {
            throw new Error(uiT('interview.toast.resumeNotGenerated', 'Resume content was not generated'));
        }

        console.log('Resume generation response:', response);
    } catch (error) {
        Utils.hideLoading();
        Utils.showToast(uiT('interview.toast.resumeFailed', 'Failed to generate resume: {msg}', { msg: error.message }));
        console.error('Resume generation error:', error);
    }
}

function selectTone(tone) {
    interviewSession.tone = tone;

    document.querySelectorAll('.tone-option').forEach(option => {
        option.classList.remove('selected');
    });
    document.querySelector(`[data-tone="${tone}"]`).classList.add('selected');

    const avatar = document.getElementById('interviewer-avatar');
    avatar.className = `interviewer-avatar avatar-${tone}`;

    console.log('Selected tone:', tone);
}

function selectInterviewMode(mode) {
    interviewMode = mode;

    document.querySelectorAll('.mode-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.mode === mode);
    });

    const isInteractive = mode === 'interactive';
    const isCustom = mode === 'custom';
    const showQuestionBank = !isInteractive && (!isCustom || interviewSession.questions.length > 0);
    document.getElementById('question-bank-panel').classList.toggle('hidden', !showQuestionBank);
    document.getElementById('custom-questions-panel')?.classList.toggle('hidden', !isCustom || interviewSession.questions.length > 0);
    document.getElementById('interactive-panel').classList.toggle('hidden', !isInteractive);
    document.getElementById('program-version-section')?.classList.toggle('hidden', isCustom);
    document.getElementById('sidebar-progress-title').textContent = isInteractive
        ? uiT('interview.sidebarProgressInteractive', 'Interview Progress')
        : (isCustom ? uiT('interview.sidebarProgressCustom', 'Custom Questions Progress') : uiT('interview.sidebarProgressQuestionBank', 'Question Bank Progress'));

    const startBtn = document.getElementById('btn-load-questions');
    if (startBtn) {
        if (isInteractive) {
            startBtn.innerHTML = '<i class="fas fa-comments mr-2"></i> ' + uiT('interview.startSession', 'Start Mock Interview');
        } else if (isCustom) {
            startBtn.innerHTML = '<i class="fas fa-magic mr-2"></i> ' + uiT('interview.generateReferenceAnswers', 'Generate Reference Answers');
        } else {
            startBtn.innerHTML = '<i class="fas fa-play mr-2"></i> ' + uiT('interview.generateQuestionBank', 'Generate Question Bank');
        }
    }

    updateProgramPreview();

    if (isInteractive && interactiveSession.active) {
        renderInteractiveChat();
        renderStageBanner();
    } else if (!isInteractive && interviewSession.questions.length) {
        renderQuestionBankStageBanner();
    }
}

function getSelectedProgramOptions() {
    const programVersion = interactiveSession.programVersion || 'quick';
    const specializedFocus = programVersion === 'specialized'
        ? (document.getElementById('specialized-focus')?.value || 'technical')
        : '';
    return { programVersion, specializedFocus };
}

function buildQuestionBankStages(questions) {
    const stageMap = new Map();
    questions.forEach((q, index) => {
        const stageIndex = q.stage_index ?? 0;
        if (!stageMap.has(stageIndex)) {
            stageMap.set(stageIndex, {
                stage_index: stageIndex,
                stage_id: q.stage_id || '',
                name: q.stage_name || `Stage ${stageIndex + 1}`,
                questionIndices: [],
            });
        }
        stageMap.get(stageIndex).questionIndices.push(index);
    });
    return Array.from(stageMap.values()).sort((a, b) => a.stage_index - b.stage_index);
}

function getQuestionBankCurrentStageIndex() {
    const q = interviewSession.questions[interviewSession.currentQuestionIndex];
    return q?.stage_index ?? 0;
}

function renderQuestionBankStageBanner() {
    const banner = document.getElementById('qb-stage-banner');
    if (!banner || !interviewSession.stages?.length) return;

    banner.classList.remove('hidden');
    const stageIdx = getQuestionBankCurrentStageIndex();
    const stage = interviewSession.stages.find(s => s.stage_index === stageIdx) || interviewSession.stages[0];

    const nameEl = document.getElementById('qb-stage-name');
    const badgeEl = document.getElementById('qb-program-badge');
    const trackEl = document.getElementById('qb-stages-track');

    if (nameEl && stage) nameEl.textContent = stage.name;
    document.getElementById('qb-stage-subtitle').textContent = stage
        ? `Question ${stage.questionIndices.indexOf(interviewSession.currentQuestionIndex) + 1} of ${stage.questionIndices.length} in this stage`
        : '';
    if (badgeEl) {
        badgeEl.textContent = interviewSession.programLabel
            || getInterviewProgramPreviews()[interviewSession.programVersion]?.label
            || '';
    }

    if (trackEl) {
        trackEl.innerHTML = interviewSession.stages.map((s) => {
            const isActive = s.stage_index === stageIdx;
            const answeredInStage = s.questionIndices.filter(i => interviewSession.answers[i]?.trim()).length;
            const isDone = answeredInStage === s.questionIndices.length;
            const bg = isDone ? 'bg-green-400' : isActive ? 'bg-white' : 'bg-white/30';
            const text = isActive ? 'text-purple-700 font-medium' : isDone ? 'text-white' : 'text-white/70';
            return `<div class="flex-1 min-w-0">
                <div class="h-1.5 rounded-full ${bg} mb-1"></div>
                <div class="text-[10px] truncate ${text}">${s.name.replace(/^第.*?·/, '')}</div>
            </div>`;
        }).join('');
    }
}

function selectProgramVersion(version) {
    interactiveSession.programVersion = version;
    interviewSession.programVersion = version;

    document.querySelectorAll('.program-version-option').forEach(el => {
        const selected = el.dataset.version === version;
        el.classList.toggle('selected', selected);
        el.classList.toggle('border-purple-500', selected);
        el.classList.toggle('bg-purple-50', selected);
        el.classList.toggle('border-gray-200', !selected);
    });

    const focusSection = document.getElementById('specialized-focus-section');
    if (focusSection) {
        focusSection.classList.toggle('hidden', version !== 'specialized');
    }

    updateProgramPreview();
}

function updateSpecializedFocus() {
    const select = document.getElementById('specialized-focus');
    interactiveSession.specializedFocus = select ? select.value : 'technical';
    updateProgramPreview();
}

function updateProgramPreview() {
    const preview = document.getElementById('program-stages-preview');
    if (!preview) return;

    const version = interactiveSession.programVersion || 'quick';
    let html = '';

    if (version === 'specialized') {
        const focus = document.getElementById('specialized-focus')?.value || 'technical';
        const cfg = getInterviewProgramPreviews().specialized[focus];
        html = `<div class="font-medium text-gray-800">${cfg?.label || '专项版'}</div>`;
    } else {
        const cfg = getInterviewProgramPreviews()[version];
        html = `<div class="font-medium text-gray-800 mb-1">${cfg.label}</div>`;
        html += cfg.stages.map((s, i) => `<div>${i + 1}. ${s}</div>`).join('');
    }

    preview.innerHTML = html;
}

async function loadInterviewQuestions() {
    if (interviewMode === 'interactive') {
        return startInteractiveInterview();
    }
    if (interviewMode === 'custom') {
        return loadCustomInterviewQuestions();
    }
    const jobTitle = document.getElementById('job-title').value.trim();
    const industry = document.getElementById('job-industry').value;

    if (!jobTitle) {
        Utils.showToast(uiT('interview.toast.jobTitleRequired', 'Please enter a job title'));
        return;
    }

    if (!interviewPrerequisites.profileReady || !interviewPrerequisites.jobReady || !interviewPrerequisites.resumeReady) {
        Utils.showToast(uiT('interview.toast.completePrereq', 'Please complete all prerequisite steps first'));
        return;
    }

    try {
        Utils.showLoading('Generating personalized questions...');
        const targetContext = typeof collectTargetJobContext === 'function' ? collectTargetJobContext({
            fields: {
                jdText: ['interview-jd-text'],
                industry: ['job-industry'],
                employerType: ['interview-employer-type'],
                experienceLevel: ['interview-experience-level'],
            },
        }) : null;

        const { programVersion, specializedFocus } = getSelectedProgramOptions();

        const response = await apiClient.startInterviewSession(
            jobTitle, industry, interviewSession.tone, targetContext, programVersion, specializedFocus,
            getSelectedQuestionLanguage()
        );

        if (response.interview_qa && response.interview_qa.length > 0) {
            interviewSession.questions = response.interview_qa.map((qa, index) => ({
                id: qa.id || `q_${index}`,
                question: qa.question,
                category: qa.category || 'General',
                answer: qa.answer || '',
                stage_id: qa.stage_id || '',
                stage_name: qa.stage_name || '',
                stage_index: qa.stage_index ?? 0,
            }));
            interviewSession.stages = buildQuestionBankStages(interviewSession.questions);
            interviewSession.programVersion = programVersion;
            interviewSession.programLabel = getInterviewProgramPreviews()[programVersion]?.label
                || (programVersion === 'specialized' && getInterviewProgramPreviews().specialized[specializedFocus]?.label)
                || programVersion;
        } else {
            throw new Error(uiT('interview.toast.noQuestionsGenerated', 'No questions generated. Ensure profile, job description, and resume are complete.'));
        }

        interviewSession.jobTitle = jobTitle;
        interviewSession.currentQuestionIndex = 0;
        interviewSession.answers = [];

        Utils.hideLoading();
        Utils.showToast(uiT('interview.toast.questionsGenerated', 'Generated {count} questions across {stages} stages', { count: interviewSession.questions.length, stages: interviewSession.stages.length }));

        showInterviewInterface();
        renderQuestionBankStageBanner();
        displayCurrentQuestion();
        updateProgress();

        console.log('Interview session started:', interviewSession);
    } catch (error) {
        Utils.hideLoading();
        Utils.showToast(uiT('interview.toast.questionsFailed', 'Failed to generate questions: {msg}', { msg: error.message }));
        console.error('Interview session error:', error);
    }
}

function parseCustomQuestionsText(text) {
    return (text || '')
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.replace(/^(Q|问|Question)[:：]\s*/i, '').replace(/^\d+[.)、]\s*/, '').trim())
        .filter(Boolean);
}

function handleCustomQuestionsFileSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const textarea = document.getElementById('custom-questions-text');
        if (textarea) {
            textarea.value = e.target.result;
        }
        document.getElementById('custom-questions-file-name').textContent = file.name;
        document.getElementById('btn-clear-custom-file')?.classList.remove('hidden');
    };
    reader.readAsText(file, 'UTF-8');
}

function clearCustomQuestionsFile() {
    const fileInput = document.getElementById('custom-questions-file');
    if (fileInput) fileInput.value = '';
    document.getElementById('custom-questions-file-name').textContent = '';
    document.getElementById('btn-clear-custom-file')?.classList.add('hidden');
}

async function loadCustomInterviewQuestions() {
    const jobTitle = document.getElementById('job-title').value.trim();
    const questionsText = document.getElementById('custom-questions-text')?.value.trim() || '';
    const questions = parseCustomQuestionsText(questionsText);

    if (!jobTitle) {
        Utils.showToast(uiT('interview.toast.jobTitleRequired', 'Please enter a job title'));
        return;
    }

    if (!questions.length) {
        Utils.showToast(uiT('interview.toast.customQuestionsRequired', 'Please enter or upload at least one interview question'));
        return;
    }

    if (!interviewPrerequisites.profileReady || !interviewPrerequisites.jobReady || !interviewPrerequisites.resumeReady) {
        Utils.showToast(uiT('interview.toast.completePrereq', 'Please complete all prerequisite steps first'));
        return;
    }

    try {
        Utils.showLoading('Generating personalized reference answers...');
        const targetContext = typeof collectTargetJobContext === 'function' ? collectTargetJobContext({
            fields: {
                jdText: ['interview-jd-text'],
                industry: ['job-industry'],
                employerType: ['interview-employer-type'],
                experienceLevel: ['interview-experience-level'],
            },
        }) : null;

        const response = await apiClient.generateCustomInterviewAnswers(
            questions, targetContext, getSelectedQuestionLanguage()
        );

        if (response.interview_qa && response.interview_qa.length > 0) {
            interviewSession.questions = response.interview_qa.map((qa, index) => ({
                id: qa.id || `q_custom_${index}`,
                question: qa.question,
                category: qa.category || 'Custom',
                answer: qa.answer || '',
                stage_id: qa.stage_id || 'custom',
                stage_name: qa.stage_name || 'Custom Questions',
                stage_index: qa.stage_index ?? 0,
            }));
            interviewSession.stages = buildQuestionBankStages(interviewSession.questions);
            interviewSession.programVersion = 'custom';
            interviewSession.programLabel = 'Custom Questions';
        } else {
            throw new Error(uiT('interview.toast.noReferenceAnswers', 'No reference answers generated. Ensure profile, job description, and resume are complete.'));
        }

        interviewSession.jobTitle = jobTitle;
        interviewSession.currentQuestionIndex = 0;
        interviewSession.answers = [];

        Utils.hideLoading();
        Utils.showToast(uiT('interview.toast.answersGenerated', 'Generated reference answers for {count} custom questions', { count: interviewSession.questions.length }));

        showInterviewInterface();
        document.getElementById('custom-questions-panel')?.classList.add('hidden');
        document.getElementById('question-bank-panel')?.classList.remove('hidden');
        renderQuestionBankStageBanner();
        displayCurrentQuestion();
        updateProgress();

        console.log('Custom interview session started:', interviewSession);
    } catch (error) {
        Utils.hideLoading();
        Utils.showToast(uiT('interview.toast.answersFailed', 'Failed to generate reference answers: {msg}', { msg: error.message }));
        console.error('Custom interview session error:', error);
    }
}

async function startInteractiveInterview() {
    const jobTitle = document.getElementById('job-title').value.trim();
    const industry = document.getElementById('job-industry').value;

    if (!jobTitle) {
        Utils.showToast(uiT('interview.toast.jobTitleRequired', 'Please enter a job title'));
        return;
    }

    if (!interviewPrerequisites.profileReady || !interviewPrerequisites.jobReady || !interviewPrerequisites.resumeReady) {
        Utils.showToast(uiT('interview.toast.completePrereq', 'Please complete all prerequisite steps first'));
        return;
    }

    try {
        Utils.showLoading('Starting interactive mock interview...');
        const targetContext = typeof collectTargetJobContext === 'function' ? collectTargetJobContext({
            fields: {
                jdText: ['interview-jd-text'],
                industry: ['job-industry'],
                employerType: ['interview-employer-type'],
                experienceLevel: ['interview-experience-level'],
            },
        }) : null;

        const programVersion = interactiveSession.programVersion || 'quick';
        const specializedFocus = programVersion === 'specialized'
            ? (document.getElementById('specialized-focus')?.value || 'technical')
            : '';

        const response = await apiClient.startInteractiveInterview({
            tone: interviewSession.tone,
            jobTitle,
            industry,
            programVersion,
            specializedFocus,
            targetContext,
            questionLanguage: getSelectedQuestionLanguage(),
        });

        const session = response.interactive_interview;
        interactiveSession = {
            active: true,
            status: session.status,
            roundCount: session.round_count,
            maxRounds: session.max_rounds,
            programVersion: session.program_version || programVersion,
            specializedFocus: session.specialized_focus || specializedFocus,
            programLabel: session.program_label || '',
            jobTrack: session.job_track || '',
            currentStageIndex: session.current_stage_index || 0,
            stages: session.stages || [],
            turns: session.turns || [],
            debrief: null,
            savedRecordId: null,
            savePromptDismissed: false,
        };

        interviewSession.jobTitle = jobTitle;

        Utils.hideLoading();
        Utils.showToast(uiT('interview.toast.started', 'Interactive mock interview started'));

        showInteractiveInterface();
        renderInteractiveChat();
        renderStageBanner();
        updateInteractiveProgress();

        console.log('Interactive interview started:', session);
    } catch (error) {
        Utils.hideLoading();
        Utils.showToast(uiT('interview.toast.startFailed', 'Failed to start interactive interview: {msg}', { msg: error.message }));
        console.error('Interactive interview error:', error);
    }
}

function showInteractiveInterface() {
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('interactive-panel').classList.remove('hidden');
    document.getElementById('interactive-debrief-section').classList.add('hidden');
    document.getElementById('interactive-stage-banner')?.classList.remove('hidden');
}

function renderStageBanner() {
    const banner = document.getElementById('interactive-stage-banner');
    if (!banner || !interactiveSession.stages?.length) return;

    const stage = interactiveSession.stages[interactiveSession.currentStageIndex];
    const nameEl = document.getElementById('interactive-stage-name');
    const subEl = document.getElementById('interactive-stage-subtitle');
    const badgeEl = document.getElementById('interactive-program-badge');
    const trackEl = document.getElementById('interactive-stages-track');

    if (stage && nameEl) nameEl.textContent = stage.name || '';
    if (stage && subEl) subEl.textContent = stage.subtitle || '';
    if (badgeEl) {
        badgeEl.textContent = interactiveSession.programLabel
            || getInterviewProgramPreviews()[interactiveSession.programVersion]?.label
            || '';
    }

    if (trackEl) {
        trackEl.innerHTML = interactiveSession.stages.map((s, i) => {
            const isActive = i === interactiveSession.currentStageIndex;
            const isDone = s.status === 'completed';
            const bg = isDone ? 'bg-green-400' : isActive ? 'bg-white' : 'bg-white/30';
            const text = isActive ? 'text-purple-700 font-medium' : isDone ? 'text-white' : 'text-white/70';
            return `<div class="flex-1 min-w-0">
                <div class="h-1.5 rounded-full ${bg} mb-1"></div>
                <div class="text-[10px] truncate ${text}">${s.name?.replace(/^第.*?·/, '') || `Stage ${i + 1}`}</div>
            </div>`;
        }).join('');
    }
}

function renderInteractiveChat() {
    const chatContainer = document.getElementById('interactive-chat');
    if (!chatContainer) return;

    let html = '';
    interactiveSession.turns.forEach(turn => {
        const isInterviewer = turn.role === 'interviewer';
        const isFeedback = turn.turn_type === 'brief_feedback';

        if (isFeedback) {
            html += `
                <div class="flex gap-3 mb-3">
                    <div class="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                        <i class="fas fa-lightbulb text-amber-600 text-sm"></i>
                    </div>
                    <div class="flex-1 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-gray-700">
                        <div class="text-xs text-amber-700 font-medium mb-1">Brief Feedback</div>
                        ${turn.content}
                    </div>
                </div>
            `;
            return;
        }

        const isStageTransition = turn.turn_type === 'stage_transition';
        if (isStageTransition) {
            html += `
                <div class="my-4 py-3 px-4 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-800">
                    <div class="text-xs text-indigo-600 font-medium mb-1"><i class="fas fa-arrow-right mr-1"></i>Stage Transition · ${turn.stage_name || ''}</div>
                    ${turn.content}
                </div>
            `;
            return;
        }

        html += `
            <div class="flex gap-3 mb-4 ${isInterviewer ? '' : 'flex-row-reverse'}">
                <div class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isInterviewer ? 'bg-purple-100' : 'bg-blue-100'}">
                    <i class="fas ${isInterviewer ? 'fa-user-tie text-purple-600' : 'fa-user text-blue-600'} text-sm"></i>
                </div>
                <div class="flex-1 max-w-[85%] ${isInterviewer ? '' : 'text-right'}">
                    <div class="text-xs text-gray-500 mb-1">
                        ${isInterviewer ? 'Interviewer' : 'You'}
                        ${turn.stage_name ? ` · ${turn.stage_name}` : ''}
                        ${turn.category ? ` · ${turn.category}` : ''}
                    </div>
                    <div class="rounded-lg p-3 text-sm ${isInterviewer ? 'bg-purple-50 border border-purple-100 text-gray-800' : 'bg-blue-50 border border-blue-100 text-gray-800'}">
                        ${turn.content}
                    </div>
                </div>
            </div>
        `;
    });

    chatContainer.innerHTML = html;
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

async function submitInteractiveAnswer() {
    const input = document.getElementById('interactive-answer-input');
    const answer = input.value.trim();

    if (!answer) {
        Utils.showToast(uiT('interview.toast.typeAnswer', 'Please type your answer'));
        return;
    }

    if (interactiveSession.status !== 'active') {
        Utils.showToast(uiT('interview.toast.notActive', 'Interview is not active'));
        return;
    }

    try {
        Utils.showLoading('Interviewer is thinking...');
        input.disabled = true;

        const response = await apiClient.submitInteractiveTurn(
            answer,
            getSelectedQuestionLanguage(),
            getSelectedFeedbackLanguage()
        );
        const session = response.interactive_interview;

        interactiveSession.status = session.status;
        interactiveSession.roundCount = session.round_count;
        interactiveSession.currentStageIndex = session.current_stage_index ?? interactiveSession.currentStageIndex;
        interactiveSession.stages = session.stages || interactiveSession.stages;
        interactiveSession.turns = session.turns || [];
        interactiveSession.active = session.status === 'active';

        input.value = '';
        input.disabled = false;

        Utils.hideLoading();
        renderInteractiveChat();
        renderStageBanner();
        updateInteractiveProgress();

        if (session.status === 'completed') {
            document.getElementById('interactive-input-section').classList.add('hidden');
            Utils.showToast(uiT('interview.toast.endedDebrief', 'Interview ended. Generating debrief...'));
            await loadInteractiveDebrief();
        }
    } catch (error) {
        input.disabled = false;
        Utils.hideLoading();
        Utils.showToast(uiT('interview.toast.submitFailed', 'Failed to submit answer: {msg}', { msg: error.message }));
        console.error('Interactive turn error:', error);
    }
}

async function endInteractiveInterview() {
    if (!interactiveSession.active && interactiveSession.status !== 'active') {
        if (interactiveSession.debrief) {
            document.getElementById('interactive-debrief-section').classList.remove('hidden');
            return;
        }
        Utils.showToast(uiT('interview.toast.noInterviewToEnd', 'No active interview to end'));
        return;
    }

    if (!confirm('End the mock interview and generate debrief report?')) {
        return;
    }

    try {
        Utils.showLoading('Generating debrief report...');
        document.getElementById('interactive-input-section').classList.add('hidden');

        const response = await apiClient.endInteractiveInterview(true, getSelectedFeedbackLanguage());
        const session = response.interactive_interview;

        interactiveSession.status = 'completed';
        interactiveSession.active = false;
        interactiveSession.turns = session.turns || [];
        interactiveSession.debrief = session.debrief;

        Utils.hideLoading();
        renderInteractiveDebrief(session.debrief);
        Utils.showToast(uiT('interview.toast.debriefReady', 'Debrief report ready'));
        promptSaveInteractiveInterview();
    } catch (error) {
        Utils.hideLoading();
        Utils.showToast(uiT('interview.toast.debriefFailed', 'Failed to generate debrief: {msg}', { msg: error.message }));
        console.error('End interactive interview error:', error);
    }
}

async function loadInteractiveDebrief() {
    try {
        const response = await apiClient.endInteractiveInterview(true, getSelectedFeedbackLanguage());
        const session = response.interactive_interview;
        interactiveSession.debrief = session.debrief;
        renderInteractiveDebrief(session.debrief);
        promptSaveInteractiveInterview();
    } catch (error) {
        console.error('Load debrief error:', error);
    }
}

function setupInteractiveSaveModal() {
    document.getElementById('btn-interview-save-confirm')?.addEventListener('click', async () => {
        hideInteractiveSaveModal();
        await saveInteractiveInterviewToAccount(true);
    });

    document.getElementById('btn-interview-save-skip')?.addEventListener('click', () => {
        interactiveSession.savePromptDismissed = true;
        hideInteractiveSaveModal();
        Utils.showToast(uiT('interview.toast.notSavedLater', 'Not saved. You can save later from the debrief section.'));
    });
}

function showInteractiveSaveModal() {
    document.getElementById('save-interview-modal')?.classList.remove('hidden');
}

function hideInteractiveSaveModal() {
    document.getElementById('save-interview-modal')?.classList.add('hidden');
}

function promptSaveInteractiveInterview() {
    if (!apiClient.isLoggedIn()) return;
    if (interactiveSession.savedRecordId) return;
    if (interactiveSession.savePromptDismissed) return;
    if (!interactiveSession.debrief || interactiveSession.status !== 'completed') return;
    showInteractiveSaveModal();
}

function renderInteractiveDebrief(debrief) {
    if (!debrief) return;

    const section = document.getElementById('interactive-debrief-section');
    const content = document.getElementById('interactive-debrief-content');

    let categoryHtml = '';
    const stageScores = debrief.stage_scores || {};
    if (Object.keys(stageScores).length) {
        categoryHtml += '<h4 class="font-semibold mt-4 mb-2">Stage Scores</h4><div class="grid sm:grid-cols-2 gap-2">';
        Object.entries(stageScores).forEach(([stage, score]) => {
            categoryHtml += `
                <div class="bg-white/10 rounded-lg p-3 text-sm">
                    <div class="flex justify-between mb-1">
                        <span class="opacity-80">${stage}</span>
                        <span class="font-bold">${score}</span>
                    </div>
                    <div class="bg-white/20 rounded-full h-1.5">
                        <div class="bg-blue-400 h-1.5 rounded-full" style="width: ${score}%"></div>
                    </div>
                </div>
            `;
        });
        categoryHtml += '</div>';
    }
    if (debrief.category_scores) {
        categoryHtml += '<h4 class="font-semibold mt-4 mb-2">Category Scores</h4><div class="grid sm:grid-cols-2 gap-2">';
        Object.entries(debrief.category_scores).forEach(([cat, score]) => {
            categoryHtml += `
                <div class="bg-white/10 rounded-lg p-3 text-sm">
                    <div class="flex justify-between mb-1">
                        <span class="opacity-80">${cat}</span>
                        <span class="font-bold">${score}</span>
                    </div>
                    <div class="bg-white/20 rounded-full h-1.5">
                        <div class="bg-green-400 h-1.5 rounded-full" style="width: ${score}%"></div>
                    </div>
                </div>
            `;
        });
        categoryHtml += '</div>';
    }

    let momentsHtml = '';
    if (debrief.key_moments && debrief.key_moments.length) {
        momentsHtml = '<h4 class="font-semibold mt-6 mb-3">Key Moments Review</h4><div class="space-y-4">';
        debrief.key_moments.forEach((moment, i) => {
            momentsHtml += `
                <div class="bg-white/10 rounded-lg p-4 text-sm">
                    <div class="font-medium mb-2">Q${i + 1}: ${moment.question}</div>
                    <div class="opacity-80 mb-1"><strong>Your answer:</strong> ${moment.your_answer_summary}</div>
                    <div class="opacity-80 mb-1"><strong>Analysis:</strong> ${moment.analysis}</div>
                    <div class="opacity-80 mb-2"><strong>Improved answer:</strong> ${moment.improved_answer}</div>
                    <div class="text-green-400 font-medium">Score: ${moment.score}/100</div>
                </div>
            `;
        });
        momentsHtml += '</div>';
    }

    content.innerHTML = `
        <div class="flex items-center justify-between mb-4">
            <div>
                <div class="text-3xl font-bold">${debrief.overall_score}/100</div>
                <div class="text-sm opacity-80">Overall Score</div>
            </div>
            <div class="text-right text-sm opacity-80">
                ${interactiveSession.programLabel || ''} · ${interactiveSession.roundCount} rounds
            </div>
        </div>

        <p class="text-sm opacity-90 mb-4">${debrief.summary}</p>

        <div class="grid md:grid-cols-2 gap-4 mb-4">
            <div>
                <h4 class="font-semibold mb-2 flex items-center gap-2"><i class="fas fa-thumbs-up text-green-400"></i> Strengths</h4>
                <ul class="space-y-1 text-sm opacity-90">
                    ${(debrief.strengths || []).map(s => `<li>• ${s}</li>`).join('')}
                </ul>
            </div>
            <div>
                <h4 class="font-semibold mb-2 flex items-center gap-2"><i class="fas fa-exclamation-circle text-yellow-400"></i> Weaknesses</h4>
                <ul class="space-y-1 text-sm opacity-90">
                    ${(debrief.weaknesses || []).map(w => `<li>• ${w}</li>`).join('')}
                </ul>
            </div>
        </div>

        ${categoryHtml}
        ${momentsHtml}

        <div class="mt-6">
            <h4 class="font-semibold mb-2">Recommendations</h4>
            <ul class="space-y-2 text-sm opacity-90">
                ${(debrief.recommendations || []).map(r => `
                    <li class="flex items-start gap-2">
                        <i class="fas fa-check-circle text-green-400 mt-0.5"></i>
                        <span>${r}</span>
                    </li>
                `).join('')}
            </ul>
        </div>
    `;

    section.classList.remove('hidden');
    section.scrollIntoView({ behavior: 'smooth' });
    updateInteractiveSaveControls();
}

function updateInteractiveSaveControls() {
    const saveBtn = document.getElementById('btn-save-interactive');
    const loginHint = document.getElementById('interactive-save-login-hint');
    const savedBadge = document.getElementById('interactive-saved-badge');

    if (!saveBtn || !loginHint) return;

    const loggedIn = apiClient.isLoggedIn();
    const hasDebrief = Boolean(interactiveSession.debrief);
    const isCompleted = interactiveSession.status === 'completed';

    loginHint.classList.toggle('hidden', loggedIn);
    saveBtn.classList.toggle('hidden', !loggedIn || !hasDebrief || !isCompleted);

    if (interactiveSession.savedRecordId) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-check mr-2"></i> ' + uiT('interview.savedToAccount', 'Saved to Account');
        if (savedBadge) {
            savedBadge.classList.remove('hidden');
            savedBadge.textContent = uiT('interview.recordIdLabel', 'Record ID: {id}', { id: interactiveSession.savedRecordId });
        }
    } else {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-cloud-upload-alt mr-2"></i> ' + uiT('interview.saveToAccount', 'Save to Account');
        if (savedBadge) savedBadge.classList.add('hidden');
    }
}

async function saveInteractiveInterviewToAccount(skipConfirm = false) {
    if (!apiClient.isLoggedIn()) {
        Utils.showToast(uiT('interview.toast.loginToSave', 'Please log in to save your mock interview'));
        return;
    }

    if (!interactiveSession.debrief || interactiveSession.status !== 'completed') {
        Utils.showToast(uiT('interview.toast.completeBeforeSave', 'Complete the interview and debrief before saving'));
        return;
    }

    if (interactiveSession.savedRecordId) {
        Utils.showToast(uiT('interview.toast.alreadySaved', 'Already saved to your account'));
        return;
    }

    if (!skipConfirm && !confirm('Save this mock interview and debrief to your account?')) {
        return;
    }

    try {
        Utils.showLoading('Saving to your account...');
        const response = await apiClient.saveInteractiveInterview('');
        interactiveSession.savedRecordId = response.record_id || interactiveSession.savedRecordId;
        Utils.hideLoading();
        updateInteractiveSaveControls();
        Utils.showToast(response.message || uiT('interview.toast.savedToAccount', 'Mock interview saved to your account'));
    } catch (error) {
        Utils.hideLoading();
        Utils.showToast(error.message || uiT('interview.toast.saveFailed', 'Failed to save mock interview'));
        console.error('Save interactive interview error:', error);
    }
}

function updateInteractiveProgress() {
    const current = interactiveSession.roundCount;
    const total = interactiveSession.maxRounds;
    const percentage = total ? (current / total) * 100 : 0;

    document.getElementById('progress-text').textContent = `${current} / ${total}`;
    document.getElementById('progress-fill').style.width = `${percentage}%`;

    const stage = interactiveSession.stages?.[interactiveSession.currentStageIndex];
    let stageLabel = interactiveSession.status === 'completed' ? 'Done' : `Round ${current}`;
    if (stage && interactiveSession.status !== 'completed') {
        stageLabel = `${stage.name} · ${stage.turn_count || 0}/${stage.max_turns}`;
    }
    document.getElementById('current-q-num').textContent = stageLabel;
}

function downloadInteractiveDebrief() {
    const debrief = interactiveSession.debrief;
    if (!debrief) {
        Utils.showToast(uiT('interview.toast.noDebrief', 'No debrief report available'));
        return;
    }

    let report = `INTERACTIVE MOCK INTERVIEW DEBRIEF\n`;
    report += `===================================\n\n`;
    report += `Position: ${interviewSession.jobTitle}\n`;
    report += `Style: ${interviewSession.tone}\n`;
    report += `Date: ${new Date().toLocaleString()}\n`;
    report += `Overall Score: ${debrief.overall_score}/100\n\n`;
    report += `SUMMARY\n${debrief.summary}\n\n`;
    report += `STRENGTHS\n${(debrief.strengths || []).map(s => `- ${s}`).join('\n')}\n\n`;
    report += `WEAKNESSES\n${(debrief.weaknesses || []).map(w => `- ${w}`).join('\n')}\n\n`;

    if (debrief.key_moments) {
        report += `KEY MOMENTS\n`;
        debrief.key_moments.forEach((m, i) => {
            report += `\nQ${i + 1}: ${m.question}\n`;
            report += `Your answer: ${m.your_answer_summary}\n`;
            report += `Analysis: ${m.analysis}\n`;
            report += `Improved: ${m.improved_answer}\n`;
            report += `Score: ${m.score}/100\n`;
        });
    }

    report += `\nRECOMMENDATIONS\n${(debrief.recommendations || []).map(r => `- ${r}`).join('\n')}\n`;

    const blob = new Blob([report], { type: 'text/plain' });
    Utils.downloadFile(blob, `interactive-debrief-${Date.now()}.txt`);
    Utils.showToast(uiT('interview.toast.debriefDownloaded', 'Debrief downloaded'));
}

function showInterviewInterface() {
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('question-section').classList.remove('hidden');
    document.getElementById('answer-section').classList.remove('hidden');
}

function toggleReferenceAnswer() {
    const content = document.getElementById('reference-answer-content');
    const btn = document.getElementById('btn-toggle-reference');
    if (!content || !btn) return;

    const isHidden = content.classList.contains('hidden');
    content.classList.toggle('hidden', !isHidden);
    btn.textContent = isHidden ? 'Hide' : 'Show';
}

function updateReferenceAnswerDisplay(question) {
    const section = document.getElementById('reference-answer-section');
    const content = document.getElementById('reference-answer-content');
    const btn = document.getElementById('btn-toggle-reference');
    if (!section || !content) return;

    if (question?.answer?.trim()) {
        section.classList.remove('hidden');
        content.textContent = question.answer;
        content.classList.add('hidden');
        if (btn) btn.textContent = 'Show';
    } else {
        section.classList.add('hidden');
        content.textContent = '';
    }
}

function displayCurrentQuestion() {
    const question = interviewSession.questions[interviewSession.currentQuestionIndex];

    document.getElementById('q-number').textContent = interviewSession.currentQuestionIndex + 1;
    document.getElementById('question-text').textContent = question.question;

    const stageLabel = document.getElementById('qb-stage-label');
    if (stageLabel) {
        stageLabel.textContent = question.stage_name ? `${question.stage_name} · ` : '';
    }

    const previousAnswer = interviewSession.answers[interviewSession.currentQuestionIndex];
    document.getElementById('answer-input').value = previousAnswer || '';

    document.getElementById('btn-prev').disabled = interviewSession.currentQuestionIndex === 0;
    document.getElementById('btn-next').disabled =
        interviewSession.currentQuestionIndex === interviewSession.questions.length - 1;

    document.getElementById('feedback-section').classList.add('hidden');
    updateReferenceAnswerDisplay(question);
    renderQuestionBankStageBanner();
}

function previousQuestion() {
    if (interviewSession.currentQuestionIndex > 0) {
        saveCurrentAnswer();
        interviewSession.currentQuestionIndex--;
        displayCurrentQuestion();
        updateProgress();
    }
}

function nextQuestion() {
    if (interviewSession.currentQuestionIndex < interviewSession.questions.length - 1) {
        saveCurrentAnswer();
        interviewSession.currentQuestionIndex++;
        displayCurrentQuestion();
        updateProgress();
    }
}

function saveCurrentAnswer() {
    const answer = document.getElementById('answer-input').value.trim();
    interviewSession.answers[interviewSession.currentQuestionIndex] = answer;
}

async function submitAnswer() {
    const answer = document.getElementById('answer-input').value.trim();

    if (!answer) {
        Utils.showToast(uiT('interview.toast.answerFirst', 'Please provide an answer first'));
        return;
    }

    interviewSession.answers[interviewSession.currentQuestionIndex] = answer;

    try {
        Utils.showLoading('Analyzing your answer...');

        const currentQuestion = interviewSession.questions[interviewSession.currentQuestionIndex];
        const feedbackResponse = await apiClient.submitAnswer(
            currentQuestion.id, answer, getSelectedFeedbackLanguage()
        );

        Utils.hideLoading();
        displayFeedback(feedbackResponse);

        if (interviewSession.currentQuestionIndex === interviewSession.questions.length - 1) {
            setTimeout(() => {
                generateSessionReport();
            }, 2000);
        }

        Utils.showToast(uiT('interview.toast.answerSubmitted', 'Answer submitted! Check feedback below.'));
    } catch (error) {
        Utils.hideLoading();
        Utils.showToast(uiT('interview.toast.feedbackFailed', 'Failed to get feedback: {msg}', { msg: error.message }));
        console.error('Submit answer error:', error);
    }
}

function displayFeedback(response) {
    const feedbackSection = document.getElementById('feedback-section');
    const feedbackContent = document.getElementById('feedback-content');

    const strengths = response.strengths || [];
    const improvements = response.improvements || [];
    const score = response.score || null;
    const suggestions = response.suggestions || [];

    let html = '';

    if (score) {
        html += `
            <div class="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
                <div class="flex items-center justify-between">
                    <span class="font-medium text-gray-900">Answer Quality Score</span>
                    <span class="text-2xl font-bold text-purple-600">${score}/100</span>
                </div>
                <div class="mt-2 bg-gray-200 rounded-full h-2">
                    <div class="bg-purple-600 h-2 rounded-full" style="width: ${score}%"></div>
                </div>
            </div>
        `;
    }

    if (strengths.length > 0) {
        html += '<h4 class="font-bold text-gray-900 mb-3 flex items-center gap-2"><i class="fas fa-thumbs-up text-green-600"></i> Strengths</h4>';
        strengths.forEach(strength => {
            html += `
                <div class="feedback-item feedback-strength">
                    <p class="text-sm text-gray-700">${strength}</p>
                </div>
            `;
        });
    }

    if (improvements.length > 0) {
        html += '<h4 class="font-bold text-gray-900 mt-6 mb-3 flex items-center gap-2"><i class="fas fa-lightbulb text-yellow-600"></i> Areas for Improvement</h4>';
        improvements.forEach(improvement => {
            html += `
                <div class="feedback-item feedback-improvement">
                    <p class="text-sm text-gray-700">${improvement}</p>
                </div>
            `;
        });
    }

    if (suggestions.length > 0) {
        html += '<h4 class="font-bold text-gray-900 mt-6 mb-3 flex items-center gap-2"><i class="fas fa-comment-dots text-blue-600"></i> Suggestions</h4>';
        html += '<ul class="list-disc list-inside space-y-2 text-sm text-gray-700">';
        suggestions.forEach(suggestion => {
            html += `<li>${suggestion}</li>`;
        });
        html += '</ul>';
    }

    if (!html && response.reply_message) {
        html = `<div class="feedback-item feedback-strength"><p class="text-sm text-gray-700">${response.reply_message}</p></div>`;
    }

    feedbackContent.innerHTML = html;
    feedbackSection.classList.remove('hidden');
    feedbackSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function updateProgress() {
    if (interviewMode === 'interactive') {
        updateInteractiveProgress();
        return;
    }

    const current = interviewSession.currentQuestionIndex + 1;
    const total = interviewSession.questions.length;
    const percentage = total ? (current / total) * 100 : 0;

    document.getElementById('progress-text').textContent = `${current} / ${total}`;
    document.getElementById('progress-fill').style.width = `${percentage}%`;

    const stage = interviewSession.stages.find(s => s.stage_index === getQuestionBankCurrentStageIndex());
    const stageLabel = stage
        ? `${stage.name} · Q${stage.questionIndices.indexOf(interviewSession.currentQuestionIndex) + 1}/${stage.questionIndices.length}`
        : current;
    document.getElementById('current-q-num').textContent = stageLabel;
}

function generateSessionReport() {
    const reportSection = document.getElementById('report-section');
    const reportContent = document.getElementById('report-content');

    const answeredCount = interviewSession.answers.filter(a => a && a.trim()).length;
    const completionRate = Math.round((answeredCount / interviewSession.questions.length) * 100);

    let stageHtml = '';
    if (interviewSession.stages?.length) {
        stageHtml = '<h4 class="font-semibold mb-3 mt-2">Stage Progress</h4><div class="space-y-2 text-sm">';
        interviewSession.stages.forEach((stage) => {
            const answered = stage.questionIndices.filter(i => interviewSession.answers[i]?.trim()).length;
            const total = stage.questionIndices.length;
            stageHtml += `<div class="flex justify-between bg-white/5 rounded px-3 py-2">
                <span class="opacity-90">${stage.name}</span>
                <span class="font-medium">${answered}/${total}</span>
            </div>`;
        });
        stageHtml += '</div>';
    }

    let html = `
        <div class="grid md:grid-cols-3 gap-4 mb-6">
            <div class="bg-white/10 rounded-lg p-4 text-center">
                <div class="text-3xl font-bold">${interviewSession.questions.length}</div>
                <div class="text-sm opacity-80">Total Questions</div>
            </div>
            <div class="bg-white/10 rounded-lg p-4 text-center">
                <div class="text-3xl font-bold">${answeredCount}</div>
                <div class="text-sm opacity-80">Answers Provided</div>
            </div>
            <div class="bg-white/10 rounded-lg p-4 text-center">
                <div class="text-3xl font-bold">${completionRate}%</div>
                <div class="text-sm opacity-80">Completion Rate</div>
            </div>
        </div>

        <div class="mb-6">
            <h4 class="font-semibold mb-3">Session Details</h4>
            <div class="space-y-2 text-sm">
                <div class="flex justify-between">
                    <span class="opacity-80">Position:</span>
                    <span class="font-medium">${interviewSession.jobTitle}</span>
                </div>
                <div class="flex justify-between">
                    <span class="opacity-80">Program:</span>
                    <span class="font-medium">${interviewSession.programLabel || interviewSession.programVersion}</span>
                </div>
                <div class="flex justify-between">
                    <span class="opacity-80">Interview Style:</span>
                    <span class="font-medium capitalize">${interviewSession.tone}</span>
                </div>
                <div class="flex justify-between">
                    <span class="opacity-80">Stages:</span>
                    <span class="font-medium">${interviewSession.stages.length}</span>
                </div>
                <div class="flex justify-between">
                    <span class="opacity-80">Date:</span>
                    <span class="font-medium">${new Date().toLocaleDateString()}</span>
                </div>
            </div>
        </div>

        ${stageHtml}

        <div>
            <h4 class="font-semibold mb-3">Key Recommendations</h4>
            <ul class="space-y-2 text-sm">
                <li class="flex items-start gap-2">
                    <i class="fas fa-check-circle text-green-400 mt-1"></i>
                    <span>Continue practicing with different question types</span>
                </li>
                <li class="flex items-start gap-2">
                    <i class="fas fa-check-circle text-green-400 mt-1"></i>
                    <span>Focus on providing specific examples using STAR method</span>
                </li>
                <li class="flex items-start gap-2">
                    <i class="fas fa-check-circle text-green-400 mt-1"></i>
                    <span>Review feedback and implement suggestions</span>
                </li>
            </ul>
        </div>
    `;

    reportContent.innerHTML = html;
    reportSection.classList.remove('hidden');
    reportSection.scrollIntoView({ behavior: 'smooth' });
}

function downloadReport() {
    let report = `INTERVIEW SESSION REPORT\n`;
    report += `========================\n\n`;
    report += `Position: ${interviewSession.jobTitle}\n`;
    report += `Style: ${interviewSession.tone}\n`;
    report += `Date: ${new Date().toLocaleString()}\n\n`;
    report += `COMPLETION: ${interviewSession.answers.filter(a => a && a.trim()).length}/${interviewSession.questions.length} questions answered\n\n`;
    report += `QUESTIONS AND ANSWERS:\n`;
    report += `=====================\n\n`;

    interviewSession.questions.forEach((q, index) => {
        report += `Q${index + 1}: ${q.question}\n`;
        report += `Category: ${q.category}\n`;
        const answer = interviewSession.answers[index];
        report += answer ? `Your Answer: ${answer}\n` : `Your Answer: [Not answered]\n`;
        if (q.answer) {
            report += `Suggested Answer: ${q.answer}\n`;
        }
        report += `\n---\n\n`;
    });

    const blob = new Blob([report], { type: 'text/plain' });
    Utils.downloadFile(blob, `interview-report-${Date.now()}.txt`);
    Utils.showToast(uiT('interview.toast.reportDownloaded', 'Report downloaded'));
}

function restartSession() {
    if (confirm('Start a new interview session? Current progress will be lost.')) {
        interviewSession = {
            questions: [],
            stages: [],
            currentQuestionIndex: 0,
            answers: [],
            jobTitle: '',
            tone: 'professional',
            programVersion: 'quick',
            programLabel: '',
            questionLanguage: getDefaultInterviewLang(),
            feedbackLanguage: getDefaultInterviewLang(),
        };

        interactiveSession = {
            active: false,
            status: 'idle',
            roundCount: 0,
            maxRounds: 10,
            programVersion: 'quick',
            specializedFocus: '',
            programLabel: '',
            jobTrack: '',
            currentStageIndex: 0,
            stages: [],
            turns: [],
            debrief: null,
            savedRecordId: null,
            savePromptDismissed: false,
        };

        hideInteractiveSaveModal();
        interviewPrerequisites = {
            profileReady: false,
            jobReady: false,
            resumeReady: false,
        };
        interviewResumeFile = null;

        document.getElementById('question-section').classList.add('hidden');
        document.getElementById('answer-section').classList.add('hidden');
        document.getElementById('reference-answer-section')?.classList.add('hidden');
        document.getElementById('feedback-section').classList.add('hidden');
        document.getElementById('report-section').classList.add('hidden');
        document.getElementById('qb-stage-banner')?.classList.add('hidden');
        document.getElementById('interactive-panel').classList.add('hidden');
        document.getElementById('interactive-debrief-section').classList.add('hidden');
        document.getElementById('interactive-input-section').classList.remove('hidden');
        document.getElementById('empty-state').classList.remove('hidden');
        document.getElementById('interview-jd-section').classList.add('hidden');
        document.getElementById('interview-resume-section').classList.add('hidden');

        document.getElementById('job-title').value = '';
        document.getElementById('company-name').value = '';
        document.getElementById('job-industry').value = '';
        const customText = document.getElementById('custom-questions-text');
        if (customText) customText.value = '';
        clearCustomQuestionsFile();
        document.getElementById('answer-input').value = '';
        document.getElementById('interview-profile-text').value = '';
        document.getElementById('interview-jd-text').value = '';
        clearInterviewFile();

        updatePrerequisiteStatus();
        updateProgress();
        selectTone('professional');
        syncQuestionLanguageButtons();
        syncFeedbackLanguageButtons();

        document.getElementById('btn-load-questions').disabled = true;
        selectInterviewMode(interviewMode);
        Utils.showToast(uiT('interview.toast.sessionReset', 'Session reset'));
    }
}
