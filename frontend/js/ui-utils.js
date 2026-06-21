// Utility functions for UI operations
import { API_BASE_URL } from './config.js';

export function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[character]);
}

// Show notification
export function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `fixed top-20 right-4 z-[9999] p-4 rounded-lg shadow-lg transition-all duration-300 transform translate-x-full`;
    const colors = { success: 'bg-green-500', error: 'bg-red-500', info: 'bg-blue-500' };
    notification.classList.add(colors[type] || 'bg-blue-500', 'text-white');
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.classList.remove('translate-x-full'), 10);
    setTimeout(() => {
        notification.classList.add('translate-x-full');
        setTimeout(() => document.body.removeChild(notification), 300);
    }, 3000);
}

// Handle network errors
export function handleNetworkError(error) {
    const isOffline = error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('ERR_CONNECTION_REFUSED');
    if (isOffline) {
        showBackendOfflineModal();
        return `Cannot connect to the backend at ${API_BASE_URL}.`;
    }
    return error.message;
}

/**
 * Show a rich modal popup when the backend server is not reachable.
 * Safe to call multiple times — only one modal is shown at a time.
 */
export function showBackendOfflineModal() {
    // Deduplicate
    if (document.getElementById('backend-offline-modal')) return;

    const overlay = document.createElement('div');
    overlay.id = 'backend-offline-modal';
    overlay.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:99999',
        'display:flex', 'align-items:center', 'justify-content:center',
        'background:rgba(0,0,0,0.75)', 'backdrop-filter:blur(6px)',
        'animation:fadeIn 0.2s ease',
    ].join(';');

    overlay.innerHTML = `
        <div style="
            background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);
            border:1px solid rgba(239,68,68,0.4);
            border-radius:16px;
            padding:36px 40px;
            max-width:460px;
            width:90%;
            box-shadow:0 25px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(239,68,68,0.15);
            text-align:center;
            font-family:Inter,system-ui,sans-serif;
            color:#f1f5f9;
            animation:slideUp 0.25s cubic-bezier(0.34,1.56,0.64,1);
        ">
            <div style="
                width:64px;height:64px;margin:0 auto 20px;
                background:rgba(239,68,68,0.15);
                border-radius:50%;
                display:flex;align-items:center;justify-content:center;
                border:2px solid rgba(239,68,68,0.4);
            ">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#ef4444" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
            </div>
            <h2 style="font-size:1.4rem;font-weight:700;margin-bottom:10px;color:#f87171;">Backend Not Running</h2>
            <p style="color:#94a3b8;font-size:0.92rem;line-height:1.6;margin-bottom:24px;">
                Cannot connect to the YT-DL Studio backend at
                <code style="background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;color:#e2e8f0;">localhost:5000</code>.
                Please start the server and try again.
            </p>
            <div style="background:rgba(0,0,0,0.3);border-radius:10px;padding:14px 18px;margin-bottom:24px;text-align:left;">
                <p style="color:#64748b;font-size:0.78rem;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">How to start the server</p>
                <code style="color:#4ade80;font-size:0.88rem;display:block;">npm start</code>
                <p style="color:#64748b;font-size:0.78rem;margin-top:6px;">or for development:</p>
                <code style="color:#4ade80;font-size:0.88rem;display:block;">npm run dev</code>
            </div>
            <div style="display:flex;gap:12px;justify-content:center;">
                <button id="backend-offline-retry" style="
                    background:linear-gradient(135deg,#00ff99,#00cc7a);
                    color:#000;font-weight:700;font-size:0.9rem;
                    border:none;border-radius:999px;
                    padding:10px 28px;cursor:pointer;
                    transition:opacity 0.2s;
                ">Retry Connection</button>
                <button id="backend-offline-close" style="
                    background:rgba(255,255,255,0.08);
                    color:#94a3b8;font-size:0.9rem;
                    border:1px solid rgba(255,255,255,0.15);border-radius:999px;
                    padding:10px 28px;cursor:pointer;
                    transition:background 0.2s;
                ">Dismiss</button>
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

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });

    document.body.appendChild(overlay);

    document.getElementById('backend-offline-close')?.addEventListener('click', close);
    document.getElementById('backend-offline-retry')?.addEventListener('click', async () => {
        const retryBtn = document.getElementById('backend-offline-retry');
        if (retryBtn) { retryBtn.textContent = 'Connecting...'; retryBtn.style.opacity = '0.7'; }
        try {
            const resp = await fetch(`${API_BASE_URL}/health`, { signal: AbortSignal.timeout(4000) });
            if (resp.ok) {
                close();
                showNotification('Backend connected successfully!', 'success');
            } else {
                throw new Error('Not OK');
            }
        } catch {
            if (retryBtn) { retryBtn.textContent = 'Retry Connection'; retryBtn.style.opacity = '1'; }
            showNotification('Still cannot reach backend. Is it running?', 'error');
        }
    });
}

// Handle API errors
export function handleApiError(error, context = 'API request') {
    console.error(`${context} failed:`, error);
    
    if (error.message.includes('Failed to fetch')) {
        return `Cannot connect to the backend at ${API_BASE_URL}.`;
    }
    
    if (error.status) {
        switch (error.status) {
            case 403:
                return 'Access forbidden - This content may be geo-blocked or require authentication. Try using a VPN.';
            case 404:
                return 'Content not available - The video may be private, deleted, or geo-blocked.';
            case 429:
                return 'Rate limited - Please wait a moment before trying again.';
            case 500:
                return 'Server error - Please try again in a few moments.';
            default:
                return `HTTP ${error.status}: ${error.message}`;
        }
    }
    
    return error.message || 'An unexpected error occurred';
}

// Format time duration
export function formatTime(seconds) {
    if (seconds === null || seconds === undefined || isNaN(seconds) || seconds < 0) return 'Unknown';
    
    const sec = Math.floor(seconds);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;

    // For ETA display, use appropriate format based on duration
    if (h > 0) {
        return `${h}h ${m}m`;
    } else if (m > 0) {
        return `${m}m ${s}s`;
    } else if (s > 0) {
        return `${s}s`;
    } else {
        return 'Almost done';
    }
}

// Format duration for video display
export function formatDuration(seconds) {
    if (seconds === null || isNaN(seconds) || seconds < 0) return '...';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const pad = (n) => n.toString().padStart(2, '0');

    if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
    return `${pad(m)}:${pad(s)}`;
}

// Format file size
export function formatFileSize(bytes) {
    if (!bytes || bytes === 0 || isNaN(bytes)) return '0 B';
    
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const absBytes = Math.abs(bytes);
    const i = Math.floor(Math.log(absBytes) / Math.log(1024));
    const size = (absBytes / Math.pow(1024, i));
    
    // Format based on size
    if (i < 2) {
        return `${size.toFixed(0)} ${sizes[i]}`;
    } else {
        return `${size.toFixed(2)} ${sizes[i]}`;
    }
}

// Get DOM element value
export function getValue(id) {
    return document.getElementById(id)?.value?.trim() || '';
}

// Get checkbox state
export function getChecked(id) {
    return document.getElementById(id)?.checked || false;
}

// Set checkbox state
export function setChecked(id, checked) {
    const element = document.getElementById(id);
    if (element) {
        element.checked = checked;
    }
}

// Set select value
export function setValue(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.value = value;
    }
}

// Toggle element visibility
export function toggleVisibility(element, show) {
    if (!element) return;
    if (show) {
        element.classList.remove('hidden');
    } else {
        element.classList.add('hidden');
    }
}

// Scroll element into view
export function scrollIntoView(element, behavior = 'smooth') {
    if (element) {
        element.scrollIntoView({ behavior, block: 'start' });
    }
}

// Add cinematic animation class
export function addCinematicEnter(element) {
    if (element) {
        element.classList.add('cinematic-enter');
        element.classList.remove('hidden', 'cinematic-exit');
    }
}

// Add cinematic exit animation
export function addCinematicExit(element, onComplete) {
    if (element) {
        element.classList.remove('cinematic-enter');
        element.classList.add('cinematic-exit');
        
        setTimeout(() => {
            element.classList.add('hidden');
            element.classList.remove('cinematic-exit');
            if (onComplete) onComplete();
        }, 600);
    }
}

// Setup checkbox toggle for dropdown
export function setupCheckboxToggle(checkboxId, dropdownId, callback) {
    const checkbox = document.getElementById(checkboxId);
    const dropdown = document.getElementById(dropdownId);
    if (checkbox && dropdown) {
        checkbox.addEventListener('change', () => {
            dropdown.disabled = !checkbox.checked;
            if (callback) callback();
        });
    }
}

// Add event listener with error handling
export function addEventListenerSafe(element, event, handler) {
    if (element) {
        element.addEventListener(event, (e) => {
            try {
                handler(e);
            } catch (error) {
                console.error(`Error in ${event} handler:`, error);
            }
        });
    }
}

// Debounce function
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Throttle function
export function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}
