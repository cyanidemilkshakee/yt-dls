// Utility functions for UI operations

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
    if (error.message.includes('Failed to fetch')) {
        return 'Cannot connect to backend server. Is it running on http://localhost:5000?';
    }
    return error.message;
}

// Handle API errors
export function handleApiError(error, context = 'API request') {
    console.error(`${context} failed:`, error);
    
    if (error.message.includes('Failed to fetch')) {
        return 'Cannot connect to backend server. Please ensure the backend is running on http://localhost:5000';
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
