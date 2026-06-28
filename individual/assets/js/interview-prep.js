/**
 * GBA Platform - Interview Preparation
 */

let interviewSession = {
    questions: [],
    currentQuestionIndex: 0,
    answers: [],
    jobTitle: '',
    tone: 'professional',
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeInterviewPrep();
});

function initializeInterviewPrep() {
    // Load session
    const sessionId = apiClient.loadSessionId();
    if (sessionId) {
        Utils.updateSessionDisplay(sessionId);
    } else {
        apiClient.generateSessionId();
        Utils.updateSessionDisplay(apiClient.sessionId);
    }

    // Enable/disable start button based on input
    setupInputValidation();
}

/**
 * Setup input validation for job title
 */
function setupInputValidation() {
    const jobTitleInput = document.getElementById('job-title');
    const startButton = document.getElementById('btn-load-questions');

    jobTitleInput.addEventListener('input', () => {
        const hasValue = jobTitleInput.value.trim().length > 0;
        startButton.disabled = !hasValue;
    });
}

/**
 * Select interviewer tone
 */
function selectTone(tone) {
    interviewSession.tone = tone;

    // Update UI
    document.querySelectorAll('.tone-option').forEach(option => {
        option.classList.remove('selected');
    });
    document.querySelector(`[data-tone="${tone}"]`).classList.add('selected');

    // Update avatar
    const avatar = document.getElementById('interviewer-avatar');
    avatar.className = `interviewer-avatar avatar-${tone}`;

    console.log('Selected tone:', tone);
}

/**
 * Load interview questions from backend
 */
async function loadInterviewQuestions() {
    const jobTitle = document.getElementById('job-title').value.trim();
    const company = document.getElementById('company-name').value.trim();
    const industry = document.getElementById('job-industry').value;

    if (!jobTitle) {
        Utils.showToast('Please enter a job title');
        return;
    }

    try {
        Utils.showLoading('Generating personalized questions...');

        // Start interview session - triggers interview_agent
        const response = await apiClient.startInterviewSession(jobTitle, industry, interviewSession.tone);

        // Extract questions from response
        if (response.interview_qa && response.interview_qa.length > 0) {
            interviewSession.questions = response.interview_qa.map((qa, index) => ({
                id: qa.id || `q_${index}`,
                question: qa.question,
                category: qa.category || 'General',
                answer: qa.answer || '', // Suggested answer from AI
            }));
        } else {
            throw new Error('No questions generated');
        }

        interviewSession.jobTitle = jobTitle;
        interviewSession.currentQuestionIndex = 0;
        interviewSession.answers = [];

        Utils.hideLoading();
        Utils.showToast(`Generated ${interviewSession.questions.length} questions`);

        // Show interview interface
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

/**
 * Show the interview interface
 */
function showInterviewInterface() {
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('question-section').classList.remove('hidden');
    document.getElementById('answer-section').classList.remove('hidden');
}

/**
 * Display current question
 */
function displayCurrentQuestion() {
    const question = interviewSession.questions[interviewSession.currentQuestionIndex];
    
    document.getElementById('q-number').textContent = interviewSession.currentQuestionIndex + 1;
    document.getElementById('question-text').textContent = question.question;

    // Load previous answer if exists
    const previousAnswer = interviewSession.answers[interviewSession.currentQuestionIndex];
    document.getElementById('answer-input').value = previousAnswer || '';

    // Update navigation buttons
    document.getElementById('btn-prev').disabled = interviewSession.currentQuestionIndex === 0;
    document.getElementById('btn-next').disabled = 
        interviewSession.currentQuestionIndex === interviewSession.questions.length - 1;

    // Hide feedback section when showing new question
    document.getElementById('feedback-section').classList.add('hidden');
}

/**
 * Navigate to previous question
 */
function previousQuestion() {
    if (interviewSession.currentQuestionIndex > 0) {
        // Save current answer before navigating
        saveCurrentAnswer();
        
        interviewSession.currentQuestionIndex--;
        displayCurrentQuestion();
        updateProgress();
    }
}

/**
 * Navigate to next question
 */
function nextQuestion() {
    if (interviewSession.currentQuestionIndex < interviewSession.questions.length - 1) {
        // Save current answer before navigating
        saveCurrentAnswer();
        
        interviewSession.currentQuestionIndex++;
        displayCurrentQuestion();
        updateProgress();
    }
}

/**
 * Save current answer to session
 */
function saveCurrentAnswer() {
    const answer = document.getElementById('answer-input').value.trim();
    interviewSession.answers[interviewSession.currentQuestionIndex] = answer;
}

/**
 * Submit answer and get AI feedback
 */
async function submitAnswer() {
    const answer = document.getElementById('answer-input').value.trim();
    
    if (!answer) {
        Utils.showToast('Please provide an answer first');
        return;
    }

    // Save answer
    interviewSession.answers[interviewSession.currentQuestionIndex] = answer;

    try {
        Utils.showLoading('Analyzing your answer...');

        const currentQuestion = interviewSession.questions[interviewSession.currentQuestionIndex];
        
        // Submit answer for feedback - triggers question_agent
        const feedbackResponse = await apiClient.submitAnswer(currentQuestion.id, answer);

        Utils.hideLoading();

        // Display feedback
        displayFeedback(feedbackResponse);

        // Check if this is the last question
        if (interviewSession.currentQuestionIndex === interviewSession.questions.length - 1) {
            // Generate session report
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

/**
 * Display AI feedback
 */
function displayFeedback(response) {
    const feedbackSection = document.getElementById('feedback-section');
    const feedbackContent = document.getElementById('feedback-content');

    // Extract feedback from response (adjust based on actual API structure)
    const strengths = response.strengths || [];
    const improvements = response.improvements || [];
    const score = response.score || null;
    const suggestions = response.suggestions || [];

    let html = '';

    // Score (if available)
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

    // Strengths
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

    // Areas for Improvement
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

    // Suggestions
    if (suggestions.length > 0) {
        html += '<h4 class="font-bold text-gray-900 mt-6 mb-3 flex items-center gap-2"><i class="fas fa-comment-dots text-blue-600"></i> Suggestions</h4>';
        html += '<ul class="list-disc list-inside space-y-2 text-sm text-gray-700">';
        suggestions.forEach(suggestion => {
            html += `<li>${suggestion}</li>`;
        });
        html += '</ul>';
    }

    feedbackContent.innerHTML = html;
    feedbackSection.classList.remove('hidden');

    // Scroll to feedback
    feedbackSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Update progress bar
 */
function updateProgress() {
    const current = interviewSession.currentQuestionIndex + 1;
    const total = interviewSession.questions.length;
    const percentage = (current / total) * 100;

    document.getElementById('progress-text').textContent = `${current} / ${total}`;
    document.getElementById('progress-fill').style.width = `${percentage}%`;
    document.getElementById('current-q-num').textContent = current;
}

/**
 * Generate final session report
 */
function generateSessionReport() {
    const reportSection = document.getElementById('report-section');
    const reportContent = document.getElementById('report-content');

    // Calculate statistics
    const answeredCount = interviewSession.answers.filter(a => a && a.trim()).length;
    const completionRate = Math.round((answeredCount / interviewSession.questions.length) * 100);

    // Build report HTML
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

    // Scroll to report
    reportSection.scrollIntoView({ behavior: 'smooth' });
}

/**
 * Download session report
 */
function downloadReport() {
    // Build report text
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
        if (answer) {
            report += `Your Answer: ${answer}\n`;
        } else {
            report += `Your Answer: [Not answered]\n`;
        }
        if (q.answer) {
            report += `Suggested Answer: ${q.answer}\n`;
        }
        report += `\n---\n\n`;
    });

    // Download as text file
    const blob = new Blob([report], { type: 'text/plain' });
    Utils.downloadFile(blob, `interview-report-${Date.now()}.txt`);
    Utils.showToast('Report downloaded');
}

/**
 * Restart interview session
 */
function restartSession() {
    if (confirm('Start a new interview session? Current progress will be lost.')) {
        // Reset session
        interviewSession = {
            questions: [],
            currentQuestionIndex: 0,
            answers: [],
            jobTitle: '',
            tone: 'professional',
        };

        // Reset UI
        document.getElementById('question-section').classList.add('hidden');
        document.getElementById('answer-section').classList.add('hidden');
        document.getElementById('feedback-section').classList.add('hidden');
        document.getElementById('report-section').classList.add('hidden');
        document.getElementById('empty-state').classList.remove('hidden');

        // Clear inputs
        document.getElementById('job-title').value = '';
        document.getElementById('company-name').value = '';
        document.getElementById('job-industry').value = '';
        document.getElementById('answer-input').value = '';

        // Reset progress
        updateProgress();

        // Reset tone selection
        selectTone('professional');

        // Disable start button
        document.getElementById('btn-load-questions').disabled = true;

        Utils.showToast('Session reset');
    }
}
