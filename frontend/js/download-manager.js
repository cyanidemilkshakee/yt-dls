/**
 * download-manager.js
 *
 * Optimisations applied:
 *  1. DOM element cache — all child element references are stored in a Map
 *     keyed by downloadId on creation. updateDownloadUI() receives a pre-built
 *     ref object instead of calling .querySelector() on every SSE/poll event.
 *     Eliminates ~20 DOM queries per progress update.
 *
 *  2. Single shared batch polling interval — one setInterval calls batchStatus()
 *     for ALL active download IDs in a single HTTP request (1 req/2s instead
 *     of N req/2s).  SSE arriving pauses the interval; SSE error restarts it.
 *
 *  3. data-status attribute — clearCompletedDownloads compares a DOM attribute
 *     instead of parsing textContent strings.
 *
 *  4. SSE + polling coexistence — when SSE reconnects, polling is suspended
 *     immediately so there is never double-updating.
 */

import { API_BASE_URL, state, platformInfo } from './config.js';
import {
    updateDownloadStatus,
    getDownloadLog,
    cancelDownload,
    removeDownload,
    pauseResumeDownload,
    getAllDownloads,
    batchStatus,
} from './api.js';
import {
    showNotification,
    handleNetworkError,
    formatFileSize,
    formatTime,
    addEventListenerSafe,
} from './ui-utils.js';

// ─── Module state ─────────────────────────────────────────────────────────────

let sseConnection        = null;
let sseReconnectAttempts = 0;
const SSE_MAX_RECONNECT_ATTEMPTS = 5;
const SSE_MAX_BACKOFF_MS         = 15_000;

// Shared batch polling
let _batchPollInterval  = null;
const BATCH_POLL_MS     = 2000;

// Set of downloadIds currently tracked (used by batch polling)
const _activeIds = new Set();

// DOM element cache: Map<downloadId, RefObject>
const _domCache = new Map();

// ─── Public init ──────────────────────────────────────────────────────────────

export function initDownloadManager() {
    initSSE();
    setupDownloadControls();
    restoreExistingDownloads();
}

// ─── SSE ──────────────────────────────────────────────────────────────────────

function initSSE() {
    if (typeof EventSource === 'undefined') {
        console.warn('SSE not supported, falling back to batch polling');
        _dispatchConnMode('polling');
        return false;
    }
    return openSSE();
}

function openSSE() {
    try {
        if (sseConnection) return true;
        sseConnection = new EventSource(`${API_BASE_URL}/downloads/events`);

        sseConnection.onopen = () => {
            console.log('SSE connected');
            sseReconnectAttempts = 0;
            _stopBatchPoll();        // SSE is healthy — stop polling
            _dispatchConnMode('sse');
        };

        sseConnection.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'progress' && message.downloadId) {
                    const refs = _domCache.get(message.downloadId);
                    if (refs) updateDownloadUI(refs, message.data);
                }
            } catch (err) {
                console.warn('Failed to parse SSE message:', err);
            }
        };

        sseConnection.onerror = () => {
            console.warn('SSE error — falling back to batch polling');
            try { sseConnection.close(); } catch (_) {}
            sseConnection = null;
            _startBatchPoll();
            _dispatchConnMode('polling');
            _scheduleSseReconnect();
        };

        return true;
    } catch (err) {
        console.warn('Failed to initialise SSE:', err);
        _startBatchPoll();
        _dispatchConnMode('polling');
        return false;
    }
}

function _scheduleSseReconnect() {
    if (sseReconnectAttempts >= SSE_MAX_RECONNECT_ATTEMPTS) {
        console.warn('SSE disabled after max retries; continuing with batch polling');
        return;
    }
    const delay = Math.min(1000 * Math.pow(2, sseReconnectAttempts), SSE_MAX_BACKOFF_MS);
    sseReconnectAttempts += 1;
    console.log(`SSE reconnect attempt ${sseReconnectAttempts} in ${delay}ms`);
    setTimeout(openSSE, delay);
}

function _dispatchConnMode(mode) {
    try { document.dispatchEvent(new CustomEvent('conn:mode', { detail: { mode } })); } catch (_) {}
}

// ─── Batch polling (single interval for ALL downloads) ───────────────────────

function _startBatchPoll() {
    if (_batchPollInterval) return;
    _batchPollInterval = setInterval(_runBatchPoll, BATCH_POLL_MS);
    console.log('Batch polling started');
}

function _stopBatchPoll() {
    if (_batchPollInterval) {
        clearInterval(_batchPollInterval);
        _batchPollInterval = null;
        console.log('Batch polling stopped');
    }
}

async function _runBatchPoll() {
    if (_activeIds.size === 0) return;
    try {
        const statuses = await batchStatus([..._activeIds]);
        for (const [downloadId, data] of statuses.entries()) {
            if (!data) {
                // Server no longer knows about this download
                _activeIds.delete(downloadId);
                continue;
            }
            const refs = _domCache.get(downloadId);
            if (refs) updateDownloadUI(refs, data);
        }
    } catch (err) {
        console.error('Batch poll error:', err);
    }
}

// ─── Controls setup ───────────────────────────────────────────────────────────

function setupDownloadControls() {
    const showDownloadsBtn  = document.getElementById('show-downloads-btn');
    const downloadsSection  = document.getElementById('downloads-section');
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

// ─── Restore existing downloads on page load ──────────────────────────────────

async function restoreExistingDownloads() {
    try {
        const data = await getAllDownloads();
        if (data.downloads && data.downloads.length > 0) {
            const clearCompletedBtn = document.getElementById('clear-completed-btn');
            if (clearCompletedBtn) clearCompletedBtn.classList.remove('hidden');

            data.downloads.sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
            data.downloads.forEach((d) => {
                addDownload({
                    title:      d.filename || d.url,
                    thumbnail:  '',
                    downloadId: d.download_id,
                });
            });
            showNotification(`Restored ${data.downloads.length} download(s).`, 'info');
        }
    } catch (err) {
        console.error('Failed to restore downloads:', err);
    }
}

// ─── Add a download item to the UI ───────────────────────────────────────────

export function addDownload(options) {
    const downloadItemTemplate = document.getElementById('download-item-template');
    const downloadsContainer   = document.getElementById('downloads-container');
    if (!downloadItemTemplate || !downloadsContainer) {
        console.error('Download template or container not found');
        return;
    }

    const clone = downloadItemTemplate.cloneNode(true);
    clone.id              = `download-${options.downloadId}`;
    clone.style.display   = 'flex';
    clone.dataset.downloadId = options.downloadId;
    clone.dataset.status     = 'initializing';  // ← data-status attribute

    clone.querySelector('h3').textContent  = options.title || 'Download';
    clone.querySelector('img').src         = options.thumbnail || 'https://placehold.co/128x72/1a1a1a/e5e5e5?text=...';

    const pauseResumeBtn = clone.querySelector('.pause-resume-btn');
    if (!platformInfo.supports_pause_resume) {
        pauseResumeBtn.style.display = 'none';
    }

    downloadsContainer.prepend(clone);

    // Build DOM ref cache — do this once, never again for this download
    const refs = {
        el:             clone,
        statusText:     clone.querySelector('.status-text'),
        progressBar:    clone.querySelector('.progress-bar'),
        progressText:   clone.querySelector('.progress-text'),
        speedText:      clone.querySelector('.speed-text'),
        etaText:        clone.querySelector('.eta-text'),
        sizeText:       clone.querySelector('.size-text'),
        pauseResumeBtn: clone.querySelector('.pause-resume-btn'),
        cancelBtn:      clone.querySelector('.cancel-btn'),
        removeBtn:      clone.querySelector('.remove-btn'),
        downloadLogBtn: clone.querySelector('.download-log-btn'),
        pauseIcon:      clone.querySelector('.pause-icon'),
        playIcon:       clone.querySelector('.play-icon'),
        logContainer:   clone.querySelector('.log-container'),
        logContent:     clone.querySelector('.log-content'),
    };
    _domCache.set(options.downloadId, refs);
    _activeIds.add(options.downloadId);

    // Animate in
    setTimeout(() => {
        clone.classList.remove('opacity-0', 'translate-y-4');
        clone.classList.add('opacity-100', 'translate-y-0');
    }, 10);

    setupDownloadItemEvents(refs, options);

    refs.statusText.innerHTML = `<span class="font-semibold text-blue-400">Initializing...</span>`;

    // Start batch polling if SSE is not connected
    if (!sseConnection) _startBatchPoll();
}

// ─── Update download UI from a data object (refs pre-cached) ─────────────────

export function updateDownloadUI(refs, data) {
    const { el, statusText, progressBar, progressText, speedText, etaText,
            sizeText, pauseResumeBtn, cancelBtn, removeBtn, downloadLogBtn,
            pauseIcon, playIcon } = refs;

    // Update data-status attribute
    el.dataset.status = data.status || 'unknown';

    const clamp = (v) => {
        if (v === undefined || v === null || isNaN(v)) return 0;
        return Math.max(0, Math.min(100, Number(v)));
    };

    const pct = clamp(data.progress);
    if (progressBar)  progressBar.style.width = `${pct}%`;
    if (progressText) progressText.textContent = `${pct.toFixed(1)}%`;

    // File size
    const downloadedBytes = Number(data.downloaded_bytes) || 0;
    const totalBytes      = Number(data.total_bytes)      || 0;
    if (sizeText) {
        if (totalBytes > 0) {
            sizeText.textContent = `${formatFileSize(downloadedBytes)} / ${formatFileSize(totalBytes)}`;
        } else if (downloadedBytes > 0) {
            sizeText.textContent = `${formatFileSize(downloadedBytes)} / Unknown`;
        } else {
            sizeText.textContent = 'Preparing...';
        }
    }

    // Terminal state handling
    const isTerminal = ['completed', 'failed', 'cancelled'].includes(data.status);
    if (isTerminal) {
        const downloadId = el.dataset.downloadId;
        if (downloadId) {
            _activeIds.delete(downloadId); // stop batch polling — refs stay in cache for log view
        }
        pauseResumeBtn?.classList.add('hidden');
        cancelBtn?.classList.add('hidden');
        removeBtn?.classList.remove('hidden');
        downloadLogBtn?.classList.remove('hidden');
        if (data.status === 'completed') {
            if (progressBar)  progressBar.style.width = '100%';
            if (progressText) progressText.textContent = '100%';
        }
    } else {
        pauseResumeBtn?.classList.remove('hidden');
        cancelBtn?.classList.remove('hidden');
        removeBtn?.classList.add('hidden');
        downloadLogBtn?.classList.add('hidden');
    }

    // Progress bar colour
    if (progressBar) {
        progressBar.classList.remove('bg-red-500', 'bg-yellow-500', 'bg-green-400', 'bg-white', 'bg-black');
        if (data.status === 'paused') {
            progressBar.classList.add(document.documentElement.classList.contains('dark') ? 'bg-white' : 'bg-black');
        } else if (data.status === 'failed' || data.status === 'cancelled') {
            progressBar.classList.add('bg-red-500');
        } else {
            progressBar.classList.add('bg-green-400');
        }
    }

    // Status text / speed / ETA
    switch (data.status) {
        case 'downloading': {
            statusText.innerHTML = `<span class="font-semibold text-blue-400">Downloading...</span>`;
            const speed = Number(data.speed) || 0;
            if (speedText) {
                speedText.textContent  = speed > 0 ? `${formatFileSize(speed)}/s` : 'Calculating...';
                speedText.style.visibility = 'visible';
            }
            const eta = Number(data.eta) || 0;
            if (etaText) {
                etaText.textContent    = eta > 0 ? `${formatTime(eta)} remaining` : 'Calculating time...';
                etaText.style.visibility = 'visible';
            }
            if (pauseIcon) pauseIcon.classList.remove('hidden');
            if (playIcon)  playIcon.classList.add('hidden');
            if (pauseResumeBtn) pauseResumeBtn.disabled = false;
            break;
        }
        case 'processing':
            statusText.innerHTML = `<span class="font-semibold text-cyan-400">Processing...</span>`;
            if (speedText) speedText.style.visibility = 'hidden';
            if (etaText)   etaText.style.visibility   = 'hidden';
            if (pauseResumeBtn) pauseResumeBtn.disabled = true;
            break;
        case 'completed':
            statusText.innerHTML = `<span class="font-semibold text-green-400">Completed</span>`;
            if (speedText) speedText.style.visibility = 'hidden';
            if (etaText)   etaText.style.visibility   = 'hidden';
            if (totalBytes > 0 && sizeText) sizeText.textContent = formatFileSize(totalBytes);
            break;
        case 'failed': {
            const errMsg = data.error || 'Unknown error';
            statusText.innerHTML = `<span class="font-semibold text-red-400">Failed: ${errMsg}</span>`;
            if (speedText) speedText.style.visibility = 'hidden';
            if (etaText)   etaText.style.visibility   = 'hidden';
            break;
        }
        case 'cancelled':
            statusText.innerHTML = `<span class="font-semibold text-red-400">Cancelled</span>`;
            if (speedText) speedText.style.visibility = 'hidden';
            if (etaText)   etaText.style.visibility   = 'hidden';
            if (cancelBtn) cancelBtn.classList.add('hidden');
            if (pauseResumeBtn) pauseResumeBtn.disabled = true;
            break;
        case 'paused':
            statusText.innerHTML = `<span class="font-semibold text-yellow-400">Paused</span>`;
            if (speedText) speedText.style.visibility = 'hidden';
            if (etaText)   etaText.style.visibility   = 'hidden';
            if (pauseIcon) pauseIcon.classList.add('hidden');
            if (playIcon)  playIcon.classList.remove('hidden');
            if (pauseResumeBtn) pauseResumeBtn.disabled = false;
            break;
        default:
            statusText.innerHTML = `<span class="font-semibold">${data.status}...</span>`;
            if (speedText) speedText.style.visibility = 'visible';
            if (etaText)   etaText.style.visibility   = 'visible';
            if (pauseResumeBtn) pauseResumeBtn.disabled = true;
    }
}

// ─── Event wiring for a single download item ──────────────────────────────────

function setupDownloadItemEvents(refs, options) {
    const { el, cancelBtn, removeBtn, pauseResumeBtn, pauseIcon, playIcon,
            statusText, logContainer, logContent } = refs;

    // Cancel
    addEventListenerSafe(cancelBtn, 'click', async (e) => {
        try {
            cancelBtn.disabled = true;
            statusText.innerHTML = `<span class="font-semibold text-yellow-400">Cancelling...</span>`;
            await cancelDownload(options.downloadId);
            showNotification('Download cancelled', 'info');
            statusText.innerHTML = `<span class="font-semibold text-yellow-400">Cancelled</span>`;
            cancelBtn.style.display = 'none';
        } catch (err) {
            showNotification(`Cancel failed: ${err.message}`, 'error');
            cancelBtn.disabled = false;
            statusText.innerHTML = `<span class="font-semibold text-blue-400">Downloading...</span>`;
        }
    });

    // Remove
    addEventListenerSafe(removeBtn, 'click', async () => {
        try {
            _activeIds.delete(options.downloadId);
            _domCache.delete(options.downloadId);
            await removeDownload(options.downloadId);
        } catch (_) { /* still remove from DOM */ }
        el.classList.add('opacity-0', 'scale-95');
        setTimeout(() => el.remove(), 300);
    });

    // Pause / Resume
    addEventListenerSafe(pauseResumeBtn, 'click', async () => {
        const isCurrentlyPaused = !playIcon.classList.contains('hidden');
        const action = isCurrentlyPaused ? 'resume' : 'pause';
        pauseResumeBtn.disabled = true;
        statusText.innerHTML = `<span class="font-semibold text-yellow-400">${action === 'pause' ? 'Pausing' : 'Resuming'}...</span>`;
        try {
            await pauseResumeDownload(options.downloadId, action);
            showNotification(`Download ${action}d`, 'success');
        } catch (err) {
            if (err.message.includes('WINDOWS_UNSUPPORTED')) {
                showNotification('Pause/Resume not supported on Windows. Use Cancel instead.', 'info');
            } else {
                showNotification(`Failed to ${action}: ${err.message}`, 'error');
            }
            // Restore icon state
            if (isCurrentlyPaused) {
                pauseIcon.classList.add('hidden');
                playIcon.classList.remove('hidden');
            } else {
                pauseIcon.classList.remove('hidden');
                playIcon.classList.add('hidden');
            }
        }
        setTimeout(() => { pauseResumeBtn.disabled = false; }, 1000);
    });

    // View log (toggle)
    const logBtn = el.querySelector('.log-btn');
    addEventListenerSafe(logBtn, 'click', async () => {
        if (logContainer.classList.contains('hidden')) {
            try {
                logContent.textContent = 'Loading log...';
                logContainer.classList.remove('hidden');
                const data = await getDownloadLog(options.downloadId);
                logContent.textContent = (data.log && data.log.length > 0)
                    ? data.log.join('\n')
                    : 'No log data available.';
                logContainer.scrollTop = logContainer.scrollHeight;
            } catch (_) {
                logContent.textContent = 'Failed to load log.';
            }
        } else {
            logContainer.classList.add('hidden');
        }
    });

    // Download log as file
    const dlLogBtn = el.querySelector('.download-log-btn');
    addEventListenerSafe(dlLogBtn, 'click', async () => {
        try {
            const data = await getDownloadLog(options.downloadId);
            if (data.log && data.log.length > 0) {
                const blob = new Blob([data.log.join('\n')], { type: 'text/plain' });
                const url  = window.URL.createObjectURL(blob);
                const a    = document.createElement('a');
                a.href     = url;
                a.download = `${options.downloadId}_log.txt`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                showNotification('Log downloaded!', 'success');
            } else {
                showNotification('No log data available', 'info');
            }
        } catch (_) {
            showNotification('Failed to download log', 'error');
        }
    });
}

// ─── Clear completed/failed/cancelled downloads ───────────────────────────────

function clearCompletedDownloads() {
    // Use data-status attribute instead of fragile textContent matching
    const terminal = new Set(['completed', 'failed', 'cancelled']);
    let count = 0;

    document.querySelectorAll('#downloads-container > div[id^="download-"]').forEach((item) => {
        if (terminal.has(item.dataset.status)) {
            const removeBtn = item.querySelector('.remove-btn');
            if (removeBtn && !removeBtn.classList.contains('hidden')) {
                removeBtn.click();
                count++;
            }
        }
    });
    showNotification(
        count > 0 ? `Cleared ${count} finished download(s).` : 'No completed downloads to clear.',
        'info'
    );
}

// ─── Cleanup on page unload ───────────────────────────────────────────────────

export function cleanup() {
    _stopBatchPoll();
    _domCache.clear();
    _activeIds.clear();
    if (sseConnection) {
        try { sseConnection.close(); } catch (_) {}
        sseConnection = null;
    }
}

// ─── Utility exports ──────────────────────────────────────────────────────────

export function getActiveCount() {
    return _activeIds.size;
}
