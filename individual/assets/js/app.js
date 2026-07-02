/**
 * GBA Platform - Main Portal Application
 */

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

document.addEventListener('DOMContentLoaded', () => {
    initializePortal();
});

async function initializePortal() {
    try {
        const health = await apiClient.healthCheck();
        console.log('Backend connected:', health);
        Utils.showToast(uiT('app.connected', 'Connected to backend server'), 2000);
    } catch (error) {
        console.warn('Backend not available:', error.message);
        Utils.showToast(uiT('app.backendDown', 'Backend server not running. Start it with: python main.py'), 5000);
    }

    const sessionId = apiClient.loadSessionId();
    if (sessionId) {
        Utils.updateSessionDisplay(sessionId);
        console.log('Loaded existing session:', sessionId);
    }
}

function startNewSession() {
    const newSessionId = apiClient.generateSessionId();
    Utils.updateSessionDisplay(newSessionId);
    Utils.showToast(uiT('app.newSession', 'New session started'));
    console.log('New session:', newSessionId);
}

function loadLastSession() {
    const sessionId = apiClient.loadSessionId();
    if (sessionId) {
        Utils.updateSessionDisplay(sessionId);
        Utils.showToast(uiT('app.sessionLoaded', 'Session loaded'));
    } else {
        Utils.showToast(uiT('app.noPreviousSession', 'No previous session found'));
        startNewSession();
    }
}

function clearSessionData() {
    if (confirm(uiT('app.confirmClear', 'Are you sure you want to clear all session data?'))) {
        apiClient.clearSession();
        Utils.updateSessionDisplay('');
        Utils.showToast(uiT('app.sessionCleared', 'Session cleared'));
        console.log('Session cleared');
    }
}

async function showApiStatus() {
    try {
        Utils.showLoading(uiT('app.checkingStatus', 'Checking API status...'));
        const health = await apiClient.healthCheck();
        Utils.hideLoading();

        const sessionId = apiClient.sessionId || uiT('common.notStarted', 'Not started');
        alert(
            uiT('app.apiStatusTitle', 'API Status: OK') + '\n'
            + uiT('app.backendUrl', 'Backend URL') + ': ' + apiClient.client.defaults.baseURL + '\n'
            + uiT('app.sessionId', 'Session ID') + ': ' + sessionId + '\n'
            + uiT('app.health', 'Health') + ': ' + JSON.stringify(health)
        );
    } catch (error) {
        Utils.hideLoading();
        Utils.showToast(uiT('app.backendNotRunning', 'Backend server is not running'));
        console.error('API status check failed:', error);
    }
}

const sessionInfoBtn = document.getElementById('session-info-btn');
if (sessionInfoBtn) {
    sessionInfoBtn.addEventListener('click', () => {
        const sessionId = apiClient.sessionId;
        if (sessionId) {
            Utils.showToast(uiT('app.sessionShort', 'Session: {id}', { id: sessionId.substr(-8) }));
        } else {
            Utils.showToast(uiT('app.noActiveSession', 'No active session'));
        }
    });
}
