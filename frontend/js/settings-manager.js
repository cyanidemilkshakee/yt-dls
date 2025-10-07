import { SETTINGS_KEY } from './config.js';
import { 
    getSystemHealth, 
    getImpersonateTargets, 
    getApMsos 
} from './api.js';
import { 
    showNotification, 
    handleNetworkError,
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
            
            let message = `System Health Check:\n\n`;
            message += `Status: ${health.status === 'healthy' ? '✅ Healthy' : health.status === 'degraded' ? '⚠️ Degraded' : '❌ Error'}\n`;
            if (health.status_reason) {
                message += `Reason: ${health.status_reason}\n`;
            }
            message += `Platform: ${health.platform}\n`;
            message += `Node.js: ${health.node_version}\n`;
            message += `Active Downloads: ${health.active_downloads}\n`;
            message += `yt-dlp: ${health.yt_dlp_available ? '✅ Available' : '❌ Not found'}`;
            if (health.yt_dlp_version) {
                message += ` (v${health.yt_dlp_version})`;
            }
            message += `\n`;
            if (health.yt_dlp_error) {
                message += `yt-dlp Error: ${health.yt_dlp_error}\n`;
            }
            message += `Download Directory: ${health.download_dir_writable ? '✅ Writable' : '❌ Not writable'}\n`;
            if (health.download_dir_error) {
                message += `Directory Error: ${health.download_dir_error}\n`;
            }
            message += `Pause/Resume: ${health.supports_pause_resume ? '✅ Supported' : '❌ Not supported on Windows'}`;
            message += `\nSSE: ${health.sse_supported ? '✅ Enabled' : '❌ Disabled'} (clients: ${typeof health.sse_clients === 'number' ? health.sse_clients : 'N/A'})`;
            
            alert(message);
            
            if (!health.yt_dlp_available) {
                showNotification('yt-dlp not found. Please install it first.', 'error');
            } else if (!health.download_dir_writable) {
                showNotification('Download directory not writable. Check permissions.', 'error');
            } else {
                showNotification('System check passed!', 'success');
            }
            
        } catch (error) {
            console.error('Health check failed:', error);
            showNotification('Health check failed. Is the backend running?', 'error');
        } finally {
            diagnosticBtn.disabled = false;
            diagnosticBtn.innerHTML = '🔧 System Health';
        }
    });
}

// Setup settings form functionality
function setupSettingsForm() {
    const settingsForm = document.getElementById('settings-form');
    const saveBtn = document.getElementById('save-settings-btn');

    if (!settingsForm) return;

    // Save settings function
    function saveSettings(showSuccessNotification = true) {
        const settings = {};
        const formData = new FormData(settingsForm);

        for (const [key, value] of formData.entries()) {
            const input = settingsForm.elements[key];
            if (input.type === 'checkbox') {
                settings[key] = input.checked;
            } else if (value.trim() !== '') {
                settings[key] = value;
            }
        }
        
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
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

    const savedSettings = localStorage.getItem(SETTINGS_KEY);
    if (!savedSettings) return;

    try {
        const settings = JSON.parse(savedSettings);

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
    const savedSettings = localStorage.getItem(SETTINGS_KEY);
    if (!savedSettings) return {};
    
    try {
        return JSON.parse(savedSettings);
    } catch (error) {
        console.error('Error parsing settings:', error);
        return {};
    }
}

// Save a specific setting
export function saveSetting(key, value) {
    const settings = getSettings();
    settings[key] = value;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// Clear all settings
export function clearSettings() {
    localStorage.removeItem(SETTINGS_KEY);
    showNotification('Settings cleared', 'info');
}
