/**
 * GBA Platform - Interview Preparation
 * Prerequisites for interview_agent: job, candidate_profile, resume_content_json
 */

let interviewSession = {
    questions: [],
    currentQuestionIndex: 0,
    answers: [],
    jobTitle: '',
    tone: 'professional',
};

/** 交互式多轮模拟面试状态 */
let interactiveSession = {
    active: false,
    status: 'idle',
    roundCount: 0,
    maxRounds: 10,
    turns: [],
    debrief: null,
    savedRecordId: null,
    savePromptDismissed: false,
};

let interviewMode = 'question_bank'; // question_bank | interactive

let interviewPrerequisites = {
    profileReady: false,
    jobReady: false,
    resumeReady: false,
};

let interviewResumeFile = null;

document.addEventListener('DOMContentLoaded', () => {
    initializeInterviewPrep();
    setupInteractiveSaveModal();
});

function initializeInterviewPrep() {
    const sessionId = apiClient.loadSessionId();
    if (sessionId) {
        Utils.updateSessionDisplay(sessionId);
    } else {
        apiClient.generateSessionId();
        Utils.updateSessionDisplay(apiClient.sessionId);
    }

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
        Utils.showToast('Please upload a resume or paste profile text');
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
        Utils.showToast('Profile uploaded successfully');
        console.log('Profile agent response:', response);
    } catch (error) {
        Utils.hideLoading();
        Utils.showToast('Failed to upload profile: ' + error.message);
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
        Utils.showToast('Please paste the target job description or fill in target job fields');
        return;
    }

    try {
        Utils.showLoading('Analyzing job description...');

        const response = await apiClient.submitJobDescription(jdText || targetContext?.jd_text || document.getElementById('job-title').value.trim(), targetContext);
        interviewPrerequisites.jobReady = true;
        updatePrerequisiteStatus();

        document.getElementById('interview-resume-section').classList.remove('hidden');
        Utils.hideLoading();
        Utils.showToast('Job description submitted successfully');
        console.log('JD agent response:', response);
    } catch (error) {
        Utils.hideLoading();
        Utils.showToast('Failed to submit job description: ' + error.message);
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
            Utils.showToast('Resume content ready for interview generation');
        } else {
            throw new Error('Resume content was not generated');
        }

        console.log('Resume generation response:', response);
    } catch (error) {
        Utils.hideLoading();
        Utils.showToast('Failed to generate resume: ' + error.message);
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
    document.getElementById('question-bank-panel').classList.toggle('hidden', isInteractive);
    document.getElementById('interactive-panel').classList.toggle('hidden', !isInteractive);
    document.getElementById('sidebar-progress-title').textContent = isInteractive
        ? 'Interactive Progress'
        : 'Session Progress';

    const startBtn = document.getElementById('btn-load-questions');
    if (startBtn) {
        startBtn.innerHTML = isInteractive
            ? '<i class="fas fa-comments mr-2"></i> Start Interactive Mock'
            : '<i class="fas fa-play mr-2"></i> Start Interview Session';
    }

    if (isInteractive && interactiveSession.active) {
        renderInteractiveChat();
    }
}

async function loadInterviewQuestions() {
    if (interviewMode === 'interactive') {
        return startInteractiveInterview();
    }
    const jobTitle = document.getElementById('job-title').value.trim();
    const industry = document.getElementById('job-industry').value;

    if (!jobTitle) {
        Utils.showToast('Please enter a job title');
        return;
    }

    if (!interviewPrerequisites.profileReady || !interviewPrerequisites.jobReady || !interviewPrerequisites.resumeReady) {
        Utils.showToast('Please complete all prerequisite steps first');
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

        const response = await apiClient.startInterviewSession(jobTitle, industry, interviewSession.tone, targetContext);

        if (response.interview_qa && response.interview_qa.length > 0) {
            interviewSession.questions = response.interview_qa.map((qa, index) => ({
                id: qa.id || `q_${index}`,
                question: qa.question,
                category: qa.category || 'General',
                answer: qa.answer || '',
            }));
        } else {
            throw new Error('No questions generated. Ensure profile, job description, and resume are complete.');
        }

        interviewSession.jobTitle = jobTitle;
        interviewSession.currentQuestionIndex = 0;
        interviewSession.answers = [];

        Utils.hideLoading();
        Utils.showToast(`Generated ${interviewSession.questions.length} questions`);

        showInterviewInterface();
        displayCurrentQuestion();
        updateProgress();

        console.log('Interview session started:', interviewSession);
    } catch (error) {
        Utils.hideLoading();
        Utils.showToast('Failed to generate questions: ' + error.message);
        console.error('Interview session error:', error);
    }
}

async function startInteractiveInterview() {
    const jobTitle = document.getElementById('job-title').value.trim();
    const industry = document.getElementById('job-industry').value;

    if (!jobTitle) {
        Utils.showToast('Please enter a job title');
        return;
    }

    if (!interviewPrerequisites.profileReady || !interviewPrerequisites.jobReady || !interviewPrerequisites.resumeReady) {
        Utils.showToast('Please complete all prerequisite steps first');
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

        const response = await apiClient.startInteractiveInterview({
            tone: interviewSession.tone,
            jobTitle,
            industry,
            maxRounds: 10,
            targetContext,
        });

        const session = response.interactive_interview;
        interactiveSession = {
            active: true,
            status: session.status,
            roundCount: session.round_count,
            maxRounds: session.max_rounds,
            turns: session.turns || [],
            debrief: null,
            savedRecordId: null,
            savePromptDismissed: false,
        };

        interviewSession.jobTitle = jobTitle;

        Utils.hideLoading();
        Utils.showToast('Interactive mock interview started');

        showInteractiveInterface();
        renderInteractiveChat();
        updateInteractiveProgress();

        console.log('Interactive interview started:', session);
    } catch (error) {
        Utils.hideLoading();
        Utils.showToast('Failed to start interactive interview: ' + error.message);
        console.error('Interactive interview error:', error);
    }
}

function showInteractiveInterface() {
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('interactive-panel').classList.remove('hidden');
    document.getElementById('interactive-debrief-section').classList.add('hidden');
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

        html += `
            <div class="flex gap-3 mb-4 ${isInterviewer ? '' : 'flex-row-reverse'}">
                <div class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isInterviewer ? 'bg-purple-100' : 'bg-blue-100'}">
                    <i class="fas ${isInterviewer ? 'fa-user-tie text-purple-600' : 'fa-user text-blue-600'} text-sm"></i>
                </div>
                <div class="flex-1 max-w-[85%] ${isInterviewer ? '' : 'text-right'}">
                    <div class="text-xs text-gray-500 mb-1">
                        ${isInterviewer ? 'Interviewer' : 'You'}
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
        Utils.showToast('Please type your answer');
        return;
    }

    if (interactiveSession.status !== 'active') {
        Utils.showToast('Interview is not active');
        return;
    }

    try {
        Utils.showLoading('Interviewer is thinking...');
        input.disabled = true;

        const response = await apiClient.submitInteractiveTurn(answer);
        const session = response.interactive_interview;

        interactiveSession.status = session.status;
        interactiveSession.roundCount = session.round_count;
        interactiveSession.turns = session.turns || [];
        interactiveSession.active = session.status === 'active';

        input.value = '';
        input.disabled = false;

        Utils.hideLoading();
        renderInteractiveChat();
        updateInteractiveProgress();

        if (session.status === 'completed') {
            document.getElementById('interactive-input-section').classList.add('hidden');
            Utils.showToast('Interview ended. Generating debrief...');
            await loadInteractiveDebrief();
        }
    } catch (error) {
        input.disabled = false;
        Utils.hideLoading();
        Utils.showToast('Failed to submit answer: ' + error.message);
        console.error('Interactive turn error:', error);
    }
}

async function endInteractiveInterview() {
    if (!interactiveSession.active && interactiveSession.status !== 'active') {
        if (interactiveSession.debrief) {
            document.getElementById('interactive-debrief-section').classList.remove('hidden');
            return;
        }
        Utils.showToast('No active interview to end');
        return;
    }

    if (!confirm('End the mock interview and generate debrief report?')) {
        return;
    }

    try {
        Utils.showLoading('Generating debrief report...');
        document.getElementById('interactive-input-section').classList.add('hidden');

        const response = await apiClient.endInteractiveInterview(true);
        const session = response.interactive_interview;

        interactiveSession.status = 'completed';
        interactiveSession.active = false;
        interactiveSession.turns = session.turns || [];
        interactiveSession.debrief = session.debrief;

        Utils.hideLoading();
        renderInteractiveDebrief(session.debrief);
        Utils.showToast('Debrief report ready');
        promptSaveInteractiveInterview();
    } catch (error) {
        Utils.hideLoading();
        Utils.showToast('Failed to generate debrief: ' + error.message);
        console.error('End interactive interview error:', error);
    }
}

async function loadInteractiveDebrief() {
    try {
        const response = await apiClient.endInteractiveInterview(true);
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
        Utils.showToast('Not saved. You can save later from the debrief section.');
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
    if (debrief.category_scores) {
        categoryHtml = '<div class="grid sm:grid-cols-2 gap-2 mt-4">';
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
                ${interactiveSession.roundCount} rounds completed
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
        saveBtn.innerHTML = '<i class="fas fa-check mr-2"></i> Saved to Account';
        if (savedBadge) {
            savedBadge.classList.remove('hidden');
            savedBadge.textContent = `Record ID: ${interactiveSession.savedRecordId}`;
        }
    } else {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-cloud-upload-alt mr-2"></i> Save to Account';
        if (savedBadge) savedBadge.classList.add('hidden');
    }
}

async function saveInteractiveInterviewToAccount(skipConfirm = false) {
    if (!apiClient.isLoggedIn()) {
        Utils.showToast('Please log in to save your mock interview');
        return;
    }

    if (!interactiveSession.debrief || interactiveSession.status !== 'completed') {
        Utils.showToast('Complete the interview and debrief before saving');
        return;
    }

    if (interactiveSession.savedRecordId) {
        Utils.showToast('Already saved to your account');
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
        Utils.showToast(response.message || 'Mock interview saved to your account');
    } catch (error) {
        Utils.hideLoading();
        Utils.showToast(error.message || 'Failed to save mock interview');
        console.error('Save interactive interview error:', error);
    }
}

function updateInteractiveProgress() {
    const current = interactiveSession.roundCount;
    const total = interactiveSession.maxRounds;
    const percentage = total ? (current / total) * 100 : 0;

    document.getElementById('progress-text').textContent = `${current} / ${total}`;
    document.getElementById('progress-fill').style.width = `${percentage}%`;
    document.getElementById('current-q-num').textContent = interactiveSession.status === 'completed'
        ? 'Done'
        : `Round ${current}`;
}

function downloadInteractiveDebrief() {
    const debrief = interactiveSession.debrief;
    if (!debrief) {
        Utils.showToast('No debrief report available');
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
    Utils.showToast('Debrief downloaded');
}

function showInterviewInterface() {
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('question-section').classList.remove('hidden');
    document.getElementById('answer-section').classList.remove('hidden');
}

function displayCurrentQuestion() {
    const question = interviewSession.questions[interviewSession.currentQuestionIndex];

    document.getElementById('q-number').textContent = interviewSession.currentQuestionIndex + 1;
    document.getElementById('question-text').textContent = question.question;

    const previousAnswer = interviewSession.answers[interviewSession.currentQuestionIndex];
    document.getElementById('answer-input').value = previousAnswer || '';

    document.getElementById('btn-prev').disabled = interviewSession.currentQuestionIndex === 0;
    document.getElementById('btn-next').disabled =
        interviewSession.currentQuestionIndex === interviewSession.questions.length - 1;

    document.getElementById('feedback-section').classList.add('hidden');
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
        Utils.showToast('Please provide an answer first');
        return;
    }

    interviewSession.answers[interviewSession.currentQuestionIndex] = answer;

    try {
        Utils.showLoading('Analyzing your answer...');

        const currentQuestion = interviewSession.questions[interviewSession.currentQuestionIndex];
        const feedbackResponse = await apiClient.submitAnswer(currentQuestion.id, answer);

        Utils.hideLoading();
        displayFeedback(feedbackResponse);

        if (interviewSession.currentQuestionIndex === interviewSession.questions.length - 1) {
            setTimeout(() => {
                generateSessionReport();
            }, 2000);
        }

        Utils.showToast('Answer submitted! Check feedback below.');
    } catch (error) {
        Utils.hideLoading();
        Utils.showToast('Failed to get feedback: ' + error.message);
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
    const current = interviewSession.currentQuestionIndex + 1;
    const total = interviewSession.questions.length;
    const percentage = (current / total) * 100;

    document.getElementById('progress-text').textContent = `${current} / ${total}`;
    document.getElementById('progress-fill').style.width = `${percentage}%`;
    document.getElementById('current-q-num').textContent = current;
}

function generateSessionReport() {
    const reportSection = document.getElementById('report-section');
    const reportContent = document.getElementById('report-content');

    const answeredCount = interviewSession.answers.filter(a => a && a.trim()).length;
    const completionRate = Math.round((answeredCount / interviewSession.questions.length) * 100);

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
                    <span class="opacity-80">Interview Style:</span>
                    <span class="font-medium capitalize">${interviewSession.tone}</span>
                </div>
                <div class="flex justify-between">
                    <span class="opacity-80">Date:</span>
                    <span class="font-medium">${new Date().toLocaleDateString()}</span>
                </div>
            </div>
        </div>

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
    Utils.showToast('Report downloaded');
}

function restartSession() {
    if (confirm('Start a new interview session? Current progress will be lost.')) {
        interviewSession = {
            questions: [],
            currentQuestionIndex: 0,
            answers: [],
            jobTitle: '',
            tone: 'professional',
        };

        interactiveSession = {
            active: false,
            status: 'idle',
            roundCount: 0,
            maxRounds: 10,
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
        document.getElementById('feedback-section').classList.add('hidden');
        document.getElementById('report-section').classList.add('hidden');
        document.getElementById('interactive-panel').classList.add('hidden');
        document.getElementById('interactive-debrief-section').classList.add('hidden');
        document.getElementById('interactive-input-section').classList.remove('hidden');
        document.getElementById('empty-state').classList.remove('hidden');
        document.getElementById('interview-jd-section').classList.add('hidden');
        document.getElementById('interview-resume-section').classList.add('hidden');

        document.getElementById('job-title').value = '';
        document.getElementById('company-name').value = '';
        document.getElementById('job-industry').value = '';
        document.getElementById('answer-input').value = '';
        document.getElementById('interview-profile-text').value = '';
        document.getElementById('interview-jd-text').value = '';
        clearInterviewFile();

        updatePrerequisiteStatus();
        updateProgress();
        selectTone('professional');

        document.getElementById('btn-load-questions').disabled = true;
        Utils.showToast('Session reset');
    }
}
