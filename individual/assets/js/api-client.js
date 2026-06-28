/**
 * GBA Platform - API Client
 * Handles all backend communication
 */

const API_CONFIG = {
    BASE_URL: 'http://localhost:8000/api',
    TIMEOUT: 30000,
};

class APIClient {
    constructor() {
        this.client = axios.create({
            baseURL: API_CONFIG.BASE_URL,
            timeout: API_CONFIG.TIMEOUT,
            headers: {
                'Content-Type': 'application/json',
            },
        });

        this.sessionId = this.loadSessionId();
    }

    /**
     * Load session ID from localStorage
     */
    loadSessionId() {
        return localStorage.getItem('gba_session_id') || '';
    }

    /**
     * Save session ID to localStorage
     */
    saveSessionId(sessionId) {
        this.sessionId = sessionId;
        localStorage.setItem('gba_session_id', sessionId);
    }

    /**
     * Clear session data
     */
    clearSession() {
        this.sessionId = '';
        localStorage.removeItem('gba_session_id');
    }

    /**
     * Generate a new session ID
     */
    generateSessionId() {
        const newSessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.saveSessionId(newSessionId);
        return newSessionId;
    }

    /**
     * Main chat endpoint - unified entry point for all agents
     */
    async chat(message, attachments = []) {
        try {
            if (!this.sessionId) {
                this.generateSessionId();
            }

            const response = await this.client.post('/chat', {
                session_id: this.sessionId,
                message: message,
                attachments: attachments,
            });

            return response.data;
        } catch (error) {
            console.error('Chat API error:', error);
            throw this.handleError(error);
        }
    }

    /**
     * Upload resume and trigger profile_agent
     */
    async uploadResume(file) {
        try {
            const base64Content = await this.fileToBase64(file);

            const response = await this.chat('', [
                {
                    filename: file.name,
                    content: base64Content,
                    content_encoding: 'base64',
                },
            ]);

            return response;
        } catch (error) {
            console.error('Resume upload error:', error);
            throw error;
        }
    }

    /**
     * Submit job description and trigger jd_agent + gap_agent
     */
    async submitJobDescription(jdText) {
        try {
            const response = await this.chat(jdText, []);
            return response;
        } catch (error) {
            console.error('JD submission error:', error);
            throw error;
        }
    }

    /**
     * Generate customized resume - triggers content_agent + render_agent
     */
    async generateResume(instruction = 'Please generate a customized resume based on my experience and target position') {
        try {
            const response = await this.chat(instruction, []);
            return response;
        } catch (error) {
            console.error('Resume generation error:', error);
            throw error;
        }
    }

    /**
     * Get current resume HTML
     */
    async getResumeHtml() {
        try {
            if (!this.sessionId) {
                throw new Error('No active session');
            }

            const response = await this.client.get('/resume/html', {
                params: { session_id: this.sessionId },
            });

            return response.data;
        } catch (error) {
            console.error('Get resume HTML error:', error);
            throw error;
        }
    }

    /**
     * Preview resume HTML directly
     */
    getResumePreviewUrl() {
        if (!this.sessionId) {
            return null;
        }
        return `${API_CONFIG.BASE_URL}/resume/preview?session_id=${this.sessionId}`;
    }

    /**
     * Render resume with custom instruction
     */
    async renderResume(renderInstruction) {
        try {
            if (!this.sessionId) {
                throw new Error('No active session');
            }

            const response = await this.client.post('/resume/render', {
                session_id: this.sessionId,
                render_instruction: renderInstruction,
            });

            return response.data;
        } catch (error) {
            console.error('Render resume error:', error);
            throw error;
        }
    }

    /**
     * Export resume as PDF
     */
    async exportResumePDF() {
        try {
            if (!this.sessionId) {
                throw new Error('No active session');
            }

            const response = await this.client.post('/export/pdf', {
                session_id: this.sessionId,
            }, {
                responseType: 'blob',
            });

            return response.data;
        } catch (error) {
            console.error('Export PDF error:', error);
            throw error;
        }
    }

    /**
     * Export resume as DOCX
     */
    async exportResumeDOCX() {
        try {
            if (!this.sessionId) {
                throw new Error('No active session');
            }

            const response = await this.client.post('/export/docx', {
                session_id: this.sessionId,
            }, {
                responseType: 'blob',
            });

            return response.data;
        } catch (error) {
            console.error('Export DOCX error:', error);
            throw error;
        }
    }

    /**
     * Start interview session - triggers interview_agent
     */
    async startInterviewSession(jobTitle, industry = '', tone = 'professional') {
        try {
            const message = `Generate interview questions for a ${jobTitle} position in the ${industry || 'general'} industry. Use a ${tone} tone.`;
            const response = await this.chat(message, []);
            return response;
        } catch (error) {
            console.error('Interview session error:', error);
            throw error;
        }
    }

    /**
     * Submit answer and get feedback - triggers question_agent
     */
    async submitAnswer(questionId, answer) {
        try {
            const message = `Evaluate my answer to question ${questionId}: ${answer}`;
            const response = await this.chat(message, []);
            return response;
        } catch (error) {
            console.error('Submit answer error:', error);
            throw error;
        }
    }

    /**
     * Generate learning path
     */
    async generateLearningPath(targetJob, currentSkills = [], timeline = '6months') {
        try {
            const message = `Create a learning path to become a ${targetJob}. Current skills: ${currentSkills.join(', ')}. Timeline: ${timeline}.`;
            const response = await this.chat(message, []);
            return response;
        } catch (error) {
            console.error('Learning path generation error:', error);
            throw error;
        }
    }

    /**
     * Health check
     */
    async healthCheck() {
        try {
            const response = await axios.get(`${API_CONFIG.BASE_URL.replace('/api', '')}/health`);
            return response.data;
        } catch (error) {
            console.error('Health check error:', error);
            throw error;
        }
    }

    /**
     * Convert file to base64
     */
    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64String = reader.result.split(',')[1];
                resolve(base64String);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    /**
     * Handle API errors
     */
    handleError(error) {
        if (error.response) {
            // Server responded with error status
            const status = error.response.status;
            const message = error.response.data?.detail || error.response.statusText;

            switch (status) {
                case 404:
                    return new Error('Resource not found. Please check your session ID.');
                case 500:
                    return new Error('Server error. Please try again later.');
                case 422:
                    return new Error('Invalid request. Please check your input.');
                default:
                    return new Error(`API error: ${message}`);
            }
        } else if (error.request) {
            // Request was made but no response
            return new Error('Network error. Please check your connection and ensure the backend is running.');
        } else {
            // Something else happened
            return new Error(error.message || 'An unexpected error occurred.');
        }
    }
}

// Create global API client instance
const apiClient = new APIClient();

// Utility functions
const Utils = {
    /**
     * Show toast notification
     */
    showToast(message, duration = 3000) {
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toast-message');

        if (toast && toastMessage) {
            toastMessage.textContent = message;
            toast.classList.remove('translate-y-20', 'opacity-0');
            toast.classList.add('translate-y-0', 'opacity-100');

            setTimeout(() => {
                toast.classList.remove('translate-y-0', 'opacity-100');
                toast.classList.add('translate-y-20', 'opacity-0');
            }, duration);
        }
    },

    /**
     * Show loading overlay
     */
    showLoading(message = 'Processing...') {
        const overlay = document.getElementById('loading-overlay');
        const messageEl = document.getElementById('loading-message');

        if (overlay) {
            if (messageEl) {
                messageEl.textContent = message;
            }
            overlay.classList.remove('hidden');
        }
    },

    /**
     * Hide loading overlay
     */
    hideLoading() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
        }
    },

    /**
     * Update session ID display
     */
    updateSessionDisplay(sessionId) {
        const sessionElements = document.querySelectorAll('#session-id');
        sessionElements.forEach(el => {
            if (el) {
                el.textContent = sessionId ? sessionId.substr(-8) : 'Not started';
            }
        });
    },

    /**
     * Format file size
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    /**
     * Download file from blob
     */
    downloadFile(blob, filename) {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    },

    /**
     * Debounce function
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { APIClient, Utils, apiClient };
}
