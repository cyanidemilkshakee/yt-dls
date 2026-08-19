import {
    SETTINGS_KEY,
    SECRET_SETTINGS_KEY,
    SECRET_SETTING_NAMES,
    getAdvancedSettings
} from './config.js';
import { 
    getSystemHealth, 
    getImpersonateTargets, 
    getApMsos 
} from './api.js';
import { 
    showNotification, 
    handleNetworkError,
    showBackendOfflineModal,
    addEventListenerSafe
} from './ui-utils.js';

// Settings management functionality

// Initialize settings manager (only if on settings page)
export function initSettingsManager() {
    // Always wire the diagnostic button (present on index page)
    setupDiagnosticButton();

    // Settings-specific initialization only when on settings page
    const settingsForm = document.getElementById('settings-form');
    if (!settingsForm) {
        console.log('Settings form not found, skipping settings-specific initialization');
        return;
    }

    setupSettingsForm();
    setupListButtons();
    loadSettings();
}

// Setup diagnostic button functionality
function setupDiagnosticButton() {
    const diagnosticBtn = document.getElementById('diagnostic-btn');
    if (!diagnosticBtn) return;

    addEventListenerSafe(diagnosticBtn, 'click', async () => {
        try {
            diagnosticBtn.disabled = true;
            diagnosticBtn.innerHTML = '🔄 Checking...';

            const health = await getSystemHealth();
            showHealthModal(health);

            if (!health.yt_dlp_available) {
                showNotification('yt-dlp not found. Please install it first.', 'error');
            } else if (!health.download_dir_writable) {
                showNotification('Download directory not writable. Check permissions.', 'error');
            } else {
                showNotification('System check passed!', 'success');
            }

        } catch (error) {
            console.error('Health check failed:', error);
            const isOffline = error.message.includes('Failed to fetch') ||
                error.message.includes('NetworkError') ||
                error.message.includes('ERR_CONNECTION_REFUSED');
            if (isOffline) {
                showBackendOfflineModal();
            } else {
                showNotification(`Health check failed: ${error.message}`, 'error');
            }
        } finally {
            diagnosticBtn.disabled = false;
            diagnosticBtn.innerHTML = '🔧 System Health';
        }
    });
}

/** Show a rich styled health status modal (replaces the old alert() call). */
function showHealthModal(health) {
    if (document.getElementById('health-status-modal')) return;

    const statusColor = health.status === 'healthy' ? '#4ade80' : health.status === 'degraded' ? '#facc15' : '#f87171';
    const statusIcon  = health.status === 'healthy' ? '✅' : health.status === 'degraded' ? '⚠️' : '❌';

    const row = (label, ok, detail = '') => `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
            <span style="font-size:1.1rem;">${ok === true ? '✅' : ok === false ? '❌' : '⚠️'}</span>
            <div style="flex:1;">
                <div style="color:#e2e8f0;font-size:0.9rem;font-weight:600;">${label}</div>
                ${detail ? `<div style="color:#64748b;font-size:0.78rem;margin-top:2px;">${detail}</div>` : ''}
            </div>
        </div>`;

    const overlay = document.createElement('div');
    overlay.id = 'health-status-modal';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);animation:fadeIn 0.2s ease';

    overlay.innerHTML = `
        <div style="
            background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);
            border:1px solid rgba(255,255,255,0.1);
            border-radius:16px;padding:32px 36px;
            max-width:480px;width:90%;
            box-shadow:0 25px 60px rgba(0,0,0,0.5);
            font-family:Inter,system-ui,sans-serif;color:#f1f5f9;
            animation:slideUp 0.25s cubic-bezier(0.34,1.56,0.64,1);
        ">
            <div style="display:flex;align-items:center;gap:14px;margin-bottom:24px;">
                <span style="font-size:1.8rem;">${statusIcon}</span>
                <div>
                    <h2 style="font-size:1.3rem;font-weight:700;margin:0;color:${statusColor};">System Health</h2>
                    <p style="margin:2px 0 0;color:#64748b;font-size:0.82rem;">${health.timestamp || new Date().toISOString()}</p>
                </div>
            </div>
            <div>
                ${row('yt-dlp', health.yt_dlp_available, health.yt_dlp_version ? `v${health.yt_dlp_version}` : (health.yt_dlp_error || 'Not found'))}
                ${row('Download Directory', health.download_dir_writable, health.download_dir || (health.download_dir_error || ''))}
                ${row('Pause / Resume', health.supports_pause_resume, health.supports_pause_resume ? 'Supported' : 'Not supported on Windows')}
                ${row('SSE (Live Updates)', health.sse_supported, `${health.sse_clients ?? 0} client(s) connected`)}
                ${row('Node.js', true, health.node_version)}
                ${row('Platform', true, health.platform)}
                ${row('Active Downloads', true, String(health.active_downloads ?? 0))}
            </div>
            <div style="margin-top:24px;text-align:center;">
                <button id="health-modal-close" style="
                    background:linear-gradient(135deg,#00ff99,#00cc7a);
                    color:#000;font-weight:700;font-size:0.9rem;
                    border:none;border-radius:999px;
                    padding:10px 32px;cursor:pointer;
                ">Close</button>
            </div>
        </div>
        <style>
            @keyframes fadeIn { from{opacity:0} to{opacity:1} }
            @keyframes slideUp { from{opacity:0;transform:translateY(20px) scale(0.96)} to{opacity:1;transform:translateY(0) scale(1)} }
        </style>
    `;

    const close = () => {
        overlay.style.animation = 'fadeIn 0.15s ease reverse';
        setTimeout(() => overlay.remove(), 150);
    };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
    document.getElementById('health-modal-close')?.addEventListener('click', close);
}

// Setup settings form functionality
function setupSettingsForm() {
    const settingsForm = document.getElementById('settings-form');
    const saveBtn = document.getElementById('save-settings-btn');

    if (!settingsForm) return;

    // Save settings function
    function saveSettings(showSuccessNotification = true) {
        const settings = {};
        const secrets = {};
        const formData = new FormData(settingsForm);

        for (const [key, value] of formData.entries()) {
            const input = settingsForm.elements[key];
            if (input.type === 'checkbox') {
                settings[key] = input.checked;
            } else if (value.trim() !== '') {
                if (SECRET_SETTING_NAMES.has(key)) secrets[key] = value;
                else settings[key] = value;
            }
        }
        
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        sessionStorage.setItem(SECRET_SETTINGS_KEY, JSON.stringify(secrets));
        if (showSuccessNotification) {
             showNotification('Settings saved automatically.', 'success');
        }
    }

    // Handle save and redirect
    function handleSaveAndRedirect(event) {
        event.preventDefault();
        
        const socketTimeoutInput = document.getElementById('socket-timeout');
        const timeoutValue = socketTimeoutInput?.value;
        
        if (socketTimeoutInput) {
            socketTimeoutInput.classList.remove('ring-2', 'ring-red-500');
        }

        if (timeoutValue && (isNaN(timeoutValue) || Number(timeoutValue) < 0)) {
            showNotification('Error: Socket Timeout must be a valid, non-negative number.', 'error');
            if (socketTimeoutInput) {
                socketTimeoutInput.classList.add('ring-2', 'ring-red-500');
                socketTimeoutInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                socketTimeoutInput.focus();
            }
            return;
        }
        
        saveSettings(false);
        showNotification('Settings saved! Redirecting now...', 'success');
        
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1500);
    }

    // Setup save button
    if (saveBtn) {
        addEventListenerSafe(saveBtn, 'click', handleSaveAndRedirect);
    }
    
    // Auto-save on input changes
    settingsForm.querySelectorAll('input, select').forEach(input => {
        addEventListenerSafe(input, 'change', () => saveSettings());
    });
}

// Setup list buttons for fetching data
function setupListButtons() {
    const listImpersonateBtn = document.getElementById('list-impersonate-btn');
    const impersonateSelect = document.getElementById('impersonate');
    const listMsoBtn = document.getElementById('list-mso-btn');
    const msoSelect = document.getElementById('ap-mso');

    // Fetch and populate function
    async function fetchAndPopulate(fetchFunction, selectElement, placeholder) {
        try {
            const data = await fetchFunction();
            const currentValue = selectElement.value;
            selectElement.innerHTML = `<option value="">${placeholder}</option>`;
            
            data.items.forEach(item => {
                const option = document.createElement('option');
                option.value = item;
                option.textContent = item;
                selectElement.appendChild(option);
            });
            
            if (data.items.includes(currentValue)) {
                selectElement.value = currentValue;
            }
            showNotification(`${placeholder} list updated.`, 'info');
        } catch (error) {
            console.error(`Error populating select:`, error);
            showNotification(handleNetworkError(error), 'error');
        }
    }

    if (listImpersonateBtn && impersonateSelect) {
        addEventListenerSafe(listImpersonateBtn, 'click', () => {
            fetchAndPopulate(getImpersonateTargets, impersonateSelect, 'None');
        });
    }

    if (listMsoBtn && msoSelect) {
        addEventListenerSafe(listMsoBtn, 'click', () => {
            fetchAndPopulate(getApMsos, msoSelect, 'None');
        });
    }
}

// Load settings from localStorage
function loadSettings() {
    const settingsForm = document.getElementById('settings-form');
    if (!settingsForm) return;

    try {
        const settings = getAdvancedSettings();

        for (const key in settings) {
            if (settingsForm.elements[key]) {
                const element = settingsForm.elements[key];
                if (element.type === 'checkbox') {
                    element.checked = settings[key];
                } else {
                    element.value = settings[key];
                }
            }
        }
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

// Get current settings
export function getSettings() {
    return getAdvancedSettings();
}

// Save a specific setting
export function saveSetting(key, value) {
    const settings = getSettings();
    settings[key] = value;
    const persistent = {};
    const secrets = {};
    for (const [name, settingValue] of Object.entries(settings)) {
        (SECRET_SETTING_NAMES.has(name) ? secrets : persistent)[name] = settingValue;
    }
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(persistent));
    sessionStorage.setItem(SECRET_SETTINGS_KEY, JSON.stringify(secrets));
}

// Clear all settings
export function clearSettings() {
    localStorage.removeItem(SETTINGS_KEY);
    sessionStorage.removeItem(SECRET_SETTINGS_KEY);
    showNotification('Settings cleared', 'info');
}
