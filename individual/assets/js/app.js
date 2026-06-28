/**
 * GBA Platform - Main Portal Application
 */

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializePortal();
});

async function initializePortal() {
    // Check API connection
    try {
        const health = await apiClient.healthCheck();
        console.log('Backend connected:', health);
        Utils.showToast('Connected to backend server', 2000);
    } catch (error) {
        console.warn('Backend not available:', error.message);
        Utils.showToast('Backend server not running. Start it with: python main.py', 5000);
    }

    // Load existing session if available
    const sessionId = apiClient.loadSessionId();
    if (sessionId) {
        Utils.updateSessionDisplay(sessionId);
        console.log('Loaded existing session:', sessionId);
    }
}

/**
 * Start a new session
 */
function startNewSession() {
    const newSessionId = apiClient.generateSessionId();
    Utils.updateSessionDisplay(newSessionId);
    Utils.showToast('New session started');
    console.log('New session:', newSessionId);
}

/**
 * Load last session from localStorage
 */
function loadLastSession() {
    const sessionId = apiClient.loadSessionId();
    if (sessionId) {
        Utils.updateSessionDisplay(sessionId);
        Utils.showToast('Session loaded');
    } else {
        Utils.showToast('No previous session found');
        startNewSession();
    }
}

/**
 * Clear all session data
 */
function clearSessionData() {
    if (confirm('Are you sure you want to clear all session data?')) {
        apiClient.clearSession();
        Utils.updateSessionDisplay('');
        Utils.showToast('Session cleared');
        console.log('Session cleared');
    }
}

/**
 * Show API status information
 */
async function showApiStatus() {
    try {
        Utils.showLoading('Checking API status...');
        const health = await apiClient.healthCheck();
        Utils.hideLoading();

        const sessionId = apiClient.sessionId || 'Not active';
        alert(`API Status: OK\nBackend URL: ${apiClient.client.defaults.baseURL}\nSession ID: ${sessionId}\nHealth: ${JSON.stringify(health)}`);
    } catch (error) {
        Utils.hideLoading();
        Utils.showToast('Backend server is not running');
        console.error('API status check failed:', error);
    }
}

// Session info button handler
const sessionInfoBtn = document.getElementById('session-info-btn');
if (sessionInfoBtn) {
    sessionInfoBtn.addEventListener('click', () => {
        const sessionId = apiClient.sessionId;
        if (sessionId) {
            Utils.showToast(`Session: ${sessionId.substr(-8)}`);
        } else {
            Utils.showToast('No active session');
        }
    });
}
