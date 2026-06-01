/**
 * GBA Platform - Resume Generator
 */

let currentFile = null;
let resumeGenerated = false;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeResumeGenerator();
});

function initializeResumeGenerator() {
    // Load session
    const sessionId = apiClient.loadSessionId();
    if (sessionId) {
        Utils.updateSessionDisplay(sessionId);
    } else {
        apiClient.generateSessionId();
        Utils.updateSessionDisplay(apiClient.sessionId);
    }

    // Setup file drag and drop
    setupDragAndDrop();
}

/**
 * Setup drag and drop for file upload
 */
function setupDragAndDrop() {
    const dropZone = document.querySelector('.border-dashed');
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.add('border-blue-500', 'bg-blue-50');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.remove('border-blue-500', 'bg-blue-50');
        });
    });

    dropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    });
}

/**
 * Handle file selection
 */
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        handleFile(file);
    }
}

/**
 * Process selected file
 */
function handleFile(file) {
    // Validate file type
    const validTypes = ['.pdf', '.docx', '.doc', '.txt'];
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!validTypes.includes(fileExtension)) {
        Utils.showToast('Invalid file type. Please upload PDF, DOCX, DOC, or TXT');
        return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
        Utils.showToast('File too large. Maximum size is 10MB');
        return;
    }

    currentFile = file;

    // Display file info
    document.getElementById('file-name').textContent = file.name;
    document.getElementById('file-size').textContent = Utils.formatFileSize(file.size);
    document.getElementById('file-info').classList.remove('hidden');

    // Enable continue button
    document.getElementById('btn-upload-resume').disabled = false;

    Utils.showToast('File uploaded successfully');
}

/**
 * Clear selected file
 */
function clearFile() {
    currentFile = null;
    document.getElementById('resume-file').value = '';
    document.getElementById('file-info').classList.add('hidden');
    document.getElementById('btn-upload-resume').disabled = true;
}

/**
 * Upload resume and trigger profile_agent
 */
async function uploadResume() {
    const resumeText = document.getElementById('resume-text').value.trim();

    if (!currentFile && !resumeText) {
        Utils.showToast('Please upload a file or paste resume text');
        return;
    }

    try {
        Utils.showLoading('Uploading resume...');
        updateStepIndicator(1, 'completed');

        let response;
        
        if (currentFile) {
            // Upload file
            response = await apiClient.uploadResume(currentFile);
        } else {
            // Use pasted text
            response = await apiClient.chat(resumeText, []);
        }

        Utils.hideLoading();
        Utils.showToast('Resume analyzed successfully');

        // Show JD section
        document.getElementById('jd-section').classList.remove('hidden');
        updateStepIndicator(2, 'active');

        // Scroll to JD section
        document.getElementById('jd-section').scrollIntoView({ behavior: 'smooth' });

        console.log('Profile agent response:', response);
    } catch (error) {
        Utils.hideLoading();
        Utils.showToast('Failed to upload resume: ' + error.message);
        console.error('Upload error:', error);
    }
}

/**
 * Generate customized resume
 */
async function generateResume() {
    const jdText = document.getElementById('jd-text').value.trim();
    const industry = document.getElementById('industry-select').value;
    const experienceLevel = document.getElementById('experience-level').value;

    if (!jdText) {
        Utils.showToast('Please paste the job description');
        return;
    }

    try {
        // Show loading and agent status panel
        Utils.showLoading('Analyzing job description...');
        document.getElementById('agent-status-panel').classList.remove('hidden');
        document.getElementById('empty-state').classList.add('hidden');

        updateStepIndicator(2, 'completed');
        updateStepIndicator(3, 'active');

        // Update agent status
        updateAgentStatus('agent-profile', 'completed');
        updateAgentStatus('agent-jd', 'running');

        // Submit JD - triggers jd_agent + gap_agent
        const jdResponse = await apiClient.submitJobDescription(jdText);
        
        updateAgentStatus('agent-jd', 'completed');
        updateAgentStatus('agent-gap', 'running');

        // Display gap analysis if available
        if (jdResponse.gaps && jdResponse.gaps.length > 0) {
            displayGapAnalysis(jdResponse.gaps);
        }

        updateAgentStatus('agent-gap', 'completed');
        updateAgentStatus('agent-content', 'running');

        // Generate resume - triggers content_agent + render_agent
        Utils.showLoading('Generating your customized resume...');
        
        const resumeResponse = await apiClient.generateResume();
        
        updateAgentStatus('agent-content', 'completed');
        updateAgentStatus('agent-render', 'running');

        // Display resume
        if (resumeResponse.resume_html && resumeResponse.resume_html.html) {
            displayResume(resumeResponse.resume_html.html);
        } else {
            // Try to get resume from separate endpoint
            const resumeData = await apiClient.getResumeHtml();
            if (resumeData.resume_html && resumeData.resume_html.html) {
                displayResume(resumeData.resume_html.html);
            } else {
                throw new Error('Resume HTML not available');
            }
        }

        updateAgentStatus('agent-render', 'completed');
        Utils.hideLoading();

        // Show results sections
        document.getElementById('resume-preview-section').classList.remove('hidden');
        document.getElementById('gap-analysis-section').classList.remove('hidden');

        updateStepIndicator(3, 'completed');
        resumeGenerated = true;

        Utils.showToast('Resume generated successfully!');

        // Scroll to resume preview
        document.getElementById('resume-preview-section').scrollIntoView({ behavior: 'smooth' });

        console.log('Resume generation complete:', resumeResponse);
    } catch (error) {
        Utils.hideLoading();
        Utils.showToast('Failed to generate resume: ' + error.message);
        console.error('Generation error:', error);

        // Mark agents as failed
        updateAgentStatus('agent-jd', 'failed');
        updateAgentStatus('agent-gap', 'failed');
        updateAgentStatus('agent-content', 'failed');
        updateAgentStatus('agent-render', 'failed');
    }
}

/**
 * Display gap analysis results
 */
function displayGapAnalysis(gaps) {
    const container = document.getElementById('gap-analysis-content');
    
    if (!gaps || gaps.length === 0) {
        container.innerHTML = '<p class="text-gray-600">No significant skill gaps detected!</p>';
        return;
    }

    const html = gaps.map(gap => `
        <div class="gap-analysis-card">
            <div class="flex items-start justify-between mb-2">
                <div>
                    <h4 class="font-bold text-gray-900">${gap.skill || gap.description}</h4>
                    <p class="text-sm text-gray-600 mt-1">${gap.suggestion || 'Consider developing this skill'}</p>
                </div>
                <span class="px-3 py-1 rounded-full text-xs font-medium ${getSeverityClass(gap.severity)}">
                    ${gap.severity || 'Medium'} Priority
                </span>
            </div>
            ${gap.type ? `<div class="text-xs text-gray-500">Type: ${gap.type}</div>` : ''}
        </div>
    `).join('');

    container.innerHTML = html;
}

/**
 * Get CSS class based on severity
 */
function getSeverityClass(severity) {
    switch (severity?.toLowerCase()) {
        case 'high':
        case 'critical':
            return 'bg-red-100 text-red-800';
        case 'medium':
            return 'bg-yellow-100 text-yellow-800';
        case 'low':
            return 'bg-green-100 text-green-800';
        default:
            return 'bg-gray-100 text-gray-800';
    }
}

/**
 * Display generated resume
 */
function displayResume(htmlContent) {
    const previewContainer = document.getElementById('resume-preview');
    previewContainer.innerHTML = htmlContent;
}

/**
 * Update agent status indicator
 */
function updateAgentStatus(agentId, status) {
    const agentElement = document.getElementById(agentId);
    if (!agentElement) return;

    const statusIcon = agentElement.querySelector('.status-icon');
    const iconMap = {
        'pending': '<i class="fas fa-clock"></i>',
        'running': '<i class="fas fa-circle-notch fa-spin"></i>',
        'completed': '<i class="fas fa-check-circle text-green-400"></i>',
        'failed': '<i class="fas fa-times-circle text-red-400"></i>',
    };

    if (statusIcon) {
        statusIcon.innerHTML = iconMap[status] || iconMap['pending'];
    }
}

/**
 * Update step indicator
 */
function updateStepIndicator(stepNumber, status) {
    const stepElement = document.getElementById(`step-${stepNumber}`);
    if (!stepElement) return;

    stepElement.classList.remove('active', 'completed');
    stepElement.classList.add(status);
}

/**
 * Download resume as HTML
 */
async function downloadResume(format = 'html') {
    try {
        if (format === 'html') {
            const resumeData = await apiClient.getResumeHtml();
            if (resumeData.resume_html && resumeData.resume_html.html) {
                const blob = new Blob([resumeData.resume_html.html], { type: 'text/html' });
                Utils.downloadFile(blob, 'resume.html');
                Utils.showToast('Resume downloaded');
            }
        }
    } catch (error) {
        Utils.showToast('Download failed: ' + error.message);
        console.error('Download error:', error);
    }
}

/**
 * Export resume as PDF
 */
async function exportResume(format = 'pdf') {
    try {
        Utils.showLoading('Exporting resume...');

        let blob;
        if (format === 'pdf') {
            blob = await apiClient.exportResumePDF();
            Utils.downloadFile(blob, 'resume.pdf');
        } else if (format === 'docx') {
            blob = await apiClient.exportResumeDOCX();
            Utils.downloadFile(blob, 'resume.docx');
        }

        Utils.hideLoading();
        Utils.showToast('Resume exported successfully');
    } catch (error) {
        Utils.hideLoading();
        Utils.showToast('Export failed: ' + error.message);
        console.error('Export error:', error);
    }
}
