import { API_BASE_URL, state, platformInfo } from './config.js';
import { 
    updateDownloadStatus, 
    getDownloadLog, 
    cancelDownload, 
    removeDownload, 
    pauseResumeDownload,
    getAllDownloads
} from './api.js';
import { 
    showNotification, 
    handleNetworkError, 
    formatFileSize, 
    formatTime,
    addEventListenerSafe
} from './ui-utils.js';

// Download management functionality
let sseConnection = null;
const activeDownloadPolling = new Map();

// SSE reconnect/backoff controls
let sseReconnectAttempts = 0;
const SSE_MAX_RECONNECT_ATTEMPTS = 5;
const SSE_MAX_BACKOFF_MS = 15000; // cap backoff at 15s

// Initialize download manager
export function initDownloadManager() {
    initSSE();
    setupDownloadControls();
    restoreExistingDownloads();
}

// Initialize SSE connection for real-time updates
function initSSE() {
    if (typeof EventSource === 'undefined') {
        console.warn('SSE not supported, falling back to polling');
        // Notify UI that we're using polling
        try {
            document.dispatchEvent(new CustomEvent('conn:mode', { detail: { mode: 'polling' } }));
        } catch (_) {}
        return false;
    }

    return openSSE();
}

// Open SSE connection with handlers
function openSSE() {
    try {
        if (sseConnection) return true; // already open
        sseConnection = new EventSource(`${API_BASE_URL}/downloads/events`);

        sseConnection.onopen = () => {
            console.log('SSE connected for real-time updates');
            sseReconnectAttempts = 0;
            // Stop polling now that SSE is healthy again
            stopAllPolling();
            // Notify UI we are on SSE
            try {
                document.dispatchEvent(new CustomEvent('conn:mode', { detail: { mode: 'sse' } }));
            } catch (_) {}
        };

        sseConnection.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                console.log('SSE message received:', message); // Debug log
                if (message.type === 'progress' && message.downloadId) {
                    const downloadItem = document.getElementById(`download-${message.downloadId}`);
                    if (downloadItem) {
                        console.log('Updating UI for download:', message.downloadId, 'with data:', message.data); // Debug log
                        updateDownloadUI(downloadItem, message.data);
                    }
                }
            } catch (error) {
                console.warn('Failed to parse SSE message:', error);
            }
        };

        sseConnection.onerror = (error) => {
            console.warn('SSE error:', error);
            if (sseConnection) {
                try { sseConnection.close(); } catch (_) {}
            }
            sseConnection = null;
            // Immediately ensure updates continue via polling
            startPollingAllActive();
            // Notify UI we fell back to polling
            try {
                document.dispatchEvent(new CustomEvent('conn:mode', { detail: { mode: 'polling' } }));
            } catch (_) {}
            scheduleSseReconnect();
        };
        return true;
    } catch (error) {
        console.warn('Failed to initialize SSE:', error);
        // fallback to polling
        startPollingAllActive();
        try {
            document.dispatchEvent(new CustomEvent('conn:mode', { detail: { mode: 'polling' } }));
        } catch (_) {}
        return false;
    }
}

function scheduleSseReconnect() {
    if (sseReconnectAttempts >= SSE_MAX_RECONNECT_ATTEMPTS) {
        console.warn('SSE disabled after max retries; continuing with polling');
        return;
    }
    const delay = Math.min(1000 * Math.pow(2, sseReconnectAttempts), SSE_MAX_BACKOFF_MS);
    sseReconnectAttempts += 1;
    console.log(`Attempting SSE reconnect in ${delay}ms (attempt ${sseReconnectAttempts}/${SSE_MAX_RECONNECT_ATTEMPTS})`);
    setTimeout(() => {
        openSSE();
    }, delay);
}

// Setup download section controls
function setupDownloadControls() {
    const showDownloadsBtn = document.getElementById('show-downloads-btn');
    const downloadsSection = document.getElementById('downloads-section');
    const clearCompletedBtn = document.getElementById('clear-completed-btn');

    if (showDownloadsBtn && downloadsSection) {
        showDownloadsBtn.addEventListener('click', () => {
            downloadsSection.classList.toggle('hidden');
            if (!downloadsSection.classList.contains('hidden')) {
                downloadsSection.scrollIntoView({ behavior: 'smooth' });
            }
        });
    }

    if (clearCompletedBtn) {
        clearCompletedBtn.addEventListener('click', clearCompletedDownloads);
    }
}

// Restore existing downloads on page load
async function restoreExistingDownloads() {
    console.log("Checking for existing downloads...");
    
    try {
        const data = await getAllDownloads();
        if (data.downloads && data.downloads.length > 0) {
            const clearCompletedBtn = document.getElementById('clear-completed-btn');
            if (clearCompletedBtn) {
                clearCompletedBtn.classList.remove('hidden');
            }
            
            data.downloads.sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
            data.downloads.forEach(d => {
                addDownload({ 
                    title: d.filename || d.url, 
                    thumbnail: '', 
                    downloadId: d.download_id 
                });
            });
            showNotification(`Restored ${data.downloads.length} active download(s).`, 'info');
        }
    } catch (error) {
        console.error("Failed to restore downloads:", error);
    }
}

// Update download UI (used by both SSE and polling)
export function updateDownloadUI(downloadItem, data) {
    console.log('updateDownloadUI called with data:', data); // Debug log
    
    // Get DOM elements
    const statusText = downloadItem.querySelector('.status-text');
    const singleProgressBar = downloadItem.querySelector('.progress-bar');
    const singleProgressText = downloadItem.querySelector('.progress-text');
    const speedText = downloadItem.querySelector('.speed-text');
    const etaText = downloadItem.querySelector('.eta-text');
    const sizeText = downloadItem.querySelector('.size-text');
    const pauseResumeBtn = downloadItem.querySelector('.pause-resume-btn');
    const cancelBtn = downloadItem.querySelector('.cancel-btn');
    const removeBtn = downloadItem.querySelector('.remove-btn');
    const downloadLogBtn = downloadItem.querySelector('.download-log-btn');
    const pauseIcon = downloadItem.querySelector('.pause-icon');
    const playIcon = downloadItem.querySelector('.play-icon');

    // Safely get numeric progress with bounds checking
    const getProgress = (value) => {
        if (value === undefined || value === null || isNaN(value)) return 0;
        return Math.max(0, Math.min(100, Number(value)));
    };

    // Single progress bar update (aggregate)
    const pct = getProgress(data.progress);
    console.log('Calculated progress percentage:', pct); // Debug log
    
    if (singleProgressBar) singleProgressBar.style.width = `${pct}%`;
    if (singleProgressText) singleProgressText.textContent = `${pct.toFixed(1)}%`;

    // Update file size information with better formatting
    const downloadedBytes = Number(data.downloaded_bytes) || 0;
    const totalBytes = Number(data.total_bytes) || 0;
    
    if (sizeText) {
        if (totalBytes > 0) {
            const downloadedStr = formatFileSize(downloadedBytes);
            const totalStr = formatFileSize(totalBytes);
            sizeText.textContent = `${downloadedStr} / ${totalStr}`;
        } else if (downloadedBytes > 0) {
            sizeText.textContent = `${formatFileSize(downloadedBytes)} / Unknown`;
        } else {
            sizeText.textContent = 'Preparing...';
        }
    }

    const isTerminalState = ['completed', 'failed', 'cancelled'].includes(data.status);
        
    if (isTerminalState) {
        const downloadId = downloadItem.dataset.downloadId;
        if (downloadId) {
            stopPolling(downloadId);
        }
        pauseResumeBtn.classList.add('hidden');
        cancelBtn.classList.add('hidden');
        removeBtn.classList.remove('hidden');
        downloadLogBtn.classList.remove('hidden');
        
        if (data.status === 'completed') {
            if (singleProgressBar) singleProgressBar.style.width = '100%';
            if (singleProgressText) singleProgressText.textContent = '100%';
        }
    } else {
        pauseResumeBtn.classList.remove('hidden');
        cancelBtn.classList.remove('hidden');
        removeBtn.classList.add('hidden');
        downloadLogBtn.classList.add('hidden');
    }

    // Update progress bar colors and status display
    const progressBars = [singleProgressBar].filter(Boolean);
    progressBars.forEach(bar => {
        bar.classList.remove('bg-red-500', 'bg-yellow-500', 'bg-green-400', 'bg-white', 'bg-black');
        if (data.status === 'paused') {
            bar.classList.add(document.documentElement.classList.contains('dark') ? 'bg-white' : 'bg-black');
        } else if (data.status === 'failed' || data.status === 'cancelled') {
            bar.classList.add('bg-red-500');
        } else if (data.status === 'completed') {
            bar.classList.add('bg-green-400');
        } else {
            bar.classList.add('bg-green-400');
        }
    });

    // Update status, speed, and ETA with improved handling
    switch (data.status) {
        case 'downloading':
            statusText.innerHTML = `<span class="font-semibold text-blue-400">Downloading...</span>`;
            
            const speed = Number(data.speed) || 0;
            if (speedText) {
                if (speed > 0) {
                    speedText.textContent = `${formatFileSize(speed)}/s`;
                    speedText.style.visibility = 'visible';
                } else {
                    speedText.textContent = 'Calculating...';
                    speedText.style.visibility = 'visible';
                }
            }
            
            const eta = Number(data.eta) || 0;
            if (etaText) {
                if (eta > 0) {
                    etaText.textContent = `${formatTime(eta)} remaining`;
                    etaText.style.visibility = 'visible';
                } else {
                    etaText.textContent = 'Calculating time...';
                    etaText.style.visibility = 'visible';
                }
            }
            
            if (pauseIcon) pauseIcon.classList.remove('hidden');
            if (playIcon) playIcon.classList.add('hidden');
            pauseResumeBtn.disabled = false;
            break;
            
        case 'processing':
            statusText.innerHTML = `<span class="font-semibold text-cyan-400">Processing...</span>`;
            if (speedText) speedText.style.visibility = 'hidden';
            if (etaText) etaText.style.visibility = 'hidden';
            pauseResumeBtn.disabled = true;
            break;
            
        case 'completed':
            statusText.innerHTML = `<span class="font-semibold text-green-400">Completed</span>`;
            if (speedText) speedText.style.visibility = 'hidden';
            if (etaText) etaText.style.visibility = 'hidden';
            if (totalBytes > 0 && sizeText) {
                sizeText.textContent = formatFileSize(totalBytes);
            }
            break;
            
        case 'failed':
            const errorMsg = data.error || 'Unknown error';
            statusText.innerHTML = `<span class="font-semibold text-red-400">Failed: ${errorMsg}</span>`;
            if (speedText) speedText.style.visibility = 'hidden';
            if (etaText) etaText.style.visibility = 'hidden';
            break;
            
        case 'cancelled':
            statusText.innerHTML = `<span class="font-semibold text-red-400">Cancelled</span>`;
            if (speedText) speedText.style.visibility = 'hidden';
            if (etaText) etaText.style.visibility = 'hidden';
            cancelBtn.classList.add('hidden');
            pauseResumeBtn.disabled = true;
            break;
            
        case 'paused':
            statusText.innerHTML = `<span class="font-semibold text-yellow-400">Paused</span>`;
            if (speedText) speedText.style.visibility = 'hidden';
            if (etaText) etaText.style.visibility = 'hidden';
            if (pauseIcon) pauseIcon.classList.add('hidden');
            if (playIcon) playIcon.classList.remove('hidden');
            pauseResumeBtn.disabled = false;
            break;
            
        default:
            statusText.innerHTML = `<span class="font-semibold">${data.status}...</span>`;
            if (speedText) speedText.style.visibility = 'visible';
            if (etaText) etaText.style.visibility = 'visible';
            pauseResumeBtn.disabled = true;
    }
}

// Stop polling for a download
function stopPolling(downloadId) {
    if (activeDownloadPolling.has(downloadId)) {
        clearInterval(activeDownloadPolling.get(downloadId));
        activeDownloadPolling.delete(downloadId);
        console.log(`Stopped polling for download: ${downloadId}`);
    }
}

// Update download status via polling
async function updateDownloadStatusPolling(downloadId, downloadItem) {
    try {
        const data = await updateDownloadStatus(downloadId);
        if (!data) {
            console.warn(`Download ${downloadId} not found, stopping polling`);
            stopPolling(downloadId);
            return;
        }
        
        updateDownloadUI(downloadItem, data);

        // Update live log if visible
        const logContainer = downloadItem.querySelector('.log-container');
        if (!logContainer.classList.contains('hidden')) {
            try {
                const logData = await getDownloadLog(downloadId);
                if (logData.log && logData.log.length > 0) {
                    const logContent = downloadItem.querySelector('.log-content');
                    logContent.textContent = logData.log.slice(-100).join('\n');
                    logContainer.scrollTop = logContainer.scrollHeight;
                }
            } catch (logError) {
                console.warn(`Failed to update log for ${downloadId}:`, logError);
            }
        }

    } catch (error) {
        console.error(`Error updating status for ${downloadId}:`, error);
        const retryCount = downloadItem.dataset.retryCount || 0;
        if (retryCount > 5) {
            console.warn(`Stopping polling for ${downloadId} due to repeated errors`);
            stopPolling(downloadId);
        } else {
            downloadItem.dataset.retryCount = parseInt(retryCount) + 1;
        }
    }
}

// Add a new download to the UI
export function addDownload(options) {
    const downloadItemTemplate = document.getElementById('download-item-template');
    const downloadsContainer = document.getElementById('downloads-container');
    
    if (!downloadItemTemplate || !downloadsContainer) {
        console.error('Download template or container not found');
        return;
    }

    const clone = downloadItemTemplate.cloneNode(true);
    clone.id = `download-${options.downloadId}`;
    clone.style.display = 'flex';
    clone.dataset.downloadId = options.downloadId;
    clone.dataset.retryCount = '0';
    
    clone.querySelector('h3').textContent = options.title || `Download`;
    clone.querySelector('img').src = options.thumbnail || `https://placehold.co/128x72/1a1a1a/e5e5e5?text=...`;
    
    // Hide pause/resume button on Windows if not supported
    const pauseResumeBtn = clone.querySelector('.pause-resume-btn');
    if (!platformInfo.supports_pause_resume) {
        pauseResumeBtn.style.display = 'none';
    }
    
    downloadsContainer.prepend(clone);
    
    setTimeout(() => {
        clone.classList.remove('opacity-0', 'translate-y-4');
        clone.classList.add('opacity-100', 'translate-y-0');
    }, 10);

    setupDownloadItemEvents(clone, options);

    clone.querySelector('.status-text').innerHTML = `<span class="font-semibold text-blue-400">Initializing...</span>`;
    
    // Always start polling immediately; SSE (if connected) will stop polling globally on open
    startPollingForDownload(options.downloadId, clone);
}

// Start polling for a given download if not already polling
function startPollingForDownload(downloadId, downloadItem) {
    if (activeDownloadPolling.has(downloadId)) return;
    const statusInterval = setInterval(() => updateDownloadStatusPolling(downloadId, downloadItem), 2000);
    activeDownloadPolling.set(downloadId, statusInterval);
    console.log(`Using polling for download ${downloadId}`);
}

// Start polling for all active downloads in the DOM
function startPollingAllActive() {
    const items = document.querySelectorAll('#downloads-container > div[id^="download-"]');
    let startedAny = false;
    items.forEach((item) => {
        const downloadId = item.dataset.downloadId;
        if (downloadId && !activeDownloadPolling.has(downloadId)) {
            startPollingForDownload(downloadId, item);
            startedAny = true;
        }
    });
    if (startedAny) {
        try {
            document.dispatchEvent(new CustomEvent('conn:mode', { detail: { mode: 'polling' } }));
        } catch (_) {}
    }
}

// Stop all polling intervals
function stopAllPolling() {
    activeDownloadPolling.forEach((interval, id) => {
        clearInterval(interval);
    });
    activeDownloadPolling.clear();
}

// Setup event listeners for download item
function setupDownloadItemEvents(clone, options) {
    // Cancel button event listener
    addEventListenerSafe(clone.querySelector('.cancel-btn'), 'click', async (e) => {
        const cancelBtn = e.currentTarget;
        const statusText = clone.querySelector('.status-text');
        
        try {
            cancelBtn.disabled = true;
            statusText.innerHTML = `<span class="font-semibold text-yellow-400">Cancelling...</span>`;
            
            await cancelDownload(options.downloadId);
            showNotification('Download cancelled', 'info');
            statusText.innerHTML = `<span class="font-semibold text-yellow-400">Cancelled</span>`;
            cancelBtn.style.display = 'none';
    } catch (error) {
            showNotification(`Cancel failed: ${error.message}`, 'error');
            cancelBtn.disabled = false;
            statusText.innerHTML = `<span class="font-semibold text-blue-400">Downloading...</span>`;
        }
    });

    // Remove button event listener  
    addEventListenerSafe(clone.querySelector('.remove-btn'), 'click', async () => {
        try {
            stopPolling(options.downloadId);
            await removeDownload(options.downloadId);
            clone.classList.add('opacity-0', 'scale-95');
            setTimeout(() => clone.remove(), 300);
        } catch (error) {
            console.warn('Remove request failed:', error);
            clone.classList.add('opacity-0', 'scale-95');
            setTimeout(() => clone.remove(), 300);
        }
    });

    // Pause/Resume button event listener
    addEventListenerSafe(clone.querySelector('.pause-resume-btn'), 'click', async (e) => {
        const btn = e.currentTarget;
        const statusText = clone.querySelector('.status-text');
        const pauseIcon = btn.querySelector('.pause-icon');
        const playIcon = btn.querySelector('.play-icon');
        
        const isCurrentlyPaused = !playIcon.classList.contains('hidden');
        const action = isCurrentlyPaused ? 'resume' : 'pause';
        
        btn.disabled = true;
        statusText.innerHTML = `<span class="font-semibold text-yellow-400">${action === 'pause' ? 'Pausing' : 'Resuming'}...</span>`;
        
        try {
            await pauseResumeDownload(options.downloadId, action);
            showNotification(`Download ${action}d`, 'success');
        } catch (error) {
            if (error.message.includes('WINDOWS_UNSUPPORTED')) {
                showNotification('Pause/Resume is not supported on Windows. Use Cancel instead.', 'info');
            } else {
                showNotification(`Failed to ${action}: ${error.message}`, 'error');
            }
            
            btn.disabled = false;
            if (isCurrentlyPaused) {
                pauseIcon.classList.add('hidden');
                playIcon.classList.remove('hidden');
            } else {
                pauseIcon.classList.remove('hidden');
                playIcon.classList.add('hidden');
            }
        }
        
        setTimeout(() => {
            btn.disabled = false;
        }, 1000);
    });
    
    // Log button functionality
    const logContainer = clone.querySelector('.log-container');
    const logContent = clone.querySelector('.log-content');
    addEventListenerSafe(clone.querySelector('.log-btn'), 'click', async () => {
        const isHidden = logContainer.classList.contains('hidden');
        if (isHidden) {
            try {
                logContent.textContent = 'Loading log...';
                logContainer.classList.remove('hidden');
                const data = await getDownloadLog(options.downloadId);
                if (data.log && data.log.length > 0) {
                    logContent.textContent = data.log.join('\n');
                } else {
                    logContent.textContent = 'No log data available.';
                }
                logContainer.scrollTop = logContainer.scrollHeight;
            } catch (err) {
                logContent.textContent = 'Failed to load log.';
            }
        } else {
            logContainer.classList.add('hidden');
        }
    });
    
    // Download log button functionality
    addEventListenerSafe(clone.querySelector('.download-log-btn'), 'click', async () => {
        try {
            const data = await getDownloadLog(options.downloadId);
            if (data.log && data.log.length > 0) {
                const logText = data.log.join('\n');
                const blob = new Blob([logText], { type: 'text/plain' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${options.downloadId}_log.txt`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                showNotification('Log downloaded successfully!', 'success');
            } else {
                showNotification('No log data available', 'info');
            }
        } catch (error) {
            console.error('Failed to download log:', error);
            showNotification('Failed to download log', 'error');
        }
    });
}

// Clear completed downloads
function clearCompletedDownloads() {
    let clearedCount = 0;
    document.querySelectorAll('#downloads-container > div[id^="download-"]').forEach(item => {
        const statusText = item.querySelector('.status-text')?.textContent.toLowerCase() || '';
        if (statusText.includes('completed') || statusText.includes('failed') || statusText.includes('cancelled')) {
            const removeBtn = item.querySelector('.remove-btn');
            if (removeBtn && !removeBtn.classList.contains('hidden')) {
                removeBtn.click();
                clearedCount++;
            }
        }
    });
    showNotification(clearedCount > 0 ? `Cleared ${clearedCount} finished downloads.` : 'No completed downloads to clear.', 'info');
}

// Cleanup on page unload
export function cleanup() {
    activeDownloadPolling.forEach(interval => clearInterval(interval));
    if (sseConnection) {
        sseConnection.close();
    }
}

// Get active polling count
export function getActivePollingCount() {
    return activeDownloadPolling.size;
}
